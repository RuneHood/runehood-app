import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ConnectButton } from "./connect-button";
import { XLogo } from "./icons";

/** Set once the Runehood accounts exist; empty hides the links. */
export const X_URL = "https://x.com/runehoodcoin";
export const TG_URL = "https://t.me/RuneHood";
export const GH_URL = "https://github.com/RuneHood";

const NAV = [
  { to: "/runes", label: "Explore" },
  { to: "/create", label: "Launch" },
  { to: "/verify", label: "Proof" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/docs", label: "Docs" },
  { to: "/account", label: "Account" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-xl" style={{ background: "rgba(6,10,8,.78)", borderColor: "var(--c-line)" }}>
      <div className="border-b px-4 py-1.5 text-center text-[12px]" style={{ borderColor: "var(--c-line)", background: "linear-gradient(90deg, rgba(11,138,74,.25), rgba(47,210,122,.08), rgba(11,138,74,.25))", color: "#bff5d6" }}>
        <>New: pair your Rune with <b className="font-semibold">TSLA, NVDA, SPY</b> and 12 more Stock Tokens on Robinhood Chain</>
      </div>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/assets/logo.webp" alt="" className="h-8 w-8" />
          <span className="font-display text-lg font-bold uppercase tracking-[.08em]">Runehood</span>

        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="border-b-2 border-transparent py-1 text-sm c-muted transition hover:text-white" activeProps={{ className: "border-b-2 py-1 text-sm !text-white !border-[var(--c-ruby)]" }}>
              {n.label}
            </Link>
          ))}
          <span className="group relative cursor-default border-b-2 border-transparent py-1 text-sm c-muted" tabIndex={0} aria-label="Marketplace Runes, coming soon">
            <span className="group-hover:invisible group-focus:invisible">Marketplace Runes</span>
            <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap font-semibold opacity-0 transition group-hover:opacity-100 group-focus:opacity-100" style={{ color: "var(--c-rose)" }}>Coming soon</span>
          </span>
        </nav>
        <div className="flex items-center gap-2">
          {TG_URL && (<a href={TG_URL} target="_blank" rel="noreferrer" aria-label="Runehood on Telegram" className="hidden h-10 w-10 items-center justify-center rounded-lg border transition hover:border-[var(--c-line-2)] sm:flex" style={{ background: "var(--c-surface)" }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M21.9 4.3 18.7 19.4c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1 1.4 11.6c-1-.3-1-1 .2-1.5L20.6 2.8c.9-.3 1.6.2 1.3 1.5z" />
            </svg>
          </a>)}
          {X_URL && (<a href={X_URL} target="_blank" rel="noreferrer" aria-label="Runehood on X" className="hidden h-10 w-10 items-center justify-center rounded-lg border transition hover:border-[var(--c-line-2)] sm:flex" style={{ background: "var(--c-surface)" }}>
            <XLogo />
          </a>)}
          {GH_URL && (<a href={GH_URL} target="_blank" rel="noreferrer" aria-label="Runehood on GitHub" className="hidden h-10 w-10 items-center justify-center rounded-lg border transition hover:border-[var(--c-line-2)] sm:flex" style={{ background: "var(--c-surface)" }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>
          </a>)}
          <ConnectButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t px-3 py-2 md:hidden" style={{ borderColor: "var(--c-line)" }}>
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="shrink-0 rounded-full px-3 py-1 text-sm c-muted" activeProps={{ className: "shrink-0 rounded-full px-3 py-1 text-sm !text-white bg-white/[.07]" }}>
            {n.label}
          </Link>
        ))}
        <span className="shrink-0 rounded-full px-3 py-1 text-sm c-dim">Marketplace Runes · soon</span>
      </nav>
    </header>
  );
}
