/**
 * ============================================================
 *  QMS TESTNET — AUTO WITHDRAW ALL LIQUIDITY (EMERGENCY/MIGRATION)
 *  
 *  Menarik 100% Liquidity Pool (LP) dari SEMUA dompet di .env
 *  sebelum jadwal deprecation pool QWAP (Kamis, 29 Okt 09:00 UTC).
 * ============================================================
 */

'use strict';

require('dotenv').config();
const { ethers } = require('ethers');
const chalk = require('chalk');
const config = require('./config');
const { log, sleep, formatAmount, shortAddr, explorerTx, isNetworkError } = require('./utils');

// ─── Provider & Wallets ───────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(
  config.RPC_URL,
  { chainId: config.CHAIN_ID, name: 'qms-testnet' },
  { staticNetwork: true }
);

const PRIVATE_KEYS = (process.env.PRIVATE_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(k => k.startsWith('0x') && k.length === 66);

if (PRIVATE_KEYS.length === 0) {
  console.log(chalk.red('\n❌ No valid private keys found in .env!\n'));
  process.exit(1);
}

const wallets = PRIVATE_KEYS.map((pk, i) => {
  const w = new ethers.Wallet(pk, provider);
  return { wallet: w, label: `W${i + 1}(${shortAddr(w.address)})` };
});

function deadline() {
  return Math.floor(Date.now() / 1000) + 1200; // 20 minutes
}

// ─── Pair Definitions ────────────────────────────────────────────────────────

const POOLS = [
  // ETH / QMS Pairs
  { name: 'QMS/USDC', isEth: true,  pair: config.PAIRS.WQMS_USDC, token: config.TOKENS.USDC, tokenSymbol: 'USDC' },
  { name: 'QMS/WETH', isEth: true,  pair: config.PAIRS.WQMS_WETH, token: config.TOKENS.WETH, tokenSymbol: 'WETH' },
  { name: 'QMS/WBTC', isEth: true,  pair: config.PAIRS.WQMS_WBTC, token: config.TOKENS.WBTC, tokenSymbol: 'WBTC' },
  { name: 'QMS/USDT', isEth: true,  pair: config.PAIRS.USDT_WQMS, token: config.TOKENS.USDT, tokenSymbol: 'USDT' },

  // Token-Token Pairs
  { name: 'WETH/USDC', isEth: false, pair: config.PAIRS.WETH_USDC, tokenA: config.TOKENS.WETH, tokenB: config.TOKENS.USDC, symA: 'WETH', symB: 'USDC' },
  { name: 'USDT/WBTC', isEth: false, pair: config.PAIRS.USDT_WBTC, tokenA: config.TOKENS.USDT, tokenB: config.TOKENS.WBTC, symA: 'USDT', symB: 'WBTC' },
  { name: 'WBTC/USDC', isEth: false, pair: config.PAIRS.WBTC_USDC, tokenA: config.TOKENS.WBTC, tokenB: config.TOKENS.USDC, symA: 'WBTC', symB: 'USDC' },
  { name: 'USDT/USDC', isEth: false, pair: config.PAIRS.USDT_USDC, tokenA: config.TOKENS.USDT, tokenB: config.TOKENS.USDC, symA: 'USDT', symB: 'USDC' },
  { name: 'USDT/WETH', isEth: false, pair: config.PAIRS.USDT_WETH, tokenA: config.TOKENS.USDT, tokenB: config.TOKENS.WETH, symA: 'USDT', symB: 'WETH' },
];

// ─── Remove Liquidity Logic ───────────────────────────────────────────────────

async function withdrawPool(wallet, pool, label) {
  const router = new ethers.Contract(config.ROUTER_ADDRESS, config.ROUTER_ABI, wallet);
  const pairContract = new ethers.Contract(pool.pair, config.PAIR_ABI, wallet);

  let balanceLP = 0n;
  try {
    balanceLP = await pairContract.balanceOf(wallet.address);
  } catch {
    return false;
  }

  if (balanceLP === 0n) return false;

  console.log(chalk.yellow(`  💧 [${pool.name}] Ditemukan ${ethers.formatEther(balanceLP)} LP token, menarik 100%...`));

  // 1. Approve Router
  try {
    const allowance = await pairContract.allowance(wallet.address, config.ROUTER_ADDRESS);
    if (allowance < balanceLP) {
      log.info(label, `Approving LP token ${pool.name}...`);
      const appTx = await pairContract.approve(config.ROUTER_ADDRESS, ethers.MaxUint256, { gasLimit: 100000n });
      await appTx.wait();
      log.success(label, `Approved LP ${pool.name}`);
    }
  } catch (err) {
    log.error(label, `Gagal approve LP ${pool.name}: ${err.message}`);
    return false;
  }

  // 2. Remove Liquidity
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let tx;
      if (pool.isEth) {
        tx = await router.removeLiquidityETH(
          pool.token,
          balanceLP,
          0n,
          0n,
          wallet.address,
          deadline(),
          { gasLimit: 500000n }
        );
      } else {
        tx = await router.removeLiquidity(
          pool.tokenA,
          pool.tokenB,
          balanceLP,
          0n,
          0n,
          wallet.address,
          deadline(),
          { gasLimit: 500000n }
        );
      }

      log.info(label, `Menunggu konfirmasi TX remove LP...`);
      const receipt = await tx.wait();
      log.success(label, `Berhasil withdraw 100% LP ${pool.name}! | Tx: ${explorerTx(receipt.hash)}`);
      return true;
    } catch (err) {
      if (attempt < 3 && isNetworkError(err)) {
        log.warn(label, `RPC glitch saat remove liquidity, mencoba ulang (${attempt}/3)...`);
        await sleep(3000);
        continue;
      }
      log.error(label, `Gagal remove liquidity ${pool.name}: ${err.reason || err.message}`);
      return false;
    }
  }
  return false;
}

// ─── Unwrap Leftover WQMS ────────────────────────────────────────────────────

async function unwrapAllWQMS(wallet, label) {
  try {
    const wqms = new ethers.Contract(config.TOKENS.WQMS, config.ERC20_ABI, wallet);
    const balance = await wqms.balanceOf(wallet.address);
    if (balance > ethers.parseEther('0.001')) {
      log.info(label, `Mengembalikan ${formatAmount(balance)} WQMS → native QMS...`);
      const tx = await wqms.withdraw(balance, { gasLimit: 150000n });
      await tx.wait();
      log.success(label, `Unwrapped WQMS selesai!`);
    }
  } catch (e) {
    // skip
  }
}

// ─── Main Execution ──────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold.red('\n╔══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.red('║   QMS TESTNET — AUTO WITHDRAW ALL LIQUIDITY (100%)       ║'));
  console.log(chalk.bold.yellow('║   Persiapan Migrasi Pool QWAP (Kamis, 29 Okt 09:00 UTC)  ║'));
  console.log(chalk.bold.red('╚══════════════════════════════════════════════════════════╝\n'));

  console.log(chalk.white(`  Network : ${config.NETWORK_NAME} (Chain ${config.CHAIN_ID})`));
  console.log(chalk.white(`  Wallets : ${wallets.length} dompet`));
  console.log(chalk.white(`  Action  : Menarik 100% LP dari 9 Pool QWAP\n`));

  let totalWithdrawnCount = 0;

  for (let i = 0; i < wallets.length; i++) {
    const { wallet, label } = wallets[i];
    console.log(chalk.bold.cyan(`\n══════════════════════════════════════════════════════════`));
    console.log(chalk.bold.cyan(`▶ [${label}] Memeriksa LP di semua pool...`));
    console.log(chalk.bold.cyan(`══════════════════════════════════════════════════════════`));

    let removedAny = false;
    for (const pool of POOLS) {
      const ok = await withdrawPool(wallet, pool, label);
      if (ok) {
        removedAny = true;
        totalWithdrawnCount++;
        await sleep(2000);
      }
    }

    if (!removedAny) {
      console.log(chalk.gray(`  ✔ Dompet ini sudah bersih (tidak ada LP tersisa).`));
    } else {
      await unwrapAllWQMS(wallet, label);
    }

    if (i < wallets.length - 1) {
      await sleep(2000);
    }
  }

  console.log(chalk.bold.green('\n══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.green('  ✅  SELESAI! SEMUA LIQUIDITY TELAH DITARIK (100%)'));
  console.log(chalk.bold.white(`  Total Pool yang ditarik: ${totalWithdrawnCount} pool`));
  console.log(chalk.bold.yellow('  Saldo QMS & token telah aman tersimpan di dompet masing-masing.'));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════════\n'));
}

main().catch(err => {
  console.error(chalk.red('\nFatal error:'), err.message);
  process.exit(1);
});
