// Live progress + countdowns for the Bitcoin side (etching, bridge out, bridge in), so users can see it is working.
import { useEffect, useState } from "react";

export const BLOCK_MS = 10 * 60_000; // Bitcoin targets one block every ~10 minutes
const JOB_MS = 3 * 60_000; // Runehood's Bitcoin worker runs every 3 minutes

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min ${String(sec).padStart(2, "0")} s`;
  return `${sec} s`;
}

type EtchLive = { status: string; commit_confs?: number; reveal_confs?: number; created_at?: number; commit_txid?: string; reveal_txid?: string };

/** Estimated time left for a Rune's etching from its live state. */
export function etchRemainingMs(e: EtchLive | null | undefined): number {
  const s = e?.status ?? "queued";
  const c = Math.max(0, e?.commit_confs ?? 0);
  const r = Math.max(0, e?.reveal_confs ?? 0);
  if (s === "etched") return 0;
  if (s === "queued" || s === "committing") return JOB_MS + 6 * BLOCK_MS + JOB_MS;
  if (s === "committed") return Math.max(0, 5 - c) * BLOCK_MS + BLOCK_MS + JOB_MS;
  if (s === "revealed") return (r >= 1 ? 0 : BLOCK_MS) + JOB_MS;
  if (s === "waiting_index") return JOB_MS;
  return 0;
}

function Step({ state, title, sub }: { state: "done" | "active" | "todo"; title: string; sub?: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold" style={state === "done" ? { background: "var(--c-up)", color: "#04150d" } : state === "active" ? { border: "2px solid #F7931A" } : { border: "1px solid var(--c-line-2)" }}>
        {state === "done" ? "✓" : state === "active" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#F7931A" }} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-xs ${state === "todo" ? "c-dim" : state === "active" ? "font-semibold text-white" : "c-muted"}`}>{title}</div>
        {sub && state === "active" && <div className="c-dim mt-0.5 text-[11px]">{sub}</div>}
      </div>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="mt-1 flex gap-1">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < value ? "#F7931A" : "var(--c-line-2)" }} />
      ))}
    </div>
  );
}

/** Countdown that keeps ticking between status refreshes; never shows a negative time. */
function useCountdown(remainingMs: number, refreshedAt: number) {
  const now = useNow();
  return Math.max(0, remainingMs - (now - refreshedAt));
}

export function EtchProgress({ etch, chainName, launchedAt, refreshedAt }: { etch: EtchLive | null | undefined; chainName: string; launchedAt: number; refreshedAt: number }) {
  const now = useNow();
  const s = etch?.status ?? "queued";
  const left = useCountdown(etchRemainingMs(etch), refreshedAt);
  const c = Math.max(0, etch?.commit_confs ?? 0);
  const order = ["queued", "committing", "committed", "revealed", "waiting_index", "etched"];
  const at = Math.max(0, order.indexOf(s));
  const st = (i: number): "done" | "active" | "todo" => (at > i ? "done" : at === i ? "active" : "todo");
  if (s === "unavailable" || s === "failed") return null;
  const start = etch?.created_at || launchedAt;
  return (
    <div className="mt-3 rounded-xl p-3" style={{ background: "var(--c-bg)" }}>
      {s !== "etched" && (
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="c-dim text-[10px] uppercase tracking-wider">Time left (estimate)</div>
            <div className="font-display text-xl font-semibold" style={{ color: "#F7B45A" }}>
              {left > 60_000 ? `≈ ${fmtDur(left)}` : "Any minute now"}
            </div>
          </div>
          <div className="text-right">
            <div className="c-dim text-[10px] uppercase tracking-wider">Running for</div>
            <div className="font-mono text-sm">{fmtDur(now - start)}</div>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Step state="done" title={`Launched on ${chainName}`} />
        <Step state={at > 1 ? "done" : st(0) === "active" || st(1) === "active" ? "active" : "todo"} title="Reserve the Rune name on Bitcoin" sub="Runehood's worker picks it up within ~3 minutes." />
        <Step
          state={at > 2 ? "done" : st(2)}
          title={`Bitcoin confirmations ${Math.min(c, 6)}/6`}
          sub={
            <>
              {c === 0 ? "Name commitment is in the mempool, waiting for the next block." : `${6 - Math.min(c, 6)} more block${6 - c === 1 ? "" : "s"} to go (~10 min each).`}
              <Bar value={Math.min(c, 6)} max={6} />
            </>
          }
        />
        <Step state={st(3)} title="Etching transaction" sub="Sent. Waiting for 1 block (~10 min)." />
        <Step state={st(4)} title="Verified by the Runes index" sub="Usually within a few minutes." />
        <Step state={s === "etched" ? "done" : "todo"} title="Bridge to Bitcoin open" />
      </div>
      {s !== "etched" && <p className="c-dim mt-3 text-[11px] leading-relaxed">Bitcoin requires 6 blocks before a Rune can be etched. Blocks average 10 minutes but can take longer. Trading works the whole time.</p>}
    </div>
  );
}

type OutLive = { status: string; confs?: number; created_at: number; btc_txid?: string };

export function outRemainingMs(o: OutLive, etchLeft: number, etched: boolean): number {
  if (o.status === "manual") return 0;
  if (!etched) return etchLeft + JOB_MS + BLOCK_MS;
  if (o.status === "queued") return JOB_MS + BLOCK_MS;
  if ((o.confs ?? 0) >= 1) return 0;
  return BLOCK_MS;
}

export function OutProgress({ o, etched, etchLeft, refreshedAt }: { o: OutLive; etched: boolean; etchLeft: number; refreshedAt: number }) {
  const now = useNow();
  const left = useCountdown(outRemainingMs(o, etchLeft, etched), refreshedAt);
  const delivered = (o.confs ?? 0) >= 1;
  const label = o.status === "manual" ? "Held for review" : delivered ? "Delivered" : !etched ? "Waiting for etching" : o.status === "queued" ? "Sending" : "Confirming 0/1";
  return (
    <span className={`flex flex-col items-end ${delivered ? "c-up" : "c-muted"}`}>
      <span className="font-semibold">{label}</span>
      {!delivered && o.status !== "manual" && (
        <span className="c-dim text-[10px]">
          {left > 60_000 ? `≈ ${fmtDur(left)} left` : "any minute"} · {fmtDur(now - o.created_at)} ago
        </span>
      )}
    </span>
  );
}

/** Typical timings, shown on create/docs so nobody thinks it is stuck. */
export function TimingTable() {
  const rows = [
    ["Launch + first trade", "Instant (one wallet transaction)"],
    ["Etched on Bitcoin", "≈ 60–90 min (6 Bitcoin blocks + etching block)"],
    ["Bridge to Bitcoin", "≈ 5–15 min after etching (1 block)"],
    ["Bridge from Bitcoin", "≈ 50–60 min (3 blocks to accept, 2 to finalize)"],
  ];
  return (
    <div className="space-y-1.5 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <span className="c-muted">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}

type InLive = { status: string; confs?: number; created_at: number };

export function InProgress({ d }: { d: InLive }) {
  const now = useNow();
  if (d.status === "minted") return <span className="c-up font-semibold">Minted</span>;
  const c = Math.max(0, d.confs ?? 0);
  const left = Math.max(0, 2 - c) * BLOCK_MS + JOB_MS;
  return (
    <span className="flex flex-col items-end">
      <span className="font-semibold">In custody · {Math.min(c, 2)}/2 confirmations</span>
      <span className="c-dim text-[10px]">≈ {fmtDur(left)} left · {fmtDur(now - d.created_at)} ago</span>
    </span>
  );
}

export function IncomingRow({ txid, confs }: { txid: string; confs: number }) {
  const c = Math.max(0, confs);
  const left = Math.max(0, 3 - c) * BLOCK_MS + JOB_MS + 2 * BLOCK_MS;
  return (
    <div className="c-card-2 px-4 py-2.5 text-xs">
      <div className="flex items-center justify-between">
        <a href={`https://mempool.space/tx/${txid}`} target="_blank" rel="noreferrer" className="font-mono hover:underline">
          Incoming {txid.slice(0, 10)}…
        </a>
        <span className="font-semibold" style={{ color: "#F7B45A" }}>
          {Math.min(c, 3)}/3 confirmations · ≈ {fmtDur(left)} left
        </span>
      </div>
      <Bar value={Math.min(c, 3)} max={3} />
    </div>
  );
}
