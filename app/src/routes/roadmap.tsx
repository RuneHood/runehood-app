import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/roadmap")({
  head: () => ({ meta: [{ title: "Roadmap | Runehood" }, { name: "description", content: "What Runehood has shipped and what comes next: Runes marketplace, Runes terminal, Bitcoin-native tools." }] }),
  component: Roadmap,
});

type Item = { t: string; d: string; done?: boolean };
type Phase = { n: string; title: string; when: string; state: "done" | "now" | "next" | "later"; items: Item[] };

const PHASES: Phase[] = [
  {
    n: "01",
    title: "Launch",
    when: "Shipped",
    state: "done",
    items: [
      { t: "Launchpad live on Ethereum", d: "One-click Rune launch with an on-chain bonding curve.", done: true },
      { t: "Launchpad live on Base", d: "ETH, cbBTC and USDC pairs.", done: true },
      { t: "Launchpad live on Robinhood Chain", d: "ETH pair on the Arbitrum Orbit L2 for tokenized assets.", done: true },
      { t: "Stock Token pairs", d: "Launch against TSLA, NVDA, SPY and 12 more Robinhood Stock Tokens; graduation opens a Uniswap V4 pool against the stock.", done: true },
      { t: "Launchpad live on BNB Chain", d: "BNB, BTCB and USDT pairs.", done: true },
      { t: "Launchpad live on Solana", d: "Fast bonding curves with locked liquidity at graduation.", done: true },
      { t: "Every token etched on Bitcoin", d: "Each launch becomes a real Rune with its full supply in Runehood custody, paid by Runehood.", done: true },
      { t: "1:1 bridge to and from Bitcoin", d: "Send tokens to your Bitcoin wallet as the native Rune and back again.", done: true },
      { t: "Graduation with locked liquidity and creator tax", d: "Sold-out curves move into a locked pool automatically; creator tax up to 5% keeps working.", done: true },
      { t: "Live progress and custody proof", d: "Countdown for every etch and bridge, public custody address and 1:1 verify page.", done: true },
    ],
  },
  {
    n: "02",
    title: "Trust",
    when: "Now",
    state: "now",
    items: [
      { t: "2-of-2 Bitcoin custody", d: "Custody keys split between Runehood and an independent co-signer on the Internet Computer, no single key can move Runes." },
      { t: "Security review", d: "External audit of the launchpad and bridge, report published." },
      { t: "Native DEX graduation per chain", d: "PancakeSwap on BNB Chain and Raydium on Solana for new launches." },
    ],
  },
  {
    n: "03",
    title: "Runes Marketplace",
    when: "Next",
    state: "next",
    items: [
      { t: "Buy and sell native Runes on Bitcoin", d: "List Runehood Runes straight from Xverse, Unisat or Magic Eden wallets with signed PSBTs. Trustless: the Bitcoin transaction settles the trade." },
      { t: "Floor, depth and history for every Rune", d: "Bitcoin-side price next to the chain price, so arbitrage between the two is visible." },
      { t: "Bridge + sell in one step", d: "Move tokens to Bitcoin and list them on the marketplace in a single flow." },
      { t: "Creator royalties in BTC", d: "Optional creator fee on marketplace sales, paid in sats." },
    ],
  },
  {
    n: "04",
    title: "Runes Terminal",
    when: "Next",
    state: "next",
    items: [
      { t: "Real-time feed of Bitcoin Runes", d: "New etchings, open mints, mint progress and mempool activity for every Rune, not only Runehood ones." },
      { t: "Charts, holders and whale tracking", d: "Holder distribution, top wallets and large transfers for any Rune." },
      { t: "Fee and block timing helper", d: "Live sat/vB, next-block estimate and safe fee suggestions before you sign." },
      { t: "Telegram alerts", d: "Bot alerts for new etches, mints that are about to sell out and tracked wallets." },
    ],
  },
  {
    n: "05",
    title: "Bitcoin-native tools",
    when: "Later",
    state: "later",
    items: [
      { t: "Fair-mint Runes launcher", d: "Etch open-mint Runes directly on Bitcoin with caps and start/end blocks, no EVM side needed." },
      { t: "Logo inscriptions gallery", d: "Every Runehood Rune logo inscribed on Bitcoin, browsable in one place." },
      { t: "Runehood API and SDK", d: "Public endpoints for Runes data, bridges and launches so bots and wallets can build on Runehood." },
      { t: "$RUNE on Robinhood Chain", d: "Platform token listed through pons, single chain, liquidity locked." },
      { t: "More chains", d: "New EVM chains added when liquidity and users are there, same one-click flow." },
    ],
  },
];

const tone = {
  done: { bg: "rgba(61,220,151,.12)", c: "var(--c-up)", label: "Shipped" },
  now: { bg: "rgba(47,210,122,.12)", c: "var(--c-ruby)", label: "In progress" },
  next: { bg: "rgba(247,147,26,.12)", c: "#F7B45A", label: "Next" },
  later: { bg: "rgba(255,255,255,.06)", c: "var(--c-muted)", label: "Later" },
};

function Roadmap() {
  const shipped = PHASES.flatMap((p) => p.items).filter((i) => i.done).length;
  const total = PHASES.flatMap((p) => p.items).length;
  return (
    <div className="mx-auto max-w-5xl px-4 pt-12 sm:px-6">
      <span className="c-eyebrow">Roadmap</span>
      <h1 className="font-display mt-2 text-5xl font-bold tracking-tight">Where Runehood is going</h1>
      <p className="c-muted mt-4 max-w-3xl leading-relaxed">
        Runehood makes Bitcoin Runes as easy to launch and trade as any memecoin. Phase one is live. Next we build the Bitcoin side: a trustless Runes marketplace and a real-time terminal for every Rune on Bitcoin.
      </p>
      <div className="mt-6 flex items-center gap-3 text-sm">
        <div className="h-2 w-56 overflow-hidden rounded-full" style={{ background: "var(--c-line-2)" }}>
          <div className="h-full rounded-full" style={{ width: `${(shipped / total) * 100}%`, background: "var(--c-grad)" }} />
        </div>
        <span className="c-muted">
          {shipped} of {total} shipped
        </span>
      </div>

      <div className="mt-10 space-y-6">
        {PHASES.map((p) => (
          <section key={p.n} className="c-card p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-sm c-dim">{p.n}</span>
              <h2 className="font-display text-2xl font-semibold">{p.title}</h2>
              <span className="ml-auto rounded-full px-3 py-1 text-xs font-semibold" style={{ background: tone[p.state].bg, color: tone[p.state].c }}>
                {p.state === "done" ? "Shipped" : p.when === "Now" ? "In progress" : p.when}
              </span>
            </div>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {p.items.map((i) => (
                <li key={i.t} className="flex gap-3">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
                    style={i.done ? { background: "var(--c-up)", color: "#04150d" } : { border: "1px solid var(--c-line-2)" }}
                  >
                    {i.done ? "✓" : ""}
                  </span>
                  <div>
                    <div className={`text-sm font-semibold ${i.done ? "" : "text-white/90"}`}>{i.t}</div>
                    <div className="c-dim mt-0.5 text-xs leading-relaxed">{i.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
