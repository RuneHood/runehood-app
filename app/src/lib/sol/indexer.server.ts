// Solana indexer: discovers Carvy pools (via our DBC config keys), records trades and bridge deposits to the vault,
// and refreshes pool state (price, progress, graduation). Uses plain JSON-RPC so it runs in the Worker.
import { tagSite } from "../indexer.server";
import { db, getPrices } from "../carvy.server";
import { CURVE_SUPPLY, quoteToSats, satsToUsd, type Prices } from "../carvy";
import { DBC_PROGRAM, LAUNCHLAB_PROGRAM, MEMO_PROGRAM, RAYDIUM_PLATFORMS, RAYDIUM_TIER_BY_PLATFORM, SOL_CONFIGS, SOL_LEGACY_CONFIGS, SOL_RPCS, SOL_TAX_BY_CONFIG, SOL_TO_RUNE, SOL_VAULT, WSOL } from "./config";

type Tok = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };
type ParsedTx = {
  slot: number;
  blockTime: number | null;
  meta: { err: unknown; fee: number; preBalances: number[]; postBalances: number[]; preTokenBalances?: Tok[]; postTokenBalances?: Tok[]; logMessages?: string[] } | null;
  transaction: { signatures: string[]; message: { accountKeys: Array<{ pubkey: string; signer: boolean }>; instructions: Array<{ programId: string; accounts?: string[]; parsed?: unknown; data?: string }> } };
};

export async function solRpc<T>(method: string, params: unknown[]): Promise<T> {
  let last: unknown;
  const env = (await import("../bindings.server")).bindings() as { RPC_SOLANA?: string };
  const urls = env.RPC_SOLANA ? [env.RPC_SOLANA, ...SOL_RPCS] : SOL_RPCS;
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (compatible; CarvyIndexer/1.0; +https://carvy.fun)", origin: "https://carvy.fun" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12_000) });
      if (!r.ok) throw new Error(`rpc ${r.status} ${new URL(url).host} ${(await r.text()).slice(0, 120)}`);
      const j = (await r.json()) as { result?: T; error?: { message: string } };
      if (j.error) throw new Error(j.error.message);
      return j.result as T;
    } catch (e) {
      last = new Error(`${method}: ${(e as Error).message}${last ? ` | ${(last as Error).message}` : ""}`);
    }
  }
  throw last instanceof Error ? last : new Error("solana rpc failed");
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}
function b58encode(b: Uint8Array): string {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = "";
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const x of b) {
    if (x !== 0) break;
    s = "1" + s;
  }
  return s;
}
const u64 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset + o, 8).getBigUint64(0, true);
const u128 = (b: Uint8Array, o: number) => u64(b, o) + (u64(b, o + 8) << 64n);

/** Minimal decode of the DBC VirtualPool account (layout of dynamic-bonding-curve 0.2.x). */
type PoolState = { config: string; creator: string; baseMint: string; baseReserve: bigint; quoteReserve: bigint; sqrtPrice: bigint; isMigrated: boolean };
async function readPool(pool: string): Promise<PoolState | null> {
  const r = await solRpc<{ value: { data: [string, string]; owner: string } | null }>("getAccountInfo", [pool, { encoding: "base64" }]);
  if (!r.value || r.value.owner !== DBC_PROGRAM) return null;
  const d = Uint8Array.from(atob(r.value.data[0]), (c) => c.charCodeAt(0));
  // 8 discriminator + VolatilityTracker (64) then config, creator, baseMint, baseVault, quoteVault (5 x 32)
  let o = 8 + 64;
  const key = () => {
    const k = b58encode(d.subarray(o, o + 32));
    o += 32;
    return k;
  };
  const config = key();
  const creator = key();
  const baseMint = key();
  key();
  key();
  const baseReserve = u64(d, o);
  const quoteReserve = u64(d, o + 8);
  o += 16 + 8 * 4; // protocol/partner base+quote fees
  const sqrtPrice = u128(d, o);
  o += 16 + 8 + 1; // sqrtPrice, activationPoint, poolType
  const isMigrated = d[o] === 1;
  return { config, creator, baseMint, baseReserve, quoteReserve, sqrtPrice, isMigrated };
}

/** Raydium LaunchLab PoolState (layout of raydium-sdk-v2 LaunchpadPool). */
type LaunchLabPool = { status: number; decA: number; decB: number; virtualA: bigint; virtualB: bigint; realA: bigint; realB: bigint; totalFundRaisingB: bigint; platformId: string; mintA: string };
async function readLaunchLab(pool: string): Promise<LaunchLabPool | null> {
  const r = await solRpc<{ value: { data: [string, string]; owner: string } | null }>("getAccountInfo", [pool, { encoding: "base64" }]);
  if (!r.value || r.value.owner !== LAUNCHLAB_PROGRAM) return null;
  const d = Uint8Array.from(atob(r.value.data[0]), (c) => c.charCodeAt(0));
  return {
    status: d[17],
    decA: d[18],
    decB: d[19],
    virtualA: u64(d, 37),
    virtualB: u64(d, 45),
    realA: u64(d, 53),
    realB: u64(d, 61),
    totalFundRaisingB: u64(d, 69),
    platformId: b58encode(d.subarray(173, 205)),
    mintA: b58encode(d.subarray(205, 237)),
  };
}

async function refreshLaunchLab(mint: string, pool: string, prices: Prices) {
  const st = await readLaunchLab(pool);
  if (!st) return;
  const reserveA = Number(st.virtualA - st.realA) / 10 ** st.decA;
  const reserveB = Number(st.virtualB + st.realB) / 10 ** st.decB;
  const priceSol = reserveA > 0 ? reserveB / reserveA : 0;
  const mcapSol = priceSol * 1e9;
  const progress = st.totalFundRaisingB > 0n ? Math.min(1, Number(st.realB) / Number(st.totalFundRaisingB)) : 0;
  const migrated = st.status >= 2;
  await db()
    .prepare("UPDATE runes SET v_sats = ?, v_tokens = 1000000000, v_quote = ?, real_sats = ?, sold = ?, graduated = CASE WHEN ? THEN 1 ELSE graduated END, migrated = CASE WHEN ? THEN 1 ELSE migrated END WHERE id = ?")
    .bind(quoteToSats("SOL", mcapSol, prices), mcapSol, quoteToSats("SOL", Number(st.realB) / 1e9, prices), progress * CURVE_SUPPLY, progress >= 0.9999 || st.status >= 1 ? 1 : 0, migrated ? 1 : 0, mint)
    .run();
}

let thresholdCache: Record<string, bigint> = {};
async function migrationThreshold(config: string): Promise<bigint> {
  if (thresholdCache[config]) return thresholdCache[config];
  // all Carvy configs share the same curve: 85.994066487 SOL
  thresholdCache[config] = 85_994_066_487n;
  return thresholdCache[config];
}

function priceSolPerToken(sqrtPrice: bigint): number {
  const s = Number(sqrtPrice) / 2 ** 64;
  return s * s * 10 ** (6 - 9);
}

async function refreshPool(mint: string, pool: string, prices: Prices) {
  const row = await db().prepare("SELECT dex FROM runes WHERE id = ?").bind(mint).first<{ dex: string }>();
  if (row?.dex === "raydium") return refreshLaunchLab(mint, pool, prices);
  const st = await readPool(pool);
  if (!st) return;
  const p = priceSolPerToken(st.sqrtPrice);
  const mcapSol = p * 1e9;
  const thr = await migrationThreshold(st.config);
  const progress = Math.min(1, Number(st.quoteReserve) / Number(thr));
  const mcapSats = quoteToSats("SOL", mcapSol, prices);
  await db()
    .prepare("UPDATE runes SET v_sats = ?, v_tokens = 1000000000, v_quote = ?, real_sats = ?, sold = ?, graduated = CASE WHEN ? THEN 1 ELSE graduated END, migrated = CASE WHEN ? THEN 1 ELSE migrated END WHERE id = ?")
    .bind(mcapSats, mcapSol, quoteToSats("SOL", Number(st.quoteReserve) / 1e9, prices), progress * CURVE_SUPPLY, progress >= 0.9999 || st.isMigrated ? 1 : 0, st.isMigrated ? 1 : 0, mint)
    .run();
}

function delta(tx: ParsedTx, owner: string, mint: string): bigint {
  const pre = tx.meta?.preTokenBalances?.find((t) => t.owner === owner && t.mint === mint)?.uiTokenAmount.amount ?? "0";
  const post = tx.meta?.postTokenBalances?.find((t) => t.owner === owner && t.mint === mint)?.uiTokenAmount.amount ?? "0";
  return BigInt(post) - BigInt(pre);
}

/** Parse one transaction and apply whatever Carvy event it contains. Idempotent. */
export async function recordSolTx(sig: string, prices?: Prices): Promise<string | null> {
  const D1 = db();
  const tx = await solRpc<ParsedTx | null>("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]);
  if (!tx) throw new Error("rpc: transaction not available yet");
  if (!tx.meta || tx.meta.err) return null;
  const pr = prices ?? (await getPrices());
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
  const t = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
  const signer = keys[0];
  const dbcIx = tx.transaction.message.instructions.find((i) => i.programId === DBC_PROGRAM);
  const carvyConfig = keys.find((k) => SOL_TAX_BY_CONFIG[k] !== undefined);
  let touched: string | null = null;

  // 1) pool creation through a Carvy config
  if (dbcIx && carvyConfig && tx.meta.logMessages?.some((l) => /InitializeVirtualPool/i.test(l))) {
    const mint = (tx.meta.postTokenBalances ?? []).map((b) => b.mint).find((m) => m !== WSOL);
    if (mint) {
      const pool = (dbcIx.accounts ?? [])[5];
      const meta = await solTokenMeta(mint);
      const m = meta?.metaId ? await D1.prepare("SELECT * FROM rune_meta WHERE id = ?").bind(meta.metaId).first<Record<string, string>>() : null;
      const st = pool ? await readPool(pool) : null;
      const realPool = st && st.baseMint === mint ? pool! : await findPool(dbcIx.accounts ?? [], mint);
      if (realPool) {
        const tax = SOL_TAX_BY_CONFIG[carvyConfig];
        const ins = await D1.prepare(
          `INSERT OR IGNORE INTO runes (id, ticker, rune_name, title, description, image_url, creator, chain, quote, fee_mode, fee_route, website, x_url, tg_url,
            v_sats, v_tokens, etch_at, created_at, onchain, quote_address, quote_decimals, v_quote, create_tx, launchpad, buy_tax, sell_tax)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'solana', 'SOL', 'dev', ?, ?, ?, ?, ?, 1000000000, ?, ?, 1, ?, 9, 0, ?, ?, ?, ?)`,
        )
          .bind(
            mint,
            (meta?.symbol ?? "RUNE").toUpperCase().slice(0, 10),
            runeNameOf(m?.rune_name || meta?.name || meta?.symbol || "MY RUNE"),
            m?.title || meta?.name || "Rune",
            m?.description ?? "",
            m?.image_url || "/assets/logo.webp",
            signer,
            signer,
            m?.website ?? "",
            m?.x_url ?? "",
            m?.tg_url ?? "",
            quoteToSats("SOL", 30, pr),
            t + 120_000,
            t,
            WSOL,
            sig,
            realPool,
            tax,
            tax,
          )
          .run();
        await tagSite(mint, meta?.metaId);
        if (ins.meta.changes)
          await D1.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, tx, created_at) VALUES ('launch', ?, ?, 'solana', ?, ?, ?)")
            .bind(mint, (meta?.symbol ?? "RUNE").toUpperCase(), `${(meta?.symbol ?? "RUNE").toUpperCase()} launched on Solana`, sig, t)
            .run();
        await D1.prepare("UPDATE runes SET dex = 'meteora' WHERE id = ?").bind(mint).run();
        await refreshPool(mint, realPool, pr);
        touched = mint;
      }
    }
  }

  // 1b) Raydium LaunchLab creation through a Carvy platform
  const llInit = tx.transaction.message.instructions.find((i) => i.programId === LAUNCHLAB_PROGRAM && (i.accounts ?? []).some((a) => RAYDIUM_TIER_BY_PLATFORM[a] !== undefined));
  if (llInit && tx.meta.logMessages?.some((l) => /Instruction: Initialize/i.test(l))) {
    const acc = llInit.accounts ?? [];
    const platform = acc.find((a) => RAYDIUM_TIER_BY_PLATFORM[a] !== undefined)!;
    const pool = acc[5];
    const st = pool ? await readLaunchLab(pool).catch(() => null) : null;
    if (st && st.platformId === platform) {
      const mint = st.mintA;
      const meta = await solTokenMeta(mint);
      const m = meta?.metaId ? await D1.prepare("SELECT * FROM rune_meta WHERE id = ?").bind(meta.metaId).first<Record<string, string>>() : null;
      const tier = RAYDIUM_TIER_BY_PLATFORM[platform];
      const sym = (meta?.symbol ?? "RUNE").toUpperCase().slice(0, 10);
      const ins = await D1.prepare(
        `INSERT OR IGNORE INTO runes (id, ticker, rune_name, title, description, image_url, creator, chain, quote, fee_mode, fee_route, website, x_url, tg_url,
          v_sats, v_tokens, etch_at, created_at, onchain, quote_address, quote_decimals, v_quote, create_tx, launchpad, buy_tax, sell_tax, dex)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'solana', 'SOL', 'dev', ?, ?, ?, ?, ?, 1000000000, ?, ?, 1, ?, 9, 0, ?, ?, ?, ?, 'raydium')`,
      )
        .bind(mint, sym, runeNameOf(m?.rune_name || meta?.name || meta?.symbol || "MY RUNE"), m?.title || meta?.name || "Rune", m?.description ?? "", m?.image_url || "/assets/logo.webp", signer, signer, m?.website ?? "", m?.x_url ?? "", m?.tg_url ?? "", quoteToSats("SOL", 28, pr), t + 120_000, t, WSOL, sig, pool, tier, tier)
        .run();
      await tagSite(mint, meta?.metaId);
      if (ins.meta.changes)
        await D1.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, tx, created_at) VALUES ('launch', ?, ?, 'solana', ?, ?, ?)").bind(mint, sym, `${sym} launched on Solana`, sig, t).run();
      await refreshLaunchLab(mint, pool, pr);
      touched = mint;
    }
  }

  // 2) trades on a known pool (buy/sell by the signer)
  const known = await D1.prepare(`SELECT id, ticker, launchpad FROM runes WHERE chain = 'solana' AND onchain = 1 AND launchpad IN (${keys.map(() => "?").join(",")})`).bind(...keys).all<{ id: string; ticker: string; launchpad: string }>();
  for (const r of known.results) {
    const tok = delta(tx, signer, r.id);
    if (tok === 0n) continue;
    const dupe = await D1.prepare("SELECT id FROM trades WHERE tx = ? AND rune_id = ?").bind(sig, r.id).first();
    if (dupe) continue;
    // SOL moved in/out of the pool's quote vault (exact trade size incl. fees); fallback: signer's lamport change
    const vaultOwners = [...new Set([...(tx.meta.preTokenBalances ?? []), ...(tx.meta.postTokenBalances ?? [])].filter((b) => b.mint === WSOL && b.owner && b.owner !== signer).map((b) => b.owner!))];
    let lamports = vaultOwners.reduce((acc, o) => acc + delta(tx, o, WSOL), 0n);
    if (lamports === 0n) lamports = BigInt(tx.meta.preBalances[0] - tx.meta.postBalances[0] - tx.meta.fee) + -delta(tx, signer, WSOL);
    const sol = Math.abs(Number(lamports)) / 1e9;
    const sats = quoteToSats("SOL", sol, pr);
    const isBuy = tok > 0n;
    const tokens = Math.abs(Number(tok)) / 1e6;
    await refreshPool(r.id, r.launchpad, pr);
    const row = await D1.prepare("SELECT v_sats FROM runes WHERE id = ?").bind(r.id).first<{ v_sats: number }>();
    await D1.batch([
      D1.prepare("INSERT INTO trades (rune_id, trader, side, sats, tokens, quote, quote_amount, usd, mcap_sats, tx, created_at) VALUES (?, ?, ?, ?, ?, 'SOL', ?, ?, ?, ?, ?)").bind(r.id, signer, isBuy ? "buy" : "sell", sats, tokens, sol, satsToUsd(sats, pr), row?.v_sats ?? 0, sig, t),
      D1.prepare("INSERT INTO holdings (rune_id, wallet, balance) VALUES (?, ?, ?) ON CONFLICT(rune_id, wallet) DO UPDATE SET balance = MAX(0, balance + excluded.balance)").bind(r.id, signer, isBuy ? tokens : -tokens),
      D1.prepare("UPDATE runes SET volume_sats = volume_sats + ? WHERE id = ?").bind(sats, r.id),
      D1.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, usd, tx, created_at) VALUES (?, ?, ?, 'solana', ?, ?, ?, ?)").bind(isBuy ? "buy" : "sell", r.id, r.ticker, `${isBuy ? "Bought" : "Sold"} ${r.ticker}`, satsToUsd(sats, pr), sig, t),
    ]);
    touched = r.id;
  }

  // 3) bridge to Bitcoin: tokens sent to the vault with a "carvy:btc:<address>" memo
  const vaultGain = (tx.meta.postTokenBalances ?? []).filter((b) => b.owner === SOL_VAULT);
  for (const b of vaultGain) {
    const gained = delta(tx, SOL_VAULT, b.mint);
    if (gained <= 0n || signer === SOL_VAULT) continue;
    const rune = await D1.prepare("SELECT id FROM runes WHERE id = ? AND chain = 'solana'").bind(b.mint).first();
    if (!rune) continue;
    const memo = memoOf(tx);
    const btcAddr = memo ? (/^(?:carvy|runehood):btc:(.+)$/.exec(memo)?.[1] ?? "").trim() : "";
    await D1.prepare(
      "INSERT OR IGNORE INTO btc_out (id, chain, bridge, nonce, token, from_addr, amount, btc_address, evm_tx, status, detail, created_at, updated_at) VALUES (?, 'solana', 'vault', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(`solana:${sig}`, b.mint, signer, (gained * SOL_TO_RUNE).toString(), btcAddr, sig, btcAddr ? "queued" : "manual", btcAddr ? "" : "No Bitcoin address memo. Held for manual refund.", Date.now(), Date.now())
      .run();
    touched = b.mint;
  }
  return touched;
}

function memoOf(tx: ParsedTx): string | null {
  for (const i of tx.transaction.message.instructions) {
    if (i.programId === MEMO_PROGRAM && typeof i.parsed === "string") return i.parsed;
  }
  const l = tx.meta?.logMessages?.find((x) => x.includes("Memo (len"));
  const m = l?.match(/: "(.*)"$/);
  return m ? m[1] : null;
}

async function findPool(accounts: string[], mint: string): Promise<string | null> {
  for (const a of accounts) {
    const st = await readPool(a).catch(() => null);
    if (st && st.baseMint === mint) return a;
  }
  return null;
}

/** Read name/symbol/uri from the Metaplex metadata account; Carvy URIs carry the rune_meta id. */
async function solTokenMeta(mint: string): Promise<{ name: string; symbol: string; uri: string; metaId: string } | null> {
  try {
    const META = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
    const { PublicKey } = await import("@solana/web3.js");
    const [pda] = PublicKey.findProgramAddressSync([new TextEncoder().encode("metadata"), b58decode(META), b58decode(mint)], new PublicKey(META));
    const r = await solRpc<{ value: { data: [string, string] } | null }>("getAccountInfo", [pda.toBase58(), { encoding: "base64" }]);
    if (!r.value) return null;
    const d = Uint8Array.from(atob(r.value.data[0]), (c) => c.charCodeAt(0));
    let o = 1 + 32 + 32;
    const str = () => {
      const len = new DataView(d.buffer, o, 4).getUint32(0, true);
      o += 4;
      const s = new TextDecoder().decode(d.subarray(o, o + len)).replace(/\0+$/, "");
      o += len;
      return s;
    };
    const name = str();
    const symbol = str();
    const uri = str();
    return { name, symbol, uri, metaId: uri.match(/\/api\/meta\/([a-f0-9]{32})/)?.[1] ?? "" };
  } catch {
    return null;
  }
}

/** Poll config keys (new pools), known pools (trades from any app) and the vault (bridge deposits). */
export async function syncSolana(): Promise<void> {
  const D1 = db();
  const pr = await getPrices();
  // bridge deposits first (user funds), then new pools + trades (config keys appear in every swap), then pools
  const addrs: string[] = [...(await vaultTokenAccounts()), ...Object.values(RAYDIUM_PLATFORMS), ...Object.values(SOL_CONFIGS), ...Object.values(SOL_LEGACY_CONFIGS)];
  const pools = (await D1.prepare("SELECT id, launchpad FROM runes WHERE chain = 'solana' AND onchain = 1 AND hidden = 0").all<{ id: string; launchpad: string }>()).results;
  for (const p of pools) addrs.push(p.launchpad);
  let budget = 25; // transactions per run (Worker subrequest limits); the cursor resumes next run
  for (const a of addrs) {
    if (budget <= 0) break;
    const key = `sidx:${a}`;
    const last = await D1.prepare("SELECT v FROM cache WHERE k = ?").bind(key).first<{ v: string }>();
    // newest-first pages back to the cursor (or full history on first sight, max 1000)
    const all: Array<{ signature: string; err: unknown }> = [];
    let before: string | undefined;
    for (let page = 0; page < 5; page++) {
      const sigs = await solRpc<Array<{ signature: string; err: unknown }>>("getSignaturesForAddress", [a, { limit: 200, ...(last ? { until: last.v } : {}), ...(before ? { before } : {}) }]).catch(() => null);
      if (!sigs || !sigs.length) break;
      all.push(...sigs);
      if (sigs.length < 200) break;
      before = sigs[sigs.length - 1].signature;
    }
    if (!all.length) continue;
    const ordered = all.reverse(); // oldest first
    let cursor: string | null = null;
    for (const sg of ordered) {
      if (budget <= 0) break;
      if (!sg.err) {
        budget--;
        const err = await recordSolTx(sg.signature, pr).then(() => null).catch((e: Error) => (console.error("sol tx", sg.signature, e), e));
        if (err && /rpc |aborted|fetch|timeout|Too many/i.test(err.message)) {
          budget = 0; // rate limited: stop this run, resume from here next run
          break;
        }
      }
      cursor = sg.signature;
    }
    if (cursor)
      await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(key, cursor, Date.now()).run();
  }
  for (const p of pools) await refreshPool(p.id, p.launchpad, pr).catch(() => {});
}

async function vaultTokenAccounts(): Promise<string[]> {
  // Vault ATA per Solana rune (derived locally; some RPCs block getTokenAccountsByOwner)
  const { PublicKey } = await import("@solana/web3.js");
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const rows = (await db().prepare("SELECT id FROM runes WHERE chain = 'solana' AND onchain = 1").all<{ id: string }>()).results;
  return rows.map((r) => getAssociatedTokenAddressSync(new PublicKey(r.id), new PublicKey(SOL_VAULT)).toBase58());
}

/** Bitcoin Rune names: A-Z with optional • spacers, at least 6 letters at the current height. */
export function runeNameOf(raw: string): string {
  let n = raw.toUpperCase().replace(/[^A-Z]+/g, "•").replace(/^•+|•+$/g, "");
  if (n.replace(/•/g, "").length < 6) n = n ? `${n}•RUNE` : "MY•RUNE";
  if (n.replace(/•/g, "").length < 6) n = `RUNE•${n}`;
  return n.slice(0, 40);
}
