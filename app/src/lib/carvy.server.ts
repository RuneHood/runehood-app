// Server-only Carvy helpers: D1 access, price feed, sessions, seeding and Rune etching progression.
import type { D1Database } from "@cloudflare/workers-types";

import { bindings } from "./bindings.server";
import { toHex } from "./eip191";
import { STOCKS, V_SATS0, V_TOKENS0, isStock, type Prices, type RuneRow, type Stock } from "./carvy";

export function db(): D1Database {
  const { DB } = bindings();
  if (!DB) throw new Error("Database is not available yet. Try again in a moment.");
  return DB;
}

const enc = new TextEncoder();
export const randomHex = (n: number) => toHex(crypto.getRandomValues(new Uint8Array(n)));

export async function sha(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(`carvy-session:${s}`));
  return toHex(new Uint8Array(d));
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function runeId(): string {
  const b = crypto.getRandomValues(new Uint8Array(36));
  let s = "";
  for (const x of b) s += B58[x % 58];
  return `${s}CRVY`;
}
export const fakeTx = () => randomHex(32);

// ---------- Sessions ----------
export async function sessionAddress(token?: string | null): Promise<string | null> {
  if (!token || token.length < 32) return null;
  const row = await db().prepare("SELECT address FROM sessions WHERE token_hash = ? AND expires_at > ?").bind(await sha(token), Date.now()).first<{ address: string }>();
  return row?.address ?? null;
}

export async function requireSession(token?: string | null): Promise<string> {
  const a = await sessionAddress(token);
  if (!a) throw new Error("Connect your wallet first.");
  return a;
}

export const walletKind = (addr: string): "evm" | "solana" => (/^0x[0-9a-f]{40}$/i.test(addr) ? "evm" : "solana");

// ---------- Prices (CoinGecko, cached 60s in D1, safe fallback) ----------
const FALLBACK: Prices = { BTC: 80_000, ETH: 2_350, SOL: 100, BNB: 750, updated: 0 };


// ---------- Robinhood Stock Token prices (Robinhood public quotes, USD per token = share price x uiMultiplier) ----------
const STOCK_MULT: Partial<Record<Stock, number>> = {"TSLA": 1.0, "NVDA": 1.000775, "AAPL": 1.000566, "SPY": 1.001718, "QQQ": 1.000701, "MSTR": 1.0, "COIN": 1.0, "GOOGL": 1.000194, "AMZN": 1.0, "META": 1.000541, "MSFT": 1.000413, "PLTR": 1.0, "AMD": 1.0, "GME": 1.0, "CRCL": 1.0};
async function stockPrices(): Promise<Partial<Record<Stock, number>> | undefined> {
  try {
    const r = await fetch(`https://api.robinhood.com/marketdata/quotes/?symbols=${STOCKS.join(",")}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { results: Array<{ symbol: string; last_trade_price: string; last_extended_hours_trade_price?: string | null } | null> };
    const out: Partial<Record<Stock, number>> = {};
    for (const x of j.results ?? []) {
      if (!x || !isStock(x.symbol)) continue;
      const px = Number(x.last_extended_hours_trade_price || x.last_trade_price);
      if (px > 0) out[x.symbol] = px * (STOCK_MULT[x.symbol] ?? 1);
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** $RUNE price in ETH from its Uniswap V4 pool (ETH = currency0, RUNE = currency1). */
async function runeEthPrice(): Promise<number | undefined> {
  try {
    const { DEPLOYMENTS, rpcCall } = await import("./onchain");
    const { RUNE_TOKEN } = await import("./rune-token");
    const { keccak256, encodePacked, encodeFunctionData, parseAbi } = await import("viem");
    const slot = keccak256(encodePacked(["bytes32", "uint256"], [RUNE_TOKEN.poolId as `0x${string}`, 6n]));
    const data = encodeFunctionData({ abi: parseAbi(["function extsload(bytes32) view returns (bytes32)"]), functionName: "extsload", args: [slot] });
    const raw = await rpcCall<string>(DEPLOYMENTS.robinhood!, "eth_call", [{ to: "0x8366a39CC670B4001A1121B8F6A443A643e40951", data }, "latest"]);
    const sq = Number(BigInt(raw) & ((1n << 160n) - 1n)) / 2 ** 96;
    return sq > 0 ? 1 / (sq * sq) : undefined;
  } catch {
    return undefined;
  }
}

export async function getPrices(): Promise<Prices> {
  const d = db();
  const row = await d.prepare("SELECT v, updated_at FROM cache WHERE k = 'prices'").first<{ v: string; updated_at: number }>();
  if (row && Date.now() - row.updated_at < 60_000) return JSON.parse(row.v) as Prices;
  const stocksP = stockPrices();
  const runeP = runeEthPrice();
  const save = async (p: Prices) => {
    p.stocks = (await stocksP) ?? (row ? (JSON.parse(row.v) as Prices).stocks : undefined);
    const re = await runeP;
    p.RUNE = re ? re * p.ETH : row ? (JSON.parse(row.v) as Prices).RUNE : undefined;
    await d.prepare("INSERT INTO cache (k, v, updated_at) VALUES ('prices', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(JSON.stringify(p), Date.now()).run();
    return p;
  };
  // 1) CoinGecko
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd", {
      headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { bitcoin?: { usd: number }; ethereum?: { usd: number }; solana?: { usd: number }; binancecoin?: { usd: number } };
    if (!j.bitcoin?.usd || !j.ethereum?.usd || !j.solana?.usd) throw new Error("bad feed");
    return await save({ BTC: j.bitcoin.usd, ETH: j.ethereum.usd, SOL: j.solana.usd, BNB: j.binancecoin?.usd ?? FALLBACK.BNB, updated: Date.now() });
  } catch {
    /* next source */
  }
  // 2) Coinbase spot prices (works from Cloudflare when CoinGecko rate-limits)
  try {
    const spot = async (pair: string) => {
      const r = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(String(r.status));
      return Number(((await r.json()) as { data: { amount: string } }).data.amount);
    };
    const [BTC, ETH, SOL, BNB] = await Promise.all([spot("BTC-USD"), spot("ETH-USD"), spot("SOL-USD"), spot("BNB-USD").catch(() => FALLBACK.BNB ?? 650)]);
    if (BTC > 0 && ETH > 0 && SOL > 0) return await save({ BTC, ETH, SOL, BNB, updated: Date.now() });
  } catch {
    /* fall back */
  }
  return row ? (JSON.parse(row.v) as Prices) : { ...FALLBACK, updated: Date.now() };
}

// ---------- Bitcoin testnet4 tip (for Rune ids) ----------
async function testnetTip(): Promise<number> {
  try {
    const r = await fetch("https://mempool.space/testnet4/api/blocks/tip/height", { signal: AbortSignal.timeout(3000) });
    const n = Number(await r.text());
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* fall through */
  }
  return 110_000 + Math.floor((Date.now() - 1_760_000_000_000) / 600_000);
}

/** Runes whose etch delay passed get their testnet Rune id assigned (block:tx) and an activity line. */
export async function progressEtching(): Promise<void> {
  const d = db();
  const due = await d.prepare("SELECT id, ticker, chain FROM runes WHERE rune_ref = '' AND onchain = 0 AND etch_at <= ? LIMIT 10").bind(Date.now()).all<{ id: string; ticker: string; chain: string }>();
  if (!due.results.length) return;
  const tip = await testnetTip();
  const now = Date.now();
  const stmts = due.results.flatMap((r) => {
    const ref = `${tip}:${1 + Math.floor(Math.random() * 900)}`;
    return [
      d.prepare("UPDATE runes SET rune_ref = ? WHERE id = ? AND rune_ref = ''").bind(ref, r.id),
      d.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, tx, created_at) VALUES ('etch', ?, ?, ?, ?, ?, ?)").bind(r.id, r.ticker, "bitcoin", `${r.ticker} etched · Rune ${ref} on Bitcoin`, fakeTx(), now),
    ];
  });
  await d.batch(stmts);
}

// ---------- Seed (platform token + starter Runes, no fake trades) ----------
const SEED: Array<Pick<RuneRow, "ticker" | "rune_name" | "title" | "description" | "image_url" | "chain" | "quote" | "fee_mode" | "is_platform">> = [
  { ticker: "RDOGE", rune_name: "RUBY•DOGE", title: "Ruby Doge", description: "The goodest boy of the Rune trenches, carved in ruby.", image_url: "/assets/tok-dog.webp", chain: "solana", quote: "SOL", fee_mode: "holders", is_platform: 0 },
  { ticker: "QCAT", rune_name: "QUARTZ•CAT", title: "Quartz Cat", description: "Smug, pink, unbothered. Fees go to holders.", image_url: "/assets/tok-cat.webp", chain: "base", quote: "cbBTC", fee_mode: "holders", is_platform: 0 },
  { ticker: "PIZZA", rune_name: "STONE•PIZZA", title: "Stone Pizza", description: "10,000 BTC for two pizzas. This one is carved in stone.", image_url: "/assets/tok-pizza.webp", chain: "ethereum", quote: "WBTC", fee_mode: "dev", is_platform: 0 },
  { ticker: "SATO", rune_name: "SATO•OF•STONE", title: "Sato", description: "Whoever carved this rune left no name.", image_url: "/assets/tok-satoshi.webp", chain: "robinhood", quote: "ETH", fee_mode: "routed", is_platform: 0 },
  { ticker: "KROAK", rune_name: "KING•KROAK", title: "King Kroak", description: "Jade crown, ruby heart. Ribbit on every chain.", image_url: "/assets/tok-frog.webp", chain: "robinhood", quote: "WBTC", fee_mode: "dev", is_platform: 0 },
];

let seeded = false;
export async function ensureSeed(): Promise<void> {
  if (seeded) return;
  const d = db();
  const c = await d.prepare("SELECT COUNT(*) AS n FROM runes").first<{ n: number }>();
  if ((c?.n ?? 0) === 0) {
    const now = Date.now();
    const stmts = SEED.flatMap((s, i) => {
      const id = s.is_platform ? "CARVYPLATFORMTOKEN1111111111111111111CRVY" : runeId();
      const t = now - (SEED.length - i) * 3600_000;
      return [
        d
          .prepare(
            "INSERT INTO runes (id, ticker, rune_name, title, description, image_url, creator, chain, quote, fee_mode, v_sats, v_tokens, etch_at, is_platform, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Carvy', ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(id, s.ticker, s.rune_name, s.title, s.description, s.image_url, s.chain, s.quote, s.fee_mode, V_SATS0, V_TOKENS0, t, s.is_platform, t),
        d.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, created_at) VALUES ('launch', ?, ?, ?, ?, ?)").bind(id, s.ticker, s.chain, `${s.ticker} launched on Carvy`, t),
      ];
    });
    await d.batch(stmts);
  }
  seeded = true;
  await progressEtching();
}

export async function credit(wallet: string, chain: string, asset: string, delta: number) {
  await db()
    .prepare("INSERT INTO balances (wallet, chain, asset, amount) VALUES (?, ?, ?, ?) ON CONFLICT(wallet, chain, asset) DO UPDATE SET amount = amount + excluded.amount")
    .bind(wallet, chain, asset, delta)
    .run();
}

export async function balanceOf(wallet: string, chain: string, asset: string): Promise<number> {
  const r = await db().prepare("SELECT amount FROM balances WHERE wallet = ? AND chain = ? AND asset = ?").bind(wallet, chain, asset).first<{ amount: number }>();
  return r?.amount ?? 0;
}
