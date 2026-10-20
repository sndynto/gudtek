// ============================================================
//  QMS TESTNET ENGINE - CORE ACTIONS
// ============================================================

const { ethers } = require("ethers");
const config = require("./config");
const {
  log, randomSleep, formatAmount, explorerTx,
  ensureApproval, randomPercent, randomPick,
  isNetworkError, sleep
} = require("./utils");

// ─── Helper: Deadline (20 Minutes) ────────────────────────
function deadline() {
  return Math.floor(Date.now() / 1000) + 60 * 20;
}

// ─── Helper: Get Token Contract ───────────────────────────
function getToken(provider, address) {
  return new ethers.Contract(address, config.ERC20_ABI, provider);
}

// ─── 1. WRAP QMS NATIVE → WQMS ───────────────────────────
async function wrapQMS(wallet, amountWei, label) {
  try {
    const wqms = new ethers.Contract(config.TOKENS.WQMS, config.ERC20_ABI, wallet);
    log.info(label, `Wrapping ${formatAmount(amountWei)} QMS → WQMS...`);
    const tx = await wqms.deposit({ value: amountWei, gasLimit: 150000n });
    const receipt = await tx.wait();
    log.success(label, `Wrapped! Tx: ${explorerTx(receipt.hash)}`);
    return true;
  } catch (e) {
    log.error(label, `Wrap failed: ${e.reason || e.message}`);
    return false;
  }
}

// ─── 2. UNWRAP WQMS → QMS NATIVE ─────────────────────────
async function unwrapWQMS(wallet, label) {
  try {
    const wqms = new ethers.Contract(config.TOKENS.WQMS, config.ERC20_ABI, wallet);
    const balance = await wqms.balanceOf(wallet.address);
    if (balance === 0n) {
      log.warn(label, "No WQMS balance to unwrap, skipping.");
      return false;
    }
    const amount = (balance * 90n) / 100n; // Unwrap 90%
    log.info(label, `Unwrapping ${formatAmount(amount)} WQMS → QMS...`);
    const tx = await wqms.withdraw(amount, { gasLimit: 150000n });
    const receipt = await tx.wait();
    log.success(label, `Unwrapped! Tx: ${explorerTx(receipt.hash)}`);
    return true;
  } catch (e) {
    log.error(label, `Unwrap failed: ${e.reason || e.message}`);
    return false;
  }
}

// ─── 3. SWAP QMS NATIVE → TOKEN ───────────────────────────
async function swapQMSForToken(wallet, amountWei, tokenOut, tokenSymbol, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const router = new ethers.Contract(config.ROUTER_ADDRESS, config.ROUTER_ABI, wallet);
      const path = [config.TOKENS.WQMS, tokenOut];

      log.info(label, `Swapping ${formatAmount(amountWei)} QMS → ${tokenSymbol}...`);

      const amounts = await router.getAmountsOut(amountWei, path).catch(() => [amountWei, 0n]);
      const tokenContract = getToken(wallet, tokenOut);
      const decimals = await tokenContract.decimals().catch(() => 18);

      const tx = await router.swapExactETHForTokens(
        0n,
        path,
        wallet.address,
        deadline(),
        { value: amountWei, gasLimit: 500000n }
      );
      const receipt = await tx.wait();
      log.success(label, `Swap successful! ${formatAmount(amountWei)} QMS → ~${formatAmount(amounts[1] || 0n, Number(decimals))} ${tokenSymbol} | Tx: ${explorerTx(receipt.hash)}`);
      return true;
    } catch (e) {
      if (attempt < 3 && isNetworkError(e)) {
        log.warn(label, `RPC connection drop on swap (${e.code || "glitch"}), auto-retrying in 3s (${attempt}/3)...`);
        await sleep(3000);
        continue;
      }
      log.error(label, `Swap QMS→${tokenSymbol} failed: ${e.reason || e.message}`);
      return false;
    }
  }
}

// ─── 4. SWAP TOKEN → QMS NATIVE ───────────────────────────
async function swapTokenForQMS(wallet, tokenIn, tokenSymbol, percentAmount, label) {
  try {
    const router = new ethers.Contract(config.ROUTER_ADDRESS, config.ROUTER_ABI, wallet);
    const tokenContract = getToken(wallet, tokenIn);

    const balance = await tokenContract.balanceOf(wallet.address);
    if (balance === 0n) {
      log.warn(label, `No ${tokenSymbol} balance, skipping reverse swap.`);
      return false;
    }

    const amountIn = BigInt(Math.floor(Number(balance) * percentAmount));
    if (amountIn === 0n) return false;

    const path = [tokenIn, config.TOKENS.WQMS];
    const decimals = await tokenContract.decimals().catch(() => 18);

    log.info(label, `Swapping ${formatAmount(amountIn, Number(decimals))} ${tokenSymbol} → QMS...`);

    await ensureApproval(wallet, tokenContract, config.ROUTER_ADDRESS, amountIn, tokenSymbol, label);

    const amounts = await router.getAmountsOut(amountIn, path).catch(() => [amountIn, 0n]);

    const tx = await router.swapExactTokensForETH(
      amountIn,
      0n,
      path,
      wallet.address,
      deadline(),
      { gasLimit: 500000n }
    );
    const receipt = await tx.wait();
    log.success(label, `Swap successful! ${formatAmount(amountIn, Number(decimals))} ${tokenSymbol} → ~${formatAmount(amounts[1] || 0n)} QMS | Tx: ${explorerTx(receipt.hash)}`);
    return true;
  } catch (e) {
    log.error(label, `Swap ${tokenSymbol}→QMS failed: ${e.reason || e.message}`);
    return false;
  }
}

// ─── 5. SWAP TOKEN → TOKEN ────────────────────────────────
async function swapTokenToToken(wallet, tokenIn, tokenOut, tokenInSymbol, tokenOutSymbol, percentAmount, label) {
  try {
    const router = new ethers.Contract(config.ROUTER_ADDRESS, config.ROUTER_ABI, wallet);
    const tokenInContract = getToken(wallet, tokenIn);

    const balance = await tokenInContract.balanceOf(wallet.address);
    if (balance === 0n) {
      log.warn(label, `No ${tokenInSymbol} balance, skipping swap.`);
      return false;
    }

    const decimals = await tokenInContract.decimals().catch(() => 18);
    const amountIn = BigInt(Math.floor(Number(balance) * percentAmount));
    if (amountIn === 0n) return false;

    const path = [tokenIn, config.TOKENS.WQMS, tokenOut];

    log.info(label, `Swapping ${formatAmount(amountIn, Number(decimals))} ${tokenInSymbol} → ${tokenOutSymbol}...`);

    await ensureApproval(wallet, tokenInContract, config.ROUTER_ADDRESS, amountIn, tokenInSymbol, label);

    const tx = await router.swapExactTokensForTokens(
      amountIn,
      0n,
      path,
      wallet.address,
      deadline(),
      { gasLimit: 500000n }
    );
    const receipt = await tx.wait();
    log.success(label, `Swap successful! ${tokenInSymbol} → ${tokenOutSymbol} | Tx: ${explorerTx(receipt.hash)}`);
    return true;
  } catch (e) {
    log.error(label, `Swap ${tokenInSymbol}→${tokenOutSymbol} failed: ${e.reason || e.message}`);
    return false;
  }
}

// ─── 6. ADD LIQUIDITY (QMS + Token) ──────────────────────
async function addLiquidityETH(wallet, token, tokenSymbol, ethAmountWei, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const router = new ethers.Contract(config.ROUTER_ADDRESS, config.ROUTER_ABI, wallet);
      const tokenContract = getToken(wallet, token);

      const tokenBalance = await tokenContract.balanceOf(wallet.address);
      if (tokenBalance === 0n) {
        log.warn(label, `No ${tokenSymbol} balance to add liquidity, skipping.`);
        return false;
      }

      const amounts = await router.getAmountsOut(ethAmountWei, [config.TOKENS.WQMS, token]).catch(() => null);
      if (!amounts) {
        if (attempt < 3) {
          await sleep(2000);
          continue;
        }
        return false;
      }

      const tokenAmountDesired = amounts[1];
      const tokenAmount = tokenAmountDesired > tokenBalance ? tokenBalance : tokenAmountDesired;

      if (tokenAmount === 0n) return false;

      const decimals = await tokenContract.decimals().catch(() => 18);
      log.info(label, `Adding Liquidity: ${formatAmount(ethAmountWei)} QMS + ${formatAmount(tokenAmount, Number(decimals))} ${tokenSymbol}...`);

      await ensureApproval(wallet, tokenContract, config.ROUTER_ADDRESS, tokenAmount, tokenSymbol, label);

      const tx = await router.addLiquidityETH(
        token,
        tokenAmount,
        0n,
        0n,
        wallet.address,
        deadline(),
        { value: ethAmountWei, gasLimit: 500000n }
      );
      const receipt = await tx.wait();
      log.success(label, `Add Liquidity successful! QMS + ${tokenSymbol} | Tx: ${explorerTx(receipt.hash)}`);
      return true;
    } catch (e) {
      if (attempt < 3 && isNetworkError(e)) {
        log.warn(label, `RPC connection drop on addLiquidity (${e.code || "glitch"}), auto-retrying in 3s (${attempt}/3)...`);
        await sleep(3000);
        continue;
      }
      log.error(label, `Add Liquidity failed: ${e.reason || e.message}`);
      return false;
    }
  }
}

// ─── 7. REMOVE LIQUIDITY (QMS + Token) ───────────────────
async function removeLiquidityETH(wallet, pairAddress, token, tokenSymbol, label) {
  try {
    const router = new ethers.Contract(config.ROUTER_ADDRESS, config.ROUTER_ABI, wallet);
    const pairContract = new ethers.Contract(pairAddress, config.PAIR_ABI, wallet);

    const lpBalance = await pairContract.balanceOf(wallet.address);
    if (lpBalance === 0n) {
      log.warn(label, `No LP token ${tokenSymbol}/QMS balance, skipping remove.`);
      return false;
    }

    const percent = randomPercent(0.5, 0.8);
    const amountLP = BigInt(Math.floor(Number(lpBalance) * percent));

    log.info(label, `Removing Liquidity: ${formatAmount(amountLP)} LP (${tokenSymbol}/QMS)...`);

    await ensureApproval(wallet, pairContract, config.ROUTER_ADDRESS, amountLP, `LP-${tokenSymbol}`, label);

    const tx = await router.removeLiquidityETH(
      token,
      amountLP,
      0n,
      0n,
      wallet.address,
      deadline(),
      { gasLimit: 500000n }
    );
    const receipt = await tx.wait();
    log.success(label, `Remove Liquidity successful! | Tx: ${explorerTx(receipt.hash)}`);
    return true;
  } catch (e) {
    log.error(label, `Remove Liquidity failed: ${e.reason || e.message}`);
    return false;
  }
}

// ─── 8. ADD LIQUIDITY (Token + Token) ────────────────────
async function addLiquidityTokens(wallet, tokenA, tokenB, symbolA, symbolB, label) {
  try {
    const router = new ethers.Contract(config.ROUTER_ADDRESS, config.ROUTER_ABI, wallet);
    const contractA = getToken(wallet, tokenA);
    const contractB = getToken(wallet, tokenB);

    const balA = await contractA.balanceOf(wallet.address);
    const balB = await contractB.balanceOf(wallet.address);
    const decA = await contractA.decimals().catch(() => 18);
    const decB = await contractB.decimals().catch(() => 18);

    if (balA === 0n || balB === 0n) {
      log.warn(label, `${symbolA} or ${symbolB} balance is empty, skipping.`);
      return false;
    }

    const amtA = (balA * 20n) / 100n;
    const amtB = (balB * 20n) / 100n;

    log.info(label, `Adding Liquidity: ${formatAmount(amtA, Number(decA))} ${symbolA} + ${formatAmount(amtB, Number(decB))} ${symbolB}...`);

    await ensureApproval(wallet, contractA, config.ROUTER_ADDRESS, amtA, symbolA, label);
    await ensureApproval(wallet, contractB, config.ROUTER_ADDRESS, amtB, symbolB, label);

    const tx = await router.addLiquidity(
      tokenA, tokenB,
      amtA, amtB,
      0n,
      0n,
      wallet.address,
      deadline(),
      { gasLimit: 500000n }
    );
    const receipt = await tx.wait();
    log.success(label, `Add Liquidity ${symbolA}+${symbolB} successful! | Tx: ${explorerTx(receipt.hash)}`);
    return true;
  } catch (e) {
    log.error(label, `Add Liquidity ${symbolA}+${symbolB} failed: ${e.reason || e.message}`);
    return false;
  }
}

// ─── 9. REMOVE LIQUIDITY (Token + Token) ─────────────────
async function removeLiquidityTokens(wallet, pairAddress, tokenA, tokenB, symbolA, symbolB, label) {
  try {
    const router = new ethers.Contract(config.ROUTER_ADDRESS, config.ROUTER_ABI, wallet);
    const pairContract = new ethers.Contract(pairAddress, config.PAIR_ABI, wallet);

    const lpBalance = await pairContract.balanceOf(wallet.address);
    if (lpBalance === 0n) {
      log.warn(label, `No LP ${symbolA}/${symbolB} balance, skipping.`);
      return false;
    }

    const amountLP = (lpBalance * 60n) / 100n;
    log.info(label, `Removing Liquidity: ${formatAmount(amountLP)} LP (${symbolA}/${symbolB})...`);

    await ensureApproval(wallet, pairContract, config.ROUTER_ADDRESS, amountLP, `LP-${symbolA}-${symbolB}`, label);

    const tx = await router.removeLiquidity(
      tokenA, tokenB,
      amountLP, 0n, 0n,
      wallet.address,
      deadline(),
      { gasLimit: 500000n }
    );
    const receipt = await tx.wait();
    log.success(label, `Remove Liquidity ${symbolA}/${symbolB} successful! | Tx: ${explorerTx(receipt.hash)}`);
    return true;
  } catch (e) {
    log.error(label, `Remove Liquidity ${symbolA}/${symbolB} failed: ${e.reason || e.message}`);
    return false;
  }
}

// ─── 10. TRANSFER BETWEEN WALLETS ─────────────────────────
async function transferToWallet(wallet, toAddress, amountWei, label) {
  try {
    log.info(label, `Transferring ${formatAmount(amountWei)} QMS → ${toAddress.slice(0, 8)}...`);
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: amountWei,
      gasLimit: 100000n,
    });
    const receipt = await tx.wait();
    log.success(label, `Transfer successful! | Tx: ${explorerTx(receipt.hash)}`);
    return true;
  } catch (e) {
    log.error(label, `Transfer failed: ${e.reason || e.message}`);
    return false;
  }
}

module.exports = {
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
};
