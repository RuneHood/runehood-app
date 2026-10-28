import { useCallback, useEffect, useState } from "react";

import { getBtcStatus } from "../../lib/api/carvy.functions";
import { fmtNum, shortAddr, timeAgo, type RuneRow } from "../../lib/carvy";
import { liveDeployment, tokenBalance } from "../../lib/onchain";
import { bridgeOutOnchain } from "../../lib/onchain-actions";
import { useWallet } from "../../lib/wallet";
import { ChainIcon, External } from "./icons";
import { loadSol } from "../../lib/sol/load";
import { ConnectButton } from "./connect-button";
import { EtchProgress, OutProgress, etchRemainingMs } from "./progress";

type Status = Awaited<ReturnType<typeof getBtcStatus>>;
const MEMPOOL = "https://mempool.space/tx/";

const STEP_TEXT: Record<string, string> = {
  queued: "Queued for etching",
  committing: "Writing the name commitment",
  committed: "Name committed, waiting 6 confirmations",
  revealed: "Etching transaction sent",
  waiting_index: "Etched, confirming with the Runes index",
  etched: "Etched on Bitcoin",
  unavailable: "Cannot be etched with this name",
  failed: "Etching needs attention",
};

const OUT_TEXT: Record<string, string> = { queued: "Queued", signed: "Sending", sent: "Sent", manual: "Held for review" };

/** Bitcoin side of an on-chain Rune: etching progress, custody, bridge to Bitcoin. */
export function BitcoinPanel({ rune }: { rune: RuneRow }) {
  const { session } = useWallet();
  const [st, setSt] = useState<Status | null>(null);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [amt, setAmt] = useState("");
  const [addr, setAddr] = useState("");
  const [bal, setBal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const live = liveDeployment(rune.chain);
  const isSol = rune.chain === "solana";
  const walletOk = !!session && session.kind === (isSol ? "solana" : "evm");
  const chainName = isSol ? "Solana" : live?.name;

  const load = useCallback(async () => {
    const r = await getBtcStatus({ data: { id: rune.id } }).catch(() => null);
    if (r) {
      setSt(r);
      setRefreshedAt(Date.now());
    }
  }, [rune.id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!session || !walletOk) return;
    if (isSol) {
      loadSol()
        .then((m) => m.solTokenBalance(session.address, rune.id))
        .then((b) => setBal(b.token))
        .catch(() => {});
      return;
    }
    if (!live) return;
    tokenBalance(live, rune.id, session.address)
      .then((b) => setBal(Number(b) / 1e18))
      .catch(() => {});
  }, [live, session, rune.id, msg, isSol, walletOk]);

  const etch = st?.etch as { status: string; detail: string; commit_txid: string; reveal_txid: string; rune_ref: string; commit_confs?: number; reveal_confs?: number; created_at?: number } | null | undefined;
  const status = etch?.status ?? "queued";
  const etched = status === "etched";
  const addrOk = /^(bc1p[02-9ac-hj-np-z]{58}|bc1q[02-9ac-hj-np-z]{38,58})$/.test(addr.trim());

  const go = async () => {
    if (!session || (!live && !isSol)) return;
    setBusy(true);
    setMsg(null);
    try {
      const h = isSol
        ? await (await loadSol()).bridgeSolToBitcoin({ owner: session.address, mint: rune.id, amount: amt, btcAddress: addr.trim() })
        : await bridgeOutOnchain({ from: session.address, chain: rune.chain, token: rune.id, launchpad: rune.launchpad, amount: amt, btcAddress: addr.trim() });
      setMsg({ ok: true, text: `${isSol ? "Locked in the Runehood vault" : "Burned"} on ${chainName} (tx ${h.slice(0, 10)}…). Sent to Bitcoin within ~3 min, delivered after 1 block (≈10 min). Track it below.` });
      setAmt("");
      setTimeout(load, 8000);
      setTimeout(load, 25000);
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message).split("\n")[0] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="c-card p-4">
      <div className="flex items-center gap-2">
        <ChainIcon chain="bitcoin" size={18} />
        <h3 className="font-display font-semibold">Bitcoin</h3>
        <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: etched ? "rgba(61,220,151,.12)" : "rgba(247,147,26,.12)", color: etched ? "var(--c-up)" : "#F7B45A" }}>
          {STEP_TEXT[status] ?? status}
        </span>
      </div>
      {(status === "unavailable" || status === "failed") && etch?.detail && <p className="c-muted mt-2 text-xs">{etch.detail}</p>}
      <EtchProgress etch={etch} chainName={chainName ?? rune.chain} launchedAt={rune.created_at} refreshedAt={refreshedAt} />
      <div className="mt-3 space-y-1 text-xs">
        {etch?.commit_txid && (
          <a className="c-muted flex items-center gap-1 hover:text-white" href={MEMPOOL + etch.commit_txid} target="_blank" rel="noreferrer">
            Commit {etch.commit_txid.slice(0, 10)}… <External size={10} />
          </a>
        )}
        {etch?.reveal_txid && (
          <a className="c-muted flex items-center gap-1 hover:text-white" href={MEMPOOL + etch.reveal_txid} target="_blank" rel="noreferrer">
            Etching {etch.reveal_txid.slice(0, 10)}… <External size={10} />
          </a>
        )}
        {etched && (
          <div className="flex justify-between">
            <span className="c-dim">Rune id</span>
            <span className="font-mono" style={{ color: "#F7B45A" }}>{etch!.rune_ref}</span>
          </div>
        )}
        {st?.custody && (
          <div className="flex justify-between gap-2">
            <span className="c-dim">In custody</span>
            <a className="font-mono hover:underline" href={`https://mempool.space/address/${st.custody.address}`} target="_blank" rel="noreferrer">
              {fmtNum(Number(BigInt(st.custody.amount) / 10n ** 12n) / 1e6, 2)} · {shortAddr(st.custody.address ?? "")}
            </a>
          </div>
        )}
      </div>

      {etched && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--c-line)" }}>
          <div className="text-sm font-semibold">Bridge to Bitcoin</div>
          <p className="c-muted mt-0.5 text-xs">Moves {rune.ticker} off {chainName} and sends the same amount of the native Rune to your Bitcoin address.</p>
          {!walletOk ? (
            <div className="mt-3">
              <ConnectButton wide prefer={isSol ? "solana" : "evm"} label={isSol ? "Connect Solana wallet" : "Connect EVM wallet"} />
            </div>
          ) : (
            <>
              <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Amount (you hold ${fmtNum(bal, 2)})`} className="c-input mt-3 text-sm" />
              <input value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="bc1p… Taproot address (Runes-compatible wallet)" className="c-input mt-2 font-mono text-xs" />
              {addr && !addrOk && <p className="c-down mt-1 text-[11px]">Use a mainnet bc1p… (Taproot) or bc1q… address from a Runes wallet like Xverse, Unisat or Magic Eden.</p>}
              <button disabled={busy || !Number(amt) || Number(amt) > bal || !addrOk} onClick={go} className="mt-3 w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: "#F7931A", color: "#1a0d00" }}>
                {busy ? "Confirm in your wallet…" : "Bridge to Bitcoin"}
              </button>
            </>
          )}
          {msg && <p className={`mt-2 text-xs ${msg.ok ? "c-up" : "c-down"}`}>{msg.text}</p>}
          <a href="/account" className="c-rose mt-3 block text-center text-xs hover:underline">
            Bridge from Bitcoin back to {chainName} →
          </a>
        </div>
      )}

      {!!st?.outs?.length && (
        <div className="mt-4 space-y-1.5 border-t pt-3 text-xs" style={{ borderColor: "var(--c-line)" }}>
          <div className="c-dim">Recent bridges to Bitcoin</div>
          {(st.outs as Array<{ id: string; amount: string; btc_address: string; status: string; btc_txid: string; created_at: number; confs?: number }>).map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2">
              <span>
                {fmtNum(Number(BigInt(o.amount) / 10n ** 12n) / 1e6, 2)} → <span className="font-mono">{shortAddr(o.btc_address)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <OutProgress o={o} etched={etched} etchLeft={etchRemainingMs(etch)} refreshedAt={refreshedAt} />
                {o.btc_txid && (
                  <a href={MEMPOOL + o.btc_txid} target="_blank" rel="noreferrer" className="c-muted hover:text-white" title="View on mempool.space">
                    <External size={10} />
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
