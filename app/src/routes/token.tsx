import { createFileRoute } from "@tanstack/react-router";

import { ArrowRight, ChainIcon } from "../components/carvy/icons";
import { BurnBar, CopyCa, RuneStats, useRuneToken } from "../components/carvy/rune-token";
import { RUNE_TOKEN } from "../lib/rune-token";

export const Route = createFileRoute("/token")({
  head: () => ({
    meta: [
      { title: "$RUNE | Runehood" },
      { name: "description", content: `$RUNE, the Runehood platform token on Robinhood Chain. Contract ${RUNE_TOKEN.address}.` },
    ],
  }),
  component: TokenPage,
});

function TokenPage() {
  const s = useRuneToken();
  return (
    <div className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <img src="/assets/logo.webp" alt="" className="h-24 w-24" />
        <div>
          <span className="c-eyebrow"><ChainIcon chain="robinhood" size={14} /> Robinhood Chain · listed on pons</span>
          <h1 className="font-display mt-2 text-5xl font-bold">$RUNE</h1>
          <p className="c-muted mt-2 max-w-xl">The Runehood platform token. One chain only: Robinhood Chain. Fixed supply of 1,000,000,000, liquidity locked in its pool from block one.</p>
        </div>
      </div>

      <div className="c-card mt-8 p-5">
        <div className="c-dim text-[11px] uppercase tracking-wider">Contract address</div>
        <CopyCa className="mt-1 break-all text-left text-sm sm:text-base" />
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={RUNE_TOKEN.buyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-black" style={{ background: "var(--c-grad)" }}>
            Buy $RUNE on pons <ArrowRight size={14} />
          </a>
          <a href={RUNE_TOKEN.explorerUrl} target="_blank" rel="noreferrer" className="rounded-xl border px-5 py-2.5 text-sm c-muted hover:text-white" style={{ background: "var(--c-surface)" }}>
            View on explorer
          </a>
        </div>
      </div>

      <div className="mt-4"><RuneStats s={s} /></div>
      <div className="c-card mt-4 p-5"><BurnBar s={s} /><p className="c-dim mt-2 text-[11px]">Burned = tokens held by the dead address (0x…dEaD) and the zero address. Market cap uses circulating supply (total minus burned).</p></div>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["Supply", "1,000,000,000 fixed. Nobody can mint more."],
          ["Chain", "Robinhood Chain only. Not bridged, not omnichain."],
          ["Liquidity", "Uniswap V4 pool vs ETH, created and locked by pons at launch."],
          ["$RUNE pairs", "Runes on Robinhood Chain can launch paired with $RUNE: every buy buys $RUNE, every graduation locks $RUNE in a pool."],
          ["Pay with ETH", "Buyers of $RUNE-paired Runes pay in ETH; it is swapped to $RUNE in the same transaction."],
          ["Burn", "Burned supply is tracked live above."],
        ].map(([t, d]) => (
          <div key={t} className="c-card p-5">
            <div className="font-display font-semibold">{t}</div>
            <p className="c-muted mt-1 text-sm">{d}</p>
          </div>
        ))}
      </div>
      <p className="c-dim mt-6 text-[11px]">Always check the contract address. Names and tickers can be copied. Nothing here is investment advice.</p>
    </div>
  );
}
