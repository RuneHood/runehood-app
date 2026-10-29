import { createServerFn } from "@tanstack/react-start";
import { encodeFunctionData, keccak256, encodePacked, parseAbi, type Hex } from "viem";

import { db, getPrices } from "../carvy.server";
import { DEPLOYMENTS, rpcCall } from "../onchain";
import { RUNE_TOKEN, type RuneTokenStats } from "../rune-token";

const ERC20 = parseAbi(["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);
const PM_ABI = parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]);
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

async function call(to: string, data: Hex): Promise<bigint> {
  const d = DEPLOYMENTS.robinhood!;
  const r = await rpcCall<Hex>(d, "eth_call", [{ to, data }, "latest"]);
  return BigInt(r);
}

/** Live $RUNE stats: price from the Uniswap V4 pool, burned = balance of the burn addresses. Cached 60 s. */
export const getRuneToken = createServerFn({ method: "GET" }).handler(async (): Promise<RuneTokenStats | null> => {
  const D = db();
  const row = await D.prepare("SELECT v, updated_at FROM cache WHERE k = 'rune_token'").first<{ v: string; updated_at: number }>();
  if (row && Date.now() - row.updated_at < 60_000) return JSON.parse(row.v) as RuneTokenStats;
  try {
    const slot = keccak256(encodePacked(["bytes32", "uint256"], [RUNE_TOKEN.poolId as Hex, 6n]));
    const [total, ...burns] = await Promise.all([
      call(RUNE_TOKEN.address, encodeFunctionData({ abi: ERC20, functionName: "totalSupply" })),
      ...RUNE_TOKEN.burnAddresses.map((a) => call(RUNE_TOKEN.address, encodeFunctionData({ abi: ERC20, functionName: "balanceOf", args: [a as Hex] }))),
    ]);
    const s0 = await call(POOL_MANAGER, encodeFunctionData({ abi: PM_ABI, functionName: "extsload", args: [slot] }));
    const sqrtP = Number(s0 & ((1n << 160n) - 1n)) / 2 ** 96;
    const runePerEth = sqrtP * sqrtP; // currency0 = native ETH, currency1 = RUNE (both 18 decimals)
    const priceEth = runePerEth > 0 ? 1 / runePerEth : 0;
    const prices = await getPrices();
    const totalN = Number(total) / 1e18;
    const burned = burns.reduce((a, b) => a + Number(b) / 1e18, 0);
    const priceUsd = priceEth * prices.ETH;
    const stats: RuneTokenStats = { priceUsd, priceEth, burned, circulating: totalN - burned, mcapUsd: priceUsd * (totalN - burned), fdvUsd: priceUsd * totalN, updated: Date.now() };
    await D.prepare("INSERT INTO cache (k, v, updated_at) VALUES ('rune_token', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(JSON.stringify(stats), Date.now()).run();
    return stats;
  } catch (e) {
    console.error("rune_token", e);
    return row ? (JSON.parse(row.v) as RuneTokenStats) : null;
  }
});
