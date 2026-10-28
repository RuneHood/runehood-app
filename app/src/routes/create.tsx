import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TimingTable } from "../components/carvy/progress";
import { useEffect, useRef, useState } from "react";

import { checkRuneName, createRune } from "../lib/api/carvy.functions";
import { CHAINS, FEE_MODES, QUOTE_INFO, STOCK_INFO, isStock, RUNE_NAME_RE, TICKER_RE, chainById, type ChainId, type FeeMode, type Quote } from "../lib/carvy";
import { useWallet } from "../lib/wallet";
import { ChainIcon, QuoteIcon } from "../components/carvy/icons";
import { ConnectButton } from "../components/carvy/connect-button";
import { liveDeployment } from "../lib/onchain";
import { createRuneOnchain } from "../lib/onchain-actions";
import { loadSol } from "../lib/sol/load";
import { SOL_LIVE } from "../lib/sol/config";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [{ title: "Etch a Rune | Runehood" }] }),
  component: Create,
});

const toRuneName = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .trim()
    .replace(/\s+/g, "•")
    .slice(0, 31);

function Create() {
  const { session } = useWallet();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [title, setTitle] = useState("");
  const [ticker, setTicker] = useState("");
  const [runeName, setRuneName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chain, setChain] = useState<ChainId>("robinhood");
  const [quote, setQuote] = useState<Quote>("ETH");
  const [feeMode, setFeeMode] = useState<FeeMode>("dev");
  const [feeRoute, setFeeRoute] = useState("");
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [tg, setTg] = useState("");
  const [initialBuy, setInitialBuy] = useState("");
  const [buyTax, setBuyTax] = useState(0);
  const [sellTax, setSellTax] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [nameCheck, setNameCheck] = useState<{ ok: boolean; reason: string; for: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!nameTouched) setRuneName(toRuneName(title));
  }, [title, nameTouched]);

  useEffect(() => {
    if (session) setChain((c) => (chainById(c).kind === session.kind ? c : session.kind === "solana" ? "solana" : "robinhood"));
  }, [session]);

  const c = chainById(chain);
  const evmLive = liveDeployment(chain);
  const solLive = chain === "solana" && SOL_LIVE;
  const live = evmLive || solLive;
  const stockQuotes = (evmLive ? Object.keys(evmLive.stockQuotes ?? {}) : []) as Quote[];
  const quotes = (evmLive ? [...Object.keys(evmLive.quotes), ...stockQuotes] : solLive ? ["SOL"] : c.quotes) as Quote[];
  useEffect(() => {
    if (!quotes.includes(quote)) setQuote(quotes[0]);
  }, [quotes, quote]);

  const upload = async (f: File) => {
    setErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error ?? "Upload failed.");
      setImage(j.url);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!live || !runeName) return setNameCheck(null);
    const n = runeName;
    const t = setTimeout(() => {
      checkRuneName({ data: { name: n } })
        .then((r) => setNameCheck({ ...r, for: n }))
        .catch(() => setNameCheck(null));
    }, 450);
    return () => clearTimeout(t);
  }, [runeName, live]);
  const nameBlocked = !!live && !!nameCheck && nameCheck.for === runeName && !nameCheck.ok;

  const tickerOk = TICKER_RE.test(ticker);
  const nameOk = RUNE_NAME_RE.test(runeName) && runeName.replace(/•/g, "").length >= 1;
  const chainOk = !session || c.kind === session.kind;
  const ready = title.trim() && tickerOk && nameOk && !nameBlocked && chainOk && !uploading && (solLive || feeMode !== "routed" || (evmLive ? /^0x[0-9a-fA-F]{40}$/.test(feeRoute) : feeRoute.length >= 26));

  const submit = async () => {
    if (!session || !ready) return;
    setBusy(true);
    setErr("");
    try {
      if (solLive) {
        const { launchSolRune } = await loadSol();
        const tier = buyTax >= 5 ? 500 : buyTax >= 3 ? 300 : buyTax >= 1 ? 100 : 0;
        const id = await launchSolRune({ owner: session.address, title: title.trim(), ticker, runeName, description: description.trim(), imageUrl: image, website: website.trim(), x: x.trim(), tg: tg.trim(), taxBps: tier, initialBuySol: initialBuy });
        await navigate({ to: "/rune/$id", params: { id } });
        return;
      }
      if (evmLive) {
        const id = await createRuneOnchain({ from: session.address, chain, title: title.trim(), ticker, runeName, description: description.trim(), imageUrl: image, website: website.trim(), x: x.trim(), tg: tg.trim(), quote, feeMode, routedTo: feeRoute.trim(), initialBuy, buyTaxBps: Math.round(buyTax * 100), sellTaxBps: Math.round(sellTax * 100) });
        await navigate({ to: "/rune/$id", params: { id } });
        return;
      }
      const r = await createRune({
        data: { token: session.token, title: title.trim(), ticker, runeName, description: description.trim(), imageUrl: image, chain, quote, feeMode, feeRoute: feeRoute.trim(), website: website.trim(), x: x.trim(), tg: tg.trim(), initialBuy: Number(initialBuy) || 0 },
      });
      await navigate({ to: "/rune/$id", params: { id: r.id } });
    } catch (e) {
      setErr(String((e as Error).message).split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6">
      <span className="c-eyebrow">Create</span>
      <h1 className="font-display mt-2 text-5xl font-bold tracking-tight">
        Etch your <span className="text-grad">Rune</span>
      </h1>
      <p className="c-muted mt-3 max-w-xl">Fixed supply of 1,000,000,000. Half the story on Bitcoin, half on the chain you pick. Runehood pays for the Bitcoin etch.</p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <Section n="1" title="Identity">
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <button onClick={() => fileRef.current?.click()} className="group relative flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-2xl border border-dashed transition hover:border-[var(--c-ruby)]" style={{ background: "var(--c-bg)", borderColor: "var(--c-line-2)" }}>
                {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="c-muted px-3 text-center text-xs">{uploading ? "Uploading…" : "Upload picture PNG, JPG, GIF"}</span>}
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <div className="space-y-3">
                <Field label="Name">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="Ruby Doge" className="c-input" />
                </Field>
                <Field label="Ticker" hint={ticker && !tickerOk ? "2 to 10 letters or digits" : undefined}>
                  <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} placeholder="RDOGE" className="c-input font-mono" />
                </Field>
              </div>
            </div>
            <Field
              label="Bitcoin Rune name"
              hint={runeName && !nameOk ? "Letters A to Z, • between words" : nameBlocked ? nameCheck!.reason : live && nameCheck?.ok && nameCheck.for === runeName ? "Available on Bitcoin." : "Unique on Bitcoin. Spacers • are allowed between letters."}
            >
              <input value={runeName} onChange={(e) => { setNameTouched(true); setRuneName(e.target.value.toUpperCase().replace(/[^A-Z•. ]/g, "").replace(/[. ]/g, "•")); }} placeholder="RUBY•DOGE" className="c-input c-rose font-mono tracking-wide" />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={3} placeholder="What is this Rune about?" className="c-input resize-none" />
            </Field>
          </Section>

          <Section n="2" title="Pick your chain" sub="50% Bitcoin, 50% the chain you choose. This is where the bonding curve and trading live.">
            <div className="grid gap-3 sm:grid-cols-2">
              {CHAINS.map((ch) => {
                const active = chain === ch.id;
                const blocked = session && session.kind !== ch.kind;
                const isLive = !!liveDeployment(ch.id) || (ch.id === "solana" && SOL_LIVE);
                return (
                  <button key={ch.id} onClick={() => setChain(ch.id)} className="relative flex items-start gap-3 rounded-2xl border p-4 text-left transition" style={active ? { background: "rgba(47,210,122,.08)", borderColor: "var(--c-ruby)" } : { background: "var(--c-surface)" }}>
                    <ChainIcon chain={ch.id} size={34} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{ch.name}</span>
                      </div>
                      <div className="c-muted mt-0.5 text-xs">{ch.blurb}</div>
                      <div className="mt-2 flex items-center gap-2 text-[11px]">
                        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "rgba(247,147,26,.14)", color: "#F7B45A" }}>50% BTC</span>
                        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: `${ch.color}22`, color: ch.color }}>50% {ch.short}</span>
                      </div>
                      <div className="mt-2 text-[11px] font-semibold" style={{ color: isLive ? "var(--c-up)" : "var(--c-gold)" }}>{isLive ? "Live on mainnet" : "Coming soon"}</div>
                      {blocked && <div className="c-rose mt-1 text-[11px]">Needs {ch.kind === "solana" ? "a Solana" : "an EVM"} wallet</div>}
                    </div>
                    {active && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full" style={{ background: "var(--c-ruby)", boxShadow: "0 0 10px var(--c-ruby)" }} />}
                  </button>
                );
              })}
            </div>
            <Field label="Trading pair">
              <div className="flex flex-wrap gap-2">
                {quotes.filter((q) => !stockQuotes.includes(q)).map((q) => (
                  <button key={q} onClick={() => setQuote(q)} className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${quote === q ? "text-white" : "c-muted"}`} style={quote === q ? { background: "rgba(47,210,122,.12)", borderColor: "var(--c-ruby)" } : { background: "var(--c-bg)" }}>
                    <QuoteIcon quote={q} /> {ticker || "RUNE"} / {q}
                  </button>
                ))}
              </div>
            </Field>
            {stockQuotes.length > 0 && (
              <Field label="Or pair with a stock">
                <p className="c-muted -mt-1 mb-3 text-xs">Robinhood Stock Tokens as the pair: buyers pay in the stock, the curve raises the stock, and at graduation the Uniswap V4 pool is {ticker || "RUNE"} / that stock. Creator fees and tax are paid in the stock too.</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {stockQuotes.map((q) => (
                    <button key={q} onClick={() => setQuote(q)} className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-center ${quote === q ? "text-white" : "c-muted"}`} style={quote === q ? { background: "rgba(47,210,122,.12)", borderColor: "var(--c-ruby)" } : { background: "var(--c-bg)" }}>
                      <QuoteIcon quote={q} size={26} />
                      <span className="font-mono text-xs font-semibold">{q}</span>
                      <span className="c-dim line-clamp-1 text-[10px]">{isStock(q) ? STOCK_INFO[q].name : ""}</span>
                    </button>
                  ))}
                </div>
                <p className="c-dim mt-2 text-[10px]">Stock Tokens are issued by Robinhood and are not available to U.S. persons and some other jurisdictions.</p>
              </Field>
            )}
          </Section>

          {solLive ? (
            <Section n="3" title="Creator fees" sub="On Solana you earn 0.5% of every curve trade and your creator fee after graduation into Raydium.">
              <p className="c-muted text-sm">Claim anytime from the Rune page. No setup needed.</p>
            </Section>
          ) : (
          <Section n="3" title="Creator fees" sub="1% trading fee. Half goes where you decide, half to the platform.">
            <div className="grid gap-2 sm:grid-cols-3">
              {FEE_MODES.map((f) => (
                <button key={f.id} onClick={() => setFeeMode(f.id)} className="rounded-2xl border p-4 text-left" style={feeMode === f.id ? { background: "rgba(47,210,122,.08)", borderColor: "var(--c-ruby)" } : { background: "var(--c-surface)" }}>
                  <div className="font-semibold">{f.label}</div>
                  <div className="c-muted mt-1 text-xs">{f.hint}</div>
                </button>
              ))}
            </div>
            {feeMode === "routed" && (
              <Field label={live ? "Wallet that receives routed fees" : "Bitcoin address for routed fees"}>
                <input value={feeRoute} onChange={(e) => setFeeRoute(e.target.value.trim())} placeholder={evmLive ? "0x… wallet on this chain" : "tb1p…"} className="c-input font-mono text-sm" />
              </Field>
            )}
          </Section>
          )}

          {live && (
            <Section n="4" title="Creator tax" sub="Optional, max 5% each way. Paid to your fee wallet on every curve trade and, forever, in the DEX pool after graduation. It can never be changed later.">
              {solLive ? (
                <div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      [0, "0.75%"],
                      [1, "1%"],
                      [3, "1.25%"],
                      [5, "1.5%"],
                    ].map(([t, label]) => (
                      <button
                        key={t}
                        onClick={() => {
                          setBuyTax(t as number);
                          setSellTax(t as number);
                        }}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold ${buyTax === t ? "text-white" : "c-muted"}`}
                        style={buyTax === t ? { background: "rgba(47,210,122,.12)", borderColor: "var(--c-ruby)" } : { background: "var(--c-bg)" }}
                      >
                        {label} after graduation
                      </button>
                    ))}
                  </div>
                  <p className="c-dim mt-2 text-[11px]">On Solana the curve pays you 0.5% of every trade. After graduation into Raydium you keep earning this creator fee on every trade in the pool (Raydium allows up to ~1.5%).</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TaxSlider label="Buy tax" value={buyTax} onChange={setBuyTax} />
                  <TaxSlider label="Sell tax" value={sellTax} onChange={setSellTax} />
                </div>
              )}
            </Section>
          )}

          <Section n={live ? "5" : "4"} title="Links and first buy" sub="Optional.">
            <div className="grid gap-3 sm:grid-cols-3">
              <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://website" className="c-input text-sm" />
              <input value={x} onChange={(e) => setX(e.target.value)} placeholder="https://x.com/…" className="c-input text-sm" />
              <input value={tg} onChange={(e) => setTg(e.target.value)} placeholder="https://t.me/…" className="c-input text-sm" />
            </div>
            <Field label={`Dev buy in ${quote} (optional)`}>
              <div className="flex gap-2">
                <input value={initialBuy} onChange={(e) => setInitialBuy(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" className="c-input" />
                {QUOTE_INFO[quote].quick.map((v) => (
                  <button key={v} onClick={() => setInitialBuy(String(v))} className="shrink-0 rounded-xl border px-3 text-xs c-muted" style={{ background: "var(--c-bg)" }}>
                    {v}
                  </button>
                ))}
              </div>
            </Field>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="c-card overflow-hidden">
            <div className="relative flex h-44 items-center justify-center" style={{ background: "radial-gradient(circle at 50% 60%, rgba(47,210,122,.25), transparent 65%)" }}>
              <img src={image || "/assets/hero-stone.webp"} alt="" className={image ? "h-28 w-28 rounded-2xl object-cover" : "c-float h-32 w-32"} />
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-bold">{ticker || "TICKER"}</span>
                <ChainIcon chain={chain} size={18} />
              </div>
              <div className="c-rose font-mono text-xs">{runeName || "RUNE•NAME"}</div>
              <p className="c-muted mt-2 line-clamp-3 text-sm">{description || "Your description shows here."}</p>
              <div className="mt-4 space-y-1.5 text-xs">
                <Row k="Supply" v="1,000,000,000 fixed" />
                <Row k="Trades on" v={c.name} />
                <Row k="Pair" v={`${ticker || "RUNE"} / ${quote}`} />
                <Row k="Creator fees" v={FEE_MODES.find((f) => f.id === feeMode)!.label} />
                {live && <Row k="Creator tax" v={`${buyTax}% buy · ${sellTax}% sell`} />}
                {live && <Row k="Graduates to" v={solLive ? "Raydium" : chain === "bsc" ? "PancakeSwap" : `Uniswap V4 · ${ticker || "RUNE"}/${quote}`} />}
                <Row k="Bitcoin etch" v="Paid by Runehood" />
              </div>
              <div className="mt-5">
                {!mounted || !session ? (
                  <ConnectButton wide label="Connect to etch" />
                ) : (
                  <button disabled={!ready || busy} onClick={submit} className="w-full rounded-full py-3.5 text-base font-semibold text-white shadow-[0_14px_40px_-12px_rgba(47,210,122,.7)] transition hover:brightness-110 disabled:opacity-40" style={{ background: "var(--c-grad)" }}>
                    {busy ? "Confirm in your wallet…" : live ? `Etch on ${c.short}` : "Etch Rune"}
                  </button>
                )}
              </div>
              {!chainOk && <p className="c-rose mt-2 text-center text-xs">Your wallet cannot launch on {c.name}. Pick another chain.</p>}
              {err && <p className="c-down mt-2 text-center text-xs">{err}</p>}
              <div className="mt-4 rounded-xl p-3" style={{ background: "var(--c-bg)" }}>
                <div className="c-dim mb-2 text-[10px] uppercase tracking-wider">How long things take</div>
                <TimingTable />
              </div>
              <p className="c-dim mt-3 text-center text-[11px]">{live ? `Mainnet on ${c.name}: one wallet transaction. Your Rune is etched on Bitcoin automatically about an hour after launch.` : "Testnet: no real funds."}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TaxSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-sm font-medium">
        {label} <span className="c-rose font-mono">{value.toFixed(1)}%</span>
      </span>
      <input type="range" min={0} max={5} step={0.5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#2fd27a]" />
    </label>
  );
}

function Section({ n, title, sub, children }: { n: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="c-card space-y-4 p-6">
      <div className="flex items-start gap-3">
        <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "var(--c-grad)" }}>
          {n}
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          {sub && <p className="c-muted text-sm">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="c-dim mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="c-dim">{k}</span>
      <span>{v}</span>
    </div>
  );
}
