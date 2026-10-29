// Browser-side Solana flows: launch a Rune (Meteora DBC pool + first buy), buy, sell, bridge to Bitcoin (vault + memo).
import { recordSol, saveRuneMeta } from "../api/carvy.functions";
import { LAUNCHLAB_PROGRAM, LAUNCHLAB_SOL_CONFIG, MEMO_PROGRAM, RAYDIUM_PLATFORMS, SOL_CONFIGS, SOL_LAUNCHER, SOL_RPCS, SOL_VAULT, WSOL } from "./config";

type SolProvider = {
  publicKey?: { toString(): string } | null;
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  signTransaction: <T>(tx: T) => Promise<T>;
  signAllTransactions: <T>(txs: T[]) => Promise<T[]>;
};

function provider(): SolProvider {
  const w = window as unknown as { phantom?: { solana?: SolProvider }; solflare?: SolProvider; backpack?: { solana?: SolProvider }; solana?: SolProvider };
  const p = w.phantom?.solana ?? w.solflare ?? w.backpack?.solana ?? w.solana;
  if (!p) throw new Error("No Solana wallet found. Install Phantom, Solflare or Backpack.");
  return p;
}

async function libs() {
  const web3 = await import("@solana/web3.js");
  const spl = await import("@solana/spl-token");
  const dbc = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const BN = (await import("bn.js")).default;
  const connection = new web3.Connection(SOL_RPCS[0], "confirmed");
  return { web3, spl, dbc, BN, connection, client: new dbc.DynamicBondingCurveClient(connection, "confirmed") };
}

type AnySigner = { publicKey: import("@solana/web3.js").PublicKey; secretKey: Uint8Array };
const CU_LIMIT = 600_000;
const CU_PRICE = 50_000; // micro-lamports per CU

/**
 * Wallet-safe send (follows Phantom's guidance so its simulation does not flag the request):
 * explicit compute budget, simulate first (no sig verify), the wallet signs FIRST with signTransaction,
 * extra signers (e.g. a new mint keypair) sign afterwards, then submit through our RPC with preflight.
 */
async function signSend(tx: import("@solana/web3.js").Transaction, owner: string, extra: AnySigner[] = []) {
  const { connection, web3 } = await libs();
  const CB = web3.ComputeBudgetProgram.programId.toBase58();
  if (!tx.instructions.some((ix) => ix.programId.toBase58() === CB)) {
    tx.instructions.unshift(web3.ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }), web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CU_PRICE }));
  }
  tx.feePayer = new web3.PublicKey(owner);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.signatures = [];
  const sim = await connection.simulateTransaction(new web3.VersionedTransaction(tx.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true });
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).filter((l) => /error|failed|insufficient/i.test(l)).slice(-2).join(" | ");
    throw new Error(`Transaction would fail: ${logs || JSON.stringify(sim.value.err)}`);
  }
  const signed = await provider().signTransaction(tx);
  if (extra.length) signed.partialSign(...(extra as import("@solana/web3.js").Signer[]));
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 });
  try {
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  } catch (e) {
    // RPC nodes can lag on block height; trust the signature status before reporting failure
    for (let i = 0; i < 10; i++) {
      const st = (await connection.getSignatureStatus(sig, { searchTransactionHistory: true })).value;
      if (st?.err) throw new Error("Transaction failed on Solana");
      if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return sig;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw e;
  }
  return sig;
}

const toUnits = (v: string, dec: number) => {
  const [i, f = ""] = v.trim().split(".");
  return BigInt(i || "0") * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0");
};

export async function launchSolRune(p: {
  owner: string;
  title: string;
  ticker: string;
  runeName: string;
  description: string;
  imageUrl: string;
  website: string;
  x: string;
  tg: string;
  taxBps: number;
  initialBuySol: string;
}): Promise<string> {
  const meta = await saveRuneMeta({ data: { title: p.title, description: p.description, imageUrl: p.imageUrl, website: p.website, x: p.x, tg: p.tg, runeName: p.runeName } });
  const uri = `${window.location.origin}/api/meta/${meta.id}?s=${encodeURIComponent(p.ticker)}`;
  if (SOL_LAUNCHER === "raydium") return launchRaydium({ owner: p.owner, title: p.title, ticker: p.ticker, uri, taxBps: p.taxBps, initialBuySol: p.initialBuySol });
  const { web3, dbc, BN, client } = await libs();
  const config = SOL_CONFIGS[p.taxBps] ?? SOL_CONFIGS[0];
  const mint = web3.Keypair.generate();
  const owner = new web3.PublicKey(p.owner);
  const buy = p.initialBuySol ? toUnits(p.initialBuySol, 9) : 0n;
  const tx = await client.creator.createPoolWithFirstBuy({
    createPoolParam: { baseMint: mint.publicKey, config: new web3.PublicKey(config), name: p.title, symbol: p.ticker, uri: `${window.location.origin}/api/meta/${meta.id}?s=${encodeURIComponent(p.ticker)}`, payer: owner, poolCreator: owner },
    firstBuyParam: buy > 0n ? { buyer: owner, buyAmount: new BN(buy.toString()), minimumAmountOut: new BN(1), referralTokenAccount: null } : undefined,
  });
  const sig = await signSend(tx, p.owner, [mint]);
  await recordSol({ data: { signature: sig } }).catch(() => {});
  void dbc;
  return mint.publicKey.toBase58();
}

export async function quoteSol(pool: string, side: "buy" | "sell", amount: string): Promise<number> {
  if (await isRaydiumPool(pool)) return quoteRaydium(pool, side, amount);
  const { web3, dbc, BN, client, connection } = await libs();
  const ps = await client.state.getPool(new web3.PublicKey(pool));
  const state = (ps as { poolState?: unknown }).poolState ?? ps;
  const cfg = await client.state.getPoolConfig((state as { config: import("@solana/web3.js").PublicKey }).config);
  const amountIn = side === "buy" ? toUnits(amount, 9) : toUnits(amount, 6);
  const currentPoint = await dbc.getCurrentPoint(connection, (cfg as { activationType: number }).activationType);
  const q = client.pool.swapQuote({ virtualPool: ps as never, config: cfg as never, swapBaseForQuote: side === "sell", amountIn: new BN(amountIn.toString()), slippageBps: 500, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint } as never);
  const out = BigInt((q as { outputAmount?: { toString(): string } }).outputAmount?.toString() ?? "0");
  return side === "buy" ? Number(out) / 1e6 : Number(out) / 1e9;
}

export async function tradeSol(p: { owner: string; pool: string; side: "buy" | "sell"; amount: string }): Promise<string> {
  if (await isRaydiumPool(p.pool)) return tradeRaydium(p);
  const { web3, BN, client } = await libs();
  const expected = await quoteSol(p.pool, p.side, p.amount);
  const min = p.side === "buy" ? BigInt(Math.floor(expected * 0.95 * 1e6)) : BigInt(Math.floor(expected * 0.95 * 1e9));
  const tx = await client.pool.swap({
    owner: new web3.PublicKey(p.owner),
    amountIn: new BN((p.side === "buy" ? toUnits(p.amount, 9) : toUnits(p.amount, 6)).toString()),
    minimumAmountOut: new BN(min.toString()),
    swapBaseForQuote: p.side === "sell",
    pool: new web3.PublicKey(p.pool),
    referralTokenAccount: null,
    payer: new web3.PublicKey(p.owner),
  } as never);
  const sig = await signSend(tx, p.owner);
  await recordSol({ data: { signature: sig } }).catch(() => {});
  return sig;
}

/** Bridge to Bitcoin: send tokens to the Carvy vault with the Bitcoin address as memo (one transaction). */
export async function bridgeSolToBitcoin(p: { owner: string; mint: string; amount: string; btcAddress: string }): Promise<string> {
  const { web3, spl } = await libs();
  const owner = new web3.PublicKey(p.owner);
  const mint = new web3.PublicKey(p.mint);
  const vault = new web3.PublicKey(SOL_VAULT);
  const from = spl.getAssociatedTokenAddressSync(mint, owner);
  const to = spl.getAssociatedTokenAddressSync(mint, vault);
  const tx = new web3.Transaction().add(
    spl.createAssociatedTokenAccountIdempotentInstruction(owner, to, vault, mint),
    spl.createTransferCheckedInstruction(from, mint, to, owner, toUnits(p.amount, 6), 6),
    new web3.TransactionInstruction({ programId: new web3.PublicKey(MEMO_PROGRAM), keys: [], data: new TextEncoder().encode(`${/runehood/.test(window.location.hostname) ? "runehood" : "carvy"}:btc:${p.btcAddress}`) as never }),
  );
  const sig = await signSend(tx, p.owner);
  await recordSol({ data: { signature: sig } }).catch(() => {});
  return sig;
}

export async function solTokenBalance(owner: string, mint: string): Promise<{ token: number; sol: number }> {
  const { web3, spl, connection } = await libs();
  const o = new web3.PublicKey(owner);
  const sol = (await connection.getBalance(o)) / 1e9;
  if (mint === WSOL) return { token: sol, sol };
  const ata = spl.getAssociatedTokenAddressSync(new web3.PublicKey(mint), o);
  const b = await connection.getTokenAccountBalance(ata).catch(() => null);
  return { token: b ? Number(b.value.uiAmountString ?? 0) : 0, sol };
}

/** Unclaimed creator trading fees of a pool (SOL). */
export async function solCreatorFees(pool: string): Promise<number> {
  const { client } = await libs();
  const m = await client.state.getPoolFeeMetrics(pool);
  return Number(m.current.creatorQuoteFee.toString()) / 1e9;
}

/** Creator claims their share of trading fees (and creator tax) from the Meteora pool. */
export async function claimSolCreatorFees(owner: string, pool: string): Promise<string> {
  const { web3, BN, client } = await libs();
  const tx = await client.creator.claimCreatorTradingFee({
    creator: new web3.PublicKey(owner),
    payer: new web3.PublicKey(owner),
    pool: new web3.PublicKey(pool),
    maxBaseAmount: new BN("18446744073709551615"),
    maxQuoteAmount: new BN("18446744073709551615"),
  });
  return signSend(tx, owner);
}

/** Carvy fee wallet: unclaimed platform (partner) fees per pool, in SOL. */
export async function platformFees(owner: string, pools: string[]): Promise<Array<{ pool: string; sol: number }>> {
  const { client } = await libs();
  const out: Array<{ pool: string; sol: number }> = [];
  for (const p of pools) {
    try {
      const ps = await client.state.getPool(p);
      const cfg = await client.state.getPoolConfig((ps as unknown as { poolState: { config: import("@solana/web3.js").PublicKey } }).poolState.config);
      if ((cfg as unknown as { feeClaimer: { toBase58(): string } }).feeClaimer.toBase58() !== owner) continue;
      const m = await client.state.getPoolFeeMetrics(p);
      out.push({ pool: p, sol: Number(m.current.partnerQuoteFee.toString()) / 1e9 });
    } catch {
      /* pool from another fee claimer */
    }
  }
  return out;
}

export async function claimPlatformFees(owner: string, pool: string): Promise<string> {
  const { web3, BN, client } = await libs();
  const tx = await client.partner.claimPartnerTradingFee({
    feeClaimer: new web3.PublicKey(owner),
    payer: new web3.PublicKey(owner),
    pool: new web3.PublicKey(pool),
    maxBaseAmount: new BN("18446744073709551615"),
    maxQuoteAmount: new BN("18446744073709551615"),
  });
  return signSend(tx, owner);
}

// ---------------------------------------------------------------- Raydium LaunchLab

async function raydiumFor(owner: string) {
  const { web3, connection, BN } = await libs();
  const sdk = await import("@raydium-io/raydium-sdk-v2");
  const p = provider();
  const raydium = await sdk.Raydium.load({
    connection,
    owner: new web3.PublicKey(owner),
    signAllTransactions: (<T,>(txs: T[]) => p.signAllTransactions(txs)) as never,
    disableLoadToken: true,
  });
  // Public RPCs reject "indexed" calls (getTokenAccountsByOwner). Mark the wallet's token list as loaded so the SDK
  // works with the owner's associated token accounts (created idempotently when missing) instead of scanning them.
  raydium.account.updateTokenAccount({ tokenAccounts: [], tokenAccountRawInfos: [] } as never);
  return { sdk, raydium, web3, BN, connection };
}

/**
 * Give the Raydium SDK the owner's associated token accounts for `mints` (read with getMultipleAccounts),
 * so it never needs the indexed getTokenAccountsByOwner call that public RPCs block.
 */
async function preloadTokenAccounts(raydium: { account: { updateTokenAccount: (x: never) => unknown } }, owner: string, mints: string[]) {
  const { web3, spl, BN, connection } = await libs();
  const o = new web3.PublicKey(owner);
  const atas = mints.map((m) => spl.getAssociatedTokenAddressSync(new web3.PublicKey(m), o, true, spl.TOKEN_PROGRAM_ID));
  const infos = await connection.getMultipleAccountsInfo(atas);
  const raw = infos.flatMap((info, i) =>
    info ? [{ pubkey: atas[i], programId: spl.TOKEN_PROGRAM_ID, accountInfo: { mint: new web3.PublicKey(mints[i]), owner: o, amount: new BN(info.data.subarray(64, 72), "le") } }] : [],
  );
  raydium.account.updateTokenAccount({ tokenAccounts: [], tokenAccountRawInfos: raw } as never);
}

/** Send a Raydium SDK build result (single legacy transaction) through the wallet-safe path. */
async function sendBuilt(built: unknown, owner: string): Promise<string> {
  const b = built as { transaction: import("@solana/web3.js").Transaction; signers?: AnySigner[] };
  const extra = (b.signers ?? []).filter((k) => k.publicKey.toBase58() !== owner);
  return signSend(b.transaction, owner, extra);
}

/** Pool state of a LaunchLab pool (null when the pool is a Meteora pool). */
async function launchLabState(pool: string) {
  const { web3, connection } = await libs();
  const acc = await connection.getAccountInfo(new web3.PublicKey(pool));
  if (!acc || acc.owner.toBase58() !== LAUNCHLAB_PROGRAM) return null;
  const d = acc.data;
  const u64 = (o: number) => d.readBigUInt64LE(o);
  return { status: d[17], decA: d[18], decB: d[19], vA: u64(37), vB: u64(45), rA: u64(53), rB: u64(61), mintA: new web3.PublicKey(d.subarray(205, 237)) };
}

export const isRaydiumPool = async (pool: string) => !!(await launchLabState(pool).catch(() => null));

async function launchRaydium(p: { owner: string; title: string; ticker: string; uri: string; taxBps: number; initialBuySol: string }): Promise<string> {
  const { sdk, raydium, web3, BN } = await raydiumFor(p.owner);
  const tier = p.taxBps >= 500 ? 150 : p.taxBps >= 300 ? 125 : p.taxBps >= 100 ? 100 : 75;
  const mintA = web3.Keypair.generate();
  const buy = p.initialBuySol ? toUnits(p.initialBuySol, 9) : 0n;
  const res = await raydium.launchpad.createLaunchpad({
    programId: sdk.LAUNCHPAD_PROGRAM,
    mintA: mintA.publicKey,
    decimals: 6,
    name: p.title,
    symbol: p.ticker,
    uri: p.uri,
    migrateType: "cpmm",
    configId: new web3.PublicKey(LAUNCHLAB_SOL_CONFIG),
    platformId: new web3.PublicKey(RAYDIUM_PLATFORMS[tier]),
    txVersion: sdk.TxVersion.LEGACY,
    buyAmount: new BN(buy.toString()),
    slippage: new BN(500),
    createOnly: buy === 0n,
    extraSigners: [mintA],
    computeBudgetConfig: { units: CU_LIMIT, microLamports: CU_PRICE },
  } as never);
  const built = res as unknown as { transactions: import("@solana/web3.js").Transaction[]; signers: AnySigner[][] };
  for (let i = 0; i < built.transactions.length; i++) {
    const own = (built.signers[i] ?? []).filter((k) => k.publicKey.toBase58() !== p.owner);
    const sig = await signSend(built.transactions[i], p.owner, own.length ? own : i === 0 ? [mintA] : []);
    await recordSol({ data: { signature: sig } }).catch(() => {});
  }
  return mintA.publicKey.toBase58();
}

async function quoteRaydium(pool: string, side: "buy" | "sell", amount: string): Promise<number> {
  const st = await launchLabState(pool);
  if (!st) return 0;
  const A = Number(st.vA - st.rA) / 10 ** st.decA;
  const B = Number(st.vB + st.rB) / 10 ** st.decB;
  const FEE = 0.0125; // 0.5% creator + 0.5% Carvy + 0.25% Raydium
  const x = Number(amount);
  if (side === "buy") {
    const net = x * (1 - FEE);
    return A - (A * B) / (B + net);
  }
  const gross = B - (A * B) / (A + x);
  return gross * (1 - FEE);
}

async function tradeRaydium(p: { owner: string; pool: string; side: "buy" | "sell"; amount: string }): Promise<string> {
  const st = await launchLabState(p.pool);
  if (!st) throw new Error("Pool not found");
  const { sdk, raydium, BN } = await raydiumFor(p.owner);
  await preloadTokenAccounts(raydium as never, p.owner, [st.mintA.toBase58(), WSOL]);
  const base = { programId: sdk.LAUNCHPAD_PROGRAM, mintA: st.mintA, slippage: new BN(500), txVersion: sdk.TxVersion.LEGACY };
  const built =
    p.side === "buy"
      ? await raydium.launchpad.buyToken({ ...base, buyAmount: new BN(toUnits(p.amount, 9).toString()), computeBudgetConfig: { units: CU_LIMIT, microLamports: CU_PRICE } } as never)
      : await raydium.launchpad.sellToken({ ...base, sellAmount: new BN(toUnits(p.amount, 6).toString()), computeBudgetConfig: { units: CU_LIMIT, microLamports: CU_PRICE } } as never);
  const sig = await sendBuilt(built, p.owner);
  await recordSol({ data: { signature: sig } }).catch(() => {});
  return sig;
}

/** Creator claims their LaunchLab creator fees (curve + graduated pool). */
export async function claimRaydiumCreatorFees(owner: string): Promise<string> {
  const { sdk, raydium, web3 } = await raydiumFor(owner);
  const built = await raydium.launchpad.claimCreatorFee({ programId: sdk.LAUNCHPAD_PROGRAM, mintB: new web3.PublicKey(WSOL), txVersion: sdk.TxVersion.LEGACY } as never);
  return sendBuilt(built, owner);
}

/** Carvy fee wallet: claim LaunchLab platform fees of every Carvy platform. */
export async function claimRaydiumPlatformFees(owner: string): Promise<string[]> {
  const { sdk, raydium, web3 } = await raydiumFor(owner);
  const out: string[] = [];
  for (const platformId of Object.values(RAYDIUM_PLATFORMS)) {
    try {
      const built = await raydium.launchpad.claimVaultPlatformFee({ programId: sdk.LAUNCHPAD_PROGRAM, platformId: new web3.PublicKey(platformId), mintB: new web3.PublicKey(WSOL), txVersion: sdk.TxVersion.LEGACY } as never);
      const res = { txId: await sendBuilt(built, owner) };
      out.push(res.txId);
    } catch {
      /* nothing to claim on this platform */
    }
  }
  return out;
}
