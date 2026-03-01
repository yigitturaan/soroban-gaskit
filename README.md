# Stellar Paymaster MVP

Gas abstraction (gasless USDC) on Stellar Testnet: users pay fees in USDC, relayer covers XLM network fees.

## Components

- **fee-forwarder/** — Soroban contract (`forward_transfer` / `execute_proxy`)
- **relayer-bot/** — Express server that signs and submits user transactions
- **frontend/** — React + Freighter wallet, Stellar Gas Station UI

## Quick start

1. **Contract:** `cd fee-forwarder && stellar contract build && stellar contract deploy ...`
2. **Relayer:** `cd relayer-bot && npm i && node setup-trustline.js && node index.js`
3. **Frontend:** `cd frontend && npm i && npm run dev`

See `fee-forwarder/README.md`, `relayer-bot/` and `frontend/README.md` for details.

## License

MIT
