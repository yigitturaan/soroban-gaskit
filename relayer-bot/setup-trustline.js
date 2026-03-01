require("dotenv").config();
const StellarSdk = require("@stellar/stellar-sdk");

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

const USDC_ISSUER = "GCKIUOTK3NWD33ONH7TQERCSLECXLWQMA377HSJR4E2MV7KPQFAQLOLN";
const USDC_CODE = "USDC";

async function main() {
  const { RELAYER_SECRET_KEY } = process.env;
  if (!RELAYER_SECRET_KEY) {
    console.error("RELAYER_SECRET_KEY is required in .env");
    process.exit(1);
  }

  const keypair = StellarSdk.Keypair.fromSecret(RELAYER_SECRET_KEY);
  const publicKey = keypair.publicKey();
  console.log(`Relayer public key: ${publicKey}`);

  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
  const account = await horizon.loadAccount(publicKey);

  const existing = account.balances.find(
    (b) => b.asset_code === USDC_CODE && b.asset_issuer === USDC_ISSUER,
  );
  if (existing) {
    console.log(`Trustline already exists (balance: ${existing.balance} USDC)`);
    process.exit(0);
  }

  const usdc = new StellarSdk.Asset(USDC_CODE, USDC_ISSUER);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(StellarSdk.Operation.changeTrust({ asset: usdc }))
    .setTimeout(60)
    .build();

  tx.sign(keypair);

  const result = await horizon.submitTransaction(tx);
  console.log(`Trustline created! Hash: ${result.hash}`);
}

main().catch((err) => {
  console.error("Failed:", err.response?.data?.extras?.result_codes ?? err.message);
  process.exit(1);
});
