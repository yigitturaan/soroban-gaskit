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
  feeAmount: 9_000n,
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

/* ── Inline SVG Icons ── */

function IconGasPump() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 22V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M4 22h10" />
      <path d="M14 10h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2v0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="var(--red)" strokeWidth="1.5" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg viewBox="0 0 24 24">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg viewBox="0 0 24 24">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconPlug() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v4a6 6 0 0 1-12 0V8z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" stroke="var(--text-1)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg viewBox="0 0 24 24" stroke="var(--accent)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function IconCloud() {
  return (
    <svg viewBox="0 0 24 24" stroke="var(--green)" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" stroke="#93c5fd" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/* ── Architecture SVG Diagram ── */

function ArchDiagram() {
  const nodeW = 160, nodeH = 100;
  const gap = 80;
  const totalW = nodeW * 4 + gap * 3;
  const svgW = totalW + 40;
  const svgH = nodeH + 80;
  const y = 40;

  const nodes = [
    { x: 20, label: "User / DApp", sub: "WALLET", icon: <IconUser />, color: "var(--text-1)" },
    { x: 20 + nodeW + gap, label: "GasKit SDK", sub: "CLIENT", icon: <IconBox />, color: "var(--accent)" },
    { x: 20 + (nodeW + gap) * 2, label: "Relayer Bot", sub: "API", icon: <IconCloud />, color: "var(--green)" },
    { x: 20 + (nodeW + gap) * 3, label: "Soroban RPC", sub: "ON-CHAIN", icon: <IconLink />, color: "#93c5fd" },
  ];

  const connectors = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const x1 = nodes[i].x + nodeW;
    const x2 = nodes[i + 1].x;
    const cy = y + nodeH / 2;
    connectors.push({ x1, x2, cy, path: `M ${x1} ${cy} L ${x2} ${cy}` });
  }

  return (
    <div className="arch-diagram">
      <svg
        className="arch-svg"
        viewBox={`0 0 ${svgW} ${svgH}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Connector lines */}
        {connectors.map((c, i) => (
          <g key={`conn-${i}`}>
            <line
              x1={c.x1} y1={c.cy} x2={c.x2} y2={c.cy}
              className="arch-connector"
              strokeDasharray="4 4"
            />
            <polygon
              className="arch-arrowhead"
              points={`${c.x2 - 6},${c.cy - 4} ${c.x2},${c.cy} ${c.x2 - 6},${c.cy + 4}`}
            />
          </g>
        ))}

        {/* Node cards */}
        {nodes.map((n, i) => (
          <foreignObject key={i} x={n.x} y={y} width={nodeW} height={nodeH}>
            <div className="arch-card">
              <div className="arch-card-icon">{n.icon}</div>
              <span className="arch-card-label">{n.label}</span>
              <span className="arch-card-sub">{n.sub}</span>
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}

/* Mobile fallback flow */
function MobileFlow() {
  const items = [
    { num: "01", label: "User / DApp", detail: "Wallet interaction", icon: <IconUser /> },
    { num: "02", label: "GasKit SDK", detail: "Simulate + sign auth", icon: <IconBox /> },
    { num: "03", label: "Relayer Bot", detail: "Sign XDR + submit", icon: <IconCloud /> },
    { num: "04", label: "Soroban RPC", detail: "On-chain finality", icon: <IconLink /> },
  ];
  return (
    <div className="flow-track-mobile">
      {items.map((item, i) => (
        <div key={i}>
          {i > 0 && <div className="flow-sep-m" />}
          <div className="flow-node-m">
            <span className="flow-node-m-num">{item.num}</span>
            <span className="flow-node-m-icon">{item.icon}</span>
            <div className="flow-node-m-text">
              <span className="flow-node-m-label">{item.label}</span>
              <span className="flow-node-m-detail">{item.detail}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════ */

function App() {
  const [publicKey, setPublicKey] = useState(null);
  const [balance, setBalance] = useState(null);
  const [tokenOk, setTokenOk] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [lastTxHash, setLastTxHash] = useState(null);
  const logRef = useRef(null);

  const CODE_SNIPPET = `const gaskit = new SorobanGasKit({ ...config });

await gaskit.execute({
  user, targetContract, functionName,
  args, signer
}); // that's it — Zero XLM for gas`;

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
      setLastTxHash(result.hash);

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

  const needsMore =
    balance !== null && balance < SEND_AMOUNT + paymaster.feeAmount;

  return (
    <div className="app">
      <div className="grid-bg" />

      {/* ── Nav ── */}
      <nav className="nav">
        <a href="#" className="nav-brand">
          Soroban GasKit <span>/testnet</span>
        </a>
        <div className="nav-right">
          <a href="#why" className="nav-link hide-mobile">Why</a>
          <a href="#how" className="nav-link hide-mobile">How</a>
          <a href="#flow" className="nav-link hide-mobile">Architecture</a>
          <a href="#demo" className="nav-link">Demo</a>
          <a
            href="https://github.com/yigitturaan/soroban-gaskit"
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
        <h1>
          Gasless Soroban<br />
          <span className="accent">Infrastructure.</span>
        </h1>
        <p className="hero-sub">
          The action-agnostic gas abstraction layer for Soroban.<br />
          Users pay in USDC. Zero XLM for gas. Three lines to integrate.
        </p>
        <div className="hero-actions">
          <a href="#demo" className="btn btn-primary">
            Open Playground
          </a>
          <a
            href="https://github.com/yigitturaan/soroban-gaskit"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
          >
            View Source
          </a>
        </div>
      </section>

      <div className="divider" />

      {/* ── Problem / Solution ── */}
      <section id="why" className="section">
        <div className="section-tag">Why it matters</div>
        <h2 className="section-title">The gas barrier is real</h2>

        <div className="ps-grid">
          <div className="ps-card ps-problem">
            <div className="ps-badge ps-badge-red">Problem</div>
            <h3>Users need XLM before they can do anything</h3>
            <ul className="ps-list">
              <li>Must buy XLM from an exchange first</li>
              <li>Fund a Stellar wallet with a second token</li>
              <li>Manage gas they don&apos;t understand or want</li>
            </ul>
            <p className="ps-impact">
              Result: <strong>massive drop-off</strong> at onboarding for every consumer dApp, wallet, and payment flow on Stellar.
            </p>
          </div>

          <div className="ps-card ps-solution">
            <div className="ps-badge ps-badge-green">Solution</div>
            <h3>True Gas Abstraction</h3>
            <ul className="ps-list">
              <li>Users pay a micro-fee in USDC (0.0009 USDC)</li>
              <li>Relayer bot covers all XLM network costs</li>
              <li>Action-agnostic — works with <em>any</em> Soroban contract</li>
            </ul>
            <p className="ps-impact">
              Result: <strong>Web2-grade UX</strong> — users interact with dApps using only the assets they already hold.
            </p>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── How It Works — Visual Bento ── */}
      <section id="how" className="section">
        <div className="section-tag">How it works</div>
        <h2 className="section-title">Gas abstraction for Soroban</h2>

        <div className="bento-grid">
          <div className="bento-cell">
            <div className="bento-icon"><IconGasPump /></div>
            <h3>Fee Delegation</h3>
            <p>Users pay in USDC. Relayer covers XLM gas fees on their behalf.</p>
            <div className="bento-tags">
              <span className="tag tag-accent">SDK</span>
              <span className="tag">USDC</span>
            </div>
          </div>
          <div className="bento-cell">
            <div className="bento-icon"><IconCode /></div>
            <h3>Action-Agnostic</h3>
            <p>Wraps any Soroban contract call — transfers, swaps, mints, votes.</p>
            <div className="bento-tags">
              <span className="tag">ANY CONTRACT</span>
            </div>
          </div>
          <div className="bento-cell">
            <div className="bento-icon"><IconShield /></div>
            <h3>Atomic Execution</h3>
            <p>Fee + action in one transaction. No partial failures possible.</p>
            <div className="bento-tags">
              <span className="tag tag-accent">ON-CHAIN</span>
              <span className="tag">SAFE</span>
            </div>
          </div>
          <div className="bento-cell">
            <div className="bento-icon"><IconZap /></div>
            <h3>3-Line SDK</h3>
            <p>Import, configure, execute. Ship gasless features in minutes.</p>
            <div className="bento-tags">
              <span className="tag">NPM</span>
              <span className="tag tag-accent">API</span>
            </div>
          </div>
          <div className="bento-cell bento-wide">
            <div className="bento-icon"><IconPlug /></div>
            <h3>Zero-Config Integration</h3>
            <p>No API keys, no backend proxies, no CORS issues. A lightweight client-side module — just drop it into your project.</p>
            <div className="bento-tags">
              <span className="tag tag-accent">CLIENT-SIDE</span>
              <span className="tag">NO BACKEND</span>
              <span className="tag">ZERO-CONFIG</span>
            </div>
          </div>
        </div>

        <div className="terminal code-block-wrap">
          <div className="terminal-bar">
            <div className="terminal-dots">
              <span /><span /><span />
            </div>
            <span className="terminal-title">usage.js</span>
          </div>
          <button
            type="button"
            className="copy-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(CODE_SNIPPET);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              } catch (e) {
                console.error("Copy failed:", e);
              }
            }}
          >
            {isCopied ? "Copied! ✓" : "Copy"}
          </button>
          <div className="terminal-body">
            <div className="ln"><span className="ln-num">1</span><span className="ln-content"><span className="t-kw">const</span> gaskit = <span className="t-kw">new</span> <span className="t-fn">SorobanGasKit</span>{"({"} ...config {"});"}</span></div>
            <div className="ln"><span className="ln-num">2</span><span className="ln-content" /></div>
            <div className="ln"><span className="ln-num">3</span><span className="ln-content"><span className="t-kw">await</span> gaskit.<span className="t-fn">execute</span>{"({"}</span></div>
            <div className="ln"><span className="ln-num">4</span><span className="ln-content">{"  "}user, targetContract, functionName,</span></div>
            <div className="ln"><span className="ln-num">5</span><span className="ln-content">{"  "}args, signer</span></div>
            <div className="ln"><span className="ln-num">6</span><span className="ln-content">{"});"} <span className="t-cmt">{"// that's it — Zero XLM for gas"}</span></span>            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── Architecture — SVG Flow ── */}
      <section id="flow" className="section flow-section">
        <div className="section-tag">Architecture</div>
        <h2 className="section-title">Transaction lifecycle</h2>

        <ArchDiagram />
        <MobileFlow />

        <div className="bento-grid bento-grid-3" style={{ marginTop: 24 }}>
          <div className="bento-cell" style={{ textAlign: "center" }}>
            <div className="cell-value">0</div>
            <div className="cell-unit">XLM from user</div>
          </div>
          <div className="bento-cell" style={{ textAlign: "center" }}>
            <div className="cell-value">0.0009</div>
            <div className="cell-unit">USDC fee</div>
          </div>
          <div className="bento-cell" style={{ textAlign: "center" }}>
            <div className="cell-value">1</div>
            <div className="cell-unit">Atomic TX</div>
          </div>
        </div>
      </section>

      <div className="divider" />

      {/* ── Playground ── */}
      <section id="demo" className="section playground">
        <div className="section-tag">Playground</div>
        <h2 className="section-title">Interactive SDK Showcase</h2>
        <p className="section-desc showcase-desc">
          A live demonstration of the Soroban GasKit infrastructure. Watch how just 3 lines of frontend code can wrap any standard contract call into a completely gasless experience, powered by our custom smart contracts and relayer network.
        </p>

        <div className="testing-disclaimer"><strong>Live Testing Note:</strong> To execute a transaction in this demo, your Freighter wallet must hold our specific Testnet USDC and have an active trustline established. If you don&apos;t have these prerequisites configured, the on-chain simulation will revert. Please refer to our <strong>Demo Video</strong> for a complete, end-to-end walkthrough of the architecture.
        </div>

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
                  <div className="wallet-badges">
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
              <div className={`step-indicator ${publicKey && tokenOk ? "active" : ""}`}>
                2
              </div>
              <div className="step-content">
                <div className="step-name">Execute Transfer</div>
                <div className="step-detail">
                  Send 10 USDC. Fee: 0.0009 USDC. Zero XLM for gas.
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
                  {loading && (
                    <p className="loading-disclaimer">
                      Executing transaction... (This may take up to 60 seconds if the free Relayer bot is waking up from sleep mode).
                    </p>
                  )}
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
            {lastTxHash && (
              <div className="receipt-card">
                <div className="receipt-header">Transaction Successful</div>
                <div className="receipt-row">
                  <span className="receipt-label">Network Gas</span>
                  <span className="receipt-value">Zero XLM for gas</span>
                  <span className="receipt-pill">Sponsored by Relayer</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Paid</span>
                  <span className="receipt-value">0.0009 USDC</span>
                </div>
                <div className="receipt-row">
                  <span className="receipt-label">Action</span>
                  <span className="receipt-value">Contract Executed</span>
                </div>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${lastTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="receipt-explorer-btn"
                >
                  View on Stellar Expert ↗
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-left">
          soroban-gaskit — Gasless SDK for Stellar
        </div>
        <div className="footer-right">
          <a
            href="https://github.com/yigitturaan/soroban-gaskit"
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
