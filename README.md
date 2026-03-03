# Soroban GasKit

> The action-agnostic **Gas Abstraction** SDK for Soroban.
> Users pay fees in USDC — zero XLM required. Any contract call. Three lines to integrate.

[![Soroban](https://img.shields.io/badge/Soroban-Powered-blue?logo=stellar)](https://soroban.stellar.org)
[![Stellar Network](https://img.shields.io/badge/Stellar-Testnet-green?logo=stellar)](https://soroban-testnet.stellar.org)
[![Open Source](https://img.shields.io/badge/Open%20Source-MIT-yellow)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/yigitturaan/soroban-gaskit/pulls)

---

## The Problem

Every Soroban transaction requires XLM for gas. Users who hold stablecoins face an onboarding wall:

1. Acquire XLM from an exchange.
2. Fund their Stellar wallet.
3. Manage a second token they don't need — just to pay fees.
4. Heavy infrastructure: existing paymaster solutions require developers to manage complex relayer backends, API keys, and CORS configurations.

This kills conversion for consumer dApps, wallets, and payment flows.

## The Solution

**Soroban GasKit** provides true **gas abstraction** through an action-agnostic SDK. A relayer bot covers the XLM network fee and atomically collects a small token fee (0.005 USDC) from the user — all in a single transaction.

- **Any contract call** — transfers, swaps, mints, governance votes.
- **Atomic execution** — fee payment and the user action never partially fail.
- **Zero trust required** — the on-chain contract enforces the fee transfer before forwarding the call.
- **Client-side simplicity** — no API keys or backend proxies required. A truly lightweight, zero-configuration module built for frontend developers.

---

## Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐       ┌──────────────┐
│              │       │                  │       │              │       │              │
│  User / DApp │──────▶│   GasKit SDK     │──────▶│  Relayer Bot │──────▶│  Soroban RPC │
│              │       │                  │       │   (Render)   │       │  (Testnet)   │
│  [WALLET]    │       │  [CLIENT-SIDE]   │       │  [API]       │       │  [ON-CHAIN]  │
│              │       │                  │       │              │       │              │
└──────────────┘       └──────────────────┘       └──────────────┘       └──────────────┘
     Freighter            Simulate TX,              Sign XDR,             execute_proxy
     signs auth           assemble auth             submit TX             fee + action
```

**Flow:**

1. **GasKit SDK** builds the `execute_proxy` transaction using the relayer's account as the source.
2. **GasKit SDK** simulates via Soroban RPC, signs the user's auth entries with Freighter.
3. **Relayer Bot** receives the assembled XDR, signs with its keypair, and submits.
4. **On-chain**, the `FeeForwarder` contract atomically transfers the USDC fee, then forwards the user's contract call.

---

## Developer Experience

**MVP Status & Integration:** For this hackathon MVP, the SDK is provided as a highly portable, zero-dependency (aside from `stellar-sdk`) ES module (`SorobanGasKit.js`). You can drop it directly into your frontend (`App.jsx` or similar) in any React/Vite/Node project. Publishing to the npm registry (`npm install soroban-gaskit`) with full TypeScript (`.d.ts`) support is our immediate priority for V2.

**Bring Your Own Token (BYOT) **

While this demo showcase uses a specific Testnet USDC, **Soroban GasKit is completely token-agnostic.** Developers are not locked into our token. To use this in your own dApp, simply replace the `feeToken` ID with your own custom Soroban token or stablecoin.

```javascript
import { SorobanGasKit } from "./SorobanGasKit"; // Drop the module into your project

// 1. Initialize the kit with your custom parameters
const gaskit = new SorobanGasKit({
  rpcUrl:           "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  contractId:       "CAPDJ4F...UZGSNCY",   // The deployed FeeForwarder contract
  feeToken:         "CA63EPM...LTVNR4",    // REPLACE THIS with your own Token ID!
  relayerUrl:       "https://stellar-gas-station-api.onrender.com/relay",
  relayerPublicKey: "GCF57AY...SHTT5KW",
  feeAmount:        50_000n,                // 0.005 tokens (assuming 7-decimals)
});

// 2. Wrap any contract call into a gasless transaction
await gaskit.execute({
  user:           publicKey,
  targetContract: "CUSDC...", // Can be a token, NFT, or governance contract
  functionName:   "transfer",  // Any valid function on the target contract
  args:           [from, to, amount],
  signer:         freighterSigner,
});
```

Any Soroban contract call can be wrapped — the SDK is not limited to token transfers.

---

## Repository Structure

```
soroban-gaskit/
├── fee-forwarder/     Soroban smart contract (Rust)
│   └── execute_proxy()   Atomic fee collection + arbitrary call forwarding
│   └── forward_transfer() Convenience method for token transfers
├── relayer-bot/       Express.js relay server (deployed on Render)
│   └── POST /relay       Accepts assembled XDR, signs, submits to Soroban RPC
├── frontend/          React + Vite showcase (deployed on Vercel)
│   └── SorobanGasKit.js     The SDK — portable, zero dependencies beyond stellar-sdk
│   └── App.jsx              Interactive demo with live transaction execution
```

| Component | Role | Tech |
|-----------|------|------|
| **fee-forwarder** | On-chain fee enforcement | Rust / Soroban SDK |
| **relayer-bot** | XLM fee sponsorship & TX submission | Node.js / Express |
| **frontend** | Product showcase & interactive demo | React / Vite |
| **SorobanGasKit.js** | Portable client SDK | Stellar SDK / Axios |

---

## Live Deployment

| Resource | URL |
|----------|-----|
| Demo (Frontend) | [soroban-gaskit.vercel.app](https://soroban-gaskit.vercel.app) |
| Relay API | `https://stellar-gas-station-api.onrender.com/relay` |
| GitHub | [github.com/yigitturaan/soroban-gaskit](https://github.com/yigitturaan/soroban-gaskit) |

---

## Quick Start

### Prerequisites

- Node.js 18+
- [Freighter Wallet](https://freighter.app) browser extension
- Stellar Testnet USDC in your wallet

### Run Locally

```bash
# Relayer Bot
cd relayer-bot
cp .env.example .env        # Add your relayer secret key
npm install
node index.js               # Starts on :3001

# Frontend
cd frontend
npm install
npm run dev                  # Starts on :5173
```

### Deploy the Contract

```bash
cd fee-forwarder
stellar contract build
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/hello_world.wasm \
  --source <DEPLOYER> --network testnet
```

---

## Roadmap

| Phase | Milestone | Status |
|-------|-----------|--------|
| **V1** | Action-agnostic `execute_proxy` contract | Done |
| **V1** | Portable GasKit SDK | Done |
| **V1** | Relayer Bot deployed on Render | Done |
| **V1** | Interactive demo with live transactions | Done |
| **V2** | Sponsored trustlines via Claimable Balances | Planned |
| **V2** | Multi-token fee support (USDC, EURC, custom) | Planned |
| **V2** | Rate limiting, nonce management, fee oracle | Planned |
| **V2** | Mainnet security audit & deployment | Planned |

---

## How It Works (Technical)

The `FeeForwarder` Soroban contract exposes a single entry point:

```rust
pub fn execute_proxy(
    env:             Env,
    fee_token:       Address,    // e.g. USDC
    user:            Address,    // pays the fee
    relayer:         Address,    // receives the fee
    fee_amount:      i128,       // 0.005 USDC = 50_000
    target_contract: Address,    // any Soroban contract
    function_name:   Symbol,     // any function
    args:            Vec<Val>,   // encoded arguments
) -> Val
```

1. `user.require_auth()` — the user must authorize via Freighter.
2. `token::transfer(user → relayer, fee_amount)` — fee is collected first.
3. `env.invoke_contract(target, fn, args)` — the actual call is forwarded.

If either step fails, the entire transaction reverts. No partial state changes.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## Community & Support

Contributions are welcome! Feel free to [open issues](https://github.com/yigitturaan/soroban-gaskit/issues) or [submit PRs](https://github.com/yigitturaan/soroban-gaskit/pulls) to improve the Soroban GasKit ecosystem.
