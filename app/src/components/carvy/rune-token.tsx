import { useEffect, useState } from "react";

import { getRuneToken } from "../../lib/api/rune-token.functions";
import { fmtNum, fmtUsd } from "../../lib/carvy";
import { RUNE_TOKEN, shortCa, type RuneTokenStats } from "../../lib/rune-token";

export function useRuneToken() {
  const [s, setS] = useState<RuneTokenStats | null>(null);
  useEffect(() => {
    let off = false;
    const load = () => getRuneToken().then((v) => !off && setS(v)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);
  return s;
}

export function CopyCa({ short = false, className = "" }: { short?: boolean; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(RUNE_TOKEN.address);
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      }}
      title="Copy $RUNE contract address"
      className={`inline-flex items-center gap-1.5 font-mono transition hover:text-white ${className}`}
    >
      <span>{short ? shortCa(RUNE_TOKEN.address) : RUNE_TOKEN.address}</span>
      <span className="rounded px-1.5 py-0.5 text-[10px] font-sans font-semibold" style={{ background: "rgba(47,210,122,.15)", color: "var(--c-rose)" }}>{ok ? "Copied" : "Copy"}</span>
    </button>
  );
}

export const fmtPrice = (n: number) => (n <= 0 ? "—" : n < 0.01 ? `$${n.toPrecision(3)}` : fmtUsd(n));

export function RuneStats({ s }: { s: RuneTokenStats | null }) {
  const burnPct = s ? (s.burned / RUNE_TOKEN.supply) * 100 : 0;
  const items = [
    { k: "Price", v: s ? fmtPrice(s.priceUsd) : "…" },
    { k: "Market cap", v: s ? fmtUsd(s.mcapUsd) : "…", sub: "circulating" },
    { k: "Burned", v: s ? `${fmtNum(s.burned, 0)}` : "…", sub: s ? `${burnPct.toFixed(2)}% of supply` : "" },
    { k: "Circulating", v: s ? fmtNum(s.circulating, 0) : "…", sub: "of 1,000,000,000" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.k} className="c-card-2 p-3">
          <div className="c-dim text-[10px] uppercase tracking-wider">{i.k}</div>
          <div className="font-display mt-1 text-lg font-semibold">{i.v}</div>
          {i.sub && <div className="c-dim text-[10px]">{i.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function BurnBar({ s }: { s: RuneTokenStats | null }) {
  const pct = s ? Math.min(100, (s.burned / RUNE_TOKEN.supply) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] c-muted">
        <span>🔥 Burned supply</span>
        <span>{s ? `${pct.toFixed(2)}%` : "…"}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "var(--c-bg)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 0.5)}%`, background: "linear-gradient(90deg,#f7931a,#ff5c3a)" }} />
      </div>
    </div>
  );
}
