// Solana launchpad constants (Meteora Dynamic Bonding Curve, mainnet). Shared by browser and server.
export const SOL_LIVE = true;
export const SOL_DECIMALS = 6;
export const SOL_TO_RUNE = 10n ** 12n; // 1 token unit (6 decimals) -> Rune units (18 decimals)
export const SOL_RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"]; // mainnet-beta blocks Cloudflare IPs; publicnode works from the Worker and the browser
export const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
export const WSOL = "So11111111111111111111111111111111111111112";
/** Creator tax tier (bps) -> Carvy DBC config key for NEW launches. Curve and graduated pool fee = 1% + tax.
 *  Platform fees of these configs are claimable by the Carvy fee wallet (SOL_FEE_WALLET). */
export const SOL_CONFIGS: Record<number, string> = {
  0: "2cqNt6SjrWE9h3xUfJXk7QemgtnH6Wefq43qRmKriMyQ",
  100: "ET8dqVddVh3uD3YLoJ6PzJb8KtYfiK6aHAYZ8GcDEPFC",
  300: "GCfQPVFLF6DFAGvmezAf2EmSrDt3b24zbG6zigwr5EFs",
  500: "9YPwMcWRD7mnJkMvjZZA1QoDn2Xp9BAXh6SmDeYT5pcA",
};
/** First-generation configs (still indexed; their pools keep trading). */
export const SOL_LEGACY_CONFIGS: Record<number, string> = {
  0: "F7LRRPoweZrwFAguZjw8o4qrW5oiRW9dDErGNDCazxJz",
  100: "9BZYToGQk63WGnGcAJXp2dAmu65qQFDc1mFnuKhiefz6",
  300: "4RdLqvN7XqRj2jEjwCyrXfPgLwYMmhrv1jnZYJLe7eLy",
  500: "6M3jsdJCn5uFNGfyMU7KsY2g5YSQi5Cnu68KSiuMhqxd",
};
/** Wallet that receives Carvy's Solana platform fees. */
export const SOL_FEE_WALLET = "7stJ1t27TQFPFEyE2ZsLt4ZsAhmGsV1MXhWQ3qUTrobY";
export const SOL_TAX_BY_CONFIG: Record<string, number> = Object.fromEntries(
  [...Object.entries(SOL_CONFIGS), ...Object.entries(SOL_LEGACY_CONFIGS)].map(([t, c]) => [c, Number(t)]),
);
/** Bridge vault owner: tokens sent here (with a Bitcoin address memo) are released as the native Rune on Bitcoin. */
export const SOL_VAULT = "GwrMx8mpgXziw7eUFQF24gRGUGSpjKgVeMSG1W8QwkCK";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const isSolAddress = (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);

// ---------------------------------------------------------------- Raydium LaunchLab (new Solana launches)
/** Which launcher new Solana Runes use. Existing Meteora pools keep trading and are still indexed. */
export const SOL_LAUNCHER: "raydium" | "meteora" = "raydium";
export const LAUNCHLAB_PROGRAM = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj";
/** LaunchLab SOL curve config (constant product, index 0): graduates at ~85 SOL into a Raydium CPMM pool. */
export const LAUNCHLAB_SOL_CONFIG = "6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX";
/** Creator fee in the graduated Raydium pool (bps) -> Carvy platform on LaunchLab.
 *  On the curve every tier pays 0.5% to the creator and 0.5% to Carvy (+0.25% Raydium). */
export const RAYDIUM_PLATFORMS: Record<number, string> = {
  75: "B64AG2m6e4WGWzpwHXJZEJwXtT8xb8ikbpSchK2FdYqD",
  100: "Ekit1bEEN3o4J4pip3yc8YhWQBZBNsnBPcdVSfhksj3S",
  125: "BwdGjVyiFPfPi5xUQLBgMTksGttgqnm8XMaMaUYQMFsh",
  150: "EMGndT1MrYsY8bVpxUoGBLxUeoUAyhmTGTT8iZjX7Jo",
};
export const RAYDIUM_TIER_BY_PLATFORM: Record<string, number> = Object.fromEntries(Object.entries(RAYDIUM_PLATFORMS).map(([t, p]) => [p, Number(t)]));
