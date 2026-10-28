import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { bridgeToBitcoin, getAccount, getRune, trade } from "../lib/api/carvy.functions";
import {
  CURVE_SUPPLY,
  QUOTE_INFO,
  TRADE_FEE,
  buyQuote,
  chainById,
  curveProgress,
  fmtAmount,
  fmtBtc,
  fmtNum,
  fmtUsd,
  mcapSats,
  priceSats,
  quoteToSats,
  satsToQuote,
  satsToUsd,
  sellQuote,
  shortAddr,
  timeAgo,
  TOTAL_SUPPLY,
  type Quote,
  type RuneRow,
} from "../lib/carvy";
import { useWallet } from "../lib/wallet";
import { ChainIcon, Copy, External, QuoteIcon, Shield } from "../components/carvy/icons";
import { Badge, BridgeBar } from "../components/carvy/rune-card";
import { Candles } from "../components/carvy/candles";
import { ConnectButton } from "../components/carvy/connect-button";
import { dexFor, liveDeployment, tokenBalance } from "../lib/onchain";
import { migrateOnchain, tradeOnchain } from "../lib/onchain-actions";
import { BitcoinPanel } from "../components/carvy/bitcoin-panel";
import { SolTradeBox } from "../components/carvy/sol-trade-box";

export const Route = createFileRoute("/rune/$id")({
  loader: async ({ params }) => {
    const d = await getRune({ data: { id: params.id } });
    if (!d.rune) throw notFound();
    return d as typeof d & { rune: RuneRow };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.rune
      ? [
          { title: `${loaderData.rune.ticker} · ${loaderData.rune.rune_name} | Runehood` },
          { name: "description", content: loaderData.rune.description || `${loaderData.rune.title} on Runehood` },
        ]
      : [],
  }),
  component: RunePage,
});

type Account = Awaited<ReturnType<typeof getAccount>>;

function RunePage() {
  const { rune, trades, holders, prices } = Route.useLoaderData();
  const router = useRouter();
  const { session } = useWallet();
  const [account, setAccount] = useState<Account>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const chain = chainById(rune.chain);

  const refreshAccount = useCallback(async () => {
    if (!session) return setAccount(null);
    setAccount(await getAccount({ data: { token: session.token } }).catch(() => null));
  }, [session]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      void router.invalidate();
    }, 6000);
    return () => clearInterval(t);
  }, [router]);

  const refreshAll = async () => {
    await Promise.all([router.invalidate(), refreshAccount()]);
  };

  const mc = mcapSats(rune.v_sats, rune.v_tokens);
  const prog = curveProgress(rune.sold);
  const holding = account?.holdings.find((h) => h.id === rune.id)?.balance ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
      <div className="c-card relative overflow-hidden p-5 sm:p-7">
        <div className="c-glow -right-24 -top-24 h-72 w-72 opacity-60" />
        <div className="relative flex flex-col gap-5 sm:flex-row">
          <img src={rune.image_url} alt="" className="h-24 w-24 shrink-0 rounded-2xl object-cover sm:h-28 sm:w-28" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{rune.ticker}</h1>
              {rune.is_platform ? <Badge tone="ruby">Platform token</Badge> : rune.graduated ? <Badge tone="up">Graduated</Badge> : <Badge>{rune.fee_mode}</Badge>}
              {rune.onchain ? <Badge tone="up">Mainnet</Badge> : <Badge tone="test">Testnet</Badge>}
            </div>
            <div className="c-muted mt-1 text-sm">
              <span className="c-rose font-mono">{rune.rune_name}</span> · {rune.title} · by {rune.creator === "Runehood" ? "Runehood" : shortAddr(rune.creator)} · {timeAgo(rune.created_at, now)}
            </div>
            <div className="mt-4 max-w-xl">
              <BridgeBar rune={rune} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(rune.id);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono"
                style={{ background: "var(--c-bg)" }}
              >
                <Copy size={12} /> {copied ? "Copied" : `ID ${rune.id.slice(0, 5)}…${rune.id.slice(-5)}`}
              </button>
              <span className="flex items-center gap-1.5 rounded-full border px-3 py-1.5" style={{ background: "var(--c-bg)" }}>
                <ChainIcon chain={chain.id} size={13} /> Trades on {chain.name}
              </span>
              {rune.rune_ref ? (
                <a href={rune.onchain ? `https://mempool.space/block/${rune.rune_ref.split(":")[0]}` : `https://mempool.space/testnet4/block/${rune.rune_ref.split(":")[0]}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold" style={{ background: "#F7931A", color: "#1a0d00" }}>
                  <ChainIcon chain="bitcoin" size={13} /> Rune {rune.rune_ref} <External size={11} />
                </a>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: "rgba(247,147,26,.12)", color: "#F7B45A" }} title={rune.onchain ? "The Bitcoin etch runs when Runehood custody goes live. Your Rune is queued." : undefined}>
                  <ChainIcon chain="bitcoin" size={13} /> {rune.onchain ? "Bitcoin etching in progress" : "Etching on Bitcoin…"}
                </span>
              )}
              {!rune.onchain && (
                <Link to="/verify" className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 c-up" style={{ background: "var(--c-bg)" }}>
                  <Shield size={12} /> Backed 1:1 · Verify
                </Link>
              )}
              {rune.website && <SocialLink href={rune.website}>Website</SocialLink>}
              {rune.x_url && <SocialLink href={rune.x_url}>X</SocialLink>}
              {rune.tg_url && <SocialLink href={rune.tg_url}>Telegram</SocialLink>}
            </div>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-4 border-t pt-5 sm:grid-cols-5" style={{ borderColor: "var(--c-line)" }}>
          <Metric label="Market cap" value={fmtUsd(satsToUsd(mc, prices))} sub={fmtBtc(mc)} />
          <Metric label="Price per 1M" value={`${fmtNum(priceSats(rune.v_sats, rune.v_tokens) * 1e6, 0)} sats`} />
          <Metric label="In the pool" value={fmtBtc(rune.real_sats)} sub={fmtUsd(satsToUsd(rune.real_sats, prices))} />
          <Metric label="Curve" value={rune.graduated ? "Graduated" : `${prog.toFixed(2)}%`} />
          <Metric label="Volume" value={fmtUsd(satsToUsd(rune.volume_sats, prices))} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <Candles trades={trades} createdAt={rune.created_at} prices={prices} />
          <div className="c-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Bonding curve</h3>
              <span className="font-display text-lg font-semibold" style={{ color: prog >= 100 ? "var(--c-up)" : "var(--c-rose)" }}>
                {prog.toFixed(2)}%
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--c-surface-2)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${prog}%`, background: prog >= 100 ? "var(--c-up)" : "var(--c-grad)" }} />
            </div>
            <p className="c-muted mt-3 text-sm">
              {rune.graduated
                ? `Graduated. Liquidity moved to the ${chain.short} pool and the Rune keeps trading 1:1 with Bitcoin.`
                : `${fmtNum(Math.max(0, CURVE_SUPPLY - rune.sold), 1)} ${rune.ticker} left on the curve. When it sells out the Rune graduates to a ${chain.short} pool.`}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
              <Mini label="Creator fees" value={fmtBtc(rune.creator_fees_sats)} />
              <Mini label="Platform fees" value={fmtBtc(rune.platform_fees_sats)} />
              <Mini label="Fee mode" value={rune.fee_mode === "dev" ? "Dev" : rune.fee_mode === "holders" ? "Holders" : "Routed"} />
            </div>
          </div>
          <TradesTable trades={trades} ticker={rune.ticker} now={now} />
        </div>

        <div className="space-y-5">
          {rune.onchain && rune.chain === "solana" ? <SolTradeBox rune={rune} onDone={refreshAll} /> : <TradeBox rune={rune} prices={prices} account={account} holding={holding} onDone={refreshAll} />}
          {rune.onchain ? <BitcoinPanel rune={rune} /> : <BridgeBox rune={rune} holding={holding} onDone={refreshAll} />}
          <div className="c-card p-5">
            <h3 className="font-display font-semibold">Holders</h3>
            {rune.description && <p className="c-muted mt-1 text-xs">{rune.description}</p>}
            <div className="mt-3 space-y-1.5 text-sm">
              {holders.length === 0 && <p className="c-dim text-xs">No holders yet.</p>}
              {holders.map((h, i) => (
                <div key={h.wallet} className="flex justify-between">
                  <span className="c-muted font-mono text-xs">
                    {i + 1}. {shortAddr(h.wallet)} {h.wallet === rune.creator && <span className="c-rose">(dev)</span>}
                  </span>
                  <span className="text-xs">{((h.balance / TOTAL_SUPPLY) * 100).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SocialLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer nofollow" className="flex items-center gap-1 rounded-full border px-3 py-1.5 c-muted hover:text-white" style={{ background: "var(--c-bg)" }}>
      {children} <External size={11} />
    </a>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="c-dim text-xs">{label}</div>
      <div className="font-display mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="c-muted text-xs">{sub}</div>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="c-card-2 p-3">
      <div className="c-dim">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}

function TradeBox({ rune, prices, account, holding, onDone }: { rune: RuneRow; prices: { BTC: number; ETH: number; SOL: number; updated: number }; account: Account; holding: number; onDone: () => Promise<void> }) {
  const chain = chainById(rune.chain);
  const { session } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quote, setQuote] = useState<Quote>(rune.quote);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [market, setMarket] = useState<"chain" | "btc">("chain");

  const live = rune.onchain ? liveDeployment(rune.chain) : null;
  const [chainBal, setChainBal] = useState<{ q: number; t: number } | null>(null);
  useEffect(() => {
    if (!live || !session || session.kind !== "evm") return setChainBal(null);
    const qa = live.quotes[quote];
    if (!qa) return;
    let off = false;
    Promise.all([tokenBalance(live, qa.address, session.address), tokenBalance(live, rune.id, session.address)])
      .then(([q, t]) => !off && setChainBal({ q: Number(q) / 10 ** qa.decimals, t: Number(t) / 1e18 }))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [live, session, quote, rune.id, msg]);
  const qbal = live ? (chainBal?.q ?? 0) : (account?.balances.find((b) => b.chain === rune.chain && b.asset === quote)?.amount ?? 0);
  const tokenBal = live ? (chainBal?.t ?? 0) : holding;
  const n = Number(amount) || 0;
  const wrongWallet = session && session.kind !== chain.kind;

  const est = useMemo(() => {
    if (n <= 0) return null;
    if (side === "buy") {
      const q = buyQuote(rune.v_sats, rune.v_tokens, quoteToSats(quote, n, prices));
      return `${fmtNum(q.tokens, 2)} ${rune.ticker}`;
    }
    const q = sellQuote(rune.v_sats, rune.v_tokens, n);
    return `${fmtAmount(satsToQuote(quote, q.sats, prices))} ${quote}`;
  }, [n, side, quote, rune, prices]);

  const submit = async () => {
    if (!session || n <= 0) return;
    setBusy(true);
    setMsg(null);
    try {
      if (live) {
        const r = await tradeOnchain({ from: session.address, chain: rune.chain, token: rune.id, side, quote, amount, launchpad: rune.launchpad });
        setMsg({ ok: true, text: side === "buy" ? `Bought about ${fmtNum(r.expected, 2)} ${rune.ticker} · tx ${r.hash.slice(0, 10)}…` : `Sold for about ${fmtAmount(r.expected)} ${quote} · tx ${r.hash.slice(0, 10)}…` });
        setAmount("");
        await onDone();
        return;
      }
      const r = await trade({ data: { token: session.token, id: rune.id, side, quote: quote as never, amount: n } });
      setMsg({ ok: true, text: side === "buy" ? `Bought ${fmtNum(r.tokens, 2)} ${rune.ticker}` : `Sold for ${fmtAmount(r.out)} ${quote}` });
      setAmount("");
      await onDone();
    } catch (e) {
      setMsg({ ok: false, text: String((e as Error).message).split("\n")[0] });
    } finally {
      setBusy(false);
    }
  };

  const quick = side === "buy" ? QUOTE_INFO[quote].quick.map(String) : ["25", "50", "100"];

  if (live && rune.graduated) {
    const dex = dexFor(rune.chain, rune.launchpad, rune.id, rune.quote_address);
    const uni = dex.url;
    return (
      <div className="c-card p-5 text-center">
        <div className="font-display text-lg font-semibold">Graduated</div>
        {rune.migrated ? (
          <>
            <p className="c-muted mt-1 text-sm">Liquidity is locked in its {dex.pool} on {chain.name}.{rune.buy_tax || rune.sell_tax ? ` Creator tax ${(rune.buy_tax ?? 0) / 100}% buy / ${(rune.sell_tax ?? 0) / 100}% sell applies there too.` : ""}</p>
            <a href={uni} target="_blank" rel="noreferrer" className="mt-4 block w-full rounded-full py-3 text-sm font-semibold text-white" style={{ background: "var(--c-grad)" }}>
              Trade on {dex.name}
            </a>
          </>
        ) : rune.launchpad && rune.launchpad.toLowerCase() === live.launchpad.toLowerCase() ? (
          <>
            <p className="c-muted mt-1 text-sm">The curve is complete. One transaction moves the liquidity into {dex.name === "PancakeSwap" ? "PancakeSwap" : "Uniswap V4"}. Anyone can do it.</p>
            {session && session.kind === "evm" ? (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setMsg(null);
                  try {
                    await migrateOnchain({ from: session.address, chain: rune.chain, token: rune.id, launchpad: rune.launchpad });
                    await onDone();
                  } catch (e) {
                    setMsg({ ok: false, text: String((e as Error).message).split("\n")[0] });
                  } finally {
                    setBusy(false);
                  }
                }}
                className="mt-4 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--c-grad)" }}
              >
                {busy ? "Confirm in your wallet…" : `Move liquidity to ${dex.name === "PancakeSwap" ? "PancakeSwap" : "Uniswap V4"}`}
              </button>
            ) : (
              <div className="mt-4">
                <ConnectButton wide prefer="evm" label="Connect EVM wallet" />
              </div>
            )}
          </>
        ) : (
          <p className="c-muted mt-1 text-sm">This Rune launched on the first Runehood contract, which graduates into Uniswap V2.</p>
        )}
        {msg && <p className={`mt-3 text-xs ${msg.ok ? "c-up" : "c-down"}`}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <div className="c-card p-4">
      <div className="flex rounded-full border p-1" style={{ background: "var(--c-bg)" }}>
        <button onClick={() => setMarket("chain")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold ${market === "chain" ? "text-white" : "c-muted"}`} style={market === "chain" ? { background: "var(--c-grad)" } : undefined}>
          <ChainIcon chain={chain.id} size={14} /> {chain.short} Market
        </button>
        <button onClick={() => setMarket("btc")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold ${market === "btc" ? "text-white" : "c-muted"}`} style={market === "btc" ? { background: "#F7931A" } : undefined}>
          <ChainIcon chain="bitcoin" size={14} /> Bitcoin Market
        </button>
      </div>

      {market === "btc" ? (
        <div className="c-card-2 mt-4 p-4 text-sm">
          <p className="font-semibold">Native Rune on Bitcoin</p>
          <p className="c-muted mt-1 text-xs leading-relaxed">
            {rune.onchain
              ? rune.rune_ref
                ? `Rune ${rune.rune_ref} lives on Bitcoin. Use "Bridge to Bitcoin" below to move ${rune.ticker} 1:1 to your Bitcoin wallet, then trade it on any Runes marketplace.`
                : `${rune.ticker} trades on ${chain.name} now. Its Bitcoin Rune is being etched; bridging opens as soon as it is confirmed.`
              : rune.rune_ref
                ? `Rune ${rune.rune_ref} lives on Bitcoin. Bridge your ${rune.ticker} to a Bitcoin address below, then trade it on any Runes marketplace.`
                : "The Rune is being etched. The Bitcoin market opens a few blocks after launch."}
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "var(--c-bg)" }}>
            <button onClick={() => { setSide("buy"); setAmount(""); }} className={`rounded-lg py-2 text-sm font-semibold ${side === "buy" ? "text-[#04150d]" : "c-muted"}`} style={side === "buy" ? { background: "var(--c-up)" } : undefined}>
              Buy
            </button>
            <button onClick={() => { setSide("sell"); setAmount(""); }} className={`rounded-lg py-2 text-sm font-semibold ${side === "sell" ? "text-white" : "c-muted"}`} style={side === "sell" ? { background: "var(--c-down)" } : undefined}>
              Sell
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs">
            <span className="c-muted">{side === "buy" ? "Pay with" : "Receive in"}</span>
            {(live ? (Object.keys(live.quotes) as Quote[]).filter((q) => q === rune.quote) : chain.quotes).map((q) => (
              <button key={q} onClick={() => setQuote(q)} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold ${quote === q ? "text-white" : "c-muted"}`} style={quote === q ? { background: "rgba(47,210,122,.15)", borderColor: "var(--c-ruby)" } : { background: "var(--c-bg)" }}>
                <QuoteIcon quote={q} size={13} /> {q}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center rounded-xl border px-4 py-3" style={{ background: "var(--c-bg)", borderColor: "var(--c-line-2)" }}>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0.0" className="font-display w-full bg-transparent text-2xl outline-none placeholder:text-[var(--c-dim)]" />
            <span className="c-muted shrink-0 text-sm font-semibold">{side === "buy" ? quote : rune.ticker}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <div className="flex gap-1.5">
              {quick.map((v) => (
                <button key={v} onClick={() => setAmount(side === "buy" ? v : String(Math.floor((tokenBal * Number(v)) / 100)))} className="rounded-full border px-2.5 py-1 c-muted hover:text-white" style={{ background: "var(--c-bg)" }}>
                  {side === "buy" ? v : `${v}%`}
                </button>
              ))}
            </div>
            {session && <span className="c-dim">Bal: {side === "buy" ? `${fmtAmount(qbal)} ${quote}` : `${fmtNum(tokenBal, 1)} ${rune.ticker}`}</span>}
          </div>
          <div className="mt-4 flex justify-between text-sm">
            <span className="c-muted">You receive</span>
            <span className="font-semibold">{est ?? "—"}</span>
          </div>
          {live && <p className="c-dim mt-1 text-[11px]">On-chain on {chain.name}. Max 5% slippage.</p>}
          {live && (rune.buy_tax || rune.sell_tax) ? <p className="c-dim mt-1 text-[11px]">Creator tax {(rune.buy_tax ?? 0) / 100}% buy · {(rune.sell_tax ?? 0) / 100}% sell, also after graduation.</p> : null}
          <p className="c-dim mt-1 text-[11px]">Trading fee {(TRADE_FEE * 100).toFixed(0)}%: half to the creator ({rune.fee_mode}), half to the platform.</p>
          <div className="mt-4">
            {!session ? (
              <ConnectButton wide prefer={chain.kind} label={chain.kind === "solana" ? "Connect Solana wallet" : "Connect EVM wallet"} />
            ) : wrongWallet ? (
              <p className="c-card-2 p-3 text-center text-xs c-rose">This Rune trades on {chain.name}. Disconnect and connect {chain.kind === "solana" ? "a Solana" : "an EVM"} wallet.</p>
            ) : (
              <button disabled={busy || n <= 0} onClick={submit} className="w-full rounded-full py-3.5 text-base font-semibold transition hover:brightness-110 disabled:opacity-50" style={side === "buy" ? { background: "var(--c-up)", color: "#04150d" } : { background: "var(--c-down)", color: "#fff" }}>
                {busy ? "Confirming…" : side === "buy" ? `Buy ${rune.ticker}` : `Sell ${rune.ticker}`}
              </button>
            )}
          </div>
          {msg && <p className={`mt-3 text-center text-xs ${msg.ok ? "c-up" : "c-down"}`}>{msg.text}</p>}
          {!live && session && !wrongWallet && qbal === 0 && side === "buy" && (
            <p className="c-dim mt-3 text-center text-xs">
              No test {quote} yet. <Link to="/account" className="c-rose underline">Claim from the faucet</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BridgeBox({ rune, holding, onDone }: { rune: RuneRow; holding: number; onDone: () => Promise<void> }) {
  const { session } = useWallet();
  const [amt, setAmt] = useState("");
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!session || holding <= 0 || rune.onchain) return null;
  const go = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await bridgeToBitcoin({ data: { token: session.token, id: rune.id, amount: Number(amt), btcAddress: addr.trim() } });
      setMsg({ ok: true, text: "Queued. Your Rune will be sent to that Bitcoin address." });
      setAmt("");
      await onDone();
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
        <h3 className="font-display font-semibold">Bridge to Bitcoin</h3>
      </div>
      <p className="c-muted mt-1 text-xs">Move {rune.ticker} 1:1 to a Bitcoin address as the native Rune.</p>
      <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={`Amount (max ${fmtNum(holding, 1)})`} className="c-input mt-3 text-sm" />
      <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="tb1p… Bitcoin address" className="c-input mt-2 font-mono text-xs" />
      <button disabled={busy || !Number(amt) || addr.length < 20} onClick={go} className="mt-3 w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: "#F7931A", color: "#1a0d00" }}>
        {busy ? "Bridging…" : "Bridge to Bitcoin"}
      </button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "c-up" : "c-down"}`}>{msg.text}</p>}
    </div>
  );
}

function TradesTable({ trades, ticker, now }: { trades: Array<{ id: number; trader: string; side: "buy" | "sell"; tokens: number; quote: string; quote_amount: number; usd: number; created_at: number; tx: string }>; ticker: string; now: number }) {
  return (
    <div className="c-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <h3 className="font-display text-lg font-semibold">Trades</h3>
        <span className="c-dim text-xs">{trades.length} recent</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="c-dim border-t text-left text-xs" style={{ borderColor: "var(--c-line)" }}>
              <th className="px-5 py-2 font-medium">Trader</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">USD</th>
              <th className="px-3 py-2 font-medium">Paid / got</th>
              <th className="px-3 py-2 font-medium">{ticker}</th>
              <th className="px-5 py-2 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 40).map((t) => (
              <tr key={t.id} className="border-t" style={{ borderColor: "var(--c-line)" }}>
                <td className="c-muted px-5 py-2 font-mono text-xs">{shortAddr(t.trader)}</td>
                <td className={`px-3 py-2 text-xs font-semibold ${t.side === "buy" ? "c-up" : "c-down"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
                <td className="px-3 py-2 text-xs">{fmtUsd(t.usd)}</td>
                <td className="px-3 py-2 text-xs">
                  {fmtAmount(t.quote_amount)} {t.quote}
                </td>
                <td className="px-3 py-2 text-xs">{fmtNum(t.tokens, 1)}</td>
                <td className="c-dim px-5 py-2 text-right text-xs">{timeAgo(t.created_at, now)}</td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td colSpan={6} className="c-dim px-5 py-8 text-center text-xs">
                  No trades yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
