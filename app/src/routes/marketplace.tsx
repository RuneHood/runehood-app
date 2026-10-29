import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { getMarketplace } from "../lib/api/carvy.functions";
import { chainById, fmtNum, fmtUsd, SATS } from "../lib/carvy";
import { ArrowRight, ChainIcon } from "../components/carvy/icons";

export const Route = createFileRoute("/marketplace")({
  loader: () => getMarketplace(),
  head: () => ({
    meta: [
      { title: "Runes Marketplace | Runehood" },
      { name: "description", content: "Trade Runehood Runes as native Bitcoin Runes. Bridge 1:1 to your Bitcoin wallet and trade on Magic Eden, UniSat, OKX and more." },
    ],
  }),
  component: Marketplace,
});

const VENUES = [
  { id: "me", name: "Magic Eden", url: (n: string) => `https://magiceden.io/runes/${encodeURIComponent(n)}` },
  { id: "unisat", name: "UniSat", url: (n: string) => `https://unisat.io/runes/market?tick=${encodeURIComponent(n)}` },
  { id: "okx", name: "OKX", url: (n: string, id: string) => `https://web3.okx.com/marketplace/runes/token/${encodeURIComponent(n)}/${id}` },
] as const;

const explorer = (n: string) => `https://ordiscan.com/rune/${encodeURIComponent(n.replace(/•/g, ""))}`;

function Marketplace() {
  const { runes, prices } = Route.useLoaderData();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toUpperCase();
    return t ? runes.filter((r) => r.ticker.includes(t) || r.rune_name.includes(t) || r.title.toUpperCase().includes(t)) : runes;
  }, [runes, q]);
  const onBtc = runes.reduce((a, r) => a + (r.bridged > 0 ? 1 : 0), 0);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
      <span className="c-eyebrow"><ChainIcon chain="bitcoin" size={14} /> Bitcoin</span>
      <h1 className="font-display mt-2 text-4xl font-bold uppercase sm:text-5xl">
        Runes <span className="text-grad">Marketplace</span>
      </h1>
      <p className="c-muted mt-3 max-w-2xl">
        Every Runehood token is a real Rune on Bitcoin. Bridge it 1:1 to your Bitcoin wallet and it trades like any native Rune on the big Bitcoin marketplaces. Bridge back to its chain whenever you want.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Step n="1" t="Bridge to Bitcoin" d="Open the Rune, pick “Bridge to Bitcoin”, paste your Taproot address (bc1p…). About 5–15 minutes." />
        <Step n="2" t="Trade on Bitcoin" d="List or buy the native Rune on Magic Eden, UniSat or OKX with any Runes wallet (Xverse, UniSat, Leather, OKX)." />
        <Step n="3" t="Bridge back" d="Send the Rune to your personal deposit address on the Account page. 3 confirmations and it is back on its chain." />
      </div>

      <div className="mt-10 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="text-sm c-muted">
          {runes.length} Runes etched on Bitcoin · {onBtc} with supply on Bitcoin
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or Rune name" className="c-input sm:max-w-xs" />
      </div>

      <div className="c-card mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="c-dim text-left text-[11px] uppercase tracking-wider">
              <th className="px-4 py-3">Rune</th>
              <th className="px-4 py-3">Rune ID</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">On Bitcoin</th>
              <th className="px-4 py-3">Trades on</th>
              <th className="px-4 py-3">Bitcoin markets</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="c-muted px-4 py-10 text-center">
                  {runes.length === 0 ? "No Rune is etched on Bitcoin yet. New launches are etched about an hour after launch." : "Nothing matches your search."}
                </td>
              </tr>
            )}
            {list.map((r) => {
              const priceUsd = (r.v_sats / r.v_tokens / SATS) * prices.BTC;
              const c = chainById(r.chain);
              const etched = r.etch_status === "etched" || r.etch_status === "minted" || !r.etch_status;
              return (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--c-line)" }}>
                  <td className="px-4 py-3">
                    <Link to="/rune/$id" params={{ id: r.id }} className="flex items-center gap-3">
                      <img src={r.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      <div>
                        <div className="font-semibold">{r.ticker}</div>
                        <div className="c-rose font-mono text-[11px]">{r.rune_name}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <a href={explorer(r.rune_name)} target="_blank" rel="noreferrer" className="font-mono text-xs c-muted hover:text-white">
                      {r.rune_ref}
                    </a>
                    {!etched && <div className="text-[10px]" style={{ color: "var(--c-gold)" }}>etching…</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{priceUsd < 0.01 ? `$${priceUsd.toPrecision(3)}` : fmtUsd(priceUsd)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-mono text-xs">{fmtNum(r.bridged, 0)}</div>
                    <div className="c-dim text-[10px]">{((r.bridged / 1e9) * 100).toFixed(r.bridged > 0 && r.bridged < 1e7 ? 3 : 1)}% of supply</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs"><ChainIcon chain={c.id} size={14} /> {c.short}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {VENUES.map((v) => (
                        <a key={v.id} href={v.url(r.rune_name, r.rune_ref)} target="_blank" rel="noreferrer" className="rounded-md border px-2 py-1 text-[11px] c-muted transition hover:border-[var(--c-ruby)] hover:text-white" style={{ background: "var(--c-bg)" }}>
                          {v.name}
                        </a>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/rune/$id" params={{ id: r.id }} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-black" style={{ background: "var(--c-grad)" }}>
                      Bridge <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="c-dim mt-3 text-[11px]">
        Price is the live price on the Rune’s chain. Prices on Bitcoin marketplaces are set by their buyers and sellers. A Rune shows up on a marketplace once it has holders on Bitcoin; Runehood is not affiliated with these marketplaces.
      </p>
    </div>
  );
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="c-card p-5">
      <div className="c-rose font-mono text-xs">0{n}</div>
      <div className="font-display mt-1 font-semibold">{t}</div>
      <p className="c-muted mt-1 text-sm">{d}</p>
    </div>
  );
}
