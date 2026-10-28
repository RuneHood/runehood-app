import { Link } from "@tanstack/react-router";

import { TG_URL, X_URL } from "./site-header";

export function SiteFooter() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t" style={{ borderColor: "var(--c-line)" }}>
      <div className="c-glow left-1/2 top-0 h-64 w-[38rem] -translate-x-1/2 -translate-y-1/2" />
      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-16 sm:px-6">
        <div className="flex flex-col items-center text-center">
          <img src="/assets/hero-stone.webp" alt="" className="h-28 w-28 drop-shadow-[0_20px_40px_rgba(47,210,122,.35)]" />
          {TG_URL && (<a href={TG_URL} target="_blank" rel="noreferrer" className="mt-6 rounded-full border px-4 py-1.5 text-sm c-rose hover:underline" style={{ background: "var(--c-surface)" }}>
            Join Telegram
          </a>)}
        </div>
        <div className="mt-14 grid gap-8 border-t pt-8 text-sm sm:grid-cols-[1.2fr_2fr_auto]" style={{ borderColor: "var(--c-line)" }}>
          <div>
            <div className="flex items-center gap-2">
              <img src="/assets/logo.webp" alt="" className="h-6 w-6" />
              <span className="font-display font-bold">Runehood</span>
            </div>
            <p className="c-muted mt-2 max-w-xs text-xs leading-relaxed">Bitcoin Runes. Any chain. Etch once on Bitcoin, trade at full speed where your crowd already is.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Link to="/runes" className="c-muted hover:text-white">Runes</Link>
            <Link to="/create" className="c-muted hover:text-white">Create</Link>
            <Link to="/roadmap" className="c-muted hover:text-white">Roadmap</Link>
            <Link to="/verify" className="c-muted hover:text-white">Verify custody</Link>
            <Link to="/docs" className="c-muted hover:text-white">How it works</Link>
            <Link to="/docs" hash="fees" className="c-muted hover:text-white">Fees</Link>
            <Link to="/docs" hash="buyback" className="c-muted hover:text-white">Buyback and burn</Link>
            <Link to="/account" className="c-muted hover:text-white">Account</Link>
            <Link to="/docs" hash="chains" className="c-muted hover:text-white">Supported chains</Link>
            {X_URL && (<a href={X_URL} target="_blank" rel="noreferrer" className="c-muted hover:text-white">X</a>)}
            {TG_URL && (<a href={TG_URL} target="_blank" rel="noreferrer" className="c-muted hover:text-white">Telegram</a>)}
          </div>
          <div className="c-dim text-xs">© 2026 Runehood</div>
        </div>
      </div>
    </footer>
  );
}
