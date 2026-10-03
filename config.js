// ============================================================
//  QMS TESTNET BOT - KONFIGURASI JARINGAN & CONTRACT
// ============================================================

module.exports = {
  // === NETWORK ===
  RPC_URL: "https://rpc.testnet.qms.finance",
  CHAIN_ID: 19480,
  NETWORK_NAME: "QMS Testnet",
  EXPLORER_URL: "https://testnet.qmsscan.io",

  // === CONTRACT ADDRESSES ===
  ROUTER_ADDRESS: "0x93AFF45f28e5DF1b55f5AEFEfB807De843b12619",
  FACTORY_ADDRESS: "0x93AFD9aC50822F82c7C4f2Ec8Ec2463b086Fb878",

  // === ALL TOKEN ADDRESSES ===
  TOKENS: {
    WQMS: "0x9AA510295aC664A3d5A3182a3eFe959DE2B12c34", // Decimals: 18
    USDC: "0xDfF68E53a0A8275212927c12017f5aB5f1842a04", // Decimals: 6
    WETH: "0x9aff7FEe3C9C0599ca9d8F88C1f23A8dbB002325", // Decimals: 18
    WBTC: "0xD0d47E0BFFfdF57d79DC42B03a0aF31e608EF2c6", // Decimals: 8
    USDT: "0x72577544f4134a25E7f09d0B5FF0ca05A1249EbF", // Decimals: 6
  },

  // === PAIR ADDRESSES ===
  PAIRS: {
    WQMS_USDC: "0x07e2fc733B75e8107342b58fb49aE311C4DB0643",
    WQMS_WETH: "0xAccDED73a352887CeCbfEbEa5ddCcA5b6Fb64173",
    WETH_USDC: "0x176BB2fC382b959DE635f9aA6B93E3C7d631eC0D",
    WQMS_WBTC: "0x07932dbD779BeaF25fdB72E5cE1E5dC380c28f2a",
    USDT_WBTC: "0x7dE6D567EE50A2ffCb072bd2910ED694d3E03883",
    USDT_WQMS: "0xBD8D322E8170ab24cF823f3c7315ddE951E7090D",
    WBTC_USDC: "0xe5EF663652cd2f7b3010abc9a02b0cdbe41ed20C",
    USDT_USDC: "0xb090d15EBb28A716a3BC2e6a799E5a3372881492",
    USDT_WETH: "0xB14c1C5FadC037c932B7396CF221dB6B5c22CedC",
  },

  // === UNISWAP V2 ABIS ===
  ROUTER_ABI: [
    "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
    "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
    "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
    "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
    "function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external returns (uint256 amountToken, uint256 amountETH)",
    "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
    "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
    "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
    "function WETH() external pure returns (address)",
  ],

  ERC20_ABI: [
    "function balanceOf(address owner) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
    "function symbol() external view returns (string)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function deposit() external payable",
    "function withdraw(uint256 amount) external",
  ],

  PAIR_ABI: [
    "function balanceOf(address owner) external view returns (uint256)",
    "function totalSupply() external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function symbol() external view returns (string)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  ],
};
