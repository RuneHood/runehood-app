import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ConnectButton } from "./connect-button";
import { XLogo } from "./icons";

/** Set once the Runehood accounts exist; empty hides the links. */
export const X_URL = "";
export const TG_URL = "";

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
          <ConnectButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t px-3 py-2 md:hidden" style={{ borderColor: "var(--c-line)" }}>
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="shrink-0 rounded-full px-3 py-1 text-sm c-muted" activeProps={{ className: "shrink-0 rounded-full px-3 py-1 text-sm !text-white bg-white/[.07]" }}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
