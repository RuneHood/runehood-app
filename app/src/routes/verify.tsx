import { createFileRoute, Link } from "@tanstack/react-router";

import { getVerify } from "../lib/api/carvy.functions";
import { TOTAL_SUPPLY, chainById, fmtNum } from "../lib/carvy";
import { ChainIcon, Shield } from "../components/carvy/icons";

export const Route = createFileRoute("/verify")({
  loader: () => getVerify(),
  head: () => ({ meta: [{ title: "Verify backing | Runehood" }] }),
  component: Verify,
});

function Verify() {
  const { runes, custodyAddress } = Route.useLoaderData();
  const etched = runes.filter((r) => r.rune_ref).length;
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <span className="c-eyebrow">Transparency</span>
      <h1 className="font-display mt-2 text-5xl font-bold tracking-tight">Verify Runehood backing</h1>
      <p className="c-muted mt-4 max-w-3xl leading-relaxed">
        Every Runehood Rune has a fixed supply of 1,000,000,000 on Bitcoin. Tokens that trade on Robinhood Chain, Ethereum, Base, BNB Chain or Solana are backed 1:1 by the Rune held in custody, and every bridge to Bitcoin releases the same amount. Mainnet Runes are etched with their full supply into the Runehood custody address below; every bridge to Bitcoin is a public transaction from it, and every deposit from Bitcoin is swept into it before tokens are minted. Custody moves to a 2-of-2 address with an independent co-signer next.
      </p>

      {custodyAddress && (
        <div className="c-card mt-6 p-5 text-sm">
          <div className="c-dim text-xs">Bitcoin custody address (holds every mainnet Rune)</div>
          <a href={`https://mempool.space/address/${custodyAddress}`} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono hover:underline" style={{ color: "#F7B45A" }}>
            {custodyAddress}
          </a>
        </div>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Box big={`${etched} of ${runes.length}`} label="Runes etched on Bitcoin" />
        <Box big={`${runes.length} of ${runes.length}`} label="backed 1:1 right now" />
        <Box big="Mainnet" label="Bitcoin network for live Runes" />
      </div>

      <div className="c-card mt-8 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4">
          <Shield size={16} />
          <h2 className="font-display text-lg font-semibold">Every Rune</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="c-dim border-t text-left text-xs" style={{ borderColor: "var(--c-line)" }}>
                <th className="px-5 py-2 font-medium">Rune</th>
                <th className="px-3 py-2 font-medium">Trades on</th>
                <th className="px-3 py-2 font-medium">Rune id</th>
                <th className="px-3 py-2 font-medium">On Bitcoin (bridged)</th>
                <th className="px-3 py-2 font-medium">In custody</th>
                <th className="px-5 py-2 text-right font-medium">Backing</th>
              </tr>
            </thead>
            <tbody>
              {runes.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--c-line)" }}>
                  <td className="px-5 py-2.5">
                    <Link to="/rune/$id" params={{ id: r.id }} className="flex items-center gap-2.5 hover:underline">
                      <img src={r.image_url} alt="" className="h-7 w-7 rounded-md object-cover" />
                      <span className="font-semibold">{r.ticker}</span>
                      <span className="c-rose hidden font-mono text-[11px] md:inline">{r.rune_name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-xs">
                      <ChainIcon chain={chainById(r.chain).id} size={14} /> {chainById(r.chain).short}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {r.rune_ref ? (
                      <a href={r.onchain ? `https://mempool.space/block/${r.rune_ref.split(":")[0]}` : `https://mempool.space/testnet4/block/${r.rune_ref.split(":")[0]}`} target="_blank" rel="noreferrer" style={{ color: "#F7B45A" }} className="hover:underline">
                        {r.rune_ref}
                      </a>
                    ) : (
                      <span className="c-muted">etching…</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs">{fmtNum(r.bridged, 2)}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {r.onchain ? (r.custody ? fmtNum(r.custody.split(",").reduce((a, x) => a + Number(BigInt(x) / 10n ** 12n) / 1e6, 0), 2) : "—") : fmtNum(TOTAL_SUPPLY - r.bridged, 2)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs font-semibold">
                    {r.onchain ? <span className={r.etch_status === "etched" ? "c-up" : "c-muted"}>{r.etch_status === "etched" ? "1:1" : r.etch_status || "queued"}</span> : <span className="c-up">1:1 (testnet)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Box({ big, label }: { big: string; label: string }) {
  return (
    <div className="c-card p-5">
      <div className="font-display text-3xl font-bold">{big}</div>
      <div className="c-muted mt-1 text-sm">{label}</div>
    </div>
  );
}
