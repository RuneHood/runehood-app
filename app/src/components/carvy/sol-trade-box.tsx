import { useEffect, useState } from "react";

import { fmtAmount, fmtNum, type RuneRow } from "../../lib/carvy";
import { useWallet } from "../../lib/wallet";
import { ChainIcon, QuoteIcon } from "./icons";
import { loadSol } from "../../lib/sol/load";
import { ConnectButton } from "./connect-button";

/** Buy / sell a Solana Rune on its Meteora bonding curve, straight from the user's Solana wallet. */
export function SolTradeBox({ rune, onDone }: { rune: RuneRow; onDone: () => Promise<void> }) {
  const { session } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [est, setEst] = useState<number | null>(null);
  const [bal, setBal] = useState<{ token: number; sol: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pool = rune.launchpad ?? "";
  const solWallet = session?.kind === "solana";
  const isCreator = solWallet && session?.address === rune.creator;
  const [fees, setFees] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  useEffect(() => {
    if (!isCreator || !pool) return;
    loadSol()
      .then((m) => (rune.dex === "raydium" ? Promise.resolve(-1) : m.solCreatorFees(pool)))
      .then(setFees)
      .catch(() => {});
  }, [isCreator, pool, msg]);
  const claim = async () => {
    if (!session) return;
    setClaiming(true);
    try {
      const m = await loadSol();
      const sig = rune.dex === "raydium" ? await m.claimRaydiumCreatorFees(session.address) : await m.claimSolCreatorFees(session.address, pool);
      setMsg({ ok: true, text: `Creator fees claimed · ${sig.slice(0, 10)}…` });
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message).split("\n")[0].slice(0, 180) });
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    if (!solWallet || !session) return setBal(null);
    let off = false;
    loadSol()
      .then((m) => m.solTokenBalance(session.address, rune.id))
      .then((b) => !off && setBal(b))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [solWallet, session, rune.id, msg]);

  useEffect(() => {
    const n = Number(amount);
    if (!n || !pool) return setEst(null);
    let off = false;
    const t = setTimeout(() => {
      loadSol()
        .then((m) => m.quoteSol(pool, side, amount))
        .then((v) => !off && setEst(v))
        .catch(() => !off && setEst(null));
    }, 350);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [amount, side, pool]);

  if (rune.migrated || rune.graduated) {
    return (
      <div className="c-card p-5 text-center">
        <div className="font-display text-lg font-semibold">Graduated</div>
        <p className="c-muted mt-1 text-sm">Liquidity moved into its {rune.dex === "raydium" ? "Raydium" : "Meteora"} pool with locked liquidity. Trade it on any Solana app.</p>
        <a href={rune.dex === "raydium" ? `https://raydium.io/swap/?inputMint=sol&outputMint=${rune.id}` : `https://jup.ag/swap/SOL-${rune.id}`} target="_blank" rel="noreferrer" className="mt-4 block w-full rounded-full py-3 text-sm font-semibold text-white" style={{ background: "var(--c-grad)" }}>
          {rune.dex === "raydium" ? "Trade on Raydium" : "Trade on Jupiter"}
        </a>
      </div>
    );
  }

  const go = async () => {
    if (!session) return;
    setBusy(true);
    setMsg(null);
    try {
      const { tradeSol } = await loadSol();
      const sig = await tradeSol({ owner: session.address, pool, side, amount });
      setMsg({ ok: true, text: `${side === "buy" ? "Bought" : "Sold"} · ${sig.slice(0, 10)}…` });
      setAmount("");
      await onDone();
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message).split("\n")[0].slice(0, 180) });
    } finally {
      setBusy(false);
    }
  };

  const quick = side === "buy" ? ["0.1", "0.5", "1"] : ["25", "50", "100"];
  return (
    <div className="c-card p-4">
      <div className="flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold text-white" style={{ background: "var(--c-grad)" }}>
        <ChainIcon chain="solana" size={14} /> {rune.dex === "raydium" ? "Solana · Raydium LaunchLab" : "Solana Market"}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "var(--c-bg)" }}>
        <button onClick={() => { setSide("buy"); setAmount(""); }} className={`rounded-lg py-2 text-sm font-semibold ${side === "buy" ? "text-[#04150d]" : "c-muted"}`} style={side === "buy" ? { background: "var(--c-up)" } : undefined}>
          Buy
        </button>
        <button onClick={() => { setSide("sell"); setAmount(""); }} className={`rounded-lg py-2 text-sm font-semibold ${side === "sell" ? "text-white" : "c-muted"}`} style={side === "sell" ? { background: "var(--c-down)" } : undefined}>
          Sell
        </button>
      </div>
      <div className="mt-3 flex items-center rounded-xl border px-4 py-3" style={{ background: "var(--c-bg)", borderColor: "var(--c-line-2)" }}>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0.0" className="font-display w-full bg-transparent text-2xl outline-none" />
        <span className="c-muted flex shrink-0 items-center gap-1 text-sm font-semibold">{side === "buy" ? <><QuoteIcon quote="SOL" size={14} /> SOL</> : rune.ticker}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <div className="flex gap-1.5">
          {quick.map((v) => (
            <button key={v} onClick={() => setAmount(side === "buy" ? v : bal ? String(Math.floor((bal.token * Number(v)) / 100)) : "")} className="rounded-full border px-2.5 py-1 c-muted hover:text-white" style={{ background: "var(--c-bg)" }}>
              {side === "buy" ? v : `${v}%`}
            </button>
          ))}
        </div>
        {bal && <span className="c-dim">Bal: {side === "buy" ? `${fmtAmount(bal.sol)} SOL` : `${fmtNum(bal.token, 1)} ${rune.ticker}`}</span>}
      </div>
      <div className="mt-4 flex justify-between text-sm">
        <span className="c-muted">You receive</span>
        <span className="font-semibold">{est === null ? "—" : side === "buy" ? `${fmtNum(est, 2)} ${rune.ticker}` : `${fmtAmount(est)} SOL`}</span>
      </div>
      <p className="c-dim mt-1 text-[11px]">On-chain on Solana (Meteora). Max 5% slippage. {rune.dex === "raydium" ? "Trading fee 1.25% (0.5% creator, 0.5% Runehood, 0.25% Raydium)." : `Trading fee ${(1 + (rune.buy_tax ?? 0) / 100).toFixed(0)}% incl. creator tax.`}</p>
      <div className="mt-4">
        {!session ? (
          <ConnectButton wide prefer="solana" label="Connect Solana wallet" />
        ) : !solWallet ? (
          <p className="c-card-2 p-3 text-center text-xs c-rose">This Rune trades on Solana. Disconnect and connect a Solana wallet.</p>
        ) : (
          <button disabled={busy || !Number(amount)} onClick={go} className="w-full rounded-full py-3.5 text-base font-semibold disabled:opacity-50" style={side === "buy" ? { background: "var(--c-up)", color: "#04150d" } : { background: "var(--c-down)", color: "#fff" }}>
            {busy ? "Confirm in your wallet…" : side === "buy" ? `Buy ${rune.ticker}` : `Sell ${rune.ticker}`}
          </button>
        )}
      </div>
      {msg && <p className={`mt-3 text-center text-xs ${msg.ok ? "c-up" : "c-down"}`}>{msg.text}</p>}
      {isCreator && (
        <div className="c-card-2 mt-4 flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
          <span>
            <span className="c-dim">Your creator fees</span> <span className="font-semibold">{fees === null ? "…" : fees < 0 ? "on Raydium" : `${fees.toFixed(4)} SOL`}</span>
          </span>
          <button disabled={claiming || fees === 0 || fees === null} onClick={claim} className="rounded-full px-3 py-1.5 font-semibold text-white disabled:opacity-50" style={{ background: "var(--c-grad)" }}>
            {claiming ? "Claiming…" : "Claim"}
          </button>
        </div>
      )}
    </div>
  );
}
