require("dotenv").config();
const express = require("express");
const cors = require("cors");
const StellarSdk = require("@stellar/stellar-sdk");

const { PORT = 3001, RELAYER_SECRET_KEY } = process.env;
if (!RELAYER_SECRET_KEY) {
  console.error("RELAYER_SECRET_KEY is required in .env");
  process.exit(1);
}

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;

const relayerKeypair = StellarSdk.Keypair.fromSecret(RELAYER_SECRET_KEY);
const rpcServer = new StellarSdk.rpc.Server(RPC_URL);

function extractSorobanError(resultXdr) {
  try {
    const result = StellarSdk.xdr.TransactionResult.fromXDR(resultXdr, "base64");
    const innerResult = result.result();
    const code = innerResult.switch().name;

    const results = innerResult.results?.();
    if (results && results.length > 0) {
      const opResult = results[0].tr?.().invokeHostFunctionResult?.();
      if (opResult) {
        const opCode = opResult.switch().name;
        return `${code} / ${opCode}`;
      }
    }
    return code;
  } catch {
    return null;
  }
}

function extractDiagnosticEvents(resultMetaXdr) {
  try {
    const meta = StellarSdk.xdr.TransactionMeta.fromXDR(resultMetaXdr, "base64");
    const v3 = meta.v3?.();
    if (!v3) return [];

    const events = v3.sorobanMeta?.()?.diagnosticEvents?.() ?? [];
    return events.map((evt) => {
      try {
        const body = evt.event().body().v0();
        const topics = body
          .topics()
          .map((t) => {
            try { return StellarSdk.scValToNative(t); }
            catch { return t.toXDR("base64"); }
          });
        let data;
        try { data = StellarSdk.scValToNative(body.data()); }
        catch { data = body.data().toXDR("base64"); }
        return { topics, data };
      } catch {
        return evt.toXDR("base64");
      }
    });
  } catch {
    return [];
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.post("/relay", async (req, res) => {
  const { txXdr } = req.body;
  if (!txXdr) {
    return res.status(400).json({ error: "Missing txXdr in request body" });
  }

  try {
    const tx = StellarSdk.TransactionBuilder.fromXDR(
      txXdr,
      NETWORK_PASSPHRASE,
    );

    if (tx instanceof StellarSdk.FeeBumpTransaction) {
      return res
        .status(400)
        .json({ error: "Expected a regular Transaction, not a FeeBumpTransaction" });
    }

    // Log auth entry details for debugging
    const op = tx.operations[0];
    if (op.type === "invokeHostFunction" && op.auth) {
      console.log(`[relay] received tx with ${op.auth.length} auth entries`);
      op.auth.forEach((entry, idx) => {
        try {
          const creds = entry.credentials();
          const credType = creds.switch().name;
          let addr = "n/a";
          let hasSig = false;
          if (credType === "sorobanCredentialsAddress") {
            const sc = creds.address().address();
            if (sc.switch().name === "scAddressTypeAccount") {
              addr = StellarSdk.StrKey.encodeEd25519PublicKey(sc.accountId().ed25519());
            }
            const sigs = creds.address().signature();
            hasSig = sigs && sigs.value && sigs.value().length > 0;
          }
          console.log(`[relay]   auth[${idx}]: type=${credType} addr=${addr.slice(0, 10)}… signed=${hasSig}`);
        } catch { /* ignore parse failures */ }
      });
    }

    // Pre-flight: re-simulate to catch stale-state issues before paying XLM
    const preflight = await rpcServer.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(preflight)) {
      const detail = preflight.error ?? "unknown simulation error";
      console.error("[relay] pre-flight simulation FAILED:", detail);
      return res.status(400).json({
        error: `Pre-flight simulation failed: ${detail}`,
        stage: "preflight",
      });
    }
    console.log("[relay] pre-flight simulation OK");

    tx.sign(relayerKeypair);

    const sendResponse = await rpcServer.sendTransaction(tx);
    console.log("[relay] sendTransaction status:", sendResponse.status, "hash:", sendResponse.hash);

    if (sendResponse.status === "ERROR") {
      const errorXdr = sendResponse.errorResult?.toXDR?.("base64") ?? null;
      const parsed = errorXdr ? extractSorobanError(errorXdr) : null;
      const detail = parsed || errorXdr || "unknown";
      console.error("[relay] sendTransaction ERROR:", detail);

      return res.status(400).json({
        error: `Transaction rejected: ${detail}`,
        resultXdr: errorXdr,
      });
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let txResult = await rpcServer.getTransaction(sendResponse.hash);

    while (txResult.status === "NOT_FOUND" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      txResult = await rpcServer.getTransaction(sendResponse.hash);
    }

    if (txResult.status === "SUCCESS") {
      console.log("[relay] SUCCESS hash:", sendResponse.hash);
      return res.json({ hash: sendResponse.hash, status: "SUCCESS" });
    }

    if (txResult.status === "NOT_FOUND") {
      return res.status(202).json({
        hash: sendResponse.hash,
        status: "PENDING",
        message: "Submitted but not confirmed within timeout — check hash later",
      });
    }

    // FAILED — extract every possible diagnostic detail
    const resultXdr = txResult.resultXdr?.toXDR?.("base64")
      ?? txResult.resultXdr ?? null;
    const resultMetaXdr = txResult.resultMetaXdr?.toXDR?.("base64")
      ?? txResult.resultMetaXdr ?? null;

    const sorobanCode = resultXdr ? extractSorobanError(resultXdr) : null;
    const diagEvents = resultMetaXdr ? extractDiagnosticEvents(resultMetaXdr) : [];

    console.error("[relay] FAILED hash:", sendResponse.hash);
    console.error("[relay] sorobanCode:", sorobanCode);
    console.error("[relay] resultXdr:", resultXdr);
    if (diagEvents.length > 0) {
      console.error("[relay] diagnosticEvents:", JSON.stringify(diagEvents, null, 2));
    }

    const errorMsg = sorobanCode
      ? `Transaction failed: ${sorobanCode}`
      : "Transaction failed on-chain (check relayer console for resultXdr)";

    return res.status(400).json({
      hash: sendResponse.hash,
      status: txResult.status,
      error: errorMsg,
      resultXdr,
      diagnosticEvents: diagEvents.length > 0 ? diagEvents : undefined,
    });
  } catch (err) {
    console.error("[relay] exception:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Fee relayer listening on port ${PORT}`);
  console.log(`Relayer public key: ${relayerKeypair.publicKey()}`);
});
