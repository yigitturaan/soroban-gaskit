import { useState } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  isConnected,
  setAllowed,
  getAddress,
  signAuthEntry,
} from "@stellar/freighter-api";
import { SorobanPaymaster } from "./SorobanPaymaster";
import "./App.css";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const paymaster = new SorobanPaymaster({
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: NETWORK_PASSPHRASE,
  contractId: "CAPDJ4F747URENH5FLAKHXH377JOENTSRCY4NQBJQZZIEJEBGUZG5NCY",
  feeToken: "CA63EPM4EEXUVUANF6FQUJEJ37RWRYIXCARWFXYUMPP7RLZWFNLTVNR4",
  relayerUrl: "https://stellar-gas-station-api.onrender.com/relay",
  relayerPublicKey: "GCF57AY6GBLPG6VK3LU27A4E5CSJRYSNSBA5XB2V6MKPUVF7PSHTT5KW",
  feeAmount: 5_000_000n,
});

const SEND_AMOUNT = 100_000_000n; // 10 USDC

function freighterSigner(networkPassphrase) {
  return async (preimage) => {
    const { signedAuthEntry, error: authError, signerAddress } =
      await signAuthEntry(preimage.toXDR("base64"), { networkPassphrase });

    if (authError || !signedAuthEntry) {
      throw new Error("Authorization signing rejected.");
    }

    const sigBytes = Uint8Array.from(atob(signedAuthEntry), (c) =>
      c.charCodeAt(0),
    );
    return { signature: sigBytes, publicKey: signerAddress };
  };
}

function truncateAddress(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : "";
}

function formatUsdc(raw) {
  return (Number(raw) / 1e7).toFixed(2);
}

function App() {
  const [publicKey, setPublicKey] = useState(null);
  const [balance, setBalance] = useState(null);
  const [tokenOk, setTokenOk] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function connectWallet() {
    try {
      const { isConnected: connected } = await isConnected();
      if (!connected) {
        setStatus({ type: "error", msg: "Freighter extension not detected." });
        return;
      }

      const allowed = await setAllowed();
      if (allowed.error) {
        setStatus({ type: "error", msg: "Connection rejected by wallet." });
        return;
      }

      const { address, error } = await getAddress();
      if (error) {
        setStatus({ type: "error", msg: "Could not retrieve wallet address." });
        return;
      }

      setPublicKey(address);
      setStatus({ type: "info", msg: "Checking USDC balance…" });

      const bal = await paymaster.getTokenBalance(address);
      if (bal === null) {
        setTokenOk(false);
        setBalance(null);
        setStatus({
          type: "error",
          msg: "USDC token contract not found on Testnet.",
        });
      } else {
        setTokenOk(true);
        setBalance(bal);
        setStatus({
          type: "success",
          msg: `Wallet connected — balance: ${formatUsdc(bal)} USDC`,
        });
      }
    } catch (err) {
      setStatus({ type: "error", msg: err.message });
    }
  }

  async function handleSend() {
    if (!publicKey || !recipient) {
      setStatus({ type: "error", msg: "Enter a recipient address." });
      return;
    }

    setLoading(true);
    try {
      const result = await paymaster.execute({
        user: publicKey,
        targetContract: paymaster.feeToken,
        functionName: "transfer",
        args: [
          new StellarSdk.Address(publicKey).toScVal(),
          new StellarSdk.Address(recipient).toScVal(),
          StellarSdk.nativeToScVal(SEND_AMOUNT, { type: "i128" }),
        ],
        signer: freighterSigner(NETWORK_PASSPHRASE),
        onStatus: setStatus,
      });

      setStatus({
        type: "success",
        msg: `Transaction ${result.status}! Hash: ${result.hash}`,
      });

      const newBal = await paymaster.getTokenBalance(publicKey);
      if (newBal !== null) setBalance(newBal);
    } catch (err) {
      const respData = err.response?.data;
      let msg = respData?.error || err.message || "Unknown error occurred.";

      if (respData?.diagnosticEvents?.length) {
        const evtSummary = respData.diagnosticEvents
          .map((e) => (typeof e === "string" ? e : JSON.stringify(e.data)))
          .join(" | ");
        msg += ` [events: ${evtSummary}]`;
      }

      if (respData?.hash) {
        msg += ` (tx: ${respData.hash})`;
      }

      console.error("Relay error:", respData ?? err);
      setStatus({ type: "error", msg });
    } finally {
      setLoading(false);
    }
  }

  const needsMore = balance !== null && balance < SEND_AMOUNT + paymaster.feeAmount;

  return (
    <div className="app">
      <header>
        <h1>Stellar Gas Station</h1>
        <p className="subtitle">Gasless USDC transfers on Testnet</p>
      </header>

      <main>
        <section className="card wallet-card">
          {publicKey ? (
            <div className="connected">
              <span className="dot" />
              <span className="address">{truncateAddress(publicKey)}</span>
              {balance !== null && (
                <span className="balance">{formatUsdc(balance)} USDC</span>
              )}
            </div>
          ) : (
            <button className="btn btn-primary" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </section>

        {publicKey && tokenOk && (
          <section className="card send-card">
            <label htmlFor="recipient">Recipient Address</label>
            <input
              id="recipient"
              type="text"
              placeholder="G..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={loading}
            />
            <button
              className="btn btn-accent"
              onClick={handleSend}
              disabled={loading || !recipient || needsMore}
            >
              {loading
                ? "Processing…"
                : needsMore
                  ? "Insufficient balance"
                  : "Send 10 USDC (Gasless)"}
            </button>
          </section>
        )}

        {status && (
          <section className={`status status-${status.type}`}>
            {status.msg}
          </section>
        )}
      </main>

      <footer>
        <p>Fee-Forwarder MVP &middot; Testnet &middot; Powered by Soroban</p>
      </footer>
    </div>
  );
}

export default App;
