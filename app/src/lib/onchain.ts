// On-chain launchpad: deployments, ABI and browser wallet transactions (EVM chains).
// A chain switches from the testnet ledger to real on-chain trading as soon as its launchpad address is set here.
import { decodeEventLog, encodeFunctionData, parseAbi, type Hex } from "viem";

import type { ChainId, Quote } from "./carvy";

export type Deployment = {
  chainId: number;
  hex: string;
  name: string;
  rpc: string;
  rpcs: string[]; // server-side fallbacks, tried in order
  explorer: string;
  launchpad: string; // current launchpad (V2). "" = not deployed yet (testnet ledger mode)
  bridge: string;
  startBlock: number;
  legacy: { launchpad: string; bridge: string; startBlock: number }[]; // older launchpads still indexed
  quotes: Partial<Record<Quote, { address: string; decimals: number }>>;
  /** Robinhood Stock Tokens enabled as pairs (configureQuote on the launchpad); v0 = virtual quote reserve (wei). */
  stockQuotes?: Partial<Record<Quote, { address: string; decimals: number; v0: string; ethPath?: PoolKeyCfg[] }>>;
  /** RunehoodZap: buy/sell stock-paired Runes with native ETH in one tx (Uniswap V4 route + curve). */
  zap?: string;
  v4Quoter?: string;
  native?: string; // native gas token symbol (default ETH)
  dex?: "pancake"; // graduation DEX of the current launchpad (default Uniswap V4)
};

export const DEPLOYMENTS: Partial<Record<ChainId, Deployment>> = {
  ethereum: {
    chainId: 1,
    hex: "0x1",
    name: "Ethereum",
    rpc: "https://ethereum-rpc.publicnode.com",
    rpcs: ["https://eth.drpc.org", "https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"],
    explorer: "https://etherscan.io",
    launchpad: "0x0280C707Ce65FF953306bDAD2c5fF4143Aa4693A",
    bridge: "0xbe4f9601A64d697441dD79A3310B7A16565a4A86",
    startBlock: 26283695,
    legacy: [{ launchpad: "0x1e1fcc56c6Bb41598a00c54f8E8B2a041907cb52", bridge: "0xeCE02c103D4FaeC8EceBD05C09267de21b7D7296", startBlock: 26283498 }],
    quotes: {
      ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18 },
      WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
      USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    },
  },
  base: {
    chainId: 8453,
    hex: "0x2105",
    name: "Base",
    rpc: "https://mainnet.base.org",
    rpcs: ["https://base.drpc.org", "https://mainnet.base.org", "https://base-rpc.publicnode.com"],
    explorer: "https://basescan.org",
    launchpad: "0xEd2c5Cc80566c06E59C736e9E726467f6Ac7F319",
    bridge: "0x71F79032e0605B5C9b99D5C92dBEE5eDf200f171",
    startBlock: 53155254,
    legacy: [{ launchpad: "0x8d0CdBcb1Fd782b9daa2Cbd29149b6ae29b1D7D8", bridge: "0xBC6958c616aC2415e22F929caaa355F779E7218E", startBlock: 53154302 }],
    quotes: {
      ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18 },
      cbBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
      USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    },
  },
  robinhood: {
    chainId: 4663,
    hex: "0x1237",
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    rpcs: ["https://robinhood.drpc.org", "https://rpc.mainnet.chain.robinhood.com"],
    explorer: "https://robinhoodchain.blockscout.com",
    launchpad: "0x0A1Ff578b7D1Fa9844E26DE415dF7319447bc4Ce",
    bridge: "0x48C106bd1CB291e952937053e590D0B318F3Ad85",
    startBlock: 99202367,
    legacy: [{ launchpad: "0x8d0CdBcb1Fd782b9daa2Cbd29149b6ae29b1D7D8", bridge: "0xBC6958c616aC2415e22F929caaa355F779E7218E", startBlock: 99187798 }],
    quotes: { ETH: { address: "0x0000000000000000000000000000000000000000", decimals: 18 } },
    zap: "0xdF14e44557a6DBF4f7856a952872B30aB7541FfD",
    v4Quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
    stockQuotes: {
      TSLA: { address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", decimals: 18, v0: "5831441922563418112", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 3000, tickSpacing: 60, hooks: "0x0000000000000000000000000000000000000000" }] },
      NVDA: { address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", decimals: 18, v0: "10941817806448908288", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }] },
      AAPL: { address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", decimals: 18, v0: "6855262628488729600", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", fee: 3000, tickSpacing: 60, hooks: "0x0000000000000000000000000000000000000000" }] },
      SPY: { address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", decimals: 18, v0: "3048697959582146560", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 100, tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000" }] },
      QQQ: { address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", decimals: 18, v0: "3248791533604700160", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", fee: 10000, tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" }] },
      MSTR: { address: "0xec262a75e413fAfD0dF80480274532C79D42da09", decimals: 18, v0: "16241461231235366912" },
      COIN: { address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", decimals: 18, v0: "14524200997598375936", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", fee: 10000, tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" }] },
      GOOGL: { address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", decimals: 18, v0: "7241739709078064128", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", fee: 10000, tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" }] },
      AMZN: { address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", decimals: 18, v0: "9262065580208128000", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 3000, tickSpacing: 60, hooks: "0x0000000000000000000000000000000000000000" }] },
      META: { address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", decimals: 18, v0: "3849264150297819648", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", fee: 3000, tickSpacing: 60, hooks: "0x0000000000000000000000000000000000000000" }] },
      MSFT: { address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", decimals: 18, v0: "4433850672881207296", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", fee: 3000, tickSpacing: 60, hooks: "0x0000000000000000000000000000000000000000" }] },
      PLTR: { address: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", decimals: 18, v0: "11982853223593963520", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", fee: 10000, tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" }] },
      AMD: { address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", decimals: 18, v0: "4076294913672421888", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", fee: 500, tickSpacing: 10, hooks: "0x0000000000000000000000000000000000000000" }, { currency0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", currency1: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", fee: 10000, tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" }] },
      GME: { address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", decimals: 18, v0: "101074994643239763968", ethPath: [{ currency0: "0x0000000000000000000000000000000000000000", currency1: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", fee: 10000, tickSpacing: 200, hooks: "0x0000000000000000000000000000000000000000" }] },
      CRCL: { address: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", decimals: 18, v0: "28856487428886032384" },
    },
  },
  bsc: {
    chainId: 56,
    hex: "0x38",
    name: "BNB Chain",
    rpc: "https://bsc-dataseed.bnbchain.org",
    rpcs: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed1.defibit.io"],
    explorer: "https://bscscan.com",
    launchpad: "0x708beaaBb273cDfD6091c31a046cb369951D539C", // graduates into PancakeSwap
    bridge: "0x4b3E10B81848865BE32b280FAE29712Ac66Cd5B0",
    startBlock: 130137472,
    legacy: [{ launchpad: "0xeA1C8824A665df1BE4d43633A1e2A11b88a07Cb4", bridge: "0x9e6f719d3183b9B4AD5EE21Ed8e18A049af88A98", startBlock: 130120951 }],
    native: "BNB",
    dex: "pancake",
    quotes: {
      BNB: { address: "0x0000000000000000000000000000000000000000", decimals: 18 },
      BTCB: { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
      USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    },
  },
};

export const allLaunchpads = (d: Deployment) => [d.launchpad, ...d.legacy.map((l) => l.launchpad)].filter(Boolean);
export const firstBlock = (d: Deployment) => Math.min(d.startBlock, ...d.legacy.map((l) => l.startBlock));

export const liveDeployment = (chain: string): Deployment | null => {
  const d = DEPLOYMENTS[chain as ChainId];
  return d && d.launchpad ? d : null;
};

export type PoolKeyCfg = { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string };

export const quoteByAddress = (d: Deployment, addr: string): { symbol: Quote; decimals: number; v0?: string } | null => {
  for (const [symbol, q] of [...Object.entries(d.quotes), ...Object.entries(d.stockQuotes ?? {})]) if (q && q.address.toLowerCase() === addr.toLowerCase()) return { symbol: symbol as Quote, decimals: q.decimals, v0: (q as { v0?: string }).v0 };
  return null;
};

/** Quote config for a symbol, including Robinhood Stock Tokens. */
export const quoteConfig = (d: Deployment, q: Quote) => d.quotes[q] ?? d.stockQuotes?.[q];

export const LAUNCHPAD_ABI = parseAbi([
  "struct CreateParams { string name; string symbol; string runeName; string metadataURI; address quote; uint8 feeMode; address routedTo; uint16 buyTaxBps; uint16 sellTaxBps; uint256 initialBuy; uint256 minTokensOut; }",
  "function createRune(CreateParams p) payable returns (address)",
  "function migrate(address token)",
  "function buy(address token,uint256 amountIn,uint256 minTokensOut) payable returns (uint256)",
  "function sell(address token,uint256 tokenAmount,uint256 minQuoteOut) returns (uint256)",
  "function quoteBuy(address token,uint256 amountIn) view returns (uint256)",
  "function quoteSell(address token,uint256 tokenAmount) view returns (uint256)",
  "function claim(address quote)",
  "function claimable(address,address) view returns (uint256)",
  "event RuneCreated(address indexed token,address indexed creator,string name,string symbol,string runeName,address quote,uint8 feeMode,address feeRecipient,string metadataURI)",
  "event Trade(address indexed token,address indexed trader,bool isBuy,uint256 quoteAmount,uint256 tokenAmount,uint256 fee,uint256 vQuote,uint256 vToken,uint256 sold)",
  "event Graduated(address indexed token,uint256 realQuote)",
  "event RuneCreated(address indexed token,address indexed creator,string name,string symbol,string runeName,address quote,uint8 feeMode,address feeRecipient,string metadataURI,uint16 buyTaxBps,uint16 sellTaxBps)",
  "event Migrated(address indexed token,uint256 quoteAmount,uint256 tokenAmount,uint256 lpTokenId,bytes32 poolId)",
]);

export const BRIDGE_ABI = parseAbi([
  "function bridgeOut(address token,uint256 amount,string btcAddress)",
  "event BridgeOut(address indexed token,address indexed from,uint256 amount,string btcAddress,uint256 indexed nonce)",
]);
/** Bridge contract that belongs to the launchpad a Rune was created on. */
export const bridgeFor = (d: Deployment, launchpad?: string) => {
  const lp = (launchpad || d.launchpad).toLowerCase();
  if (lp === d.launchpad.toLowerCase()) return d.bridge;
  return d.legacy.find((l) => l.launchpad.toLowerCase() === lp)?.bridge ?? d.bridge;
};
export const allBridges = (d: Deployment) => [d.bridge, ...d.legacy.map((l) => l.bridge)].filter(Boolean);
export const ERC20_ABI = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

export function decodeLaunchpadLog(log: { topics: Hex[]; data: Hex }) {
  try {
    return decodeEventLog({ abi: LAUNCHPAD_ABI, topics: log.topics as [Hex, ...Hex[]], data: log.data });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- JSON-RPC (works in browser and Worker)
export async function rpcCall<T = any>(d: Deployment, method: string, params: unknown[]): Promise<T> {
  const urls = typeof window === "undefined" ? d.rpcs : [d.rpc, ...d.rpcs.filter((u) => u !== d.rpc)];
  let last: unknown = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      if (!r.ok) throw new Error(`RPC ${r.status}`);
      const j = (await r.json()) as { result?: T; error?: { message: string } };
      if (j.error) throw new Error(j.error.message);
      return j.result as T;
    } catch (e) {
      last = last instanceof Error ? new Error(`${(last as Error).message} | ${new URL(url).host}: ${(e as Error).message}`) : new Error(`${new URL(url).host}: ${(e as Error).message}`);
    }
  }
  throw last instanceof Error ? last : new Error("All RPC endpoints failed.");
}

export const toUnits = (v: string | number, dec: number): bigint => {
  const [i, f = ""] = String(v).trim().split(".");
  return BigInt(i || "0") * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0");
};
export const fromUnits = (v: bigint, dec: number): number => Number(v) / 10 ** dec;

// ---------------------------------------------------------------- browser wallet
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<any> };
const eth = (): Eip1193 => {
  const p = typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193 }).ethereum : undefined;
  if (!p) throw new Error("No EVM wallet found. Install MetaMask, Rabby or Coinbase Wallet.");
  return p;
};

export async function ensureChain(d: Deployment) {
  const p = eth();
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: d.hex }] });
  } catch (e) {
    if ((e as { code?: number }).code === 4902) {
      await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: d.hex, chainName: d.name, nativeCurrency: { name: d.native ?? "Ether", symbol: d.native ?? "ETH", decimals: 18 }, rpcUrls: [d.rpc], blockExplorerUrls: [d.explorer] }] });
    } else throw e;
  }
}

export type TxLog = { address: string; topics: Hex[]; data: Hex };
export async function sendTx(d: Deployment, from: string, to: string, data: Hex, value = 0n): Promise<{ hash: Hex; logs: TxLog[] }> {
  await ensureChain(d);
  const hash: Hex = await eth().request({ method: "eth_sendTransaction", params: [{ from, to, data, ...(value ? { value: `0x${value.toString(16)}` } : {}) }] });
  for (let i = 0; i < 120; i++) {
    const rc = await rpcCall<{ status: string; logs: TxLog[] } | null>(d, "eth_getTransactionReceipt", [hash]).catch(() => null);
    if (rc) {
      if (rc.status !== "0x1") throw new Error("Transaction failed on chain.");
      return { hash, logs: rc.logs };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Still waiting for the network. Check the transaction in the explorer.");
}

export async function viewCall(d: Deployment, to: string, data: Hex): Promise<Hex> {
  return rpcCall<Hex>(d, "eth_call", [{ to, data }, "latest"]);
}

export async function ensureAllowance(d: Deployment, from: string, token: string, spender: string, amount: bigint) {
  const cur = BigInt(await viewCall(d, token, encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [from as Hex, spender as Hex] })));
  if (cur >= amount) return;
  await sendTx(d, from, token, encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [spender as Hex, amount] }));
}

export async function tokenBalance(d: Deployment, token: string, owner: string): Promise<bigint> {
  if (/^0x0{40}$/i.test(token)) return BigInt(await rpcCall<Hex>(d, "eth_getBalance", [owner, "latest"]));
  return BigInt(await viewCall(d, token, encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [owner as Hex] })));
}

/** DEX a graduated Rune trades on, with a ready swap link. */
export function dexFor(chain: ChainId, launchpad: string | null | undefined, token: string, quoteAddress?: string | null): { name: string; pool: string; url: string } {
  const d = DEPLOYMENTS[chain];
  const native = !quoteAddress || /^0x0{40}$/i.test(quoteAddress);
  if (d?.dex === "pancake" && (!launchpad || launchpad.toLowerCase() === d.launchpad.toLowerCase())) {
    return { name: "PancakeSwap", pool: "PancakeSwap pool", url: `https://pancakeswap.finance/swap?chain=bsc&inputCurrency=${native ? "BNB" : quoteAddress}&outputCurrency=${token}` };
  }
  const net = chain === "ethereum" ? "mainnet" : chain === "bsc" ? "bnb" : chain;
  return { name: "Uniswap", pool: "Uniswap V4 pool", url: `https://app.uniswap.org/swap?chain=${net}&inputCurrency=${native ? "NATIVE" : quoteAddress}&outputCurrency=${token}` };
}

/** CarvyHolderRewards vault per chain (holders of Holders-mode Runes claim here). */
export const HOLDER_REWARDS: Partial<Record<ChainId, string>> = {
  ethereum: "0x3D6a340d9f63e30C379f868Df836859B4DF5E2e7",
  base: "0x1265635fC2a2b086C263167f4AbA2C4E1ca40f77",
  robinhood: "0xb1b47F59EE240e45f980098d56Db30FeFce21EF2",
  bsc: "0x54bB6C4485215dcD6c0c280980Cd7c988e0EB3A8",
};
export const HOLDER_REWARDS_ABI = parseAbi(["function claim(address holder, address asset, uint256 cumulative, bytes32[] proof)"]);
