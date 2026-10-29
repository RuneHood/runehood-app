// Server-side indexer for the on-chain launchpad: pulls RuneCreated / Trade / Graduated logs from each live
// chain into D1 so the site shows real on-chain Runes, trades, charts and holders. Throttled per chain.
import type { Hex } from "viem";

import { CHAINS, CURVE_SUPPLY, mcapSats, quoteToSats, satsToUsd, type ChainId, type Prices } from "./carvy";
import { DEPLOYMENTS, allLaunchpads, decodeLaunchpadLog, firstBlock, liveDeployment, quoteByAddress, rpcCall, type Deployment } from "./onchain";
import { db, getPrices } from "./carvy.server";
import { bindings } from "./bindings.server";

const THROTTLE_MS = 15_000;
const MAX_RANGE = 5_000;

type Log = { address: string; topics: Hex[]; data: Hex; blockNumber: Hex; transactionHash: Hex; logIndex: Hex; blockTimestamp?: Hex };

const metaIdFromUri = (uri: string) => { const m = /^(carvy|runehood):meta:([0-9a-f]{8,48})$/.exec(uri); return m ? m[2] : ""; };

/** Tag a Rune with the site its metadata was saved on (carvy.fun or runehood.fun). */
export async function tagSite(runeId: string, metaId: string | null | undefined) {
  if (!metaId) return;
  await db().prepare("UPDATE runes SET site = COALESCE((SELECT site FROM rune_meta WHERE id = ?), site) WHERE id = ?").bind(metaId, runeId).run();
}

export async function syncAllChains(force = false): Promise<void> {
  const chains = CHAINS.map((c) => c.id).filter((id) => liveDeployment(id));
  await Promise.all(chains.map((c) => syncChain(c, force).catch((e) => console.error("index", c, e))));
}

/** A private RPC (e.g. Alchemy) set as a Worker secret goes first; public endpoints stay as fallbacks. */
function withPrivateRpc(chain: ChainId, d: Deployment): Deployment {
  const env = bindings();
  const key = chain === "ethereum" ? env.RPC_ETHEREUM : chain === "base" ? env.RPC_BASE : chain === "robinhood" ? env.RPC_ROBINHOOD : chain === "bsc" ? env.RPC_BSC : undefined;
  return key ? { ...d, rpcs: [key, ...d.rpcs] } : d;
}

export async function syncChain(chain: ChainId, force = false): Promise<void> {
  const live = liveDeployment(chain);
  if (!live) return;
  const d = withPrivateRpc(chain, live);
  const D1 = db();
  const key = `idx2:${chain}`;
  const row = await D1.prepare("SELECT v, updated_at FROM cache WHERE k = ?").bind(key).first<{ v: string; updated_at: number }>();
  if (!force && row && Date.now() - row.updated_at < THROTTLE_MS) return;
  let from = row ? Number(row.v) + 1 : firstBlock(d);
  // claim the slot first so parallel requests do not double-index
  await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET updated_at = excluded.updated_at").bind(key, String(from - 1), Date.now()).run();
  const head = parseInt(await rpcCall<string>(d, "eth_blockNumber", []), 16) - 3; // small lag: load-balanced RPC nodes can trail the head
  const prices = await getPrices();
  let rounds = 0;
  while (from <= head && rounds++ < 6) {
    const to = Math.min(head, from + MAX_RANGE - 1);
    const logs = await rpcCall<Log[]>(d, "eth_getLogs", [{ address: allLaunchpads(d), fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }]);
    logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16) || parseInt(a.logIndex, 16) - parseInt(b.logIndex, 16));
    for (const log of logs) await applyLog(chain, d, log, prices);
    await D1.prepare("UPDATE cache SET v = ?, updated_at = ? WHERE k = ?").bind(String(to), Date.now(), key).run();
    from = to + 1;
  }
}

/** Apply every launchpad log of one transaction from its receipt (works on RPCs without eth_getLogs). */
export async function applyReceipt(chain: ChainId, hash: string): Promise<boolean> {
  const live = liveDeployment(chain);
  if (!live) return false;
  const d = withPrivateRpc(chain, live);
  const rc = await rpcCall<{ status: string; blockNumber: Hex; logs: Log[] } | null>(d, "eth_getTransactionReceipt", [hash]).catch(() => null);
  if (!rc || rc.status !== "0x1") return false;
  const prices = await getPrices();
  const pads = allLaunchpads(d).map((a) => a.toLowerCase());
  for (const log of rc.logs) if (pads.includes(log.address.toLowerCase())) await applyLog(chain, d, log, prices);
  const { recordBridgeLog } = await import("./btc/service.server");
  for (const log of rc.logs) await recordBridgeLog(chain, log as never).catch(() => null);
  return true;
}

async function logTime(d: Deployment, log: Log): Promise<number> {
  if (log.blockTimestamp) return parseInt(log.blockTimestamp, 16) * 1000;
  return blockTime(d, log.blockNumber);
}

async function blockTime(d: Deployment, block: Hex): Promise<number> {
  const b = await rpcCall<{ timestamp: Hex } | null>(d, "eth_getBlockByNumber", [block, false]).catch(() => null);
  return b ? parseInt(b.timestamp, 16) * 1000 : Date.now();
}

async function applyLog(chain: ChainId, d: Deployment, log: Log, prices: Prices) {
  const ev = decodeLaunchpadLog(log);
  if (!ev) return;
  const D1 = db();
  const a = ev.args as Record<string, unknown>;
  if (ev.eventName === "RuneCreated") {
    const token = String(a.token).toLowerCase();
    const q = quoteByAddress(d, String(a.quote));
    if (!q) return;
    const meta = metaIdFromUri(String(a.metadataURI));
    const m = meta ? await D1.prepare("SELECT * FROM rune_meta WHERE id = ?").bind(meta).first<{ title: string; description: string; image_url: string; website: string; x_url: string; tg_url: string }>() : null;
    const t = await logTime(d, log);
    const vQuote0 = 0; // set by the first Trade; until then use the configured start below
    const startQuote = q.v0 ? Number(q.v0) / 1e18 : q.symbol === "ETH" ? 1 : q.symbol === "BNB" ? 3 : q.symbol === "USDC" || q.symbol === "USDT" ? 4000 : 0.04;
    const vSats = quoteToSats(q.symbol, startQuote, prices);
    const feeMode = ["dev", "holders", "routed"][Number(a.feeMode)] ?? "dev";
    const ins = await D1.prepare(
      `INSERT OR IGNORE INTO runes (id, ticker, rune_name, title, description, image_url, creator, chain, quote, fee_mode, fee_route, website, x_url, tg_url,
        v_sats, v_tokens, etch_at, created_at, onchain, quote_address, quote_decimals, v_quote, create_tx, launchpad, buy_tax, sell_tax)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        token,
        String(a.symbol).toUpperCase().slice(0, 10),
        String(a.runeName).toUpperCase().replace(/\./g, "•"),
        m?.title || String(a.name),
        m?.description ?? "",
        m?.image_url || "/assets/logo.webp",
        String(a.creator).toLowerCase(),
        chain,
        q.symbol,
        feeMode,
        String(a.feeRecipient).toLowerCase(),
        m?.website ?? "",
        m?.x_url ?? "",
        m?.tg_url ?? "",
        vSats,
        1_073_000_000,
        t + 120_000,
        t,
        String(a.quote).toLowerCase(),
        q.decimals,
        vQuote0 || startQuote,
        log.transactionHash,
        log.address.toLowerCase(),
        Number(a.buyTaxBps ?? 0),
        Number(a.sellTaxBps ?? 0),
      )
      .run();
    await tagSite(token, meta);
    if (ins.meta.changes) {
      await D1.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, tx, created_at) VALUES ('launch', ?, ?, ?, ?, ?, ?)")
        .bind(token, String(a.symbol).toUpperCase(), chain, `${String(a.symbol).toUpperCase()} launched on ${d.name}`, log.transactionHash, t)
        .run();
    } else {
      await D1.prepare("UPDATE runes SET launchpad = ?, buy_tax = ?, sell_tax = ? WHERE id = ? AND launchpad = ''").bind(log.address.toLowerCase(), Number(a.buyTaxBps ?? 0), Number(a.sellTaxBps ?? 0), token).run();
    }
    return;
  }
  if (ev.eventName === "Trade") {
    const token = String(a.token).toLowerCase();
    const r = await D1.prepare("SELECT ticker, quote, quote_decimals, graduated, fee_mode, quote_address FROM runes WHERE id = ?").bind(token).first<{ ticker: string; quote: string; quote_decimals: number; graduated: number; fee_mode: string; quote_address: string }>();
    if (!r) return;
    const dupe = await D1.prepare("SELECT id FROM trades WHERE tx = ? AND rune_id = ?").bind(log.transactionHash, token).first();
    if (dupe) return;
    if (r.fee_mode === "holders") {
      const { accrueCurveTrade } = await import("./holders.server");
      await accrueCurveTrade(chain, token, r.quote_address, Boolean(a.isBuy), a.quoteAmount as bigint, a.fee as bigint).catch((e) => console.error("holders accrue", e));
    }
    const dec = r.quote_decimals;
    const q = r.quote as Parameters<typeof quoteToSats>[0];
    const quoteAmt = Number(a.quoteAmount as bigint) / 10 ** dec;
    const tokens = Number(a.tokenAmount as bigint) / 1e18;
    const vQuote = Number(a.vQuote as bigint) / 10 ** dec;
    const vToken = Number(a.vToken as bigint) / 1e18;
    const sold = Number(a.sold as bigint) / 1e18;
    const vSats = quoteToSats(q, vQuote, prices);
    const sats = quoteToSats(q, quoteAmt, prices);
    const usd = satsToUsd(sats, prices);
    const fee = Number(a.fee as bigint) / 10 ** dec;
    const feeSats = quoteToSats(q, fee, prices);
    const isBuy = Boolean(a.isBuy);
    let trader = String(a.trader).toLowerCase();
    // trades routed through RunehoodZap (pay with ETH) belong to the wallet that sent the tx
    if (d.zap && trader === d.zap.toLowerCase()) {
      const tx = await rpcCall<{ from: string } | null>(d, "eth_getTransactionByHash", [log.transactionHash]).catch(() => null);
      if (tx?.from) trader = tx.from.toLowerCase();
    }
    const t = await logTime(d, log);
    await D1.batch([
      D1.prepare(
        "UPDATE runes SET v_sats = ?, v_tokens = ?, v_quote = ?, sold = ?, real_sats = MAX(0, real_sats + ?), volume_sats = volume_sats + ?, creator_fees_sats = creator_fees_sats + ?, platform_fees_sats = platform_fees_sats + ? WHERE id = ?",
      ).bind(vSats, vToken, vQuote, sold, isBuy ? sats - feeSats : -(sats + feeSats), sats, feeSats / 2, feeSats / 2, token),
      D1.prepare("INSERT INTO holdings (rune_id, wallet, balance) VALUES (?, ?, ?) ON CONFLICT(rune_id, wallet) DO UPDATE SET balance = MAX(0, balance + excluded.balance)").bind(token, trader, isBuy ? tokens : -tokens),
      D1.prepare("INSERT INTO trades (rune_id, trader, side, sats, tokens, quote, quote_amount, usd, mcap_sats, tx, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(token, trader, isBuy ? "buy" : "sell", sats, tokens, r.quote, quoteAmt, usd, mcapSats(vSats, vToken), log.transactionHash, t),
      D1.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, usd, tx, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(isBuy ? "buy" : "sell", token, r.ticker, chain, `${isBuy ? "Bought" : "Sold"} ${r.ticker}`, usd, log.transactionHash, t),
    ]);
    return;
  }
  if (ev.eventName === "Migrated") {
    const token = String(a.token).toLowerCase();
    const r = await D1.prepare("SELECT ticker, migrated FROM runes WHERE id = ?").bind(token).first<{ ticker: string; migrated: number }>();
    if (!r || r.migrated) return;
    await D1.batch([
      D1.prepare("UPDATE runes SET migrated = 1, graduated = 1, pool_id = ? WHERE id = ?").bind(String(a.poolId ?? ""), token),
      D1.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, tx, created_at) VALUES ('graduate', ?, ?, ?, ?, ?, ?)").bind(token, r.ticker, chain, `${r.ticker} moved into its Uniswap V4 pool on ${d.name}`, log.transactionHash, Date.now()),
    ]);
    return;
  }
  if (ev.eventName === "Graduated") {
    const token = String(a.token).toLowerCase();
    const r = await D1.prepare("SELECT ticker, graduated FROM runes WHERE id = ?").bind(token).first<{ ticker: string; graduated: number }>();
    if (!r || r.graduated) return;
    await D1.batch([
      D1.prepare("UPDATE runes SET graduated = 1 WHERE id = ?").bind(token),
      D1.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, tx, created_at) VALUES ('graduate', ?, ?, ?, ?, ?, ?)").bind(token, r.ticker, chain, `${r.ticker} graduated on ${d.name}`, log.transactionHash, Date.now()),
    ]);
  }
}

export const anyLive = () => Object.keys(DEPLOYMENTS).some((c) => liveDeployment(c));
