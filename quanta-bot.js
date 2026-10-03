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

// ─── Startup Banner ───────────────────────────────────────
function printBanner(progress) {
  console.log(chalk.bold.magenta("\n╔══════════════════════════════════════════════╗"));
  console.log(chalk.bold.magenta("║     QMS QUANTA FARMING ENGINE (ALL TOKENS)   ║"));
  console.log(chalk.bold.magenta("║     1 Set = 1 Swap + 1 Add LP                ║"));
  console.log(chalk.bold.magenta("║     Tokens: USDC, USDT, WETH, WBTC           ║"));
  console.log(chalk.bold.magenta("║     Max 10 Sets per Wallet                   ║"));
  console.log(chalk.bold.magenta("╚══════════════════════════════════════════════╝\n"));

  console.log(chalk.white(`  Network  : ${config.NETWORK_NAME} (Chain ${config.CHAIN_ID})`));
  console.log(chalk.white(`  Wallets  : ${wallets.length}`));
  console.log(chalk.white(`  Set Delay: ${SET_DELAY_MS / 60000} minutes between sets\n`));

  console.log(chalk.bold("  📊 Progress per Wallet:"));
  for (const { wallet, label } of wallets) {
    const p = getWalletProgress(progress, wallet.address);
    const bar = "🟩".repeat(p.completedSets) + "⬜".repeat(MAX_SETS - p.completedSets);
    console.log(`  ${chalk.cyan(label)} ${bar} ${p.completedSets}/${MAX_SETS} sets`);
  }
  console.log();
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
  printBanner(progress);

  const allDone = wallets.every(({ wallet }) => {
    const p = getWalletProgress(progress, wallet.address);
    return p.completedSets >= MAX_SETS;
  });

  if (allDone) {
    console.log(chalk.green.bold("🎉 All wallets have reached 10/10 sets!\n"));
    printSummary(progress);
    return;
  }

  let globalSetCount = 0;

  while (true) {
    let anyActive = false;

    for (let i = 0; i < wallets.length; i++) {
      const { wallet, label } = wallets[i];
      const p = getWalletProgress(progress, wallet.address);

      if (p.completedSets >= MAX_SETS) {
        console.log(chalk.gray(`  ${label} → Already ${MAX_SETS}/10 sets, skipping.`));
        continue;
      }

      anyActive = true;
      const nextSet = p.completedSets + 1;
      const ok = await runOneSet(wallet, label, nextSet);

      if (ok) {
        p.completedSets++;
        p.swaps = (p.swaps || 0) + 1;
        p.lps = (p.lps || 0) + 1;
        progress[wallet.address] = p;
        saveProgress(progress);
        globalSetCount++;

        printProgressBar(p, label);
      }

      if (i < wallets.length - 1) {
        await randomSleep(15000, 30000, "  Delay between wallets:");
      }
    }

    if (!anyActive) {
      console.log(chalk.green.bold("\n🎉 ALL WALLETS FINISHED!"));
      break;
    }

    const allDoneNow = wallets.every(({ wallet }) => {
      return (progress[wallet.address]?.completedSets || 0) >= MAX_SETS;
    });

    if (allDoneNow) {
      console.log(chalk.green.bold("\n🎉 ALL WALLETS REACHED 10/10 SETS!"));
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
  const bar = "🟩".repeat(p.completedSets) + "⬜".repeat(MAX_SETS - p.completedSets);
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
    const bar = "🟩".repeat(p.completedSets) + "⬜".repeat(MAX_SETS - p.completedSets);
    console.log(`  ${chalk.cyan(label)}: ${bar} ${p.completedSets}/10 sets → ~${quanta} Quanta`);
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
process.on("unhandledRejection", (reason) => {
  console.error(chalk.red("\n[ERROR]"), reason);
});

// ─── Start ────────────────────────────────────────────────
runQuantaEngine().catch((e) => {
  console.error(chalk.red("\n❌ Execution crash:"), e.message);
  process.exit(1);
});
