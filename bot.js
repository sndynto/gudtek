// ============================================================
//  QMS TESTNET ENGINE — LOGICAL SEQUENCED FULL AUTO PROTOCOL
//  1. Buy Tokens (QMS → USDC, USDT, WETH, WBTC)
//  2. Swap Tokens (Token ↔ Token & Token → QMS)
//  3. Add Liquidity (QMS+Token & Token+Token)
//  4. Remove Liquidity (Remove LP)
//  5. Wrap / Unwrap & Transfer
// ============================================================

require("dotenv").config();
const { ethers } = require("ethers");
const chalk = require("chalk");

const config = require("./config");
const { log, randomSleep, sleep, formatAmount, randomPick, randomPercent, shortAddr } = require("./utils");
const {
  wrapQMS,
  unwrapWQMS,
  swapQMSForToken,
  swapTokenForQMS,
  swapTokenToToken,
  addLiquidityETH,
  removeLiquidityETH,
  addLiquidityTokens,
  removeLiquidityTokens,
  transferToWallet,
} = require("./actions");

// ─── Load Environment Config ──────────────────────────────
const PRIVATE_KEYS = (process.env.PRIVATE_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter((k) => k.startsWith("0x") && k.length === 66);

const DELAY_MIN = parseInt(process.env.DELAY_MIN_MS || "10000");
const DELAY_MAX = parseInt(process.env.DELAY_MAX_MS || "30000");
const CYCLE_MIN = parseInt(process.env.CYCLE_DELAY_MIN_MS || "60000");
const CYCLE_MAX = parseInt(process.env.CYCLE_DELAY_MAX_MS || "120000");
const MAX_CYCLES = parseInt(process.env.MAX_CYCLES || "0");

// ─── Validation ───────────────────────────────────────────
if (PRIVATE_KEYS.length === 0) {
  console.log(chalk.red("\n❌ ERROR: No valid private keys found in .env!\n"));
  process.exit(1);
}

// ─── Provider & Wallets ───────────────────────────────────
const provider = new ethers.JsonRpcProvider(config.RPC_URL);
const wallets = PRIVATE_KEYS.map((pk, i) => {
  const w = new ethers.Wallet(pk, provider);
  return { wallet: w, label: `Wallet-${i + 1}(${shortAddr(w.address)})` };
});

const TOKEN_LIST = [
  { symbol: "USDC", address: config.TOKENS.USDC },
  { symbol: "USDT", address: config.TOKENS.USDT },
  { symbol: "WETH", address: config.TOKENS.WETH },
  { symbol: "WBTC", address: config.TOKENS.WBTC },
];

const ETH_PAIRS = [
  { symbol: "USDC", address: config.TOKENS.USDC, pair: config.PAIRS.WQMS_USDC },
  { symbol: "USDT", address: config.TOKENS.USDT, pair: config.PAIRS.USDT_WQMS },
  { symbol: "WETH", address: config.TOKENS.WETH, pair: config.PAIRS.WQMS_WETH },
  { symbol: "WBTC", address: config.TOKENS.WBTC, pair: config.PAIRS.WQMS_WBTC },
];

const TOKEN_PAIRS = [
  { a: config.TOKENS.USDC, b: config.TOKENS.USDT, symA: "USDC", symB: "USDT", pair: config.PAIRS.USDT_USDC },
  { a: config.TOKENS.WBTC, b: config.TOKENS.USDC, symA: "WBTC", symB: "USDC", pair: config.PAIRS.WBTC_USDC },
  { a: config.TOKENS.USDT, b: config.TOKENS.WBTC, symA: "USDT", symB: "WBTC", pair: config.PAIRS.USDT_WBTC },
  { a: config.TOKENS.USDT, b: config.TOKENS.WETH, symA: "USDT", symB: "WETH", pair: config.PAIRS.USDT_WETH },
  { a: config.TOKENS.WETH, b: config.TOKENS.USDC, symA: "WETH", symB: "USDC", pair: config.PAIRS.WETH_USDC },
];

// ─── Random Amount Helper (< 3 QMS) ───────────────────────
function getRandomAmountWei(balanceWei) {
  const balanceEth = parseFloat(ethers.formatEther(balanceWei));
  const maxSafe = Math.min(2.5, balanceEth * 0.15);
  const minSafe = Math.min(0.005, maxSafe);
  if (maxSafe <= minSafe) {
    return ethers.parseEther("0.001");
  }
  const randomValue = (Math.random() * (maxSafe - minSafe) + minSafe).toFixed(4);
  return ethers.parseEther(randomValue);
}

// ─── Print Startup Banner ─────────────────────────────────
async function printBanner() {
  log.title("QMS TESTNET ENGINE — FULL AUTO PROTOCOL");
  console.log(chalk.white(`  Network  : ${config.NETWORK_NAME} (Chain ${config.CHAIN_ID})`));
  console.log(chalk.white(`  RPC      : ${config.RPC_URL}`));
  console.log(chalk.white(`  Wallets  : ${wallets.length} active wallet(s)`));
  console.log(chalk.white(`  Flow     : Buy Tokens → Swap → Add LP → Remove LP → Wrap`));
  console.log(chalk.white(`  Max Nom. : Random < 3.0 QMS per transaction`));
  console.log(chalk.white(`  Cycles   : ${MAX_CYCLES === 0 ? "∞ (unlimited)" : MAX_CYCLES}`));
  console.log(chalk.magenta("══════════════════════════════════════════\n"));

  for (const { wallet, label } of wallets) {
    const balance = await provider.getBalance(wallet.address);
    log.info(label, `Address: ${wallet.address}`);
    log.info(label, `Native QMS Balance: ${formatAmount(balance, 18, 4)} QMS`);
    if (balance < ethers.parseEther("0.01")) {
      log.warn(label, `Low balance! Claim testnet faucet at: https://faucet.testnet.qms.finance`);
    }
  }
  console.log();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ─── Structured Single Cycle Execution ────────────────────
async function runWalletCycle(wallet, label, otherWallets, cycleNum) {
  log.divider();
  log.info(label, chalk.bold(`=== Cycle #${cycleNum} Started ===`));

  let qmsBalance = await provider.getBalance(wallet.address);
  if (qmsBalance < ethers.parseEther("0.005")) {
    log.warn(label, `QMS balance too low (${formatAmount(qmsBalance, 18, 4)} QMS), skipping cycle.`);
    return;
  }

  // =========================================================
  //  PHASE 1: BUY ALL TOKENS (Swap QMS → USDC, USDT, WETH, WBTC)
  //  Ensures wallet holds ALL tokens before trading!
  // =========================================================
  log.info(label, chalk.yellow("▶ PHASE 1: Buying All Tokens (QMS → Tokens)..."));
  
  const shuffledTokens = [...TOKEN_LIST];
  shuffleArray(shuffledTokens);

  for (const t of shuffledTokens) {
    qmsBalance = await provider.getBalance(wallet.address);
    const amt = getRandomAmountWei(qmsBalance);
    await swapQMSForToken(wallet, amt, t.address, t.symbol, label);
    await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");
  }

  // Wrap some QMS to WQMS
  qmsBalance = await provider.getBalance(wallet.address);
  const wrapAmt = getRandomAmountWei(qmsBalance);
  await wrapQMS(wallet, wrapAmt, label);
  await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");

  // =========================================================
  //  PHASE 2: TOKEN TO TOKEN & REVERSE SWAPS (Token → Token & Token → QMS)
  // =========================================================
  log.info(label, chalk.yellow("▶ PHASE 2: Token-to-Token & Reverse Swaps..."));
  
  const shuffledPairs = [...TOKEN_PAIRS];
  shuffleArray(shuffledPairs);

  for (const p of shuffledPairs) {
    await swapTokenToToken(wallet, p.a, p.b, p.symA, p.symB, 0.25, label);
    await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");
  }

  // Swap some tokens back to QMS
  for (const t of shuffledTokens) {
    await swapTokenForQMS(wallet, t.address, t.symbol, 0.3, label);
    await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");
  }

  // =========================================================
  //  PHASE 3: ADD LIQUIDITY (QMS+Token & Token+Token)
  // =========================================================
  log.info(label, chalk.yellow("▶ PHASE 3: Adding Liquidity (All Pools)..."));

  const shuffledEthPairs = [...ETH_PAIRS];
  shuffleArray(shuffledEthPairs);

  for (const item of shuffledEthPairs) {
    qmsBalance = await provider.getBalance(wallet.address);
    const amt = getRandomAmountWei(qmsBalance);
    await swapQMSForToken(wallet, amt, item.address, item.symbol, label);
    await randomSleep(4000, 7000, "Waiting for swap:");
    await addLiquidityETH(wallet, item.address, item.symbol, amt / 2n, label);
    await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");
  }

  // Add Liquidity Token+Token
  for (const p of shuffledPairs) {
    await addLiquidityTokens(wallet, p.a, p.b, p.symA, p.symB, label);
    await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");
  }

  // =========================================================
  //  PHASE 4: REMOVE LIQUIDITY
  // =========================================================
  log.info(label, chalk.yellow("▶ PHASE 4: Removing Liquidity..."));

  for (const item of shuffledEthPairs) {
    await removeLiquidityETH(wallet, item.pair, item.address, item.symbol, label);
    await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");
  }

  for (const p of shuffledPairs) {
    await removeLiquidityTokens(wallet, p.pair, p.a, p.b, p.symA, p.symB, label);
    await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");
  }

  // =========================================================
  //  PHASE 5: UNWRAP & FINISHING
  // =========================================================
  log.info(label, chalk.yellow("▶ PHASE 5: Unwrapping WQMS & Finishing..."));
  await unwrapWQMS(wallet, label);
  await randomSleep(DELAY_MIN, DELAY_MAX, "Transaction delay:");

  if (otherWallets.length > 0) {
    const target = randomPick(otherWallets);
    const transferAmt = ethers.parseEther((Math.random() * 0.005 + 0.001).toFixed(4));
    await transferToWallet(wallet, target.wallet.address, transferAmt, label);
  }

  log.success(label, chalk.bold(`Cycle #${cycleNum} COMPLETED SUCCESSFULLY ✓`));
}

// ─── Main Loop ─────────────────────────────────────────────
async function runFullAuto() {
  await printBanner();

  let cycle = 0;

  while (MAX_CYCLES === 0 || cycle < MAX_CYCLES) {
    cycle++;
    log.title(`CYCLE #${cycle} — ${wallets.length} Active Wallet(s)`);

    for (const { wallet, label } of wallets) {
      const others = wallets.filter((w) => w.wallet.address !== wallet.address);
      await runWalletCycle(wallet, label, others, cycle);
      await randomSleep(DELAY_MIN, DELAY_MAX, "Delay between wallets:");
    }

    if (MAX_CYCLES === 0 || cycle < MAX_CYCLES) {
      const waitMs = Math.floor(
        Math.random() * (CYCLE_MAX - CYCLE_MIN + 1) + CYCLE_MIN
      );
      console.log(
        chalk.yellow(
          `\n  ⏳ Waiting ${(waitMs / 1000).toFixed(0)} seconds before next cycle...\n`
        )
      );
      await sleep(waitMs);
    }
  }

  log.title("EXECUTION FINISHED — All Cycles Completed!");
}

// ─── Error Handler ────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error(chalk.red("\n[FATAL ERROR]"), reason);
});

// ─── Start ────────────────────────────────────────────────
runFullAuto().catch((e) => {
  console.error(chalk.red("\n❌ Execution crash:"), e.message);
  process.exit(1);
});
