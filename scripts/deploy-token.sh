#!/usr/bin/env bash
# Deploys the native XLM Stellar Asset Contract (SAC) on Testnet.
#
# Why native XLM?
#   - Users already have XLM from Friendbot (no trustline / mint needed).
#   - Proves the same fee-forwarding flow as any SAC token.
#
# Prerequisites:
#   - stellar CLI installed  (brew install stellar-cli  or  cargo install stellar-cli)
#   - relayer-bot/.env has a real RELAYER_SECRET_KEY (funded on Testnet)
#
# Usage:
#   chmod +x scripts/deploy-token.sh
#   ./scripts/deploy-token.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load relayer secret from .env
ENV_FILE="$SCRIPT_DIR/../relayer-bot/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found."
  exit 1
fi

RELAYER_SECRET_KEY=$(grep '^RELAYER_SECRET_KEY=' "$ENV_FILE" | cut -d= -f2-)
if [[ -z "$RELAYER_SECRET_KEY" || "$RELAYER_SECRET_KEY" == SX* ]]; then
  echo "Error: Set a real RELAYER_SECRET_KEY in relayer-bot/.env first."
  echo "  Generate one:  stellar keys generate --global relayer --network testnet --fund"
  echo "  Then copy the secret:  stellar keys show relayer"
  exit 1
fi

echo "Deploying native XLM SAC on Testnet…"
echo ""

SAC_ADDRESS=$(stellar contract asset deploy \
  --asset native \
  --source-account "$RELAYER_SECRET_KEY" \
  --network testnet)

echo "--------------------------------------------"
echo "SAC Contract Address:  $SAC_ADDRESS"
echo "--------------------------------------------"
echo ""
echo "Next steps:"
echo "  1. Open  frontend/src/App.jsx"
echo "  2. Set   TOKEN_CONTRACT = \"$SAC_ADDRESS\""
echo "  3. Fund your Freighter wallet via Friendbot:"
echo "     https://friendbot.stellar.org/?addr=<YOUR_G_ADDRESS>"
echo "  4. Restart the frontend (npm run dev)"
