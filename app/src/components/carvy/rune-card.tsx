import { Link } from "@tanstack/react-router";

import { chainById, curveProgress, fmtBtc, fmtUsd, mcapSats, satsToUsd, shortAddr, timeAgo, TOTAL_SUPPLY, type Prices, type RuneRow } from "../../lib/carvy";
import { ChainIcon } from "./icons";

export function BridgeBar({ rune, compact = false }: { rune: Pick<RuneRow, "bridged" | "chain">; compact?: boolean }) {
  const chain = chainById(rune.chain);
  const pct = Math.min(100, (rune.bridged / TOTAL_SUPPLY) * 100);
  const fmt = (n: number) => (n === 0 || n === 100 ? n.toFixed(0) : n > 0 && n < 0.01 ? "<0.01" : n > 99.99 && n < 100 ? ">99.99" : n < 1 ? n.toFixed(2) : n.toFixed(1));
  return (
    <div>
      <div className="flex h-1.5 overflow-hidden rounded-full" style={{ background: "var(--c-surface-2)" }}>
        <div style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%`, background: "#F7931A" }} />
        <div style={{ flex: 1, background: chain.color, opacity: 0.75 }} />
      </div>
      <div className={`mt-1.5 flex justify-between ${compact ? "text-[11px]" : "text-xs"}`}>
        <span style={{ color: "#F7B45A" }}>{fmt(pct)}% bridged to Bitcoin</span>
        <span style={{ color: chain.color }}>{fmt(100 - pct)}% on {chain.short}</span>
      </div>
    </div>
  );
}

const FEE_LABEL: Record<string, string> = { dev: "Dev", holders: "Holders", routed: "Routed" };

export function RuneCard({ rune, prices, now }: { rune: RuneRow; prices: Prices; now: number }) {
  const mc = mcapSats(rune.v_sats, rune.v_tokens);
  const prog = curveProgress(rune.sold);
  const chain = chainById(rune.chain);
  return (
    <Link to="/rune/$id" params={{ id: rune.id }} className="c-card group block p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--c-line-2)] hover:shadow-[0_20px_50px_-25px_rgba(47,210,122,.45)]">
      <div className="flex gap-3.5">
        <div className="relative shrink-0">
          <img src={rune.image_url} alt="" className="h-[72px] w-[72px] rounded-xl object-cover" loading="lazy" />
          <span className="absolute -bottom-1.5 -right-1.5 rounded-full border-2" style={{ borderColor: "var(--c-surface)" }}>
            <ChainIcon chain={chain.id} size={20} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-display truncate text-[17px] font-semibold">{rune.ticker}</span>
            {rune.is_platform ? (
              <Badge tone="ruby">Platform</Badge>
            ) : rune.graduated ? (
              <Badge tone="up">Graduated</Badge>
            ) : (
              <Badge>{FEE_LABEL[rune.fee_mode]}</Badge>
            )}
            {rune.onchain ? <Badge tone="up">Mainnet</Badge> : <Badge tone="test">Testnet</Badge>}
            <span className="c-dim ml-auto shrink-0 text-xs">{timeAgo(rune.created_at, now)}</span>
          </div>
          <div className="c-rose mt-0.5 truncate font-mono text-[11px] tracking-wide">{rune.rune_name}</div>
          <p className="c-muted mt-1 line-clamp-2 text-xs leading-relaxed">{rune.description || rune.title}</p>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="c-dim text-[11px]">Market cap</div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-semibold">{fmtUsd(satsToUsd(mc, prices))}</span>
            <span className="c-muted text-xs">{fmtBtc(mc)}</span>
          </div>
        </div>
        <span className="text-sm font-semibold" style={{ color: prog >= 100 ? "var(--c-up)" : "var(--c-rose)" }}>
          {prog.toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--c-surface-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${prog}%`, background: prog >= 100 ? "var(--c-up)" : "var(--c-grad)" }} />
      </div>
      <div className="mt-3.5">
        <BridgeBar rune={rune} compact />
      </div>
      <div className="mt-3.5 flex items-center justify-between border-t pt-3 text-[11px]" style={{ borderColor: "var(--c-line)" }}>
        <span className="c-dim">by {rune.creator === "Runehood" ? "Runehood" : shortAddr(rune.creator)}</span>
        <span className="rounded-full px-2 py-0.5 font-mono" style={{ background: rune.rune_ref ? "rgba(247,147,26,.12)" : "var(--c-surface-2)", color: rune.rune_ref ? "#F7B45A" : "var(--c-muted)" }}>
          {rune.rune_ref ? `Rune ${rune.rune_ref}` : rune.onchain ? "BTC etching" : "Etching…"}
        </span>
      </div>
    </Link>
  );
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: "ruby" | "up" | "test" }) {
  const style =
    tone === "test"
      ? { background: "rgba(242,193,78,.12)", color: "var(--c-gold)", border: "1px dashed rgba(242,193,78,.4)" }
      : tone === "ruby"
      ? { background: "rgba(47,210,122,.14)", color: "var(--c-rose)" }
      : tone === "up"
        ? { background: "rgba(61,220,151,.12)", color: "var(--c-up)" }
        : { background: "var(--c-surface-2)", color: "var(--c-muted)" };
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={style}>
      {children}
    </span>
  );
}
