import type { ChainId } from "../../lib/carvy";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";

import { shortAddr } from "../../lib/carvy";
import { NO_WALLET_MOBILE, hasEvm, hasSol, isMobile, useWallet, walletDeepLinks } from "../../lib/wallet";
import { ChainIcon, WalletIcon } from "./icons";

/** Header wallet control: pick EVM or Solana, sign once, then show the address with a menu. */
export function ConnectButton({ wide = false, label = "Connect wallet", prefer }: { wide?: boolean; label?: string; prefer?: "evm" | "solana" }) {
  const { session, connect, disconnect, busy, error, setError } = useWallet();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [deep, setDeep] = useState<"evm" | "solana" | null>(null);
  useEffect(() => {
    if (error === NO_WALLET_MOBILE) setOpen(true);
  }, [error]);

  if (mounted && session && !wide) {
    return (
      <div className="relative">
        <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition hover:border-[var(--c-line-2)]" style={{ background: "var(--c-surface)" }}>
          <ChainIcon chain={session.kind === "solana" ? "solana" : "ethereum"} size={16} />
          <span className="font-mono">{shortAddr(session.address)}</span>
        </button>
        {menu && (
          <div className="c-card absolute right-0 top-12 z-50 w-52 p-1.5 shadow-2xl" onMouseLeave={() => setMenu(false)}>
            <Link to="/account" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5">
              Account and faucet
            </Link>
            <button onClick={() => { setMenu(false); void disconnect(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm c-ruby hover:bg-white/5">
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  const start = async (k: "evm" | "solana") => {
    // On a phone without the wallet's in-app browser there is no provider: offer to reopen the page inside the wallet.
    if (isMobile() && !(k === "solana" ? hasSol() : hasEvm())) {
      setDeep(k);
      setOpen(true);
      return;
    }
    const s = await connect(k);
    if (s) setOpen(false);
  };
  const shownError = error === NO_WALLET_MOBILE ? "" : error;

  return (
    <>
      <button
        onClick={() => {
          setError("");
          setDeep(null);
          if (prefer) void start(prefer);
          else setOpen(true);
        }}
        disabled={busy}
        className={`group flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_30px_-8px_rgba(47,210,122,.6)] transition hover:brightness-110 active:scale-[.98] disabled:opacity-60 ${wide ? "w-full py-3.5 text-base" : ""}`}
        style={{ background: "var(--c-grad)" }}
      >
        <WalletIcon />
        {busy ? "Check your wallet…" : label}
      </button>
      {prefer && shownError && <p className="mt-2 text-xs c-down">{shownError}</p>}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => { setOpen(false); setDeep(null); }}>
          <div className="c-card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <img src="/assets/logo.webp" alt="" className="h-10 w-10" />
              <div>
                <h3 className="font-display text-lg font-semibold">Connect a wallet</h3>
                <p className="c-muted text-xs">One free signature. No transaction.</p>
              </div>
            </div>
            {deep ? (
              <div className="mt-5">
                <p className="c-muted text-sm">On a phone, wallets only work inside their own app. Open Runehood in your wallet's browser and connect there:</p>
                <div className="mt-3 space-y-2">
                  {walletDeepLinks(deep).map((w) => (
                    <a key={w.name} href={w.url} className="c-card-2 flex w-full items-center justify-between px-4 py-3 text-sm font-semibold transition hover:border-[var(--c-ruby)]">
                      Open in {w.name}
                      <span className="c-muted text-xs">→</span>
                    </a>
                  ))}
                </div>
                <button onClick={() => setDeep(null)} className="c-muted mt-3 text-xs hover:text-white">← Back</button>
              </div>
            ) : (
              <div className="mt-5 space-y-2.5">
              <WalletRow onClick={() => start("solana")} busy={busy} title="Solana wallet" sub="Phantom, Solflare, Backpack" chains={["solana"]} />
              <WalletRow onClick={() => start("evm")} busy={busy} title="EVM wallet" sub="MetaMask, Rabby, Coinbase Wallet" chains={["robinhood", "ethereum", "base", "bsc"]} />
            </div>
            )}
            {shownError && <p className="mt-4 rounded-lg px-3 py-2 text-xs c-down" style={{ background: "rgba(255,92,116,.08)" }}>{shownError}</p>}
            <p className="c-dim mt-5 text-[11px] leading-relaxed">Each Rune trades on the chain its creator picked: an EVM wallet for Ethereum, Base, BNB Chain and Robinhood, a Solana wallet for Solana.</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function WalletRow({ onClick, busy, title, sub, chains }: { onClick: () => void; busy: boolean; title: string; sub: string; chains: ChainId[] }) {
  return (
    <button onClick={onClick} disabled={busy} className="c-card-2 flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:border-[var(--c-ruby)] disabled:opacity-50">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="c-muted text-xs">{sub}</div>
      </div>
      <div className="flex shrink-0 -space-x-1.5">
        {chains.map((c) => (
          <span key={c} className="flex h-[26px] w-[26px] items-center justify-center rounded-full ring-2" style={{ background: "var(--c-surface-2)", ["--tw-ring-color" as never]: "var(--c-surface-2)" }}>
            <ChainIcon chain={c} size={20} />
          </span>
        ))}
      </div>
    </button>
  );
}
