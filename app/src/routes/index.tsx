import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getHome } from "../lib/api/carvy.functions";
import { CHAINS, STOCKS, STOCK_INFO, fmtBtc, fmtNum, fmtUsd, timeAgo, type Stock } from "../lib/carvy";
import { ArrowRight, ChainIcon, QuoteIcon, Shield } from "../components/carvy/icons";
import { RuneCard } from "../components/carvy/rune-card";
import { BurnBar, CopyCa, RuneStats, useRuneToken } from "../components/carvy/rune-token";
import { RUNE_TOKEN } from "../lib/rune-token";

export const Route = createFileRoute("/")({
  loader: () => getHome(),
  component: Home,
});

function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function useLiveRefresh(ms = 10_000) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => void router.invalidate(), ms);
    return () => clearInterval(t);
  }, [router, ms]);
}

function Home() {
  const data = Route.useLoaderData();
  const now = useNow();
  useLiveRefresh();
  const { stats, prices } = data;
  return (
    <div>
      <Hero />
      {/* Stats */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="c-card grid grid-cols-2 divide-y lg:grid-cols-4 lg:divide-x lg:divide-y-0" style={{ borderColor: "var(--c-line)" }}>
          <Stat big={`${stats.runes}`} label="Runes live on mainnet" extra={<span className="c-dim">{stats.graduated} graduated · plus {stats.testnetRunes} testnet demos</span>} />
          <Stat big={fmtUsd(stats.volumeUsd)} label="traded on Runehood" extra={<span className="c-dim">{fmtUsd(stats.volume24Usd)} in the last 24 hours</span>} />
          <Stat big={fmtNum(stats.traders, 0)} label="traders" extra={<span className="c-dim">{fmtNum(stats.traders24, 0)} in the last 24 hours</span>} />
          <Stat big={fmtBtc(stats.paidSats)} label="earned by creators" extra={<span className="c-dim">claimable on chain</span>} />
        </div>
      </section>

      <HowItWorks />
      <StockPairs stocks={prices.stocks} />

      {/* Top Runes */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <span className="c-eyebrow">Trending</span>
            <h2 className="font-display mt-2 text-3xl font-bold sm:text-4xl">Hot Runes</h2>
          </div>
          <Link to="/runes" className="c-muted hidden items-center gap-1.5 text-sm hover:text-white sm:flex">
            All Runes <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.top.map((r) => (
            <RuneCard key={r.id} rune={r} prices={prices} now={now} />
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Link to="/runes" className="flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition hover:border-[var(--c-ruby)] hover:text-white" style={{ background: "var(--c-surface)" }}>
            View all Runes <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* Activity */}
      <section id="activity" className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <span className="c-eyebrow">Live feed</span>
            <h2 className="font-display mt-2 text-3xl font-bold sm:text-4xl">On chain right now</h2>
          </div>
          <p className="c-muted max-w-sm text-sm sm:text-right">Every line is a trade, launch, etch or bridge on Runehood. Updates every few seconds.</p>
        </div>
        <div className="c-card mt-8 divide-y overflow-hidden" style={{ borderColor: "var(--c-line)" }}>
          {data.activity.length === 0 && <div className="c-muted p-8 text-center text-sm">Quiet for now. Be the first to etch a Rune.</div>}
          {data.activity.map((a) => (
            <Link key={a.id} to="/rune/$id" params={{ id: a.rune_id }} className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-white/[.025]">
              <ActivityDot kind={a.kind} />
              <span className="min-w-0 flex-1 truncate">
                {a.kind === "buy" || a.kind === "sell" ? (
                  <>
                    <span className={a.kind === "buy" ? "c-up" : "c-down"}>{a.kind === "buy" ? "Bought" : "Sold"}</span> {fmtUsd(a.usd)} of <b className="font-semibold">{a.ticker}</b>
                  </>
                ) : (
                  a.text.replace(/ on [A-Z][a-z]+vy$/, " on Runehood")
                )}
              </span>
              <span className="c-dim shrink-0 text-xs">{timeAgo(a.created_at, now)}</span>
              <span className="hidden shrink-0 items-center gap-1.5 text-xs c-muted sm:flex">
                {a.chain && a.chain !== "bitcoin" ? <ChainIcon chain={a.chain as never} size={14} /> : <ChainIcon chain="bitcoin" size={14} />}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <Journey />

      {/* $RUNE */}
      <RuneSection />

      {/* Monumental */}
      <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
        <h2 className="font-display text-[11vw] font-bold uppercase leading-[.95] tracking-[-0.03em] sm:text-[6.5rem]">
          Etch once.
          <br />
          <span className="text-grad">Trade everywhere.</span>
        </h2>
        <div className="mt-10 flex flex-col justify-between gap-6 border-t pt-8 sm:flex-row sm:items-center" style={{ borderColor: "var(--c-line)" }}>
          <p className="c-muted max-w-lg">Runehood pays for the Bitcoin side. Pick Robinhood Chain, Ethereum, Base, BNB Chain or Solana and see the full price in your pair before you approve.</p>
          <Link to="/create" className="group flex items-center gap-3 rounded-full py-3 pl-7 pr-3 text-base font-semibold text-white transition hover:brightness-110" style={{ background: "var(--c-grad)" }}>
            Etch a Rune
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25 transition group-hover:translate-x-0.5">
              <ArrowRight />
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="rh-grid absolute inset-0" />
      <div className="c-glow right-[8%] top-16 h-[30rem] w-[30rem]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:pt-20">
        <div>
          <span className="c-eyebrow"><span className="c-live-dot" /> Bitcoin Runes · 5 chains</span>
          <h1 className="font-display mt-5 text-4xl font-bold uppercase leading-[1.02] sm:text-6xl">
            Your Rune,
            <br />
            <span className="text-grad">etched on Bitcoin.</span>
          </h1>
          <p className="c-muted mt-6 max-w-lg text-lg leading-relaxed">Launch in one click, trade on the chain you like, bridge 1:1 to your Bitcoin wallet whenever you want. Runehood pays the Bitcoin fees.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/create" className="group flex items-center gap-2 rounded-xl px-7 py-3.5 text-base font-semibold text-black shadow-[0_14px_40px_-10px_rgba(47,210,122,.7)] transition hover:brightness-110 active:scale-[.98]" style={{ background: "var(--c-grad)" }}>
              Etch a Rune <span className="transition group-hover:translate-x-1"><ArrowRight /></span>
            </Link>
            <Link to="/runes" className="rounded-xl border px-7 py-3.5 text-base font-medium transition hover:border-[var(--c-rose)]" style={{ background: "var(--c-surface)" }}>
              Explore Runes
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-2 text-xs c-muted">
            {CHAINS.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5" style={{ background: "var(--c-surface)" }}>
                <ChainIcon chain={c.id} size={14} /> {c.short}
              </span>
            ))}
          </div>
        </div>
        <div className="relative flex justify-center">
          <div className="absolute inset-x-10 bottom-4 h-10 rounded-[50%] blur-2xl" style={{ background: "rgba(47,210,122,.25)" }} />
          <img src="/assets/hero-stone.webp" alt="Runehood emerald rune stone" className="c-float relative h-72 w-72 drop-shadow-[0_40px_60px_rgba(47,210,122,.35)] sm:h-[26rem] sm:w-[26rem]" />
        </div>
      </div>
    </section>
  );
}

function Stat({ big, label, extra }: { big: string; label: string; extra: React.ReactNode }) {
  return (
    <div className="p-6">
      <div className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{big}</div>
      <div className="mt-1 text-sm">{label}</div>
      <div className="mt-2 text-xs">{extra}</div>
    </div>
  );
}

function ActivityDot({ kind }: { kind: string }) {
  const color = kind === "buy" ? "var(--c-up)" : kind === "sell" ? "var(--c-down)" : kind === "etch" || kind === "bridge" ? "#F7931A" : "var(--c-rose)";
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />;
}

function HowItWorks() {
  return (
    <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <span className="c-eyebrow">How it works</span>
          <h2 className="font-display mt-3 text-4xl font-bold uppercase leading-[1] sm:text-5xl">
            Born on Bitcoin.
            <br />
            <span className="text-grad">Traded anywhere.</span>
          </h2>
          <p className="c-muted mt-6 max-w-md leading-relaxed">
            Every Runehood Rune is a real Rune on Bitcoin. The chain you pick adds the liquidity and the speed: trades settle in seconds, every token is backed 1:1 in custody, and the supply is fixed at 1,000,000,000 forever.
          </p>
          <div className="mt-6 flex flex-wrap gap-5 text-sm">
            <Link to="/docs" className="c-rose inline-flex items-center gap-1 hover:underline">Read the docs <ArrowRight size={13} /></Link>
            <Link to="/verify" className="c-rose inline-flex items-center gap-1 hover:underline">Check the backing <ArrowRight size={13} /></Link>
          </div>
        </div>
        <div className="space-y-4">
          <div className="c-card p-6">
            <div className="c-card-2 mx-auto max-w-sm p-4">
              <div className="flex items-center justify-between text-xs c-muted">
                <span>Approve launch</span>
                <span className="flex items-center gap-1"><span className="c-live-dot" /> Wallet</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <img src="/assets/tok-dog.webp" alt="" className="h-11 w-11 rounded-lg" />
                <div className="flex-1">
                  <div className="font-display font-semibold">$RDOGE</div>
                  <div className="c-rose font-mono text-[11px]">JADE•DOGE</div>
                </div>
                <div className="text-right text-xs">
                  <div className="c-muted">Network</div>
                  <div className="flex items-center gap-1"><ChainIcon chain="base" size={12} /> Base</div>
                </div>
              </div>
              <div className="mt-4 rounded-lg py-2 text-center text-sm font-semibold text-white" style={{ background: "var(--c-grad)" }}>Approve</div>
            </div>
            <h3 className="font-display mt-6 text-lg font-semibold">One signature</h3>
            <p className="c-muted mt-1 text-sm">Name, ticker, picture, chain. One signature and your Rune is live.</p>
          </div>
          <div className="c-card p-6">
            <div className="flex items-center justify-center gap-3 py-2 sm:gap-6">
              <Pill icon={<ChainIcon chain="robinhood" size={20} />} title="$ORBIT" sub="Trades on your chain" />
              <span className="font-display text-xl font-bold c-rose">1:1</span>
              <Pill icon={<ChainIcon chain="bitcoin" size={20} />} title="$ORBIT" sub="Bitcoin Rune" />
            </div>
            <h3 className="font-display mt-5 text-xl font-semibold">A real Bitcoin Rune</h3>
            <p className="c-muted mt-1 text-sm">Runehood etches your Rune on Bitcoin a few blocks after launch, with your picture inscribed on chain. Fixed supply, nobody can mint more.</p>
          </div>
          <div className="c-card p-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CHAINS.map((c) => (
                <div key={c.id} className="c-card-2 flex flex-col items-center gap-2 p-3 text-center">
                  <ChainIcon chain={c.id} size={28} />
                  <div className="text-xs font-semibold">{c.short}</div>
                  <div className="c-dim text-[10px]">{c.quotes.join(" · ")}</div>
                </div>
              ))}
            </div>
            <h3 className="font-display mt-5 text-lg font-semibold">Five chains, one Rune</h3>
            <p className="c-muted mt-1 text-sm">50% Bitcoin, 50% the chain you choose. Pair with ETH, WBTC, cbBTC, SOL or USDC. Holders move the Rune 1:1 back to Bitcoin any time.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pill({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="c-card-2 flex items-center gap-2.5 px-4 py-3">
      {icon}
      <div>
        <div className="font-display text-sm font-semibold">{title}</div>
        <div className="c-dim text-[11px]">{sub}</div>
      </div>
    </div>
  );
}

const STEPS = [
  { img: "/assets/step-create.webp", n: "01", t: "Create", d: "Name, ticker, picture and your chain. One approval in your wallet." },
  { img: "/assets/step-trade.webp", n: "02", t: "Trading opens", d: "Trading starts in seconds on a bonding curve priced in BTC." },
  { img: "/assets/step-etch.webp", n: "03", t: "Etched on Bitcoin", d: "The Rune is created on Bitcoin and your logo is inscribed with it." },
  { img: "/assets/step-bridge.webp", n: "04", t: "Bridge any time", d: "Holders move the Rune 1:1 between Bitcoin and your chain." },
];

function Journey() {
  return (
    <section className="mx-auto mt-28 max-w-7xl px-4 sm:px-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <span className="c-eyebrow">The journey</span>
          <h2 className="font-display mt-2 text-4xl font-bold tracking-tight sm:text-5xl">From idea to Rune</h2>
        </div>
        <p className="c-muted max-w-sm text-sm sm:text-right">After your one approval, every step runs on its own.</p>
      </div>
      <div className="relative mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="absolute left-[12%] right-[12%] top-[76px] hidden h-px lg:block" style={{ background: "linear-gradient(90deg, transparent, var(--c-line-2), var(--c-ruby), var(--c-line-2), transparent)" }} />
        {STEPS.map((s) => (
          <div key={s.n} className="relative text-center">
            <div className="mx-auto flex h-[152px] w-[152px] items-center justify-center rounded-full border" style={{ background: "radial-gradient(circle, #0f2418, var(--c-bg) 70%)" }}>
              <img src={s.img} alt="" className="h-32 w-32 object-contain" loading="lazy" />
            </div>
            <div className="c-rose mt-5 font-mono text-xs">{s.n}</div>
            <h3 className="font-display mt-1 text-lg font-semibold">{s.t}</h3>
            <p className="c-muted mx-auto mt-1 max-w-[16rem] text-sm">{s.d}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 flex items-center justify-center gap-2 text-xs c-muted">
        <Shield size={14} /> The etch and backing status of every Rune is public on the Verify page.
      </div>
    </section>
  );
}

function StockPairs({ stocks }: { stocks?: Partial<Record<Stock, number>> }) {
  return (
    <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
      <div className="c-card relative overflow-hidden p-8 sm:p-10">
        <div className="rh-grid absolute inset-0" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div>
            <span className="c-eyebrow"><ChainIcon chain="robinhood" size={14} /> Robinhood Chain</span>
            <h2 className="font-display mt-3 text-3xl font-bold uppercase leading-tight sm:text-4xl">
              Pair your Rune
              <br />
              <span className="text-grad">with a stock.</span>
            </h2>
            <p className="c-muted mt-4 max-w-md text-sm leading-relaxed">Launch against TSLA, NVDA, SPY and other Robinhood Stock Tokens instead of ETH. The curve raises the stock, and at graduation your Rune gets a locked Uniswap V4 pool against it. Creator fees and tax are paid in the stock.</p>
            <Link to="/create" className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-black" style={{ background: "var(--c-grad)" }}>
              Launch with a stock <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {STOCKS.map((s) => (
              <div key={s} className="c-card-2 flex flex-col items-center gap-1 px-2 py-3 text-center">
                <QuoteIcon quote={s} size={28} />
                <div className="font-mono text-xs font-semibold">{s}</div>
                <div className="c-dim text-[10px]">{fmtUsd(stocks?.[s] ?? STOCK_INFO[s].usd)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RuneSection() {
  const s = useRuneToken();
  return (
    <section className="mx-auto mt-24 max-w-7xl px-4 sm:px-6">
      <div className="c-card relative overflow-hidden p-8 sm:p-10">
        <div className="rh-grid absolute inset-0" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div className="flex items-start gap-5">
            <img src="/assets/logo.webp" alt="" className="h-20 w-20 shrink-0" />
            <div>
              <span className="c-eyebrow"><ChainIcon chain="robinhood" size={14} /> Platform token · live</span>
              <h3 className="font-display mt-2 text-3xl font-bold">$RUNE</h3>
              <p className="c-muted mt-2 max-w-md text-sm">The Runehood token lives on one chain only: Robinhood Chain, launched on pons with liquidity locked from block one. Runes you launch can still trade on any of the five chains.</p>
              <div className="mt-4 text-xs c-muted"><span className="c-dim mr-2 uppercase tracking-wider text-[10px]">CA</span><CopyCa short className="text-xs" /></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={RUNE_TOKEN.buyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-black" style={{ background: "var(--c-grad)" }}>Buy on pons <ArrowRight size={14} /></a>
                <Link to="/token" className="rounded-xl border px-5 py-2.5 text-sm c-muted hover:text-white" style={{ background: "var(--c-surface)" }}>Token details</Link>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <RuneStats s={s} />
            <div className="c-card-2 p-3"><BurnBar s={s} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
