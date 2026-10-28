import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { listRunes } from "../lib/api/carvy.functions";
import { CHAINS } from "../lib/carvy";
import { ChainIcon } from "../components/carvy/icons";
import { RuneCard } from "../components/carvy/rune-card";

type Sort = "new" | "mcap" | "volume" | "graduating";
type Search = { sort?: Sort; chain?: string; q?: string };
const SORT_IDS: Sort[] = ["new", "mcap", "volume", "graduating"];
const search = (s: Record<string, unknown>): Search => ({
  sort: SORT_IDS.includes(s.sort as Sort) ? (s.sort as Sort) : undefined,
  chain: typeof s.chain === "string" ? s.chain : undefined,
  q: typeof s.q === "string" ? s.q : undefined,
});

export const Route = createFileRoute("/runes")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listRunes({ data: { sort: deps.sort ?? "mcap", chain: deps.chain ?? "all", q: deps.q ?? "" } }),
  head: () => ({ meta: [{ title: "All Runes | Runehood" }] }),
  component: Runes,
});

const SORTS = [
  { id: "mcap", label: "Market cap" },
  { id: "new", label: "Newest" },
  { id: "volume", label: "Volume" },
  { id: "graduating", label: "About to graduate" },
] as const;

function Runes() {
  const { runes, prices } = Route.useLoaderData();
  const raw = Route.useSearch();
  const s = { sort: raw.sort ?? "mcap", chain: raw.chain ?? "all", q: raw.q ?? "" };
  const navigate = useNavigate({ from: "/runes" });
  const router = useRouter();
  const [q, setQ] = useState(s.q);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      void router.invalidate();
    }, 8000);
    return () => clearInterval(t);
  }, [router]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== s.q) void navigate({ search: (p) => ({ ...p, q }) });
    }, 300);
    return () => clearTimeout(t);
  }, [q, s.q, navigate]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
      <span className="c-eyebrow">Market</span>
      <h1 className="font-display mt-2 text-5xl font-bold tracking-tight">Every Rune on Runehood</h1>
      <p className="c-muted mt-3">
        {runes.length} Runes trading across {CHAINS.length} chains. Prices in BTC, refreshed every few seconds.
      </p>

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          <ChainChip active={s.chain === "all"} onClick={() => navigate({ search: (p) => ({ ...p, chain: "all" }) })}>
            All chains
          </ChainChip>
          {CHAINS.map((c) => (
            <ChainChip key={c.id} active={s.chain === c.id} onClick={() => navigate({ search: (p) => ({ ...p, chain: c.id }) })}>
              <ChainIcon chain={c.id} size={14} /> {c.short}
            </ChainChip>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticker or name" className="c-input !rounded-full !py-2 text-sm sm:w-60" />
          <select value={s.sort} onChange={(e) => navigate({ search: (p) => ({ ...p, sort: e.target.value as Sort }) })} className="c-input !w-auto !rounded-full !py-2 text-sm">
            {SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="c-dim mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span>Creator fees:</span>
        <span><b className="c-muted">Dev</b> to the creator</span>
        <span><b className="c-muted">Routed</b> to a chosen wallet, paid in BTC</span>
        <span><b className="c-muted">Holders</b> to every holder</span>
      </div>

      {runes.length === 0 ? (
        <div className="c-card c-muted mt-8 p-12 text-center">No Runes match. Try another chain or search.</div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {runes.map((r) => (
            <RuneCard key={r.id} rune={r} prices={prices} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChainChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition ${active ? "text-white" : "c-muted hover:text-white"}`}
      style={active ? { background: "rgba(47,210,122,.12)", borderColor: "rgba(47,210,122,.5)" } : { background: "var(--c-surface)" }}
    >
      {children}
    </button>
  );
}
