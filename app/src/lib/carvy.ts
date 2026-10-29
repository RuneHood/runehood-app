// Shared (client + server) launchpad constants, chain catalog, bonding curve math and formatting.

export type ChainId = "robinhood" | "ethereum" | "base" | "solana" | "bsc";
export const STOCKS = ["TSLA", "NVDA", "AAPL", "SPY", "QQQ", "MSTR", "COIN", "GOOGL", "AMZN", "META", "MSFT", "PLTR", "AMD", "GME", "CRCL"] as const;
export type Stock = (typeof STOCKS)[number];
export const isStock = (q: string): q is Stock => (STOCKS as readonly string[]).includes(q);
/** Robinhood Stock Tokens (Robinhood Chain): name and a fallback USD price per token (price x uiMultiplier). */
export const STOCK_INFO: Record<Stock, { name: string; usd: number }> = {
  TSLA: { name: "Tesla", usd: 404.46 },
  NVDA: { name: "NVIDIA", usd: 215.72 },
  AAPL: { name: "Apple", usd: 344.25 },
  SPY: { name: "SPDR S&P 500 ETF Trust", usd: 774.97 },
  QQQ: { name: "Invesco QQQ", usd: 726.5 },
  MSTR: { name: "Strategy Inc.", usd: 145.22 },
  COIN: { name: "Coinbase", usd: 162.39 },
  GOOGL: { name: "Alphabet Class A", usd: 325.76 },
  AMZN: { name: "Amazon", usd: 254.65 },
  META: { name: "Meta Platforms", usd: 613.07 },
  MSFT: { name: "Microsoft", usd: 532.17 },
  PLTR: { name: "Palantir Technologies", usd: 196.83 },
  AMD: { name: "AMD", usd: 578.61 },
  GME: { name: "GameStop", usd: 23.34 },
  CRCL: { name: "Circle Internet Group", usd: 81.73 },
};
export type Quote = "ETH" | "WBTC" | "cbBTC" | "USDC" | "SOL" | "BNB" | "BTCB" | "USDT" | "RUNE" | Stock;

export type ChainInfo = {
  id: ChainId;
  name: string;
  short: string;
  kind: "evm" | "solana";
  color: string;
  quotes: Quote[];
  explorer: string;
  blurb: string;
};

export const CHAINS: ChainInfo[] = [
  { id: "robinhood", name: "Robinhood Chain", short: "Robinhood", kind: "evm", color: "#3DDC84", quotes: ["ETH", "WBTC", "USDC"], explorer: "https://explorer.testnet.chain.robinhood.com", blurb: "Arbitrum Orbit L2 built for tokenized assets." },
  { id: "ethereum", name: "Ethereum", short: "Ethereum", kind: "evm", color: "#8EA2FF", quotes: ["ETH", "WBTC", "USDC"], explorer: "https://sepolia.etherscan.io", blurb: "Deepest liquidity, WBTC native home." },
  { id: "base", name: "Base", short: "Base", kind: "evm", color: "#4C8DFF", quotes: ["ETH", "cbBTC", "USDC"], explorer: "https://sepolia.basescan.org", blurb: "Cheap, fast L2 with cbBTC and a huge retail crowd." },
  { id: "bsc", name: "BNB Chain", short: "BNB", kind: "evm", color: "#F3BA2F", quotes: ["BNB", "BTCB", "USDT"], explorer: "https://bscscan.com", blurb: "Huge retail volume, cheap gas, PancakeSwap crowd." },
  { id: "solana", name: "Solana", short: "Solana", kind: "solana", color: "#B58CFF", quotes: ["SOL", "WBTC", "USDC"], explorer: "https://solscan.io", blurb: "Sub-second trades, the home of memecoin speed." },
];

export const chainById = (id: string): ChainInfo => CHAINS.find((c) => c.id === id) ?? CHAINS[0];
export const isChain = (id: string): id is ChainId => CHAINS.some((c) => c.id === id);

export const QUOTE_INFO: Record<Quote, { label: string; color: string; faucet: number; quick: number[] }> = {
  ETH: { label: "ETH", color: "#8EA2FF", faucet: 2, quick: [0.01, 0.05, 0.1] },
  WBTC: { label: "WBTC", color: "#F2A541", faucet: 0.05, quick: [0.0005, 0.002, 0.005] },
  cbBTC: { label: "cbBTC", color: "#4C8DFF", faucet: 0.05, quick: [0.0005, 0.002, 0.005] },
  USDC: { label: "USDC", color: "#5AA9FF", faucet: 5000, quick: [25, 100, 500] },
  SOL: { label: "SOL", color: "#B58CFF", faucet: 20, quick: [0.1, 0.5, 1] },
  BNB: { label: "BNB", color: "#F3BA2F", faucet: 0, quick: [0.05, 0.1, 0.5] },
  BTCB: { label: "BTCB", color: "#F2A541", faucet: 0, quick: [0.0005, 0.002, 0.005] },
  USDT: { label: "USDT", color: "#26A17B", faucet: 0, quick: [25, 100, 500] },
  RUNE: { label: "$RUNE", color: "#2fd27a", faucet: 0, quick: [100_000, 500_000, 1_000_000] },
  ...(Object.fromEntries(STOCKS.map((s) => [s, { label: s, color: "#3DDC84", faucet: 0, quick: STOCK_INFO[s].usd < 60 ? [1, 5, 20] : STOCK_INFO[s].usd < 250 ? [0.25, 1, 3] : [0.1, 0.5, 1] }])) as Record<Stock, { label: string; color: string; faucet: number; quick: number[] }>),
};

// ---- Bonding curve (constant product with virtual reserves, priced in sats) ----
export const TOTAL_SUPPLY = 1_000_000_000;
export const CURVE_SUPPLY = 793_100_000; // sold on the curve before graduation
export const V_SATS0 = 4_000_000; // 0.04 BTC virtual
export const V_TOKENS0 = 1_073_000_000;
export const TRADE_FEE = 0.01; // 1%
export const SATS = 100_000_000;

export function buyQuote(vSats: number, vTokens: number, satsIn: number) {
  const fee = satsIn * TRADE_FEE;
  const net = satsIn - fee;
  const k = vSats * vTokens;
  const nvS = vSats + net;
  const nvT = k / nvS;
  return { tokens: vTokens - nvT, fee, net, vSats: nvS, vTokens: nvT };
}

export function sellQuote(vSats: number, vTokens: number, tokensIn: number) {
  const k = vSats * vTokens;
  const nvT = vTokens + tokensIn;
  const nvS = k / nvT;
  const gross = vSats - nvS;
  const fee = gross * TRADE_FEE;
  return { sats: gross - fee, fee, gross, vSats: nvS, vTokens: nvT };
}

export const priceSats = (vSats: number, vTokens: number) => vSats / vTokens; // sats per token
export const mcapSats = (vSats: number, vTokens: number) => priceSats(vSats, vTokens) * TOTAL_SUPPLY;
export const curveProgress = (sold: number) => Math.min(100, (sold / CURVE_SUPPLY) * 100);

// ---- Formatting ----
export function fmtUsd(n: number): string {
  if (!isFinite(n)) return "$0";
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `$${(n / 1e3).toFixed(1)}K`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  if (a >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(3)}`;
}

export function fmtBtc(sats: number): string {
  const b = sats / SATS;
  if (b >= 100) return `₿${b.toFixed(1)}`;
  if (b >= 1) return `₿${b.toFixed(2)}`;
  if (b >= 0.01) return `₿${b.toFixed(3)}`;
  return `₿${b.toFixed(5)}`;
}

export function fmtNum(n: number, dp = 2): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(dp)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(dp)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(dp)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: dp });
}

export function fmtAmount(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toPrecision(4).replace(/0+$/, "").replace(/\.$/, "");
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(1, Math.floor((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const shortAddr = (a?: string) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "");

export const FEE_MODES = [
  { id: "dev", label: "Dev", hint: "Creator share goes to your wallet." },
  { id: "holders", label: "Holders", hint: "Creator share and tax are paid to holders pro rata, claimable every 6 hours." },
  { id: "routed", label: "Routed", hint: "Creator share goes to a wallet you choose." },
] as const;
export type FeeMode = (typeof FEE_MODES)[number]["id"];

export const RUNE_NAME_RE = /^[A-Z](?:[A-Z]|•(?=[A-Z])){0,25}$/;
export const TICKER_RE = /^[A-Z0-9]{2,10}$/;

export type RuneRow = {
  id: string;
  ticker: string;
  rune_name: string;
  title: string;
  description: string;
  image_url: string;
  creator: string;
  chain: ChainId;
  quote: Quote;
  fee_mode: FeeMode;
  fee_route: string;
  website: string;
  x_url: string;
  tg_url: string;
  v_sats: number;
  v_tokens: number;
  real_sats: number;
  sold: number;
  bridged: number;
  volume_sats: number;
  creator_fees_sats: number;
  platform_fees_sats: number;
  graduated: number;
  rune_ref: string;
  etch_at: number;
  is_platform: number;
  dex?: string;
  created_at: number;
  onchain?: number;
  quote_address?: string;
  quote_decimals?: number;
  v_quote?: number;
  create_tx?: string;
  launchpad?: string;
  buy_tax?: number;
  sell_tax?: number;
  migrated?: number;
};

export type Prices = { BTC: number; ETH: number; SOL: number; BNB?: number; RUNE?: number; stocks?: Partial<Record<Stock, number>>; updated: number };

export const usdPerQuote = (q: Quote, p: Prices) => q === "RUNE" ? (p.RUNE ?? 0.00007) : isStock(q) ? (p.stocks?.[q] ?? STOCK_INFO[q].usd) : (q === "ETH" ? p.ETH : q === "SOL" ? p.SOL : q === "BNB" ? (p.BNB ?? 650) : q === "USDC" || q === "USDT" ? 1 : p.BTC);
export const quoteToSats = (q: Quote, amount: number, p: Prices) => (amount * usdPerQuote(q, p) * SATS) / p.BTC;
export const satsToQuote = (q: Quote, sats: number, p: Prices) => (sats * p.BTC) / SATS / usdPerQuote(q, p);
export const satsToUsd = (sats: number, p: Prices) => (sats / SATS) * p.BTC;
