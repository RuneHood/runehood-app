// $RUNE: the Runehood platform token. Single chain: Robinhood Chain, launched on pons (Uniswap V4 pool vs ETH, liquidity locked).
export const RUNE_TOKEN = {
  address: "0x437d083c57bb31573aa383f9602ec5a86519b9d4",
  symbol: "RUNE",
  name: "RuneHood",
  chain: "robinhood" as const,
  supply: 1_000_000_000,
  decimals: 18,
  /** Uniswap V4 pool id (ETH / RUNE, pons hook) */
  poolId: "0x46dbc81a252f907c35329cec90784512756fc66207f9f9fe4c78fe64c28e826d",
  buyUrl: "https://ponsfamily.com/launchpad/0x437d083c57bb31573aa383f9602ec5a86519b9d4",
  explorerUrl: "https://robinhoodchain.blockscout.com/token/0x437d083c57bb31573aa383f9602ec5a86519b9d4",
  burnAddresses: ["0x000000000000000000000000000000000000dEaD", "0x0000000000000000000000000000000000000000"],
};

export type RuneTokenStats = { priceUsd: number; priceEth: number; burned: number; circulating: number; mcapUsd: number; fdvUsd: number; updated: number };

export const shortCa = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
