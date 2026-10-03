# QMS Testnet Automation Toolkit ⚡

An automated interaction toolkit for exploring and testing smart contract features on the **QMS Network Testnet** and **Qwap DEX**.

> [!IMPORTANT]
> **DYOR (Do Your Own Research) & Disclaimer**
> 
> * This project is created **strictly for educational, experimental, and fun purposes**.
> * It operates exclusively on the **QMS Testnet** (Chain ID `19480`). Testnet tokens have **no monetary value**.
> * This toolkit is provided "as is" without warranty of any kind. Use it responsibly and at your own risk.
> * Always keep your private keys secure and never share your `.env` file publicly.

---

## 🌟 Features

* 🔄 **Automated Token Swaps:** Executes swaps between QMS Native and supported ERC-20 tokens (`USDC`, `USDT`, `WETH`, `WBTC`).
* 🔀 **Cross-Token & Reverse Swaps:** Performs token-to-token trades and reverse conversions.
* 💧 **Liquidity Management:** Automates both **Add Liquidity** and **Remove Liquidity** across native and token-pair pools.
* 📦 **Token Wrapping:** Handles `QMS ↔ WQMS` wrap and unwrap operations.
* 🎯 **Quanta Farming Mode:** Built-in module optimized for completed sets (1 Swap + 1 Add LP per cycle) with tracking log output.
* 🛡️ **Execution Safety:** Features explicit gas limits, randomized delay timings, and transaction amounts capped strictly under 3 QMS per execution.

---

## 🛠️ Prerequisites

* [Node.js](https://nodejs.org/) (v18 or higher)
* Testnet QMS tokens claimed from the official faucet: [faucet.testnet.qms.finance](https://faucet.testnet.qms.finance/)

---

## 🚀 Installation & Setup

1. **Clone or Download Repository:**
   ```bash
   cd QMS
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the `.env.example` template to `.env`:
   ```bash
   cp .env.example .env
   ```

4. **Add Private Key(s):**
   Open `.env` and insert your private key(s):
   ```env
   PRIVATE_KEYS=0xYOUR_PRIVATE_KEY_HERE
   ```
   *(For multiple wallets, separate private keys with a comma)*

---

## 📖 Usage

### Option 1: Full Protocol Automation
Runs the complete, multi-phase execution sequence (Buying Tokens → Swaps → Adding Liquidity → Removing Liquidity → Wrapping):
```bash
npm start
```
*or*
```bash
node bot.js
```

---

### Option 2: Quanta Farming Mode (Testnet Trials)
Runs targeted set sequences (1 Swap + 1 Add Liquidity per set) with set delays and progress tracking:
```bash
npm run quanta
```
*or*
```bash
node quanta-bot.js
```

---

## ⚙️ Configuration Options

Customizable settings in `.env`:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DELAY_MIN_MS` | Minimum delay between actions (ms) | `10000` |
| `DELAY_MAX_MS` | Maximum delay between actions (ms) | `30000` |
| `CYCLE_DELAY_MIN_MS` | Minimum delay between cycles (ms) | `60000` |
| `CYCLE_DELAY_MAX_MS` | Maximum delay between cycles (ms) | `120000` |
| `MAX_CYCLES` | Number of cycles (`0` = continuous) | `0` |
| `MAX_SETS` | Target sets for Quanta mode | `10` |
| `SET_DELAY_MS` | Delay between Quanta sets (ms) | `900000` (15 mins) |

---

## 📄 License & Terms

Distributed under the **ISC License**. For testing and experimental use only.
