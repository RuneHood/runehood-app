import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  CHAINS,
  CURVE_SUPPLY,
  QUOTE_INFO,
  RUNE_NAME_RE,
  TICKER_RE,
  V_SATS0,
  V_TOKENS0,
  buyQuote,
  chainById,
  isChain,
  mcapSats,
  quoteToSats,
  satsToQuote,
  satsToUsd,
  sellQuote,
  type Quote,
  type RuneRow,
} from "../carvy";
import { normAddr } from "../base58";
import { recoverPersonal, verifySolana } from "../eip191";
import {
  balanceOf,
  credit,
  db,
  ensureSeed,
  fakeTx,
  getPrices,
  progressEtching,
  randomHex,
  requireSession,
  runeId,
  sessionAddress,
  sha,
  walletKind,
} from "../carvy.server";
import { syncAllChains, syncChain } from "../indexer.server";
import { liveDeployment } from "../onchain";
import { bindings } from "../bindings.server";

const DAY = 86_400_000;

const safeSync = () => syncAllChains().catch((e) => console.error("sync", e));
const safeSolSync = async () => {
  const D1 = db();
  const row = await D1.prepare("SELECT updated_at FROM cache WHERE k = 'solsync'").first<{ updated_at: number }>();
  if (row && Date.now() - row.updated_at < 20_000) return;
  await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES ('solsync', '1', ?) ON CONFLICT(k) DO UPDATE SET updated_at = excluded.updated_at").bind(Date.now()).run();
  const { syncSolana } = await import("../sol/indexer.server");
  await syncSolana().catch((e) => console.error("solsync", e));
};


/** Which site this Worker serves. Both sites share contracts, engine and database; each lists only its own Runes. */
const SITE = (): "carvy" | "runehood" => ((bindings() as { APP_SLUG?: string }).APP_SLUG === "runehood" ? "runehood" : "carvy");
const S = () => `site = '${SITE()}'`;

// ---------------- Public reads ----------------
export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSeed();
  await Promise.all([safeSync(), safeSolSync()]);
  const d = db();
  const prices = await getPrices();
  const since = Date.now() - DAY;
  const M = `rune_id IN (SELECT id FROM runes WHERE onchain = 1 AND hidden = 0 AND ${S()})`;
  const [top, act, totals, day, traders, traders24, fees, count, testnet] = await Promise.all([
    d.prepare(`SELECT * FROM runes WHERE hidden = 0 AND ${S()} ORDER BY onchain DESC, is_platform DESC, (v_sats / v_tokens) DESC, created_at DESC LIMIT 6`).all<RuneRow>(),
    d.prepare(`SELECT a.* FROM activity a JOIN runes r ON r.id = a.rune_id WHERE COALESCE(r.hidden, 0) = 0 AND r.${S()} ORDER BY COALESCE(r.onchain, 0) DESC, a.created_at DESC LIMIT 22`).all(),
    d.prepare(`SELECT COALESCE(SUM(sats),0) AS v FROM trades WHERE ${M}`).first<{ v: number }>(),
    d.prepare(`SELECT COALESCE(SUM(sats),0) AS v FROM trades WHERE created_at > ? AND ${M}`).bind(since).first<{ v: number }>(),
    d.prepare(`SELECT COUNT(DISTINCT trader) AS n FROM trades WHERE ${M}`).first<{ n: number }>(),
    d.prepare(`SELECT COUNT(DISTINCT trader) AS n FROM trades WHERE created_at > ? AND ${M}`).bind(since).first<{ n: number }>(),
    d.prepare(`SELECT COALESCE(SUM(creator_fees_sats),0) AS f FROM runes WHERE onchain = 1 AND hidden = 0 AND ${S()}`).first<{ f: number }>(),
    d.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN graduated = 1 THEN 1 ELSE 0 END) AS e FROM runes WHERE onchain = 1 AND hidden = 0 AND ${S()}`).first<{ n: number; e: number }>(),
    d.prepare(`SELECT COUNT(*) AS n FROM runes WHERE onchain = 0 AND hidden = 0 AND ${S()}`).first<{ n: number }>(),
  ]);
  return {
    prices,
    top: top.results,
    activity: act.results as Array<{ id: number; kind: string; rune_id: string; ticker: string; chain: string; text: string; usd: number; tx: string; created_at: number }>,
    stats: {
      runes: count?.n ?? 0,
      graduated: count?.e ?? 0,
      testnetRunes: testnet?.n ?? 0,
      volumeUsd: satsToUsd(totals?.v ?? 0, prices),
      volume24Usd: satsToUsd(day?.v ?? 0, prices),
      traders: traders?.n ?? 0,
      traders24: traders24?.n ?? 0,
      paidSats: fees?.f ?? 0,
    },
  };
});

export const listRunes = createServerFn({ method: "GET" })
  .inputValidator(z.object({ sort: z.enum(["new", "mcap", "volume", "graduating"]).default("mcap"), chain: z.string().default("all"), q: z.string().max(40).default("") }))
  .handler(async ({ data }) => {
    await ensureSeed();
    await Promise.all([safeSync(), safeSolSync()]);
    const d = db();
    const where: string[] = ["hidden = 0", S()];
    const args: unknown[] = [];
    if (data.chain !== "all" && isChain(data.chain)) {
      where.push("chain = ?");
      args.push(data.chain);
    }
    if (data.q.trim()) {
      where.push("(ticker LIKE ? OR title LIKE ? OR rune_name LIKE ?)");
      const q = `%${data.q.trim().toUpperCase()}%`;
      args.push(q, `%${data.q.trim()}%`, q);
    }
    const order = data.sort === "new" ? "created_at DESC" : data.sort === "volume" ? "volume_sats DESC" : data.sort === "graduating" ? "graduated ASC, sold DESC" : "is_platform DESC, (v_sats / v_tokens) DESC";
    const rows = await d.prepare(`SELECT * FROM runes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY onchain DESC, ${order} LIMIT 120`).bind(...args).all<RuneRow>();
    return { prices: await getPrices(), runes: rows.results };
  });

export const getRune = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().min(4).max(64) }))
  .handler(async ({ data }) => {
    await ensureSeed();
    await progressEtching();
    await Promise.all([safeSync(), safeSolSync()]);
    const d = db();
    const rid = data.id.toLowerCase().startsWith("0x") ? data.id.toLowerCase() : data.id;
    const rune = await d.prepare(`SELECT * FROM runes WHERE id = ? AND hidden = 0 AND ${S()}`).bind(rid).first<RuneRow>();
    if (!rune) return { rune: null, trades: [], holders: [], prices: await getPrices() };
    const [trades, holders] = await Promise.all([
      d.prepare("SELECT id, trader, side, sats, tokens, quote, quote_amount, usd, mcap_sats, tx, created_at FROM trades WHERE rune_id = ? ORDER BY created_at DESC LIMIT 300").bind(rid).all(),
      d.prepare("SELECT wallet, balance FROM holdings WHERE rune_id = ? AND balance > 0.000001 ORDER BY balance DESC LIMIT 20").bind(rid).all<{ wallet: string; balance: number }>(),
    ]);
    return {
      rune,
      trades: trades.results as Array<{ id: number; trader: string; side: "buy" | "sell"; sats: number; tokens: number; quote: Quote; quote_amount: number; usd: number; mcap_sats: number; tx: string; created_at: number }>,
      holders: holders.results,
      prices: await getPrices(),
    };
  });

export const getVerify = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSeed();
  await progressEtching();
  const rows = await db()
    .prepare(
      "SELECT r.id, r.ticker, r.rune_name, r.image_url, r.chain, r.sold, r.bridged, r.rune_ref, r.onchain, COALESCE(e.status, '') AS etch_status, (SELECT GROUP_CONCAT(c.amount) FROM btc_custody c WHERE c.rune_id = r.id AND c.spent = 0) AS custody FROM runes r LEFT JOIN btc_etch e ON e.rune_id = r.id WHERE r.hidden = 0 AND r.site = '" + SITE() + "' ORDER BY r.onchain DESC, r.created_at DESC LIMIT 200",
    )
    .all<Pick<RuneRow, "id" | "ticker" | "rune_name" | "image_url" | "chain" | "sold" | "bridged" | "rune_ref"> & { onchain: number; etch_status: string; custody: string | null }>();
  const { custodyAddress } = await import("../btc/service.server");
  return { runes: rows.results, custodyAddress: custodyAddress() };
});

// ---------------- Auth ----------------
const addrSchema = z.string().min(32).max(64);

export const getNonce = createServerFn({ method: "POST" })
  .inputValidator(z.object({ address: addrSchema }))
  .handler(async ({ data }) => {
    const address = normAddr(data.address);
    const nonce = randomHex(16);
    const issued = new Date().toISOString();
    await db().prepare("INSERT INTO nonces (nonce, address, issued, created_at) VALUES (?, ?, ?, ?)").bind(nonce, address, issued, Date.now()).run();
    return { nonce, issued, message: signMessage(address, nonce, issued) };
  });

const signMessage = (address: string, nonce: string, issued: string) =>
  `Sign in to Carvy\n\nThis signature is free and does not send a transaction.\n\nWallet: ${address}\nNonce: ${nonce}\nIssued: ${issued}`;

export const signIn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ address: addrSchema, nonce: z.string().length(32), issued: z.string().max(40), signature: z.string().min(40).max(200) }))
  .handler(async ({ data }) => {
    const d = db();
    const address = normAddr(data.address);
    const row = await d.prepare("SELECT address, issued, created_at FROM nonces WHERE nonce = ?").bind(data.nonce).first<{ address: string; issued: string; created_at: number }>();
    if (!row || row.address !== address || row.issued !== data.issued || Date.now() - row.created_at > 10 * 60_000) throw new Error("Sign-in request expired. Try again.");
    await d.prepare("DELETE FROM nonces WHERE nonce = ?").bind(data.nonce).run();
    const msg = signMessage(address, data.nonce, data.issued);
    const ok = walletKind(address) === "evm" ? recoverPersonal(msg, data.signature) === address : verifySolana(msg, data.signature, address);
    if (!ok) throw new Error("Signature does not match this wallet.");
    const token = randomHex(32);
    await d.prepare("INSERT INTO sessions (token_hash, address, expires_at) VALUES (?, ?, ?)").bind(await sha(token), address, Date.now() + 30 * DAY).run();
    return { token, address };
  });

export const signOut = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().max(128) }))
  .handler(async ({ data }) => {
    await db().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(data.token)).run();
    return { ok: true };
  });

// ---------------- Account ----------------
export const getAccount = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().max(128) }))
  .handler(async ({ data }) => {
    const address = await sessionAddress(data.token);
    if (!address) return null;
    const d = db();
    const [bal, hold, br, fc] = await Promise.all([
      d.prepare("SELECT chain, asset, amount FROM balances WHERE wallet = ? AND amount > 0.0000001 ORDER BY chain").bind(address).all<{ chain: string; asset: string; amount: number }>(),
      d.prepare("SELECT h.balance, r.id, r.ticker, r.title, r.image_url, r.chain, r.v_sats, r.v_tokens, r.rune_ref FROM holdings h JOIN runes r ON r.id = h.rune_id WHERE h.wallet = ? AND r.hidden = 0 AND h.balance > 0.000001 ORDER BY h.balance * r.v_sats / r.v_tokens DESC").bind(address).all(),
      d.prepare("SELECT b.*, r.ticker FROM bridges b JOIN runes r ON r.id = b.rune_id WHERE b.wallet = ? ORDER BY b.created_at DESC LIMIT 30").bind(address).all(),
      d.prepare("SELECT claimed_at FROM faucet_claims WHERE wallet = ?").bind(address).first<{ claimed_at: number }>(),
    ]);
    return {
      address,
      kind: walletKind(address),
      balances: bal.results,
      holdings: hold.results as Array<{ balance: number; id: string; ticker: string; title: string; image_url: string; chain: string; v_sats: number; v_tokens: number; rune_ref: string }>,
      bridges: br.results as Array<{ id: number; ticker: string; amount: number; btc_address: string; status: string; created_at: number }>,
      faucetAt: fc ? fc.claimed_at + DAY : 0,
      prices: await getPrices(),
    };
  });

export const claimFaucet = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().max(128) }))
  .handler(async ({ data }) => {
    const address = await requireSession(data.token);
    const d = db();
    const fc = await d.prepare("SELECT claimed_at FROM faucet_claims WHERE wallet = ?").bind(address).first<{ claimed_at: number }>();
    if (fc && Date.now() - fc.claimed_at < DAY) throw new Error("Testnet faucet is available once every 24 hours.");
    const kind = walletKind(address);
    const chains = CHAINS.filter((c) => c.kind === kind);
    for (const c of chains) for (const q of c.quotes) await credit(address, c.id, q, QUOTE_INFO[q].faucet);
    await d.prepare("INSERT INTO faucet_claims (wallet, claimed_at) VALUES (?, ?) ON CONFLICT(wallet) DO UPDATE SET claimed_at = excluded.claimed_at").bind(address, Date.now()).run();
    return { ok: true };
  });

// ---------------- Create ----------------
const urlOpt = z.string().max(200).refine((v) => !v || /^https:\/\/[^\s]+$/.test(v), "Links must start with https://").default("");

export const createRune = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().max(128),
      title: z.string().trim().min(1).max(40),
      ticker: z.string().trim().toUpperCase().regex(TICKER_RE, "Ticker: 2 to 10 letters or digits"),
      runeName: z.string().trim().toUpperCase().regex(RUNE_NAME_RE, "Rune name: A to Z with optional • spacers, up to 26 letters"),
      description: z.string().trim().max(280).default(""),
      imageUrl: z.string().max(200).refine((v) => !v || /^\/media\/uploads\/[a-f0-9]{24}\.(png|jpg|webp|gif)$/.test(v), "Upload the picture again.").default(""),
      chain: z.string().refine(isChain, "Pick a chain"),
      quote: z.string(),
      feeMode: z.enum(["dev", "holders", "routed"]),
      feeRoute: z.string().max(80).default(""),
      website: urlOpt,
      x: urlOpt,
      tg: urlOpt,
      initialBuy: z.number().min(0).max(1e9).default(0),
    }),
  )
  .handler(async ({ data }) => {
    const address = await requireSession(data.token);
    const chain = chainById(data.chain);
    if (liveDeployment(chain.id)) throw new Error(`${chain.name} is live on mainnet: launch with your wallet transaction.`);
    if (walletKind(address) !== chain.kind) throw new Error(chain.kind === "solana" ? "Connect a Solana wallet to launch on Solana." : `Connect an EVM wallet to launch on ${chain.name}.`);
    const quote = data.quote as Quote;
    if (!chain.quotes.includes(quote)) throw new Error(`${data.quote} is not a pair on ${chain.name}.`);
    if (data.feeMode === "routed" && data.feeRoute.length < 26) throw new Error("Add the Bitcoin address that should receive routed fees.");
    const d = db();
    const dup = await d.prepare("SELECT id FROM runes WHERE REPLACE(rune_name, '•', '') = ?").bind(data.runeName.replace(/•/g, "")).first();
    if (dup) throw new Error("That Rune name is already taken. Rune names are unique on Bitcoin.");
    const id = runeId();
    const now = Date.now();
    await d.batch([
      d
        .prepare(
          "INSERT INTO runes (id, ticker, rune_name, title, description, image_url, creator, chain, quote, fee_mode, fee_route, website, x_url, tg_url, v_sats, v_tokens, etch_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, data.ticker, data.runeName, data.title, data.description, data.imageUrl || "/assets/logo.webp", address, chain.id, quote, data.feeMode, data.feeRoute, data.website, data.x, data.tg, V_SATS0, V_TOKENS0, now + 90_000, now),
      d.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, created_at) VALUES ('launch', ?, ?, ?, ?, ?)").bind(id, data.ticker, chain.id, `${data.ticker} launched on ${chain.short} · etching on Bitcoin`, now),
    ]);
    if (data.initialBuy > 0) await doTrade(address, id, "buy", quote, data.initialBuy);
    return { id };
  });

// ---------------- Trade ----------------
async function doTrade(address: string, id: string, side: "buy" | "sell", quote: Quote, amount: number) {
  const d = db();
  const prices = await getPrices();
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await d.prepare("SELECT * FROM runes WHERE id = ?").bind(id).first<RuneRow>();
    if (!r) throw new Error("Rune not found.");
    if (r.onchain) throw new Error("This Rune trades on chain. Confirm the trade in your wallet.");
    const chain = chainById(r.chain);
    if (walletKind(address) !== chain.kind) throw new Error(chain.kind === "solana" ? "This Rune trades on Solana. Connect a Solana wallet." : `This Rune trades on ${chain.name}. Connect an EVM wallet.`);
    if (!chain.quotes.includes(quote)) throw new Error(`${quote} is not a pair on ${chain.name}.`);
    const now = Date.now();
    const tx = fakeTx();
    if (side === "buy") {
      const satsIn = quoteToSats(quote, amount, prices);
      if (satsIn < 100) throw new Error("Minimum buy is 100 sats.");
      const q = buyQuote(r.v_sats, r.v_tokens, satsIn);
      const remaining = r.graduated ? Infinity : CURVE_SUPPLY - r.sold;
      if (q.tokens > remaining + 1) throw new Error(`Only ${Math.floor(remaining).toLocaleString("en-US")} ${r.ticker} left on the curve. Buy less.`);
      const deb = await d.prepare("UPDATE balances SET amount = amount - ? WHERE wallet = ? AND chain = ? AND asset = ? AND amount >= ?").bind(amount, address, r.chain, quote, amount - 1e-12).run();
      if (!deb.meta.changes) throw new Error(`Not enough ${quote} on ${chain.short}. Use the testnet faucet on your Account page.`);
      const sold = r.sold + q.tokens;
      const grad = r.graduated || sold >= CURVE_SUPPLY - 1 ? 1 : 0;
      const upd = await d
        .prepare("UPDATE runes SET v_sats = ?, v_tokens = ?, real_sats = real_sats + ?, sold = ?, volume_sats = volume_sats + ?, creator_fees_sats = creator_fees_sats + ?, platform_fees_sats = platform_fees_sats + ?, graduated = ? WHERE id = ? AND v_sats = ? AND v_tokens = ?")
        .bind(q.vSats, q.vTokens, q.net, sold, satsIn, q.fee / 2, q.fee / 2, grad, id, r.v_sats, r.v_tokens)
        .run();
      if (!upd.meta.changes) {
        await credit(address, r.chain, quote, amount);
        continue;
      }
      const usd = satsToUsd(satsIn, prices);
      const stmts = [
        d.prepare("INSERT INTO holdings (rune_id, wallet, balance) VALUES (?, ?, ?) ON CONFLICT(rune_id, wallet) DO UPDATE SET balance = balance + excluded.balance").bind(id, address, q.tokens),
        d.prepare("INSERT INTO trades (rune_id, trader, side, sats, tokens, quote, quote_amount, usd, mcap_sats, tx, created_at) VALUES (?, ?, 'buy', ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, address, satsIn, q.tokens, quote, amount, usd, mcapSats(q.vSats, q.vTokens), tx, now),
        d.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, usd, tx, created_at) VALUES ('buy', ?, ?, ?, ?, ?, ?, ?)").bind(id, r.ticker, r.chain, `Bought ${r.ticker}`, usd, tx, now),
      ];
      if (grad && !r.graduated) stmts.push(d.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, created_at) VALUES ('graduate', ?, ?, ?, ?, ?)").bind(id, r.ticker, r.chain, `${r.ticker} graduated · liquidity moved to the ${chain.short} pool`, now));
      await d.batch(stmts);
      return { tokens: q.tokens, sats: satsIn, out: q.tokens, tx };
    }
    // sell: amount = tokens
    const tokens = amount;
    const deb = await d.prepare("UPDATE holdings SET balance = balance - ? WHERE rune_id = ? AND wallet = ? AND balance >= ?").bind(tokens, id, address, tokens - 1e-6).run();
    if (!deb.meta.changes) throw new Error(`Not enough ${r.ticker} in your wallet.`);
    const q = sellQuote(r.v_sats, r.v_tokens, tokens);
    if (q.gross > r.real_sats + 1) {
      await d.prepare("UPDATE holdings SET balance = balance + ? WHERE rune_id = ? AND wallet = ?").bind(tokens, id, address).run();
      throw new Error("Not enough liquidity on the curve for this sell.");
    }
    const upd = await d
      .prepare("UPDATE runes SET v_sats = ?, v_tokens = ?, real_sats = real_sats - ?, sold = MAX(0, sold - ?), volume_sats = volume_sats + ?, creator_fees_sats = creator_fees_sats + ?, platform_fees_sats = platform_fees_sats + ? WHERE id = ? AND v_sats = ? AND v_tokens = ?")
      .bind(q.vSats, q.vTokens, q.gross, tokens, q.gross, q.fee / 2, q.fee / 2, id, r.v_sats, r.v_tokens)
      .run();
    if (!upd.meta.changes) {
      await d.prepare("UPDATE holdings SET balance = balance + ? WHERE rune_id = ? AND wallet = ?").bind(tokens, id, address).run();
      continue;
    }
    const out = satsToQuote(quote, q.sats, prices);
    const usd = satsToUsd(q.gross, prices);
    await d.batch([
      d.prepare("INSERT INTO balances (wallet, chain, asset, amount) VALUES (?, ?, ?, ?) ON CONFLICT(wallet, chain, asset) DO UPDATE SET amount = amount + excluded.amount").bind(address, r.chain, quote, out),
      d.prepare("INSERT INTO trades (rune_id, trader, side, sats, tokens, quote, quote_amount, usd, mcap_sats, tx, created_at) VALUES (?, ?, 'sell', ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, address, q.gross, tokens, quote, out, usd, mcapSats(q.vSats, q.vTokens), tx, now),
      d.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, usd, tx, created_at) VALUES ('sell', ?, ?, ?, ?, ?, ?, ?)").bind(id, r.ticker, r.chain, `Sold ${r.ticker}`, usd, tx, now),
    ]);
    return { tokens, sats: q.sats, out, tx };
  }
  throw new Error("The market moved. Try again.");
}

export const trade = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().max(128), id: z.string().max(64), side: z.enum(["buy", "sell"]), quote: z.enum(["ETH", "WBTC", "cbBTC", "USDC", "SOL", "BNB", "BTCB", "USDT"]), amount: z.number().positive().max(1e12) }))
  .handler(async ({ data }) => {
    const address = await requireSession(data.token);
    return doTrade(address, data.id, data.side, data.quote, data.amount);
  });

// ---------------- Bridge to Bitcoin ----------------
export const bridgeToBitcoin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().max(128), id: z.string().max(64), amount: z.number().positive(), btcAddress: z.string().regex(/^(tb1|bc1)[a-z0-9]{20,80}$/, "Use a Taproot or SegWit Bitcoin address (tb1… on testnet).") }))
  .handler(async ({ data }) => {
    const address = await requireSession(data.token);
    const d = db();
    const r = await d.prepare("SELECT ticker, rune_ref, chain FROM runes WHERE id = ?").bind(data.id).first<{ ticker: string; rune_ref: string; chain: string }>();
    if (!r) throw new Error("Rune not found.");
    if (!r.rune_ref) throw new Error("This Rune is still being etched on Bitcoin. Bridging opens a few blocks after launch.");
    const deb = await d.prepare("UPDATE holdings SET balance = balance - ? WHERE rune_id = ? AND wallet = ? AND balance >= ?").bind(data.amount, data.id, address, data.amount - 1e-6).run();
    if (!deb.meta.changes) throw new Error(`Not enough ${r.ticker} to bridge.`);
    const now = Date.now();
    await d.batch([
      d.prepare("UPDATE runes SET bridged = bridged + ? WHERE id = ?").bind(data.amount, data.id),
      d.prepare("INSERT INTO bridges (rune_id, wallet, btc_address, amount, status, created_at) VALUES (?, ?, ?, ?, 'queued', ?)").bind(data.id, address, data.btcAddress, data.amount, now),
      d.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, tx, created_at) VALUES ('bridge', ?, ?, 'bitcoin', ?, ?, ?)").bind(data.id, r.ticker, `${Math.round(data.amount).toLocaleString("en-US")} ${r.ticker} bridged to Bitcoin`, fakeTx(), now),
    ]);
    return { ok: true };
  });

// ---------------- On-chain launchpad helpers ----------------
/** Stores picture/description/links before the on-chain createRune tx; the tx carries `carvy:meta:<id>`. */
export const saveRuneMeta = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      title: z.string().trim().min(1).max(40),
      description: z.string().trim().max(280).default(""),
      imageUrl: z.string().max(200).refine((v) => !v || /^\/media\/uploads\/[a-f0-9]{24}\.(png|jpg|webp|gif)$/.test(v), "Upload the picture again.").default(""),
      website: urlOpt,
      x: urlOpt,
      tg: urlOpt,
      runeName: z.string().max(40).default(""),
    }),
  )
  .handler(async ({ data }) => {
    const id = randomHex(16);
    await db()
      .prepare("INSERT INTO rune_meta (id, title, description, image_url, website, x_url, tg_url, rune_name, created_at, site) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, data.title, data.description, data.imageUrl, data.website, data.x, data.tg, data.runeName.toUpperCase().replace(/\./g, "•"), Date.now(), SITE())
      .run();
    return { id, uri: `${SITE()}:meta:${id}` };
  });

/** Called by the browser right after a confirmed on-chain tx so the site reflects it immediately. */
export const syncNow = createServerFn({ method: "POST" })
  .inputValidator(z.object({ chain: z.string().refine(isChain), tx: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional() }))
  .handler(async ({ data }) => {
    if (data.tx) {
      const { applyReceipt } = await import("../indexer.server");
      await applyReceipt(data.chain as "ethereum", data.tx).catch((e) => console.error("receipt", e));
    }
    await syncChain(data.chain as "ethereum", true).catch(() => {});
    return { ok: true };
  });

// ---------------- Bitcoin side ----------------
export const getBtcStatus = createServerFn({ method: "GET" })
  .inputValidator(z.object({ id: z.string().min(4).max(64) }))
  .handler(async ({ data }) => {
    const { bitcoinStatus } = await import("../btc/service.server");
    return bitcoinStatus(data.id.startsWith("0x") ? data.id.toLowerCase() : data.id);
  });

/** Pre-launch check of the Bitcoin Rune name: length rule at the current height + not already etched. */
export const checkRuneName = createServerFn({ method: "GET" })
  .inputValidator(z.object({ name: z.string().min(1).max(40) }))
  .handler(async ({ data }) => {
    const { parseRuneName, minimumNameLength } = await import("../btc/engine.server");
    const { runeLookup, tipHeight } = await import("../btc/mempool.server");
    let parsed;
    try {
      parsed = parseRuneName(data.name);
    } catch (e) {
      return { ok: false, reason: String((e as Error).message) };
    }
    const height = await tipHeight().catch(() => 0);
    const min = height ? minimumNameLength(height) : 6;
    if (parsed.name.length < min) return { ok: false, reason: `Bitcoin needs at least ${min} letters in a Rune name right now.` };
    const taken = await db()
      .prepare("SELECT id FROM runes WHERE onchain = 1 AND REPLACE(REPLACE(UPPER(rune_name), '•', ''), '.', '') = ? LIMIT 1")
      .bind(parsed.name)
      .first();
    if (taken) return { ok: false, reason: "Another Carvy Rune already uses this name." };
    const r = await runeLookup(parsed.name);
    if (r === null) return { ok: true, reason: "Could not reach the Runes index; the name is checked again before etching." };
    if (r !== "missing") return { ok: false, reason: `${r.spaced} already exists on Bitcoin (${r.id}). Pick another name.` };
    return { ok: true, reason: "" };
  });

export const getDepositInfo = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().max(128) }))
  .handler(async ({ data }) => {
    const address = await requireSession(data.token);
    const { depositAddressFor, depositsFor, incomingFor } = await import("../btc/service.server");
    const dep = await depositAddressFor(address);
    return { address: dep, deposits: await depositsFor(address), incoming: dep ? await incomingFor(dep) : [] };
  });

/** Browser reports a confirmed Solana transaction (launch, trade, bridge) so the site shows it right away. */
export const recordSol = createServerFn({ method: "POST" })
  .inputValidator(z.object({ signature: z.string().min(60).max(100) }))
  .handler(async ({ data }) => {
    const { recordSolTx } = await import("../sol/indexer.server");
    for (let i = 0; i < 6; i++) {
      const r = await recordSolTx(data.signature).catch(() => null);
      if (r) return { id: r };
      await new Promise((res) => setTimeout(res, 2500));
    }
    return { id: null };
  });


/** Solana pools of all Carvy Runes (for the fee wallet's claim card). */
export const getSolPools = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await db().prepare("SELECT id, ticker, launchpad FROM runes WHERE chain = 'solana' AND onchain = 1 AND launchpad <> ''").all<{ id: string; ticker: string; launchpad: string }>();
  return rows.results;
});

/** Holder rewards a connected EVM wallet can claim (Holders fee mode). */
export const getHolderRewards = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().max(128) }))
  .handler(async ({ data }) => {
    const address = await requireSession(data.token);
    if (!address.startsWith("0x")) return [];
    const { holderRewardsFor } = await import("../holders.server");
    return holderRewardsFor(address);
  });
