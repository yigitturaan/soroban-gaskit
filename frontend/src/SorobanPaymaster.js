import * as StellarSdk from "@stellar/stellar-sdk";
import axios from "axios";

function getAddressFromAuthEntry(entry) {
  const creds = entry.credentials();
  if (creds.switch().name !== "sorobanCredentialsAddress") return null;
  const scAddr = creds.address().address();
  if (scAddr.switch().name === "scAddressTypeAccount") {
    return StellarSdk.StrKey.encodeEd25519PublicKey(
      scAddr.accountId().ed25519(),
    );
  }
  return null;
}

function parseSimulationError(error) {
  if (!error) return "Transaction simulation failed.";

  if (error.includes("non-existing value for contract instance"))
    return "Contract not found or archived on-chain.";

  if (error.includes("balance is not sufficient"))
    return "Insufficient token balance (amount + fee).";

  const msgs = [...error.matchAll(/data:"([^"]+)"/g)].map((m) => m[1]);
  const meaningful = msgs.find(
    (m) =>
      !m.includes("escalating error") && !m.includes("contract call failed"),
  );
  if (meaningful) return meaningful;

  return error.length > 300 ? error.slice(0, 300) + "…" : error;
}

/**
 * Generic Soroban Paymaster SDK.
 *
 * Wraps the on-chain `execute_proxy` contract so that any dApp can let users
 * pay a fee in a Soroban token (e.g. USDC) instead of XLM.  The relayer bot
 * covers XLM network fees and receives the token fee atomically.
 *
 * @example
 * const paymaster = new SorobanPaymaster({ ...config });
 *
 * // Gasless USDC transfer
 * await paymaster.execute({
 *   user:           publicKey,
 *   targetContract: "CUSDC...",
 *   functionName:   "transfer",
 *   args: [
 *     new Address(from).toScVal(),
 *     new Address(to).toScVal(),
 *     nativeToScVal(10_0000000n, { type: "i128" }),
 *   ],
 *   signer: mySignerCallback,
 * });
 */
export class SorobanPaymaster {
  /**
   * @param {object} cfg
   * @param {string} cfg.rpcUrl          Soroban RPC endpoint
   * @param {string} cfg.networkPassphrase
   * @param {string} cfg.contractId      Deployed execute_proxy contract
   * @param {string} cfg.feeToken        Token used for the fee (e.g. USDC)
   * @param {string} cfg.relayerUrl      Relayer bot HTTP endpoint
   * @param {string} cfg.relayerPublicKey
   * @param {bigint} cfg.feeAmount       Fee in stroops (7-decimal)
   */
  constructor({
    rpcUrl,
    networkPassphrase,
    contractId,
    feeToken,
    relayerUrl,
    relayerPublicKey,
    feeAmount,
  }) {
    this.rpcServer = new StellarSdk.rpc.Server(rpcUrl);
    this.networkPassphrase = networkPassphrase;
    this.contractId = contractId;
    this.feeToken = feeToken;
    this.relayerUrl = relayerUrl;
    this.relayerPublicKey = relayerPublicKey;
    this.feeAmount = feeAmount;
  }

  /**
   * Build, sign, and relay a gasless contract call.
   *
   * @param {object}          p
   * @param {string}          p.user            User's G-address
   * @param {string}          p.targetContract  Contract to call
   * @param {string}          p.functionName    Function to invoke
   * @param {xdr.ScVal[]}     p.args            Encoded arguments for the target fn
   * @param {Function}        p.signer          (preimage) => { signature, publicKey }
   * @param {Function}        [p.onStatus]      Optional status callback
   * @returns {Promise<{hash: string, status: string}>}
   */
  async execute({ user, targetContract, functionName, args, signer, onStatus }) {
    onStatus?.({ type: "info", msg: "Building transaction…" });

    const relayerAccount = await this.rpcServer.getAccount(
      this.relayerPublicKey,
    );
    const contract = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(relayerAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          "execute_proxy",
          new StellarSdk.Address(this.feeToken).toScVal(),
          new StellarSdk.Address(user).toScVal(),
          new StellarSdk.Address(this.relayerPublicKey).toScVal(),
          StellarSdk.nativeToScVal(this.feeAmount, { type: "i128" }),
          new StellarSdk.Address(targetContract).toScVal(),
          StellarSdk.xdr.ScVal.scvSymbol(functionName),
          StellarSdk.xdr.ScVal.scvVec(args),
        ),
      )
      .setTimeout(300)
      .build();

    return this._signAndRelay(tx, user, signer, onStatus);
  }

  /** @private Simulate → sign auth pre-assembly → assemble → relay. */
  async _signAndRelay(tx, user, signer, onStatus) {
    onStatus?.({ type: "info", msg: "Simulating transaction…" });
    const simulation = await this.rpcServer.simulateTransaction(tx);

    if (StellarSdk.rpc.Api.isSimulationError(simulation)) {
      throw new Error(parseSimulationError(simulation.error));
    }

    onStatus?.({ type: "info", msg: "Please approve in wallet…" });

    const { sequence: latestLedger } = await this.rpcServer.getLatestLedger();
    const validUntilLedger = latestLedger + 600;

    // Sign user's auth entries IN the simulation result BEFORE assembly.
    // assembleTransaction reads simulation.result.auth directly (no re-parse
    // when _parsed is set), so our signed entries flow into the built tx.
    const authEntries = simulation.result?.auth ?? [];
    for (let i = 0; i < authEntries.length; i++) {
      const addr = getAddressFromAuthEntry(authEntries[i]);
      if (addr !== user) continue;

      authEntries[i] = await StellarSdk.authorizeEntry(
        authEntries[i],
        signer,
        validUntilLedger,
        this.networkPassphrase,
      );
    }

    const assembled = StellarSdk.rpc
      .assembleTransaction(tx, simulation)
      .build();

    onStatus?.({ type: "info", msg: "Sending to relayer…" });
    const { data } = await axios.post(this.relayerUrl, {
      txXdr: assembled.toXDR(),
    });

    return data;
  }

  /**
   * Convenience method for gasless token transfers using `forward_transfer`.
   * Works with both old and new contract deployments.
   */
  async transfer({ user, recipient, amount, signer, onStatus }) {
    onStatus?.({ type: "info", msg: "Building transaction…" });

    const relayerAccount = await this.rpcServer.getAccount(
      this.relayerPublicKey,
    );
    const contract = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(relayerAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          "forward_transfer",
          new StellarSdk.Address(this.feeToken).toScVal(),
          new StellarSdk.Address(user).toScVal(),
          new StellarSdk.Address(this.relayerPublicKey).toScVal(),
          new StellarSdk.Address(recipient).toScVal(),
          StellarSdk.nativeToScVal(amount, { type: "i128" }),
          StellarSdk.nativeToScVal(this.feeAmount, { type: "i128" }),
        ),
      )
      .setTimeout(300)
      .build();

    return this._signAndRelay(tx, user, signer, onStatus);
  }

  /** Query the user's fee-token balance (returns `bigint | null`). */
  async getTokenBalance(userAddr) {
    try {
      const account = await this.rpcServer.getAccount(userAddr);
      const token = new StellarSdk.Contract(this.feeToken);

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          token.call("balance", new StellarSdk.Address(userAddr).toScVal()),
        )
        .setTimeout(30)
        .build();

      const sim = await this.rpcServer.simulateTransaction(tx);
      if (StellarSdk.rpc.Api.isSimulationError(sim)) return null;

      const retval = sim.result?.retval;
      return retval ? StellarSdk.scValToNative(retval) : 0n;
    } catch {
      return null;
    }
  }
}
