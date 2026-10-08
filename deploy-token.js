/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   QMS TESTNET — MULTI-WALLET AUTO DEPLOY ENGINE             ║
 * ║                                                              ║
 * ║   Deploys one smart contract from EACH active wallet        ║
 * ║   with random Meme names, symbols, and total supply.        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   npm run deploy-token
 *   node deploy-token.js
 */

'use strict';

require('dotenv').config();
const { ethers } = require('ethers');
const solc       = require('solc');
const fs         = require('fs');
const path       = require('path');
const chalk      = require('chalk');

// ─── Network ─────────────────────────────────────────────────────────────────

const RPC_URL  = 'https://rpc.testnet.qms.finance';
const CHAIN_ID = 19480;
const EXPLORER = 'https://testnet.qmsscan.io';

// ─── Solana meme token list ───────────────────────────────────────────────────

const SOLANA_TOKENS = [
  { name: 'Bonk',                    symbol: 'BONK'    },
  { name: 'dogwifhat',               symbol: 'WIF'     },
  { name: 'Popcat',                  symbol: 'POPCAT'  },
  { name: 'Book of Meme',            symbol: 'BOME'    },
  { name: 'cat in a dogs world',     symbol: 'MEW'     },
  { name: 'Myro',                    symbol: 'MYRO'    },
  { name: 'Slerf',                   symbol: 'SLERF'   },
  { name: 'Samo',                    symbol: 'SAMO'    },
  { name: 'Cope',                    symbol: 'COPE'    },
  { name: 'Raydium',                 symbol: 'RAY'     },
  { name: 'Orca',                    symbol: 'ORCA'    },
  { name: 'Shadow Token',            symbol: 'SHDW'    },
  { name: 'Mango Markets',           symbol: 'MNGO'    },
  { name: 'Step Finance',            symbol: 'STEP'    },
  { name: 'Jito',                    symbol: 'JTO'     },
  { name: 'Pyth Network',            symbol: 'PYTH'    },
  { name: 'Jupiter',                 symbol: 'JUP'     },
  { name: 'Marinade',                symbol: 'MNDE'    },
  { name: 'Helium',                  symbol: 'HNT'     },
  { name: 'Render',                  symbol: 'RNDR'    },
  { name: 'Parcl',                   symbol: 'PRCL'    },
  { name: 'Tensor',                  symbol: 'TNSR'    },
  { name: 'Kamino',                  symbol: 'KMNO'    },
  { name: 'Drift Protocol',          symbol: 'DRIFT'   },
  { name: 'Zeta Markets',            symbol: 'ZEX'     },
  { name: 'Nosana',                  symbol: 'NOS'     },
  { name: 'Grass',                   symbol: 'GRASS'   },
  { name: 'Fartcoin',                symbol: 'FART'    },
  { name: 'Peanut the Squirrel',     symbol: 'PNUT'    },
  { name: 'Gigachad',                symbol: 'GIGA'    },
  { name: 'Neiro',                   symbol: 'NEIRO'   },
  { name: 'Act I The AI Prophecy',   symbol: 'ACT'     },
  { name: 'Moodeng',                 symbol: 'MOODENG' },
  { name: 'Goatseus Maximus',        symbol: 'GOAT'    },
  { name: 'Turbo',                   symbol: 'TURBO'   },
  { name: 'Harambe',                 symbol: 'HARAMBE' },
  { name: 'Mother Iggy',             symbol: 'MOTHER'  },
  { name: 'Aura',                    symbol: 'AURA'    },
  { name: 'Sigma',                   symbol: 'SIGMA'   },
  { name: 'Ponke',                   symbol: 'PONKE'   },
  { name: 'Catwifhat',               symbol: 'CWIF'    },
  { name: 'Chillguy',                symbol: 'CHILLGUY'},
  { name: 'Wen',                     symbol: 'WEN'     },
  { name: 'Smog',                    symbol: 'SMOG'    },
  { name: 'Billy',                   symbol: 'BILLY'   },
  { name: 'Ninja',                   symbol: 'NINJA'   },
  { name: 'Ansem',                   symbol: 'ANSEM'   },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const log = {
  info:    (...a) => console.log(chalk.cyan('  ℹ'), ...a),
  success: (...a) => console.log(chalk.green('  ✅'), ...a),
  warn:    (...a) => console.log(chalk.yellow('  ⚠'), ...a),
  error:   (...a) => console.log(chalk.red('  ✗'), ...a),
  tx:      (hash) => console.log(chalk.gray('    TX →'), chalk.blue(`${EXPLORER}/tx/${hash}`)),
  addr:    (a)    => chalk.magenta(a.slice(0, 6) + '…' + a.slice(-4)),
};

const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep      = (ms)  => new Promise(r => setTimeout(r, ms));

// Random supply between 1 Million and 1 Trillion
function randomSupply() {
  const min = 1_000_000;
  const max = 1_000_000_000_000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Key normalizer & Wallet Loader ──────────────────────────────────────────

function normalizeKey(raw) {
  if (!raw) return null;
  let k = raw.trim();
  if (!k || k === '0xYOUR_PRIVATE_KEY_HERE') return null;
  k = k.replace(/^[^0-9a-fA-F]*/, ''); // strip prefix garbage
  if (!k.startsWith('0x')) k = '0x' + k;
  k = k.replace(/^0x(0x)+/, '0x');     // fix doubled 0x
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) return null;
  return k;
}

function loadWallets(provider) {
  const wallets = [];
  const seen = new Set();
  
  if (process.env.PRIVATE_KEYS) {
    const keys = process.env.PRIVATE_KEYS.split(',').map(normalizeKey).filter(Boolean);
    for (const key of keys) {
      if (!seen.has(key)) {
        seen.add(key);
        wallets.push(new ethers.Wallet(key, provider));
      }
    }
  }
  
  if (wallets.length === 0) {
    log.error('No valid private keys found in .env! Set PRIVATE_KEYS=0xKey1,0xKey2,...');
    process.exit(1);
  }
  return wallets;
}

// ─── Compile MemeToken.sol ────────────────────────────────────────────────────

function compileContract() {
  const contractPath = path.join(__dirname, 'contracts', 'MemeToken.sol');
  const source       = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources:  { 'MemeToken.sol': { content: source } },
    settings: {
      optimizer:       { enabled: true, runs: 200 },
      evmVersion:      'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
    },
  };

  log.info('Compiling MemeToken.sol (Only once for all wallets)…');
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  const fatal = (output.errors || []).filter(e => e.severity === 'error');
  if (fatal.length > 0) {
    fatal.forEach(e => log.error(e.formattedMessage));
    throw new Error('Compilation failed');
  }

  const contract = output.contracts['MemeToken.sol']['MemeToken'];
  log.success('Compilation OK');
  return { abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + chalk.bold.magenta('╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.magenta('║   QMS MULTI-WALLET AUTO DEPLOY ENGINE               ║'));
  console.log(chalk.bold.magenta('╚══════════════════════════════════════════════════════╝') + '\n');

  // 1. Connect
  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'qms-testnet' });
  const currentBlock = await provider.getBlockNumber();
  log.success(`Connected to QMS Testnet — block #${currentBlock}`);

  // 2. Load Wallets
  const wallets = loadWallets(provider);
  log.info(`Loaded ${chalk.bold(wallets.length)} active wallet(s) from .env`);

  // 3. Compile
  console.log();
  const { abi, bytecode } = compileContract();
  
  const logDir = path.join(__dirname, 'deployments');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

  // 4. Iterate over all wallets and deploy
  let successCount = 0;

  for (let i = 0; i < wallets.length; i++) {
    const deployer = wallets[i];
    const label    = `Wallet-${i + 1}`;
    
    console.log('\n' + chalk.bold.yellow(`▶ [${label}] Deploying Token...`));
    
    const balance = await provider.getBalance(deployer.address);
    log.info(`Address : ${log.addr(deployer.address)} (${ethers.formatEther(balance)} QMS)`);

    if (balance < ethers.parseEther('0.01')) {
      log.warn(`Skipping ${label} — Not enough QMS for gas. Faucet: https://faucet.testnet.qms.finance`);
      continue;
    }

    // Pick random setup
    const picked = randomPick(SOLANA_TOKENS);
    const supply = randomSupply();

    log.info(`Name    : ${chalk.bold.white(picked.name)}`);
    log.info(`Symbol  : ${chalk.bold.white(picked.symbol)}`);
    log.info(`Supply  : ${supply.toLocaleString()} ${picked.symbol}`);

    try {
      const factory  = new ethers.ContractFactory(abi, bytecode, deployer);
      const contract = await factory.deploy(picked.name, picked.symbol, supply, {
        gasLimit: 3_000_000n,
      });

      log.info(`TX Hash : ${contract.deploymentTransaction().hash}`);
      log.info('Waiting for confirmation…');
      await contract.waitForDeployment();

      const contractAddress = await contract.getAddress();
      log.success(`Deployed at: ${chalk.bold.green(contractAddress)}`);
      console.log(chalk.gray(`    Explorer → ${EXPLORER}/address/${contractAddress}`));
      
      // Save log for this deployment
      const record = {
        deployedAt:     new Date().toISOString(),
        network:        'QMS Testnet',
        contractAddress,
        tokenName:      picked.name,
        tokenSymbol:    picked.symbol,
        totalSupply:    supply,
        deployer:       deployer.address,
        deployTxHash:   contract.deploymentTransaction().hash,
      };
      
      const logFile = path.join(logDir, `${picked.symbol}_${Date.now()}.json`);
      fs.writeFileSync(logFile, JSON.stringify(record, null, 2));
      successCount++;
      
    } catch (err) {
      log.error(`Deployment failed for ${label}: ${err.message}`);
    }

    // Sleep before next wallet to avoid rapid RPC spam
    if (i < wallets.length - 1) {
      log.info('Sleeping 3 seconds before next wallet...');
      await sleep(3000);
    }
  }

  console.log('\n' + chalk.bold.green('══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.green(`  ✅  ALL DEPLOYMENTS COMPLETE`));
  console.log(chalk.bold.white(`  Successfully deployed: ${successCount} / ${wallets.length} token(s)`));
  console.log(chalk.bold.white(`  Check logs inside    : deployments/`));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════════') + '\n');
}

main().catch(err => {
  log.error('Fatal:', err.message);
  process.exit(1);
});
