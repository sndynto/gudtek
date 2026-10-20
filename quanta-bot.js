// ============================================================
//  QMS QUANTA FARMING ENGINE (ALL TOKENS)
//  Target: 10 sets per wallet = 100 Quanta (Qubits) / 130 Quanta (Quantum Pioneer)
//  1 SET = 1 Swap + 1 Add Liquidity (NOT remove)
//  Supported Tokens: USDC, USDT, WETH, WBTC
// ============================================================

require("dotenv").config();
const { ethers } = require("ethers");
const chalk = require("chalk");
const fs = require("fs");

const config = require("./config");
const { log, randomSleep, sleep, formatAmount, shortAddr, explorerTx } = require("./utils");
const { swapQMSForToken, addLiquidityETH } = require("./actions");

// ─── Configuration ────────────────────────────────────────
const PRIVATE_KEYS = (process.env.PRIVATE_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter((k) => k.startsWith("0x") && k.length === 66);

const MAX_SETS     = parseInt(process.env.MAX_SETS || "10");         // Max 10 sets per Discord rules
const SET_DELAY_MS = parseInt(process.env.SET_DELAY_MS || "900000"); // 15 minutes between sets (900000ms)
const PROGRESS_FILE = "./quanta-progress.json";

// ─── Validation ───────────────────────────────────────────
if (PRIVATE_KEYS.length === 0) {
  console.log(chalk.red("\n❌ No valid private keys found in .env!\n"));
  process.exit(1);
}

// ─── Provider & Wallets ───────────────────────────────────
const provider = new ethers.JsonRpcProvider(config.RPC_URL);
const wallets = PRIVATE_KEYS.map((pk, i) => {
  const w = new ethers.Wallet(pk, provider);
  return { wallet: w, label: `W${i + 1}(${shortAddr(w.address)})` };
});

// ─── Progress Tracker ─────────────────────────────────────
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveProgress(data) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function getWalletProgress(progress, address) {
  if (!progress[address]) {
    progress[address] = { completedSets: 0, swaps: 0, lps: 0 };
  }
  return progress[address];
}

// ─── Relative Time & Activity Scanner ─────────────────────
function formatTimeAgo(isoStr) {
  if (!isoStr) return chalk.red("Belum pernah swap");
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (3600 * 1000));
  const diffDays = Math.floor(diffMs / (86400 * 1000));

  if (diffMins < 1) return chalk.green("Baru saja (<1m lalu)");
  if (diffMins < 60) return chalk.green(`${diffMins} menit lalu`);
  if (diffHours < 24) return chalk.yellow(`${diffHours} jam lalu`);
  return chalk.red(`${diffDays} hari lalu`);
}

async function scanWalletsActivity(walletsList, progress) {
  process.stdout.write(chalk.cyan("  🔍 Memindai status on-chain 14 wallet di QMSScan Explorer...\r"));
  const todayUTC = new Date().toISOString().slice(0, 10);

  const results = await Promise.all(
    walletsList.map(async ({ wallet, label }) => {
      const addr = wallet.address;
      let latestSwap = null;
      let latestLp = null;

      try {
        const res = await fetch(`https://testnet.qmsscan.io/api/v2/addresses/${addr}/transactions`, {
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          const swap = items.find(tx => tx.method && tx.method.toLowerCase().includes("swap"));
          const lp = items.find(tx => tx.method && tx.method.toLowerCase().includes("addliquidity"));
          if (swap) latestSwap = swap.timestamp;
          if (lp) latestLp = lp.timestamp;
        }
      } catch {
        const p = progress[addr];
        if (p?.lastSwapTime) latestSwap = p.lastSwapTime;
        if (p?.lastLpTime) latestLp = p.lastLpTime;
      }

      const isSwappedToday = latestSwap ? latestSwap.slice(0, 10) === todayUTC : false;
      const isLpToday = latestLp ? latestLp.slice(0, 10) === todayUTC : false;

      return {
        address: addr,
        label,
        latestSwap,
        latestLp,
        isSwappedToday,
        isLpToday,
      };
    })
  );
  process.stdout.write(" ".repeat(70) + "\r");
  return results;
}

// ─── Startup Banner ───────────────────────────────────────
function printBanner(progress, activities) {
  console.log(chalk.bold.magenta("\n╔══════════════════════════════════════════════╗"));
  console.log(chalk.bold.magenta("║     QMS QUANTA FARMING ENGINE (ALL TOKENS)   ║"));
  console.log(chalk.bold.magenta("║     1 Set = 1 Swap + 1 Add LP                ║"));
  console.log(chalk.bold.magenta("║     Tokens: USDC, USDT, WETH, WBTC           ║"));
  console.log(chalk.bold.magenta("║     Max 10 Sets per Wallet                   ║"));
  console.log(chalk.bold.magenta("╚══════════════════════════════════════════════╝\n"));

  console.log(chalk.white(`  Network  : ${config.NETWORK_NAME} (Chain ${config.CHAIN_ID})`));
  console.log(chalk.white(`  Wallets  : ${wallets.length} active wallet(s)`));
  console.log(chalk.white(`  Set Delay: ${SET_DELAY_MS / 60000} minutes between sets\n`));

  console.log(chalk.bold("  📊 Status & Deteksi Swap Hari Ini (Live On-Chain):"));
  let todayCount = 0;
  let needTodayCount = 0;

  for (const { wallet, label } of wallets) {
    const p = getWalletProgress(progress, wallet.address);
    const act = activities.find(a => a.address.toLowerCase() === wallet.address.toLowerCase());
    const bar = "🟩".repeat(Math.min(p.completedSets, MAX_SETS)) + "⬜".repeat(Math.max(0, MAX_SETS - p.completedSets));

    let streakStatus = "";
    if (act?.isSwappedToday) {
      todayCount++;
      streakStatus = chalk.green("✔ SUDAH HARI INI");
    } else {
      needTodayCount++;
      streakStatus = chalk.red.bold("✘ BELUM HARI INI");
    }

    const swapTimeStr = formatTimeAgo(act?.latestSwap);
    console.log(`  ${chalk.cyan(label.padEnd(20))} ${bar} ${p.completedSets}/${MAX_SETS} | Terakhir: ${swapTimeStr.padEnd(25)} [${streakStatus}]`);
  }

  console.log();
  console.log(`  ℹ  ${chalk.green(todayCount + " wallet sudah swap hari ini")}, ${chalk.yellow(needTodayCount + " wallet BELUM swap hari ini")}`);
  if (needTodayCount > 0) {
    console.log(chalk.yellow(`  ⚡ Wallet yang BELUM swap hari ini diprioritaskan dieksekusi lebih dulu!\n`));
  } else {
    console.log(chalk.green(`  🎉 Semua wallet sudah melakukan swap hari ini!\n`));
  }
}

// ─── Random Token Selection ───────────────────────────────
function getRandomTokenConfig() {
  const options = [
    { address: config.TOKENS.USDC, symbol: "USDC", swapPercent: 0.04, liqPercent: 0.03 },
    { address: config.TOKENS.USDT, symbol: "USDT", swapPercent: 0.04, liqPercent: 0.03 },
    { address: config.TOKENS.WETH, symbol: "WETH", swapPercent: 0.04, liqPercent: 0.03 },
    { address: config.TOKENS.WBTC, symbol: "WBTC", swapPercent: 0.04, liqPercent: 0.03 },
  ];
  return options[Math.floor(Math.random() * options.length)];
}

// ─── Execute 1 Set for 1 Wallet ───────────────────────────
async function runOneSet(wallet, label, setNum) {
  const tokenCfg = getRandomTokenConfig();
  console.log(chalk.bold.cyan(`\n  ┌─ ${label} — Set #${setNum} (Target Pair: QMS / ${tokenCfg.symbol})`));

  const qmsBalance = await provider.getBalance(wallet.address);
  if (qmsBalance < ethers.parseEther("0.01")) {
    console.log(chalk.red(`  │  ❌ QMS balance too low (${formatAmount(qmsBalance)} QMS)! Claim faucet first.`));
    console.log(chalk.red(`  │  Faucet: https://faucet.testnet.qms.finance`));
    return false;
  }

  const swapAmount = BigInt(Math.floor(Number(qmsBalance) * tokenCfg.swapPercent));
  const liqAmount  = BigInt(Math.floor(Number(qmsBalance) * tokenCfg.liqPercent));

  // ── STEP 1: SWAP ──────────────────────────────────────
  console.log(chalk.bold(`  │\n  │  [STEP 1/2] 🔄 SWAP QMS → ${tokenCfg.symbol}`));
  const swapOk = await swapQMSForToken(
    wallet,
    swapAmount,
    tokenCfg.address,
    tokenCfg.symbol,
    label
  );

  if (!swapOk) {
    console.log(chalk.red(`  │  ❌ Swap failed, set cancelled.`));
    return false;
  }

  await randomSleep(8000, 15000, "  │  ⏳ Waiting for tokens:");

  // ── STEP 2: ADD LIQUIDITY ─────────────────────────────
  console.log(chalk.bold(`  │\n  │  [STEP 2/2] 💧 ADD LIQUIDITY QMS / ${tokenCfg.symbol}`));
  const lpOk = await addLiquidityETH(
    wallet,
    tokenCfg.address,
    tokenCfg.symbol,
    liqAmount,
    label
  );

  if (!lpOk) {
    console.log(chalk.red(`  │  ❌ Add Liquidity failed, set incomplete.`));
    return false;
  }

  console.log(chalk.bold.green(`  └─ ✅ Set #${setNum} COMPLETE! (1 Swap + 1 LP QMS/${tokenCfg.symbol})\n`));
  return true;
}

// ─── Main Loop ────────────────────────────────────────────
async function runQuantaEngine() {
  const progress = loadProgress();
  const activities = await scanWalletsActivity(wallets, progress);
  printBanner(progress, activities);

  // Cek apakah ada wallet yang masih butuh set atau belum swap hari ini
  const allCompletedMax = wallets.every(({ wallet }) => {
    const p = getWalletProgress(progress, wallet.address);
    return p.completedSets >= MAX_SETS;
  });

  const allSwappedToday = activities.every(a => a.isSwappedToday);

  if (allCompletedMax && allSwappedToday) {
    console.log(chalk.green.bold("🎉 Semua wallet sudah mencapai 10/10 sets dan sudah swap hari ini!\n"));
    printSummary(progress);
    return;
  }

  while (true) {
    let anyActive = false;

    // Prioritaskan wallet yang BELUM swap hari ini terlebih dahulu
    const sortedWallets = [...wallets].sort((a, b) => {
      const actA = activities.find(x => x.address.toLowerCase() === a.wallet.address.toLowerCase());
      const actB = activities.find(x => x.address.toLowerCase() === b.wallet.address.toLowerCase());
      const needA = !actA?.isSwappedToday;
      const needB = !actB?.isSwappedToday;
      if (needA && !needB) return -1;
      if (!needA && needB) return 1;
      return 0;
    });

    for (let i = 0; i < sortedWallets.length; i++) {
      const { wallet, label } = sortedWallets[i];
      const p = getWalletProgress(progress, wallet.address);
      const act = activities.find(x => x.address.toLowerCase() === wallet.address.toLowerCase());

      // Jika sudah 10 sets dan sudah swap hari ini, lewati
      if (p.completedSets >= MAX_SETS && act?.isSwappedToday) {
        console.log(chalk.gray(`  ${label} → Sudah 10/10 sets & sudah swap hari ini, skipping.`));
        continue;
      }

      anyActive = true;
      const nextSet = p.completedSets >= MAX_SETS ? p.completedSets : p.completedSets + 1;
      
      if (!act?.isSwappedToday) {
        console.log(chalk.yellow.bold(`\n  ⚡ [${label}] Memproses set harian (karena belum swap hari ini)...`));
      }

      const ok = await runOneSet(wallet, label, nextSet);

      if (ok) {
        if (p.completedSets < MAX_SETS) {
          p.completedSets++;
        }
        p.swaps = (p.swaps || 0) + 1;
        p.lps = (p.lps || 0) + 1;
        p.lastSwapTime = new Date().toISOString();
        p.lastLpTime = new Date().toISOString();
        progress[wallet.address] = p;
        saveProgress(progress);

        if (act) {
          act.isSwappedToday = true;
          act.latestSwap = p.lastSwapTime;
          act.latestLp = p.lastLpTime;
        }

        printProgressBar(p, label);
      }

      if (i < sortedWallets.length - 1) {
        await randomSleep(15000, 30000, "  Delay between wallets:");
      }
    }

    if (!anyActive) {
      console.log(chalk.green.bold("\n🎉 SEMUA WALLET SUDAH SELESAI!"));
      break;
    }

    const allFinished = sortedWallets.every(({ wallet }) => {
      const p = progress[wallet.address] || { completedSets: 0 };
      const act = activities.find(x => x.address.toLowerCase() === wallet.address.toLowerCase());
      return p.completedSets >= MAX_SETS && act?.isSwappedToday;
    });

    if (allFinished) {
      console.log(chalk.green.bold("\n🎉 SEMUA WALLET MENCAPAI 10/10 SETS & SELESAI HARI INI!"));
      break;
    }

    const waitSec = Math.ceil(SET_DELAY_MS / 1000);
    console.log(chalk.yellow(`\n  ⏳ Waiting ${waitSec} seconds (${waitSec / 60} minutes) before next set...`));
    console.log(chalk.gray(`  (Discord system takes ~10-15 minutes to register transactions)\n`));

    for (let remaining = waitSec; remaining > 0; remaining -= 60) {
      if (remaining < waitSec) {
        process.stdout.write(chalk.gray(`  ⏳ ${remaining} seconds left...   \r`));
      }
      await sleep(Math.min(60000, remaining * 1000));
    }
    console.log();
  }

  printSummary(progress);
}

// ─── Visual Progress Bar ──────────────────────────────────
function printProgressBar(p, label) {
  const bar = "🟩".repeat(Math.min(p.completedSets, MAX_SETS)) + "⬜".repeat(Math.max(0, MAX_SETS - p.completedSets));
  const quanta = p.completedSets * 10;
  console.log(chalk.bold(`\n  📊 ${label}: ${bar} ${p.completedSets}/${MAX_SETS} sets (~${quanta} Quanta)\n`));
}

// ─── Final Summary ────────────────────────────────────────
function printSummary(progress) {
  console.log(chalk.bold.magenta("\n╔══════════════════════════════════════════════╗"));
  console.log(chalk.bold.magenta("║                 FINAL SUMMARY                ║"));
  console.log(chalk.bold.magenta("╚══════════════════════════════════════════════╝\n"));

  let totalSets = 0;
  for (const { wallet, label } of wallets) {
    const p = progress[wallet.address] || { completedSets: 0 };
    const quanta = p.completedSets * 10;
    const bar = "🟩".repeat(Math.min(p.completedSets, MAX_SETS)) + "⬜".repeat(Math.max(0, MAX_SETS - p.completedSets));
    console.log(`  ${chalk.cyan(label)}: ${bar} ${p.completedSets}/${MAX_SETS} sets → ~${quanta} Quanta`);
    console.log(`    Address: ${wallet.address}`);
    totalSets += p.completedSets;
  }

  console.log(chalk.bold(`\n  Total Completed Sets : ${totalSets}`));
  console.log(chalk.bold(`  Estimated Quanta     : ~${totalSets * 10} Quanta (Qubits) / ~${totalSets * 13} (Quantum Pioneer)`));
  console.log();
  console.log(chalk.yellow("  ⚠  Remember: Check progress in Discord after 10-15 minutes!"));
  console.log(chalk.yellow("  ⚠  Make sure your wallet address was submitted in Discord!\n"));
}

// ─── Error Handler ────────────────────────────────────────
function isQuietNetworkError(err) {
  if (!err) return false;
  const code = err.code || err.error?.code;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "SERVER_ERROR" ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("fetch failed")
  );
}

process.on("unhandledRejection", (reason) => {
  if (isQuietNetworkError(reason)) {
    return;
  }
  console.error(chalk.red("\n[ERROR]"), reason);
});

process.on("uncaughtException", (err) => {
  if (isQuietNetworkError(err)) {
    return;
  }
  console.error(chalk.red("\n[UNCAUGHT ERROR]"), err);
});

// ─── Start ────────────────────────────────────────────────
runQuantaEngine().catch((e) => {
  console.error(chalk.red("\n❌ Execution crash:"), e.message);
  process.exit(1);
});
