// Bitcoin chain access through mempool.space (with blockstream.info as fallback for reads and broadcast).
const BASES = ["https://mempool.space/api", "https://blockstream.info/api"];

async function get<T>(path: string, json = true): Promise<T> {
  let last: unknown;
  for (const b of BASES) {
    try {
      const r = await fetch(b + path, { signal: AbortSignal.timeout(10_000) });
      if (r.status === 404) throw Object.assign(new Error("not found"), { notFound: true });
      if (!r.ok) throw new Error(`${b}${path} ${r.status}`);
      return (json ? await r.json() : await r.text()) as T;
    } catch (e) {
      if ((e as { notFound?: boolean }).notFound) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("bitcoin api failed");
}

export type ApiUtxo = { txid: string; vout: number; value: number; status: { confirmed: boolean; block_height?: number } };
export type ApiTxStatus = { confirmed: boolean; block_height?: number; block_hash?: string };

export const tipHeight = async () => Number(await get<string>("/blocks/tip/height", false));
export const addressUtxos = (addr: string) => get<ApiUtxo[]>(`/address/${addr}/utxo`);
export const txStatus = (txid: string) => get<ApiTxStatus>(`/tx/${txid}/status`);
let tipCache = { h: 0, at: 0 };
/** Tip height cached ~30s (status endpoints are polled by every open page). */
export async function tipHeightCached(): Promise<number> {
  if (Date.now() - tipCache.at < 30_000 && tipCache.h) return tipCache.h;
  tipCache = { h: await tipHeight(), at: Date.now() };
  return tipCache.h;
}
const confCache = new Map<string, { c: number; at: number }>();
/** Confirmations of a tx (0 = in mempool, -1 = unknown), cached ~30s. */
export async function confirmations(txid: string): Promise<number> {
  if (!txid) return -1;
  const hit = confCache.get(txid);
  if (hit && Date.now() - hit.at < 30_000) return hit.c;
  try {
    const [st, tip] = await Promise.all([txStatus(txid), tipHeightCached()]);
    const c = st.confirmed && st.block_height ? tip - st.block_height + 1 : 0;
    confCache.set(txid, { c, at: Date.now() });
    return c;
  } catch {
    return -1;
  }
}
export async function recommendedFees(): Promise<{ fastestFee: number; halfHourFee: number }> {
  const r = await fetch("https://mempool.space/api/v1/fees/recommended", { signal: AbortSignal.timeout(8000) });
  return (await r.json()) as { fastestFee: number; halfHourFee: number };
}
export type CpfpInfo = { effectiveFeePerVsize: number; cluster?: { txs: Array<{ txid: string; fee: number; weight: number }> } };
export const cpfpInfo = async (txid: string) => {
  const r = await fetch(`https://mempool.space/api/v1/cpfp/${txid}`, { signal: AbortSignal.timeout(8000) });
  return (await r.json()) as CpfpInfo;
};
export const blockTxids = (hash: string) => get<string[]>(`/block/${hash}/txids`);

export async function feeRate(): Promise<bigint> {
  try {
    const r = await fetch("https://mempool.space/api/v1/fees/recommended", { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { fastestFee: number; halfHourFee: number };
    // next-block rate (min 2 sat/vB): costs a few hundred sats more but keeps every step fast
    return BigInt(Math.min(50, Math.max(2, Math.ceil(j.fastestFee))));
  } catch {
    return 3n;
  }
}

/** Broadcast; returns txid. Tries every endpoint, treats "already in mempool/chain" as success. */
export async function broadcast(hex: string, txid: string): Promise<string> {
  let lastErr = "";
  for (const b of BASES) {
    try {
      const r = await fetch(`${b}/tx`, { method: "POST", body: hex, signal: AbortSignal.timeout(15_000) });
      const t = await r.text();
      if (r.ok) return t.trim();
      if (/already|txn-already-known|known/i.test(t)) return txid;
      lastErr = t.slice(0, 300);
    } catch (e) {
      lastErr = String((e as Error).message);
    }
  }
  throw new Error(`broadcast failed: ${lastErr}`);
}

/** Runes index (Hiro). Returns null when unknown/unreachable so callers never act on a guess. */
export type HiroEtching = { id: string; name: string; spaced_name: string; divisibility: number; supply?: { premine: string } };

export async function hiroEtching(nameOrId: string, apiKey: string): Promise<HiroEtching | "missing" | null> {
  try {
    const r = await fetch(`https://api.hiro.so/runes/v1/etchings/${encodeURIComponent(nameOrId)}`, { headers: { "x-api-key": apiKey, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) return "missing";
    if (!r.ok) return null;
    return (await r.json()) as HiroEtching;
  } catch {
    return null;
  }
}

/** Rune lookup by name or id. Xverse's public ord index first (no key), Hiro as a fallback when a key is set.
 *  Returns "missing" only when an index positively says the Rune does not exist, null when unsure. */
export type RuneInfo = { id: string; divisibility: number; premine: string; spaced: string };

export async function runeLookup(nameOrId: string, hiroKey = ""): Promise<RuneInfo | "missing" | null> {
  try {
    const r = await fetch(`https://api.xverse.app/v1/runes/${encodeURIComponent(nameOrId)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) return "missing";
    if (r.ok) {
      const t = await r.text();
      const j = JSON.parse(t) as { id: string; entry: { divisibility: number; spaced_rune: string } };
      const premine = t.match(/"premine"\s*:\s*"?(\d+)/)?.[1] ?? "0"; // keep full u128 precision
      return { id: j.id, divisibility: j.entry.divisibility, premine, spaced: j.entry.spaced_rune };
    }
  } catch {
    /* fall through */
  }
  if (!hiroKey) return null;
  const h = await hiroEtching(nameOrId, hiroKey);
  if (h === null || h === "missing") return h;
  return { id: h.id, divisibility: h.divisibility, premine: h.supply?.premine ?? "0", spaced: h.spaced_name };
}
