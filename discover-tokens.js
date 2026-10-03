// Script sementara untuk get token addresses dari factory
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider("https://rpc.testnet.qms.finance");

// Token addresses yang terlihat di screenshot (partial)
// USDT: 0x7257...9EbF
// WBTC: 0xD0d4...F2c6
// Kita query Factory untuk mendapatkan semua pair

const FACTORY = "0x93AFD9aC50822F82c7C4f2Ec8Ec2463b086Fb878";
const FACTORY_ABI = [
  "function allPairsLength() view returns (uint256)",
  "function allPairs(uint256) view returns (address)",
  "function getPair(address, address) view returns (address)",
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function symbol() view returns (string)",
];
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, provider);
  const totalPairs = await factory.allPairsLength();
  console.log(`Total pairs: ${totalPairs}`);

  const tokens = new Map();

  for (let i = 0; i < totalPairs; i++) {
    const pairAddr = await factory.allPairs(i);
    const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
    const t0 = await pair.token0();
    const t1 = await pair.token1();

    for (const t of [t0, t1]) {
      if (!tokens.has(t)) {
        const erc20 = new ethers.Contract(t, ERC20_ABI, provider);
        const sym = await erc20.symbol().catch(() => "???");
        const name = await erc20.name().catch(() => "???");
        const dec = await erc20.decimals().catch(() => 18);
        tokens.set(t, { symbol: sym, name, decimals: dec });
        console.log(`Token: ${sym} (${name}) | ${t} | decimals: ${dec}`);
      }
    }
    console.log(`Pair #${i}: ${pairAddr}`);
    console.log(`  token0: ${tokens.get(t0)?.symbol} | ${t0}`);
    console.log(`  token1: ${tokens.get(t1)?.symbol} | ${t1}`);
    console.log();
  }
}

main().catch(console.error);
