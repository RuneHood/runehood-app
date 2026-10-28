import { useMemo, useState } from "react";

import { fmtBtc, fmtUsd, mcapSats, satsToUsd, V_SATS0, V_TOKENS0, type Prices } from "../../lib/carvy";

type T = { mcap_sats: number; created_at: number; usd: number };
const FRAMES = [
  { id: "1m", ms: 60_000 },
  { id: "5m", ms: 300_000 },
  { id: "15m", ms: 900_000 },
  { id: "1h", ms: 3_600_000 },
  { id: "4h", ms: 14_400_000 },
  { id: "1D", ms: 86_400_000 },
] as const;

/** Market-cap candlestick chart built from the Rune's own trades (SVG, no external lib). */
export function Candles({ trades, createdAt, prices }: { trades: T[]; createdAt: number; prices: Prices }) {
  const [frame, setFrame] = useState<(typeof FRAMES)[number]["id"]>("5m");
  const [unit, setUnit] = useState<"USD" | "BTC">("USD");
  const ms = FRAMES.find((f) => f.id === frame)!.ms;
  const start = mcapSats(V_SATS0, V_TOKENS0);

  const candles = useMemo(() => {
    const asc = [...trades].sort((a, b) => a.created_at - b.created_at);
    const out: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }> = [];
    let last = start;
    const first = Math.floor(createdAt / ms) * ms;
    const end = Math.floor(Date.now() / ms) * ms;
    const buckets = new Map<number, T[]>();
    for (const tr of asc) {
      const b = Math.floor(tr.created_at / ms) * ms;
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b)!.push(tr);
    }
    const span = Math.min(80, Math.max(1, Math.floor((end - first) / ms) + 1));
    const from = end - (span - 1) * ms;
    // carry price from before the window
    for (const tr of asc) if (tr.created_at < from) last = tr.mcap_sats;
    for (let t = from; t <= end; t += ms) {
      const list = buckets.get(t) ?? [];
      const o = last;
      let h = o;
      let l = o;
      let v = 0;
      for (const tr of list) {
        h = Math.max(h, tr.mcap_sats);
        l = Math.min(l, tr.mcap_sats);
        v += tr.usd;
        last = tr.mcap_sats;
      }
      out.push({ t, o, h, l, c: last, v });
    }
    return out;
  }, [trades, createdAt, ms, start]);

  const conv = (s: number) => (unit === "USD" ? satsToUsd(s, prices) : s / 1e8);
  const fmt = (s: number) => (unit === "USD" ? fmtUsd(satsToUsd(s, prices)) : fmtBtc(s));
  const W = 800;
  const H = 320;
  const VH = 50;
  const hi = Math.max(...candles.map((c) => c.h));
  const lo = Math.min(...candles.map((c) => c.l));
  const pad = (hi - lo) * 0.12 || hi * 0.05;
  const top = conv(hi + pad);
  const bot = conv(Math.max(0, lo - pad));
  const y = (s: number) => 10 + ((top - conv(s)) / (top - bot || 1)) * (H - VH - 30);
  const maxV = Math.max(1, ...candles.map((c) => c.v));
  const cw = (W - 60) / Math.max(candles.length, 1);
  const lastC = candles[candles.length - 1];
  const change = ((lastC.c - start) / start) * 100;

  return (
    <div className="c-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="c-muted text-sm">Market cap</span>
          <span className="font-display text-xl font-semibold">{fmt(lastC.c)}</span>
          <span className={`text-sm font-semibold ${change >= 0 ? "c-up" : "c-down"}`}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}%
          </span>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-full border p-0.5" style={{ background: "var(--c-bg)" }}>
            {FRAMES.map((f) => (
              <button key={f.id} onClick={() => setFrame(f.id)} className={`rounded-full px-2.5 py-1 text-xs ${frame === f.id ? "bg-white/10 text-white" : "c-muted"}`}>
                {f.id}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border p-0.5" style={{ background: "var(--c-bg)" }}>
            {(["USD", "BTC"] as const).map((u) => (
              <button key={u} onClick={() => setUnit(u)} className={`rounded-full px-2.5 py-1 text-xs ${unit === u ? "bg-white/10 text-white" : "c-muted"}`}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label="Market cap chart">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => {
          const yy = 10 + g * (H - VH - 30);
          const val = top - g * (top - bot);
          return (
            <g key={g}>
              <line x1="0" x2={W - 60} y1={yy} y2={yy} stroke="#1a2b22" strokeDasharray="3 5" />
              <text x={W - 54} y={yy + 4} fontSize="11" fill="#5a6e63" fontFamily="JetBrains Mono, monospace">
                {unit === "USD" ? fmtUsd(val) : `₿${val.toFixed(val < 0.1 ? 4 : 3)}`}
              </text>
            </g>
          );
        })}
        {candles.map((c, i) => {
          const x = i * cw + cw / 2;
          const up = c.c >= c.o;
          const col = up ? "#3ddc97" : "#ff5c74";
          const bodyTop = y(Math.max(c.o, c.c));
          const bodyH = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
          const vh = (c.v / maxV) * (VH - 6);
          return (
            <g key={c.t}>
              {c.v > 0 && <rect x={x - cw * 0.35} y={H - vh - 4} width={cw * 0.7} height={vh} fill={col} opacity=".25" />}
              <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1.2" />
              <rect x={x - Math.max(1, cw * 0.32)} y={bodyTop} width={Math.max(2, cw * 0.64)} height={bodyH} fill={col} rx="1" />
            </g>
          );
        })}
        <line x1="0" x2={W - 60} y1={y(lastC.c)} y2={y(lastC.c)} stroke="#2fd27a" strokeDasharray="2 4" opacity=".7" />
      </svg>
      {trades.length === 0 && <p className="c-dim -mt-2 text-center text-xs">No trades yet. The first buy starts the chart.</p>}
    </div>
  );
}
