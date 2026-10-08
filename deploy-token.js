/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   QMS TESTNET — AUTO DEPLOY SMART CONTRACT                  ║
 * ║                                                              ║
 * ║   1. Pick random Solana-inspired token name/ticker           ║
 * ║   2. Compile MemeToken.sol with solc                         ║
 * ║   3. Deploy ERC-20 contract to QMS Testnet via ethers.js     ║
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

const RPC_URL        = 'https://rpc.testnet.qms.finance';
const CHAIN_ID       = 19480;
const EXPLORER       = 'https://testnet.qmsscan.io';

// ─── Config ──────────────────────────────────────────────────────────────────

const TOTAL_SUPPLY    = parseInt(process.env.TOKEN_SUPPLY || '1000000000');

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

// ─── Key normalizer ───────────────────────────────────────────────────────────

function normalizeKey(raw) {
  if (!raw) return null;
  let k = raw.trim();
  if (!k || k === '0xYOUR_PRIVATE_KEY_HERE') return null;
  k = k.replace(/^[^0-9a-fA-F]*/, '');          // strip garbage prefix (e.g. "x0x...")
  if (!k.startsWith('0x')) k = '0x' + k;
  k = k.replace(/^0x(0x)+/, '0x');              // fix doubled "0x0x..."
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) return null;
  return k;
}

function loadDeployer(provider) {
  let key = null;
  if (process.env.PRIVATE_KEYS) {
    const keys = process.env.PRIVATE_KEYS.split(',').map(normalizeKey).filter(Boolean);
    if (keys.length > 0) key = keys[0];
  }
  if (!key && process.env.PRIVATE_KEY) key = normalizeKey(process.env.PRIVATE_KEY);
  if (!key) {
    log.error('No valid private key found in .env! Set PRIVATE_KEYS=0xKey1,0xKey2,...');
    process.exit(1);
  }
  return new ethers.Wallet(key, provider);
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
      evmVersion:      'paris',   // per QMS EVM compatibility docs
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
    },
  };

  log.info('Compiling MemeToken.sol …');
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
  console.log(chalk.bold.magenta('║   QMS AUTO DEPLOY SMART CONTRACT ENGINE             ║'));
  console.log(chalk.bold.magenta('╚══════════════════════════════════════════════════════╝') + '\n');

  // 1. Connect to QMS Testnet (RPC: https://rpc.testnet.qms.finance, ChainID: 19480)
  const provider     = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: 'qms-testnet' });
  const currentBlock = await provider.getBlockNumber();
  log.success(`Connected to QMS Testnet — block #${currentBlock}`);

  // 2. Deployer wallet
  const deployer = loadDeployer(provider);
  const balance  = await provider.getBalance(deployer.address);
  log.info(`Deployer : ${log.addr(deployer.address)} (${ethers.formatEther(balance)} QMS)`);

  if (balance < ethers.parseEther('0.01')) {
    log.error('Not enough QMS for gas! Faucet → https://faucet.testnet.qms.finance');
    process.exit(1);
  }

  // 3. Pick random Solana-inspired token
  const picked = randomPick(SOLANA_TOKENS);
  console.log('\n' + chalk.bold.yellow('🎲 Token selected:'));
  log.info(`Name   : ${chalk.bold.white(picked.name)}`);
  log.info(`Symbol : ${chalk.bold.white(picked.symbol)}`);
  log.info(`Supply : ${TOTAL_SUPPLY.toLocaleString()} ${picked.symbol}`);

  // 4. Compile
  console.log();
  const { abi, bytecode } = compileContract();

  // 5. Deploy (same principle as QMS docs: point at RPC, pay gas in QMS)
  console.log('\n' + chalk.bold.cyan('🚀 Deploying contract to QMS Testnet…'));
  log.info(`RPC    : ${RPC_URL}`);
  log.info(`ChainID: ${CHAIN_ID}`);

  const factory  = new ethers.ContractFactory(abi, bytecode, deployer);
  const contract = await factory.deploy(picked.name, picked.symbol, TOTAL_SUPPLY, {
    gasLimit: 3_000_000n,
  });

  log.info(`TX     : ${contract.deploymentTransaction().hash}`);
  log.tx(contract.deploymentTransaction().hash);
  log.info('Waiting for confirmation…');
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  log.success(`Deployed at: ${chalk.bold.green(contractAddress)}`);
  console.log(chalk.gray(`    Explorer → ${EXPLORER}/address/${contractAddress}`));
  console.log(chalk.gray(`    Verify   → paste address at ${EXPLORER}`));

  // 6. Save deployment log
  const record = {
    deployedAt:     new Date().toISOString(),
    stack:          'solc 0.8.20 + ethers.js 6',
    network:        'QMS Testnet',
    rpc:            RPC_URL,
    chainId:        CHAIN_ID,
    contractAddress,
    tokenName:      picked.name,
    tokenSymbol:    picked.symbol,
    totalSupply:    TOTAL_SUPPLY,
    deployer:       deployer.address,
    explorerUrl:    `${EXPLORER}/address/${contractAddress}`,
    deployTxHash:   contract.deploymentTransaction().hash,
  };

  const logDir = path.join(__dirname, 'deployments');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
  const logFile = path.join(logDir, `${picked.symbol}_${Date.now()}.json`);
  fs.writeFileSync(logFile, JSON.stringify(record, null, 2));

  console.log('\n' + chalk.bold.green('══════════════════════════════════════════════════════════'));
  console.log(chalk.bold.green('  ✅  DEPLOYMENT COMPLETE'));
  console.log(chalk.bold.white(`  Token     : ${picked.name} (${picked.symbol})`));
  console.log(chalk.bold.white(`  Contract  : ${contractAddress}`));
  console.log(chalk.bold.white(`  Explorer  : ${EXPLORER}/address/${contractAddress}`));
  console.log(chalk.bold.white(`  Log       : deployments/${picked.symbol}_*.json`));
  console.log(chalk.bold.green('══════════════════════════════════════════════════════════') + '\n');
}

main().catch(err => {
  log.error('Fatal:', err.message);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
