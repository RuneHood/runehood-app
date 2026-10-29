// Browser-side flows for the live on-chain launchpad: create a Rune, buy, sell.
import { decodeFunctionResult, encodeFunctionData, parseAbi, type Hex } from "viem";

import type { ChainId, FeeMode, Quote } from "./carvy";
import { saveRuneMeta, syncNow } from "./api/carvy.functions";
import { BRIDGE_ABI, HOLDER_REWARDS_ABI, LAUNCHPAD_ABI, bridgeFor, decodeLaunchpadLog, ensureAllowance, liveDeployment, sendTx, toUnits, viewCall, type Deployment, type PoolKeyCfg } from "./onchain";

const SLIPPAGE_BPS = 500n; // 5%
const FEE_MODE: Record<FeeMode, number> = { dev: 0, holders: 1, routed: 2 };
const ZERO = "0x0000000000000000000000000000000000000000";

function need(chain: string): Deployment {
  const d = liveDeployment(chain);
  if (!d) throw new Error("This chain is not live yet.");
  return d;
}

function quoteOf(d: Deployment, q: Quote) {
  const c = d.quotes[q] ?? d.stockQuotes?.[q];
  if (!c) throw new Error(`${q} is not a pair on ${d.name}.`);
  return c;
}

export async function createRuneOnchain(p: {
  from: string;
  chain: ChainId;
  title: string;
  ticker: string;
  runeName: string;
  description: string;
  imageUrl: string;
  website: string;
  x: string;
  tg: string;
  quote: Quote;
  feeMode: FeeMode;
  routedTo: string;
  initialBuy: string;
  buyTaxBps: number;
  sellTaxBps: number;
}): Promise<string> {
  const d = need(p.chain);
  const q = quoteOf(d, p.quote);
  if (p.feeMode === "routed" && !/^0x[0-9a-fA-F]{40}$/.test(p.routedTo)) throw new Error(`Routed fees on ${d.name} need an EVM address (0x…).`);
  const meta = await saveRuneMeta({ data: { title: p.title, description: p.description, imageUrl: p.imageUrl, website: p.website, x: p.x, tg: p.tg } });
  const buy = p.initialBuy ? toUnits(p.initialBuy, q.decimals) : 0n;
  const isNative = q.address === ZERO;
  if (buy > 0n && !isNative) await ensureAllowance(d, p.from, q.address, d.launchpad, buy);
  const data = encodeFunctionData({
    abi: LAUNCHPAD_ABI,
    functionName: "createRune",
    args: [
      {
        name: p.title,
        symbol: p.ticker,
        runeName: p.runeName.replace(/•/g, "."),
        metadataURI: meta.uri,
        quote: q.address as Hex,
        feeMode: FEE_MODE[p.feeMode],
        routedTo: (p.feeMode === "routed" ? p.routedTo : ZERO) as Hex,
        buyTaxBps: Math.max(0, Math.min(500, Math.round(p.buyTaxBps))),
        sellTaxBps: Math.max(0, Math.min(500, Math.round(p.sellTaxBps))),
        initialBuy: buy,
        minTokensOut: 0n,
      },
    ],
  });
  const sent = await sendTx(d, p.from, d.launchpad, data, isNative ? buy : 0n);
  const logs = sent.logs;
  let token = "";
  for (const l of logs) {
    if (l.address.toLowerCase() !== d.launchpad.toLowerCase()) continue;
    const ev = decodeLaunchpadLog(l);
    if (ev?.eventName === "RuneCreated") token = String((ev.args as { token: string }).token).toLowerCase();
  }
  await syncNow({ data: { chain: p.chain, tx: sent.hash } }).catch(() => {});
  if (!token) throw new Error("Launched, but the Rune address was not found in the receipt. Refresh the Runes page.");
  return token;
}

export async function migrateOnchain(p: { from: string; chain: ChainId; token: string; launchpad?: string }) {
  const d = need(p.chain);
  const r = await sendTx(d, p.from, p.launchpad || d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "migrate", args: [p.token as Hex] }));
  await syncNow({ data: { chain: p.chain, tx: r.hash } }).catch(() => {});
  return r.hash;
}

export async function tradeOnchain(p: { from: string; chain: ChainId; token: string; side: "buy" | "sell"; quote: Quote; amount: string; launchpad?: string }) {
  const base = need(p.chain);
  const d = { ...base, launchpad: p.launchpad || base.launchpad };
  const q = quoteOf(d, p.quote);
  if (p.side === "buy") {
    const amountIn = toUnits(p.amount, q.decimals);
    const expected = BigInt(await viewCall(d, d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "quoteBuy", args: [p.token as Hex, amountIn] })));
    const min = (expected * (10_000n - SLIPPAGE_BPS)) / 10_000n;
    const isNative = q.address === ZERO;
    if (!isNative) await ensureAllowance(d, p.from, q.address, d.launchpad, amountIn);
    const r = await sendTx(d, p.from, d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "buy", args: [p.token as Hex, amountIn, min] }), isNative ? amountIn : 0n);
    await syncNow({ data: { chain: p.chain, tx: r.hash } }).catch(() => {});
    return { hash: r.hash, expected: Number(expected) / 1e18 };
  }
  const tokens = toUnits(p.amount, 18);
  const expected = BigInt(await viewCall(d, d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "quoteSell", args: [p.token as Hex, tokens] })));
  const min = (expected * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  await ensureAllowance(d, p.from, p.token, d.launchpad, tokens);
  const r = await sendTx(d, p.from, d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "sell", args: [p.token as Hex, tokens, min] }));
  await syncNow({ data: { chain: p.chain, tx: r.hash } }).catch(() => {});
  return { hash: r.hash, expected: Number(expected) / 10 ** q.decimals };
}

export async function bridgeOutOnchain(p: { from: string; chain: ChainId; token: string; launchpad?: string; amount: string; btcAddress: string }) {
  const d = need(p.chain);
  const bridge = bridgeFor(d, p.launchpad);
  const r = await sendTx(d, p.from, bridge, encodeFunctionData({ abi: BRIDGE_ABI, functionName: "bridgeOut", args: [p.token as Hex, toUnits(p.amount, 18), p.btcAddress] }));
  await syncNow({ data: { chain: p.chain, tx: r.hash } }).catch(() => {});
  return r.hash;
}

/** Claim Holders-mode rewards from CarvyHolderRewards on one chain. */
export async function claimHolderRewardOnchain(p: { from: string; chain: ChainId; vault: string; asset: string; cumulative: string; proof: string[] }) {
  const d = need(p.chain);
  const r = await sendTx(d, p.from, p.vault, encodeFunctionData({ abi: HOLDER_REWARDS_ABI, functionName: "claim", args: [p.from as Hex, p.asset as Hex, BigInt(p.cumulative), p.proof as Hex[]] }));
  return r.hash;
}

// ---------------- Pay with ETH for stock-paired Runes (RunehoodZap) ----------------
const ZAP_ABI = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function buyWithEth(address token, PoolKey[] path, uint256 minQuoteOut, uint256 minTokensOut) payable returns (uint256)",
  "function sellForEth(address token, uint256 tokenAmount, address quote, PoolKey[] path, uint256 minEthOut) returns (uint256)",
]);
const QUOTER_ABI = parseAbi([
  "struct PathKey { address intermediateCurrency; uint24 fee; int24 tickSpacing; address hooks; bytes hookData; }",
  "struct QuoteExactParams { address exactCurrency; PathKey[] path; uint128 exactAmount; }",
  "function quoteExactInput(QuoteExactParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

/** True when this Rune's quote can be paid with native ETH through the zap. */
export function canPayWithEth(chain: string, quote: Quote): boolean {
  const d = liveDeployment(chain);
  return !!(d?.zap && d.stockQuotes?.[quote]?.ethPath?.length);
}

const toKeys = (path: PoolKeyCfg[]) =>
  path.map((k) => ({ currency0: k.currency0 as Hex, currency1: k.currency1 as Hex, fee: k.fee, tickSpacing: k.tickSpacing, hooks: k.hooks as Hex }));

function quoterPath(start: string, path: PoolKeyCfg[]) {
  let cur = start.toLowerCase();
  return path.map((k) => {
    const next = k.currency0.toLowerCase() === cur ? k.currency1 : k.currency0;
    cur = next.toLowerCase();
    return { intermediateCurrency: next as Hex, fee: k.fee, tickSpacing: k.tickSpacing, hooks: k.hooks as Hex, hookData: "0x" as Hex };
  });
}

async function quoteRoute(d: Deployment, start: string, path: PoolKeyCfg[], amount: bigint): Promise<bigint> {
  const data = encodeFunctionData({ abi: QUOTER_ABI, functionName: "quoteExactInput", args: [{ exactCurrency: start as Hex, path: quoterPath(start, path), exactAmount: amount }] });
  const raw = await viewCall(d, d.v4Quoter!, data);
  const [out] = decodeFunctionResult({ abi: QUOTER_ABI, functionName: "quoteExactInput", data: raw }) as readonly [bigint, bigint];
  return out;
}

/** Estimate for the trade box: ETH in -> tokens out (buy), tokens in -> ETH out (sell). */
export async function zapEstimate(p: { chain: ChainId; token: string; quote: Quote; side: "buy" | "sell"; amount: string; launchpad?: string }): Promise<number> {
  const base = need(p.chain);
  const d = { ...base, launchpad: p.launchpad || base.launchpad };
  const sq = d.stockQuotes?.[p.quote];
  if (!sq?.ethPath) throw new Error("No ETH route.");
  if (p.side === "buy") {
    const q = await quoteRoute(d, ZERO, sq.ethPath, toUnits(p.amount, 18));
    const t = BigInt(await viewCall(d, d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "quoteBuy", args: [p.token as Hex, q] })));
    return Number(t) / 1e18;
  }
  const q = BigInt(await viewCall(d, d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "quoteSell", args: [p.token as Hex, toUnits(p.amount, 18)] })));
  const e = await quoteRoute(d, sq.address, [...sq.ethPath].reverse(), q);
  return Number(e) / 1e18;
}

export async function zapTradeOnchain(p: { from: string; chain: ChainId; token: string; side: "buy" | "sell"; quote: Quote; amount: string; launchpad?: string }) {
  const base = need(p.chain);
  const d = { ...base, launchpad: p.launchpad || base.launchpad };
  const sq = d.stockQuotes?.[p.quote];
  if (!d.zap || !sq?.ethPath) throw new Error(`Paying with ETH is not available for ${p.quote}.`);
  const path = toKeys(sq.ethPath);
  if (p.side === "buy") {
    const ethIn = toUnits(p.amount, 18);
    const q = await quoteRoute(d, ZERO, sq.ethPath, ethIn);
    const minQ = (q * (10_000n - 300n)) / 10_000n;
    const t = BigInt(await viewCall(d, d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "quoteBuy", args: [p.token as Hex, minQ] })));
    const minT = (t * (10_000n - 200n)) / 10_000n;
    const r = await sendTx(d, p.from, d.zap, encodeFunctionData({ abi: ZAP_ABI, functionName: "buyWithEth", args: [p.token as Hex, path, minQ, minT] }), ethIn);
    await syncNow({ data: { chain: p.chain, tx: r.hash } }).catch(() => {});
    return { hash: r.hash, expected: Number(t) / 1e18 };
  }
  const tokens = toUnits(p.amount, 18);
  const q = BigInt(await viewCall(d, d.launchpad, encodeFunctionData({ abi: LAUNCHPAD_ABI, functionName: "quoteSell", args: [p.token as Hex, tokens] })));
  const sellPath = [...sq.ethPath].reverse();
  const e = await quoteRoute(d, sq.address, sellPath, q);
  const minE = (e * (10_000n - 300n)) / 10_000n;
  await ensureAllowance(d, p.from, p.token, d.zap, tokens);
  const r = await sendTx(d, p.from, d.zap, encodeFunctionData({ abi: ZAP_ABI, functionName: "sellForEth", args: [p.token as Hex, tokens, sq.address as Hex, toKeys(sellPath), minE] }));
  await syncNow({ data: { chain: p.chain, tx: r.hash } }).catch(() => {});
  return { hash: r.hash, expected: Number(e) / 1e18 };
}
