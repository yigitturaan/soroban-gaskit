import { useState, useRef, useCallback } from "react";
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

const SEND_AMOUNT = 100_000_000n;

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

function truncAddr(a) {
  return a ? `${a.slice(0, 5)}...${a.slice(-5)}` : "";
}

function fmtUsdc(raw) {
  return (Number(raw) / 1e7).toFixed(2);
}

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function App() {
  const [publicKey, setPublicKey] = useState(null);
  const [balance, setBalance] = useState(null);
  const [tokenOk, setTokenOk] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const logRef = useRef(null);

  const log = useCallback((tag, msg) => {
    setLogs((prev) => [...prev, { ts: ts(), tag, msg }]);
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, []);

  async function connectWallet() {
    try {
      log("info", "Connecting to Freighter...");
      const { isConnected: connected } = await isConnected();
      if (!connected) {
        log("err", "Freighter extension not detected.");
        return;
      }

      const allowed = await setAllowed();
      if (allowed.error) {
        log("err", "Connection rejected by wallet.");
        return;
      }

      const { address, error } = await getAddress();
      if (error) {
        log("err", "Could not retrieve wallet address.");
        return;
      }

      setPublicKey(address);
      log("ok", `Wallet connected: ${truncAddr(address)}`);
      log("info", "Querying USDC balance...");

      const bal = await paymaster.getTokenBalance(address);
      if (bal === null) {
        setTokenOk(false);
        setBalance(null);
        log("warn", "No USDC trustline found. Add one manually or via Step 2.");
      } else {
        setTokenOk(true);
        setBalance(bal);
        log("ok", `Balance: ${fmtUsdc(bal)} USDC`);
      }
    } catch (err) {
      log("err", err.message);
    }
  }

  async function handleSend() {
    if (!publicKey || !recipient) {
      log("err", "Missing recipient address.");
      return;
    }

    setLoading(true);
    try {
      const statusHandler = ({ msg }) => {
        const tag = msg.includes("approve") ? "info" : "info";
        log(tag, msg);
      };

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
        onStatus: statusHandler,
      });

      log("ok", `TX ${result.status} — hash: ${result.hash}`);

      const newBal = await paymaster.getTokenBalance(publicKey);
      if (newBal !== null) {
        setBalance(newBal);
        log("ok", `Updated balance: ${fmtUsdc(newBal)} USDC`);
      }
    } catch (err) {
      const respData = err.response?.data;
      let msg = respData?.error || err.message || "Unknown error.";

      if (respData?.diagnosticEvents?.length) {
        const evtSummary = respData.diagnosticEvents
          .map((e) => (typeof e === "string" ? e : JSON.stringify(e.data)))
          .join(" | ");
        msg += ` [${evtSummary}]`;
      }
      if (respData?.hash) msg += ` (tx: ${respData.hash})`;

      console.error("Relay error:", respData ?? err);
      log("err", msg);
    } finally {
      setLoading(false);
    }
  }

  function handleOnboarding(action) {
    if (action === "usdc") {
      log("warn", "V2: Claimable Balances will auto-distribute test USDC. Currently use Stellar Laboratory.");
    } else {
      log("warn", "V2: Trustlines will be auto-established via sponsored transactions. Add USDC trustline from your wallet.");
    }
  }

  const needsMore =
    balance !== null && balance < SEND_AMOUNT + paymaster.feeAmount;

  return (
    <div className="app">
      <div className="grid-bg" />

      {/* ── Nav ── */}
      <nav className="nav">
        <a href="#" className="nav-brand">
          soroban-gas-station <span>/testnet</span>
        </a>
        <div className="nav-right">
          <a href="#how" className="nav-link hide-mobile">How it works</a>
          <a href="#flow" className="nav-link hide-mobile">Architecture</a>
          <a href="#demo" className="nav-link">Demo</a>
          <a
            href="https://github.com/yigitturaan/stellar-paymaster-v2"
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            GitHub
          </a>
          {publicKey ? (
            <div className="wallet-pill">
              <span className="indicator" />
              {truncAddr(publicKey)}
            </div>
          ) : (
            <button className="btn-connect" onClick={connectWallet}>
              Connect
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-tag">
          <span className="dot" />
          Live on Stellar Testnet
        </div>
        <h1>
          Gasless Soroban<br />
          <span className="accent">Infrastructure.</span>
        </h1>
        <p className="hero-sub">
          An action-agnostic SDK that lets users pay transaction fees in
          USDC instead of XLM. Integrate in three lines.
        </p>
        <div className="hero-actions">
          <a href="#demo" className="btn btn-primary">
            Open Playground
          </a>
          <a
            href="https://github.com/yigitturaan/stellar-paymaster-v2"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            View Source
          </a>
        </div>
      </section>

      <div className="divider" />

      {/* ── How it Works ── */}
      <section id="how" className="section">
        <div className="section-tag">How it works</div>
        <h2 className="section-title">The problem with Soroban gas</h2>
        <p className="section-desc">
          Every Soroban transaction requires XLM. Users holding only stablecoins
          face a multi-step onboarding wall that kills conversion.
        </p>

        <div className="bento-grid">
          <div className="bento-cell">
            <div className="bento-label">Problem</div>
            <h3>XLM acquisition barrier</h3>
            <p>
              Before doing anything on Stellar, users need to acquire XLM from
              an exchange, fund their wallet, and manage a second token they
              don&apos;t want — just to pay gas.
            </p>
          </div>
          <div className="bento-cell">
            <div className="bento-label">Solution</div>
            <h3>Token-denominated fees</h3>
            <p>
              Wrap any contract call with our Paymaster. A relayer bot covers the
              XLM fee and atomically collects a small token payment from the user.
              One transaction, zero XLM.
            </p>
          </div>
          <div className="bento-cell">
            <div className="bento-label">Integration</div>
            <h3>Three lines of code</h3>
            <p>
              Import the SDK, pass your contract call parameters,
              and <code style={{ color: "var(--accent)" }}>paymaster.execute()</code> handles
              simulation, signing, and relay.
            </p>
          </div>
          <div className="bento-cell">
            <div className="bento-label">Scope</div>
            <h3>Action-agnostic</h3>
            <p>
              Not limited to transfers. Any Soroban contract invocation — swaps,
              mints, governance votes, game actions — can be made gasless through
              the same SDK.
            </p>
          </div>
        </div>

        {/* SDK sample */}
        <div className="terminal">
          <div className="terminal-bar">
            <div className="terminal-dots">
              <span /><span /><span />
            </div>
            <span className="terminal-title">SorobanPaymaster.js — usage</span>
          </div>
          <div className="terminal-body">
            <div className="ln"><span className="ln-num">1</span><span className="ln-content"><span className="t-kw">const</span> paymaster = <span className="t-kw">new</span> <span className="t-fn">SorobanPaymaster</span>{"({"} ...config {"});"}</span></div>
            <div className="ln"><span className="ln-num">2</span><span className="ln-content" /></div>
            <div className="ln"><span className="ln-num">3</span><span className="ln-content"><span className="t-kw">await</span> paymaster.<span className="t-fn">execute</span>{"({"}</span></div>
            <div className="ln"><span className="ln-num">4</span><span className="ln-content">{"  "}user:           publicKey,</span></div>
            <div className="ln"><span className="ln-num">5</span><span className="ln-content">{"  "}targetContract: <span className="t-str">&quot;CUSDC...&quot;</span>,</span></div>
            <div className="ln"><span className="ln-num">6</span><span className="ln-content">{"  "}functionName:   <span className="t-str">&quot;transfer&quot;</span>,</span></div>
            <div className="ln"><span className="ln-num">7</span><span className="ln-content">{"  "}args:           [from, to, amount],</span></div>
            <div className="ln"><span className="ln-num">8</span><span className="ln-content">{"  "}signer:         walletSigner,</span></div>
            <div className="ln"><span className="ln-num">9</span><span className="ln-content">{"});"}</span></div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── Architecture Flow ── */}
      <section id="flow" className="section flow-section">
        <div className="section-tag">Architecture</div>
        <h2 className="section-title">Transaction lifecycle</h2>
        <p className="section-desc" style={{ margin: "0 auto" }}>
          Four stages from user intent to on-chain finality.
        </p>

        <div className="flow-track">
          <div className="flow-node">
            <span className="flow-node-num">01</span>
            <span className="flow-node-label">DApp</span>
            <span className="flow-node-detail">SDK call</span>
          </div>
          <div className="flow-sep" />
          <div className="flow-node">
            <span className="flow-node-num">02</span>
            <span className="flow-node-label">Paymaster SDK</span>
            <span className="flow-node-detail">Simulate + sign auth</span>
          </div>
          <div className="flow-sep" />
          <div className="flow-node">
            <span className="flow-node-num">03</span>
            <span className="flow-node-label">Relayer Bot</span>
            <span className="flow-node-detail">Sign XDR + submit</span>
          </div>
          <div className="flow-sep" />
          <div className="flow-node">
            <span className="flow-node-num">04</span>
            <span className="flow-node-label">Soroban RPC</span>
            <span className="flow-node-detail">On-chain finality</span>
          </div>
        </div>

        {/* Key metrics */}
        <div className="bento-grid bento-grid-3" style={{ marginTop: 16 }}>
          <div className="bento-cell" style={{ textAlign: "center" }}>
            <div className="cell-value">0</div>
            <div className="cell-unit">XLM required from user</div>
          </div>
          <div className="bento-cell" style={{ textAlign: "center" }}>
            <div className="cell-value">0.5</div>
            <div className="cell-unit">USDC fee per transaction</div>
          </div>
          <div className="bento-cell" style={{ textAlign: "center" }}>
            <div className="cell-value">1</div>
            <div className="cell-unit">Atomic transaction</div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── Playground ── */}
      <section id="demo" className="section playground">
        <div className="section-tag">Playground</div>
        <h2 className="section-title">Control Panel</h2>
        <p className="section-desc">
          Execute a gasless USDC transfer on Stellar Testnet.
        </p>

        <div className="panel-grid">
          {/* Left: Steps */}
          <div className="panel-left">
            <div className="panel-label">Transaction Pipeline</div>

            {/* Step 1 */}
            <div className="step-item">
              <div className={`step-indicator ${publicKey ? "done" : "active"}`}>
                {publicKey ? "\u2713" : "1"}
              </div>
              <div className="step-content">
                <div className="step-name">Connect Wallet</div>
                <div className="step-detail">
                  Authenticate via Freighter extension.
                </div>
                {publicKey ? (
                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                    <span className="connected-badge">
                      <span className="c-dot" />
                      {truncAddr(publicKey)}
                    </span>
                    {balance !== null && (
                      <span className="balance-tag">{fmtUsdc(balance)} USDC</span>
                    )}
                  </div>
                ) : (
                  <div className="step-actions">
                    <button className="btn btn-primary btn-sm" onClick={connectWallet}>
                      Connect
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2 */}
            <div className="step-item">
              <div className={`step-indicator ${publicKey && tokenOk ? "done" : publicKey ? "active" : ""}`}>
                {publicKey && tokenOk ? "\u2713" : "2"}
              </div>
              <div className="step-content">
                <div className="step-name">Onboarding</div>
                <div className="step-detail">
                  USDC trustline &amp; test tokens.
                </div>
                <div className="step-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleOnboarding("usdc")}
                    disabled={!publicKey}
                  >
                    Request USDC
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleOnboarding("trustline")}
                    disabled={!publicKey}
                  >
                    Add Trustline
                  </button>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="step-item">
              <div className={`step-indicator ${publicKey && tokenOk ? "active" : ""}`}>
                3
              </div>
              <div className="step-content">
                <div className="step-name">Execute Transfer</div>
                <div className="step-detail">
                  Send 10 USDC. Fee: 0.5 USDC. XLM cost: 0.
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="recipient">
                    Recipient
                  </label>
                  <input
                    id="recipient"
                    className="form-input"
                    type="text"
                    placeholder="G..."
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    disabled={loading || !publicKey || !tokenOk}
                  />
                </div>
                <div className="step-actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-primary btn-sm btn-full"
                    onClick={handleSend}
                    disabled={loading || !recipient || needsMore || !publicKey || !tokenOk}
                  >
                    {loading
                      ? "Processing..."
                      : needsMore
                        ? "Insufficient balance"
                        : "Send 10 USDC (Gasless)"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Log output */}
          <div className="panel-right">
            <div className="panel-label">Output</div>
            <div className="log-output" ref={logRef}>
              {logs.length === 0 ? (
                <span className="log-empty">
                  Waiting for input<span className="log-cursor" />
                </span>
              ) : (
                logs.map((l, i) => (
                  <div className="log-line" key={i}>
                    <span className="log-ts">{l.ts}</span>
                    <span className={`log-tag ${l.tag}`}>
                      [{l.tag.toUpperCase()}]
                    </span>
                    <span className="log-msg">{l.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-left">
          soroban-gas-station — ODTU Blockchain Hackathon
        </div>
        <div className="footer-right">
          <a
            href="https://github.com/yigitturaan/stellar-paymaster-v2"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a href="https://stellar.org" target="_blank" rel="noreferrer">
            Stellar
          </a>
          <a href="https://soroban.stellar.org" target="_blank" rel="noreferrer">
            Docs
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
