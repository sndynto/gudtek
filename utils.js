// ============================================================
//  QMS TESTNET TOOLKIT - UTILITIES
// ============================================================

const { ethers } = require("ethers");
const chalk = require("chalk");

// ─── Logging ──────────────────────────────────────────────
const log = {
  info: (wallet, msg) =>
    console.log(`${chalk.gray(timestamp())} ${chalk.cyan(`[${wallet}]`)} ${msg}`),
  success: (wallet, msg) =>
    console.log(`${chalk.gray(timestamp())} ${chalk.cyan(`[${wallet}]`)} ${chalk.green("✔")} ${msg}`),
  warn: (wallet, msg) =>
    console.log(`${chalk.gray(timestamp())} ${chalk.cyan(`[${wallet}]`)} ${chalk.yellow("⚠")} ${msg}`),
  error: (wallet, msg) =>
    console.log(`${chalk.gray(timestamp())} ${chalk.cyan(`[${wallet}]`)} ${chalk.red("✘")} ${msg}`),
  title: (msg) =>
    console.log(`\n${chalk.bold.magenta("══════════════════════════════════════════")}\n${chalk.bold.magenta("  " + msg)}\n${chalk.bold.magenta("══════════════════════════════════════════")}`),
  divider: () =>
    console.log(chalk.gray("──────────────────────────────────────────")),
};

function timestamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// ─── Delay Helpers ────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function randomSleep(min, max, label = "") {
  const ms = randomDelay(min, max);
  if (label) console.log(chalk.gray(`  ⏳ ${label} ${(ms / 1000).toFixed(1)}s...`));
  await sleep(ms);
}

// ─── Format Helpers ───────────────────────────────────────
function formatAmount(amount, decimals = 18, precision = 6) {
  return parseFloat(ethers.formatUnits(amount, decimals)).toFixed(precision);
}

function shortAddr(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function explorerTx(txHash) {
  return `https://testnet.qmsscan.io/tx/${txHash}`;
}

// ─── Token Approval ───────────────────────────────────────
async function ensureApproval(wallet, tokenContract, spender, amount, tokenSymbol, walletLabel) {
  const currentAllowance = await tokenContract.allowance(wallet.address, spender);
  if (currentAllowance < amount) {
    log.info(walletLabel, `Approving ${tokenSymbol}...`);
    const tx = await tokenContract.approve(spender, ethers.MaxUint256, { gasLimit: 100000n });
    await tx.wait();
    log.success(walletLabel, `${tokenSymbol} approved successfully`);
  }
}

// ─── Gas Limit Helper ─────────────────────────────────────
async function safeGasLimit(estimateFn, multiplier = 1.3) {
  try {
    const estimated = await estimateFn();
    return BigInt(Math.floor(Number(estimated) * multiplier));
  } catch {
    return 500000n;
  }
}

// ─── Random Utilities ─────────────────────────────────────
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPercent(min, max) {
  return Math.random() * (max - min) + min;
}

// ─── Network Error & Auto-Retry Helpers ───────────────────
function isNetworkError(err) {
  if (!err) return false;
  const code = err.code || err.error?.code || err.info?.error?.code;
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
    msg.includes("timeout") ||
    msg.includes("server error") ||
    msg.includes("bad response") ||
    msg.includes("failed to fetch") ||
    msg.includes("could not detect network")
  );
}

async function withRetry(fn, maxRetries = 3, delayMs = 3000, label = "") {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries || !isNetworkError(err)) {
        throw err;
      }
      if (label) {
        log.warn(label, `RPC glitch (${err.code || "network"}), auto-retrying in ${(delayMs / 1000).toFixed(0)}s (${attempt}/${maxRetries})...`);
      }
      await sleep(delayMs);
    }
  }
}

module.exports = {
  log,
  sleep,
  randomDelay,
  randomSleep,
  formatAmount,
  shortAddr,
  explorerTx,
  ensureApproval,
  safeGasLimit,
  randomPick,
  randomPercent,
  isNetworkError,
  withRetry,
};
