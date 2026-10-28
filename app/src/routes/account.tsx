import { createFileRoute, Link } from "@tanstack/react-router";
import { getHolderRewards } from "../lib/api/carvy.functions";
import { claimHolderRewardOnchain } from "../lib/onchain-actions";
import { DEPLOYMENTS } from "../lib/onchain";
import { SOL_FEE_WALLET } from "../lib/sol/config";
import { loadSol } from "../lib/sol/load";
import { getSolPools } from "../lib/api/carvy.functions";
import { InProgress, IncomingRow } from "../components/carvy/progress";
import { useCallback, useEffect, useState } from "react";

import { claimFaucet, getAccount, getDepositInfo } from "../lib/api/carvy.functions";
import { chainById, fmtAmount, fmtBtc, fmtNum, fmtUsd, mcapSats, priceSats, satsToUsd, shortAddr, timeAgo, usdPerQuote, type Quote } from "../lib/carvy";
import { useWallet } from "../lib/wallet";
import { ChainIcon, QuoteIcon } from "../components/carvy/icons";
import { ConnectButton } from "../components/carvy/connect-button";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account | Runehood" }] }),
  component: Account,
});

type Acc = Awaited<ReturnType<typeof getAccount>>;

function Account() {
  const { session, disconnect } = useWallet();
  const [acc, setAcc] = useState<Acc>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    if (!session) return setAcc(null);
    setLoading(true);
    const a = await getAccount({ data: { token: session.token } }).catch(() => null);
    if (!a) void disconnect();
    setAcc(a);
    setLoading(false);
  }, [session, disconnect]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!mounted || !session) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-20 text-center">
        <img src="/assets/hero-stone.webp" alt="" className="c-float h-36 w-36" />
        <h1 className="font-display mt-6 text-3xl font-bold">Your account</h1>
        <p className="c-muted mt-2 text-sm">Connect a wallet to see your Runes, claim test funds and track bridges to Bitcoin.</p>
        <div className="mt-6 w-full max-w-xs">
          <ConnectButton wide />
        </div>
      </div>
    );
  }

  const faucetReady = !acc || acc.faucetAt <= Date.now();
  const claim = async () => {
    setMsg(null);
    try {
      await claimFaucet({ data: { token: session.token } });
      setMsg({ ok: true, text: "Test funds added to every chain your wallet supports." });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message).split("\n")[0] });
    }
  };

  const portfolio = acc ? acc.holdings.reduce((s, h) => s + satsToUsd(priceSats(h.v_sats, h.v_tokens) * h.balance, acc.prices), 0) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="c-eyebrow">Account</span>
          <h1 className="font-display mt-2 flex items-center gap-3 text-4xl font-bold">
            <ChainIcon chain={session.kind === "solana" ? "solana" : "ethereum"} size={30} />
            <span className="font-mono text-3xl">{shortAddr(session.address)}</span>
          </h1>
          <p className="c-muted mt-1 text-sm">{session.kind === "solana" ? "Solana wallet · trades Solana Runes" : "EVM wallet · trades Robinhood Chain, Ethereum and Base Runes"}</p>
        </div>
        <div className="text-right">
          <div className="c-dim text-xs">Rune portfolio</div>
          <div className="font-display text-3xl font-bold">{fmtUsd(portfolio)}</div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <div className="c-card relative overflow-hidden p-6">
            <div className="c-glow -right-16 -top-16 h-52 w-52" />
            <h2 className="font-display relative text-xl font-semibold">Testnet faucet</h2>
            <p className="c-muted relative mt-1 text-sm">Free test {session.kind === "solana" ? "SOL, WBTC and USDC on Solana" : "ETH, WBTC, cbBTC and USDC on Robinhood Chain, Ethereum and Base"}. Once every 24 hours.</p>
            <button disabled={!faucetReady || loading} onClick={claim} className="relative mt-4 rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40" style={{ background: "var(--c-grad)" }}>
              {faucetReady ? "Claim test funds" : `Next claim ${new Date(acc!.faucetAt).toLocaleTimeString()}`}
            </button>
            {msg && <p className={`relative mt-3 text-xs ${msg.ok ? "c-up" : "c-down"}`}>{msg.text}</p>}
          </div>
          <div className="c-card p-6">
            <h2 className="font-display text-xl font-semibold">Balances</h2>
            <div className="mt-4 space-y-2">
              {acc?.balances.length ? (
                acc.balances.map((b) => (
                  <div key={`${b.chain}-${b.asset}`} className="c-card-2 flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="relative">
                        <QuoteIcon quote={b.asset} size={26} />
                        <span className="absolute -bottom-1 -right-1">
                          <ChainIcon chain={chainById(b.chain).id} size={13} />
                        </span>
                      </span>
                      <div>
                        <div className="text-sm font-semibold">{b.asset}</div>
                        <div className="c-dim text-xs">{chainById(b.chain).name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{fmtAmount(b.amount)}</div>
                      <div className="c-dim text-xs">{fmtUsd(b.amount * usdPerQuote(b.asset as Quote, acc.prices))}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="c-dim text-sm">{loading ? "Loading…" : "No balances yet. Claim from the faucet above."}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="c-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">Your Runes</h2>
              <Link to="/runes" className="c-rose text-sm hover:underline">Find Runes</Link>
            </div>
            <div className="mt-4 space-y-2">
              {acc?.holdings.length ? (
                acc.holdings.map((h) => {
                  const value = satsToUsd(priceSats(h.v_sats, h.v_tokens) * h.balance, acc.prices);
                  return (
                    <Link key={h.id} to="/rune/$id" params={{ id: h.id }} className="c-card-2 flex items-center gap-3 px-4 py-3 transition hover:border-[var(--c-line-2)]">
                      <img src={h.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold">
                          {h.ticker} <ChainIcon chain={chainById(h.chain).id} size={13} />
                        </div>
                        <div className="c-dim text-xs">
                          {fmtNum(h.balance, 2)} · mcap {fmtBtc(mcapSats(h.v_sats, h.v_tokens))}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">{fmtUsd(value)}</div>
                    </Link>
                  );
                })
              ) : (
                <p className="c-dim text-sm">No Runes yet. Buy one or etch your own.</p>
              )}
            </div>
          </div>
          <DepositCard token={session.token} />
          {session.kind === "evm" && <HolderRewardsCard token={session.token} address={session.address} />}
          {session.kind === "solana" && session.address === SOL_FEE_WALLET && <PlatformFeesCard owner={session.address} />}
          <div className="c-card p-6">
            <h2 className="font-display text-xl font-semibold">Bridges to Bitcoin</h2>
            <div className="mt-4 space-y-2 text-sm">
              {acc?.bridges.length ? (
                acc.bridges.map((b) => (
                  <div key={b.id} className="c-card-2 flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-semibold">
                        {fmtNum(b.amount, 1)} {b.ticker}
                      </div>
                      <div className="c-dim font-mono text-xs">to {shortAddr(b.btc_address)}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-semibold" style={{ color: "#F7B45A" }}>
                        {b.status}
                      </div>
                      <div className="c-dim">{timeAgo(b.created_at)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="c-dim">Nothing bridged yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DepositCard({ token }: { token: string }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getDepositInfo>> | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let off = false;
    const load = () => getDepositInfo({ data: { token } }).then((r) => !off && setInfo(r)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, [token]);
  if (!info?.address) return null;
  return (
    <div className="c-card p-6">
      <div className="flex items-center gap-2">
        <ChainIcon chain="bitcoin" size={20} />
        <h2 className="font-display text-xl font-semibold">Bridge from Bitcoin</h2>
      </div>
      <p className="c-muted mt-1 text-sm">Send Runehood Runes from your Bitcoin wallet to your personal deposit address. After 3 confirmations they are moved into custody and, 2 blocks later, the same amount is minted to this wallet on the Rune's chain. Usually 50–60 minutes in total; progress shows here live.</p>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(info.address!);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        className="c-card-2 mt-4 w-full break-all px-4 py-3 text-left font-mono text-xs hover:border-[var(--c-line-2)]"
      >
        {copied ? "Copied" : info.address}
      </button>
      <p className="c-dim mt-2 text-[11px]">Only send Runes created on Runehood, one Rune type at a time. Other Runes or inscriptions sent here are held for manual review.</p>
      {info.incoming && info.incoming.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {info.incoming.map((i) => (
            <IncomingRow key={i.txid} txid={i.txid} confs={i.confs} />
          ))}
        </div>
      )}
      {info.deposits.length > 0 && (
        <div className="mt-4 space-y-1.5 text-sm">
          {info.deposits.map((d) => (
            <div key={d.id} className="c-card-2 flex items-center justify-between px-4 py-2.5 text-xs">
              <span>
                {fmtNum(Number(BigInt(d.amount) / 10n ** 12n) / 1e6, 2)} {d.ticker}
              </span>
              {d.status === "minted" ? <span className="c-up">Minted on {chainById(d.chain).short}</span> : <InProgress d={d} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformFeesCard({ owner }: { owner: string }) {
  const [rows, setRows] = useState<Array<{ pool: string; sol: number; ticker: string }> | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = async () => {
    const pools = await getSolPools();
    const fees = await (await loadSol()).platformFees(owner, pools.map((p) => p.launchpad));
    setRows(fees.map((f) => ({ ...f, ticker: pools.find((p) => p.launchpad === f.pool)?.ticker ?? "?" })));
  };
  useEffect(() => {
    void load().catch(() => setRows([]));
  }, [owner]);
  const total = (rows ?? []).reduce((a, r) => a + r.sol, 0);
  return (
    <div className="c-card p-6">
      <h2 className="font-display text-xl font-semibold">Platform fees (Solana)</h2>
      <p className="c-muted mt-1 text-sm">Runehood's share of trading fees on every Solana Rune. Unclaimed: {rows ? `${total.toFixed(4)} SOL` : "loading…"}</p>
      <div className="mt-4 space-y-1.5">
        {(rows ?? []).filter((r) => r.sol > 0).map((r) => (
          <div key={r.pool} className="c-card-2 flex items-center justify-between px-4 py-2.5 text-xs">
            <span>
              {r.ticker} · {r.sol.toFixed(4)} SOL
            </span>
            <button
              disabled={!!busy}
              onClick={async () => {
                setBusy(r.pool);
                try {
                  const sig = await (await loadSol()).claimPlatformFees(owner, r.pool);
                  setMsg(`Claimed · ${sig.slice(0, 10)}…`);
                  await load();
                } catch (e) {
                  setMsg(String((e as Error).message).slice(0, 160));
                } finally {
                  setBusy("");
                }
              }}
              className="rounded-full px-3 py-1.5 font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--c-grad)" }}
            >
              {busy === r.pool ? "Claiming…" : "Claim"}
            </button>
          </div>
        ))}
      </div>
      <button
        disabled={!!busy}
        onClick={async () => {
          setBusy("raydium");
          try {
            const sigs = await (await loadSol()).claimRaydiumPlatformFees(owner);
            setMsg(sigs.length ? `Raydium platform fees claimed (${sigs.length} tx)` : "Nothing to claim on Raydium yet");
          } catch (e) {
            setMsg(String((e as Error).message).slice(0, 160));
          } finally {
            setBusy("");
          }
        }}
        className="mt-4 rounded-full border px-4 py-2 text-xs font-semibold c-muted hover:text-white disabled:opacity-50"
      >
        {busy === "raydium" ? "Claiming…" : "Claim Raydium LaunchLab platform fees"}
      </button>
      {msg && <p className="c-dim mt-3 text-xs">{msg}</p>}
    </div>
  );
}

function HolderRewardsCard({ token, address }: { token: string; address: string }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getHolderRewards>> | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => getHolderRewards({ data: { token } }).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    void load();
  }, [token]);
  if (!rows || !rows.length) return null;
  const label = (chain: string, asset: string) => {
    const d = DEPLOYMENTS[chain as "ethereum"];
    const q = d && Object.entries(d.quotes).find(([, v]) => v?.address.toLowerCase() === asset.toLowerCase());
    return q ? q[0] : "tokens";
  };
  const dec = (chain: string, asset: string) => {
    const d = DEPLOYMENTS[chain as "ethereum"];
    return (d && Object.values(d.quotes).find((v) => v?.address.toLowerCase() === asset.toLowerCase())?.decimals) ?? 18;
  };
  return (
    <div className="c-card p-6">
      <h2 className="font-display text-xl font-semibold">Holder rewards</h2>
      <p className="c-muted mt-1 text-sm">Your share of creator fees from Runes in Holders mode, updated every 6 hours.</p>
      <div className="mt-4 space-y-1.5">
        {rows.map((r) => {
          const id = `${r.chain}:${r.asset}`;
          return (
            <div key={id} className="c-card-2 flex items-center justify-between px-4 py-2.5 text-xs">
              <span>
                {(Number(BigInt(r.claimable)) / 10 ** dec(r.chain, r.asset)).toPrecision(4)} {label(r.chain, r.asset)} · {DEPLOYMENTS[r.chain as "ethereum"]?.name}
              </span>
              <button
                disabled={!!busy}
                onClick={async () => {
                  setBusy(id);
                  try {
                    const h = await claimHolderRewardOnchain({ from: address, chain: r.chain, vault: r.vault, asset: r.asset, cumulative: r.cumulative, proof: r.proof });
                    setMsg(`Claimed · ${h.slice(0, 10)}…`);
                    await load();
                  } catch (e) {
                    setMsg(String((e as Error).message).split("\n")[0].slice(0, 160));
                  } finally {
                    setBusy("");
                  }
                }}
                className="rounded-full px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--c-grad)" }}
              >
                {busy === id ? "Claiming…" : "Claim"}
              </button>
            </div>
          );
        })}
      </div>
      {msg && <p className="c-dim mt-3 text-xs">{msg}</p>}
    </div>
  );
}
