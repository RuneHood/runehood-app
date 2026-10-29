// Browser wallet session: EVM (MetaMask, Rabby, Coinbase) or Solana (Phantom, Solflare, Backpack).
// One free signature creates a 30-day session; the token lives in localStorage.
import { useCallback, useState, useSyncExternalStore } from "react";

import { b58encode } from "./base58";
import { getNonce, signIn as serverSignIn, signOut as serverSignOut } from "./api/carvy.functions";

export type Session = { token: string; address: string; kind: "evm" | "solana" };

const KEY = "carvy.session";
const EVT = "carvy-session";

function read(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Session | null;
    return s && typeof s.token === "string" && typeof s.address === "string" ? s : null;
  } catch {
    return null;
  }
}

let cache: Session | null | undefined;
const snapshot = () => {
  if (cache === undefined) cache = read();
  return cache;
};

export function setSession(s: Session | null) {
  if (typeof window === "undefined") return;
  if (s) window.localStorage.setItem(KEY, JSON.stringify(s));
  else window.localStorage.removeItem(KEY);
  cache = s;
  window.dispatchEvent(new Event(EVT));
}

function subscribe(cb: () => void) {
  const on = () => {
    cache = read();
    cb();
  };
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", on);
  };
}

export const sessionToken = () => snapshot()?.token ?? "";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<any> };
type SolProvider = {
  connect: () => Promise<{ publicKey: { toString(): string } }>;
  publicKey?: { toString(): string } | null;
  signMessage: (msg: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
};

function evm(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null) as Eip1193 | null;
}
function sol(): SolProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { phantom?: { solana?: SolProvider }; solflare?: SolProvider; backpack?: { solana?: SolProvider }; solana?: SolProvider };
  return w.phantom?.solana ?? w.solflare ?? w.backpack?.solana ?? w.solana ?? null;
}

export const hasEvm = () => !!evm();
export const hasSol = () => !!sol();

/** Phones have no browser extensions: wallets only inject inside their own in-app browser. */
export const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** Deep links that reopen the current page inside a wallet's in-app browser (where the wallet is injected). */
export function walletDeepLinks(kind: "evm" | "solana"): Array<{ name: string; url: string }> {
  if (typeof window === "undefined") return [];
  const url = window.location.href;
  const ref = encodeURIComponent(window.location.origin);
  const u = encodeURIComponent(url);
  if (kind === "solana")
    return [
      { name: "Phantom", url: `https://phantom.app/ul/browse/${u}?ref=${ref}` },
      { name: "Solflare", url: `https://solflare.com/ul/v1/browse/${u}?ref=${ref}` },
      { name: "Backpack", url: `https://backpack.app/ul/v1/browse/${u}?ref=${ref}` },
    ];
  return [
    { name: "MetaMask", url: `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}` },
    { name: "Coinbase Wallet", url: `https://go.cb-w.com/dapp?cb_url=${u}` },
    { name: "Trust Wallet", url: `https://link.trustwallet.com/open_url?coin_id=60&url=${u}` },
    { name: "Phantom", url: `https://phantom.app/ul/browse/${u}?ref=${ref}` },
  ];
}

/** In-app browsers sometimes inject the provider a moment after load. */
async function waitFor<T>(get: () => T | null, ms = 1500): Promise<T | null> {
  const end = Date.now() + ms;
  let v = get();
  while (!v && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 100));
    v = get();
  }
  return v;
}

export const NO_WALLET_MOBILE = "NO_WALLET_MOBILE";

async function connectEvm(): Promise<{ address: string; sign: (m: string) => Promise<string> }> {
  const p = await waitFor(evm);
  if (!p) throw new Error(isMobile() ? NO_WALLET_MOBILE : "No EVM wallet found. Install MetaMask, Rabby or Coinbase Wallet.");
  const [account] = (await p.request({ method: "eth_requestAccounts" })) as string[];
  const address = account.toLowerCase();
  return {
    address,
    sign: async (m) => {
      const hex = `0x${[...new TextEncoder().encode(m)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
      return p.request({ method: "personal_sign", params: [hex, account] });
    },
  };
}

async function connectSol(): Promise<{ address: string; sign: (m: string) => Promise<string> }> {
  const p = await waitFor(sol);
  if (!p) throw new Error(isMobile() ? NO_WALLET_MOBILE : "No Solana wallet found. Install Phantom, Solflare or Backpack.");
  const r = await p.connect();
  const pk = r?.publicKey ?? p.publicKey;
  if (!pk) throw new Error("Wallet did not share an address.");
  return {
    address: pk.toString(),
    sign: async (m) => {
      const out = await p.signMessage(new TextEncoder().encode(m), "utf8");
      return b58encode(out instanceof Uint8Array ? out : out.signature);
    },
  };
}

export function useWallet() {
  const session = useSyncExternalStore(subscribe, snapshot, () => null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = useCallback(async (kind: "evm" | "solana") => {
    setError("");
    setBusy(true);
    try {
      const w = kind === "evm" ? await connectEvm() : await connectSol();
      const n = await getNonce({ data: { address: w.address } });
      const signature = await w.sign(n.message);
      const s = await serverSignIn({ data: { address: w.address, nonce: n.nonce, issued: n.issued, signature } });
      const next: Session = { token: s.token, address: s.address, kind };
      setSession(next);
      return next;
    } catch (e) {
      const m = String((e as Error).message ?? e);
      setError(/reject|denied|cancel/i.test(m) ? "Signature cancelled." : m.split("\n")[0].slice(0, 160));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const s = snapshot();
    setSession(null);
    if (s) await serverSignOut({ data: { token: s.token } }).catch(() => {});
  }, []);

  return { session, connect, disconnect, busy, error, setError };
}
