// Carvy Bitcoin service (runs from the Worker cron):
//   1) etch every mainnet Rune on Bitcoin (name check -> commit -> 6 confirmations -> reveal -> verify)
//   2) index BridgeOut events from every Carvy bridge contract
//   3) release bridged Runes from custody to the user's Bitcoin address
// Every step is idempotent and stored in D1, so a crash or a slow block never loses or doubles anything.
import * as btc from "@scure/btc-signer";
import type { Hex } from "viem";
import { decodeEventLog } from "viem";

import { db } from "../carvy.server";
import { bindings } from "../bindings.server";
import { BRIDGE_ABI, DEPLOYMENTS, allBridges, firstBlock, liveDeployment, rpcCall, type Deployment } from "../onchain";
import { CHAINS, type ChainId } from "../carvy";
import { PREMINE, RUNE_DUST, COMMIT_CONFIRMATIONS, buildPayment, buildReveal, buildRuneTransfer, buildSweep, minimumNameLength, parseRuneName, planEtch, type EtchPlan, type Utxo } from "./engine.server";
import { sha256 } from "@noble/hashes/sha2";
import { createWalletClient, http, encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addressUtxos, blockTxids, broadcast, confirmations, cpfpInfo, feeRate, recommendedFees, runeLookup, tipHeight, tipHeightCached, txStatus } from "./mempool.server";

const NET = btc.NETWORK;
const MAX_LOGO_BYTES = 40_000;
const hexToBytes = (h: string) => Uint8Array.from((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));
const bytesToHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

type Keys = { fee: Uint8Array; custody: Uint8Array; reveal: Uint8Array; feeAddr: string; custodyAddr: string; hiro: string };

function keys(): Keys | null {
  const e = bindings();
  if (!e.BTC_FEE_KEY || !e.BTC_CUSTODY_KEY || !e.BTC_REVEAL_KEY) return null;
  const fee = hexToBytes(e.BTC_FEE_KEY);
  const custody = hexToBytes(e.BTC_CUSTODY_KEY);
  return {
    fee,
    custody,
    reveal: hexToBytes(e.BTC_REVEAL_KEY),
    feeAddr: btc.p2tr(btc.utils.pubSchnorr(fee), undefined, NET).address!,
    custodyAddr: btc.p2tr(btc.utils.pubSchnorr(custody), undefined, NET).address!,
    hiro: e.HIRO_API_KEY ?? "",
  };
}

export function custodyAddress(): string | null {
  return keys()?.custodyAddr ?? null;
}

async function withLock<T>(name: string, ttlMs: number, f: () => Promise<T>): Promise<T | undefined> {
  const D1 = db();
  const now = Date.now();
  const r = await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES (?, '1', ?) ON CONFLICT(k) DO UPDATE SET v = '1', updated_at = excluded.updated_at WHERE cache.updated_at < ?")
    .bind(`lock:${name}`, now, now - ttlMs)
    .run();
  if (!r.meta.changes) return undefined;
  try {
    return await f();
  } finally {
    await D1.prepare("UPDATE cache SET updated_at = 0 WHERE k = ?").bind(`lock:${name}`).run();
  }
}

export async function runBitcoinJobs(): Promise<string[]> {
  const log: string[] = [];
  const k = keys();
  if (!k) return ["bitcoin keys not configured"];
  await withLock("btc", 4 * 60_000, async () => {
    await queueNewRunes(log);
    await etchStep(k, log);
    await indexBridgeOuts(log);
    await bridgeOutStep(k, log);
    await depositsStep(k, log);
    await mintStep(log);
    await feeBumpStep(k, log).catch((e) => log.push(`fee bump: ${(e as Error).message}`));
    await graduateStep(log).catch((e) => log.push(`graduate: ${(e as Error).message}`));
    const { holdersStep } = await import("../holders.server");
    await holdersStep(log).catch((e) => log.push(`holders: ${(e as Error).message}`));
  });
  return log;
}

// ------------------------------------------------------------------ etching

async function queueNewRunes(log: string[]) {
  const D1 = db();
  const r = await D1.prepare(
    "INSERT OR IGNORE INTO btc_etch (rune_id, rune_name, status, created_at, updated_at) SELECT id, rune_name, 'queued', ?, ? FROM runes WHERE onchain = 1 AND hidden = 0 AND id NOT IN (SELECT rune_id FROM btc_etch)",
  )
    .bind(Date.now(), Date.now())
    .run();
  if (r.meta.changes) log.push(`queued ${r.meta.changes} rune(s) for etching`);
}

async function spendableFeeUtxos(k: Keys): Promise<Utxo[]> {
  const D1 = db();
  const reserved = new Set(
    (await D1.prepare("SELECT v FROM cache WHERE k LIKE 'btcspent:%' AND updated_at > ?").bind(Date.now() - 6 * 3600_000).all<{ v: string }>()).results.map((x) => x.v),
  );
  const script = btc.p2tr(btc.utils.pubSchnorr(k.fee), undefined, NET).script;
  return (await addressUtxos(k.feeAddr))
    .filter((u) => !reserved.has(`${u.txid}:${u.vout}`))
    .sort((a, b) => b.value - a.value)
    .map((u) => ({ txid: u.txid, vout: u.vout, value: BigInt(u.value), script }));
}

async function reserve(utxos: Utxo[]) {
  const D1 = db();
  for (const u of utxos) await D1.prepare("INSERT OR REPLACE INTO cache (k, v, updated_at) VALUES (?, ?, ?)").bind(`btcspent:${u.txid}:${u.vout}`, `${u.txid}:${u.vout}`, Date.now()).run();
}

async function loadLogo(imageUrl: string): Promise<{ contentType: string; body: Uint8Array } | undefined> {
  try {
    const { STORAGE } = bindings();
    let bytes: Uint8Array | null = null;
    let type = "image/webp";
    const m = imageUrl.match(/^\/media\/(uploads\/[a-f0-9]{24}\.(png|jpg|webp|gif))$/);
    if (m && STORAGE) {
      const o = await STORAGE.get(m[1]);
      if (o) {
        bytes = new Uint8Array(await o.arrayBuffer());
        type = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[m[2]]!;
      }
    }
    if (!bytes || bytes.length > MAX_LOGO_BYTES) return undefined;
    return { contentType: type, body: bytes };
  } catch {
    return undefined;
  }
}

async function etchStep(k: Keys, log: string[]) {
  const D1 = db();
  const height = await tipHeight();
  const rows = (await D1.prepare("SELECT e.*, r.ticker, r.image_url FROM btc_etch e JOIN runes r ON r.id = e.rune_id WHERE e.status IN ('queued','committing','committed','revealed','waiting_index') ORDER BY e.created_at LIMIT 10").all<
    Record<string, any>
  >()).results;
  let committedThisRun = false;
  for (const row of rows) {
    const set = (status: string, extra: Record<string, unknown> = {}) => {
      const cols = Object.keys(extra);
      return D1.prepare(`UPDATE btc_etch SET status = ?, updated_at = ?${cols.map((c) => `, ${c} = ?`).join("")} WHERE rune_id = ?`)
        .bind(status, Date.now(), ...cols.map((c) => extra[c] as never), row.rune_id)
        .run();
    };
    try {
      if (row.status === "queued") {
        if (committedThisRun) continue; // one commit per run keeps fee UTXOs simple
        let parsed;
        try {
          parsed = parseRuneName(String(row.rune_name));
        } catch (e) {
          await set("unavailable", { detail: String((e as Error).message) });
          continue;
        }
        const min = minimumNameLength(height);
        if (parsed.name.length < min) {
          await set("unavailable", { detail: `Bitcoin needs at least ${min} letters in a Rune name right now (this one has ${parsed.name.length}).` });
          log.push(`${row.ticker}: name too short`);
          continue;
        }
        const dupe = await D1.prepare("SELECT rune_id FROM btc_etch WHERE rune_id <> ? AND REPLACE(REPLACE(UPPER(rune_name), '•', ''), '.', '') = ? AND status IN ('committing','committed','revealed','waiting_index','etched') LIMIT 1")
          .bind(row.rune_id, parsed.name)
          .first();
        if (dupe) {
          await set("unavailable", { detail: `Another Carvy Rune already uses the Bitcoin name ${parsed.spaced}.` });
          continue;
        }
        const taken = await runeLookup(parsed.name, k.hiro);
        if (taken === null) continue; // index unreachable: try next run
        if (taken !== "missing") {
          await set("unavailable", { detail: `The Rune name ${parsed.spaced} already exists on Bitcoin (${taken.id}).` });
          log.push(`${row.ticker}: name taken`);
          continue;
        }
        const rate = await feeRate();
        const logo = await loadLogo(String(row.image_url ?? ""));
        const plan = planEtch({ displayName: parsed.spaced, symbol: String(row.ticker || "C").slice(0, 1), revealKey: k.reveal, custodyAddress: k.custodyAddr, feeRate: rate, net: NET, logo });
        const utxos = await spendableFeeUtxos(k);
        const commit = buildPayment({ inputs: utxos, key: k.fee, to: [{ address: plan.commitAddress, amount: plan.commitValue }], changeAddress: k.feeAddr, feeRate: rate, net: NET });
        const usedTx = btc.Transaction.fromRaw(hexToBytes(commit.hex));
        const used: Utxo[] = [];
        for (let i = 0; i < usedTx.inputsLength; i++) {
          const inp = usedTx.getInput(i);
          used.push({ txid: bytesToHex(inp.txid!), vout: inp.index!, value: 0n, script: new Uint8Array() });
        }
        await reserve(used);
        const out = usedTx.getOutput(0);
        const vout = out.script && bytesToHex(out.script) === bytesToHex(btc.OutScript.encode(btc.Address(NET).decode(plan.commitAddress))) ? 0 : 1;
        // persist the signed commit + plan BEFORE broadcasting, so a crash can only ever re-send the same tx
        await set("committing", {
          script_hex: bytesToHex(plan.script),
          runestone_hex: bytesToHex(plan.runestone),
          commit_value: Number(plan.commitValue),
          commit_txid: commit.txid,
          commit_hex: commit.hex,
          commit_vout: vout,
          with_logo: logo ? 1 : 0,
          detail: "Commit signed.",
        });
        await broadcast(commit.hex, commit.txid);
        await set("committed", { detail: `Commit sent at ${rate} sat/vB. Reveal after ${COMMIT_CONFIRMATIONS} confirmations.` });
        committedThisRun = true;
        log.push(`${row.ticker}: commit ${commit.txid}`);
      } else if (row.status === "committing") {
        await broadcast(row.commit_hex, row.commit_txid);
        await set("committed", { detail: `Commit sent. Reveal after ${COMMIT_CONFIRMATIONS} confirmations.` });
      } else if (row.status === "committed") {
        const st = await txStatus(row.commit_txid).catch(async (e) => {
          if ((e as { notFound?: boolean }).notFound) await broadcast(row.commit_hex, row.commit_txid);
          throw e;
        });
        if (!st.confirmed || !st.block_height) continue;
        const confs = height - st.block_height + 1;
        // the reveal is mined in a later block, so 5 confirmations now == at least 6 at inclusion
        if (confs < COMMIT_CONFIRMATIONS - 1) {
          await set("committed", { detail: `Commit has ${confs}/${COMMIT_CONFIRMATIONS} confirmations.` });
          continue;
        }
        const plan = { script: hexToBytes(row.script_hex), runestone: hexToBytes(row.runestone_hex), commitValue: BigInt(row.commit_value) } as EtchPlan;
        const reveal = buildReveal(plan, { txid: row.commit_txid, vout: Number(row.commit_vout) }, { revealKey: k.reveal, custodyAddress: k.custodyAddr, net: NET });
        await set("revealed", { reveal_txid: reveal.txid, reveal_hex: reveal.hex, detail: "Reveal signed." });
        await broadcast(reveal.hex, reveal.txid);
        await set("revealed", { detail: "Reveal sent, waiting for the block." });
        log.push(`${row.ticker}: reveal ${reveal.txid}`);
      } else if (row.status === "revealed" || row.status === "waiting_index") {
        const st = await txStatus(row.reveal_txid).catch(async (e) => {
          if ((e as { notFound?: boolean }).notFound && row.reveal_hex) await broadcast(row.reveal_hex, row.reveal_txid);
          throw e;
        });
        if (!st.confirmed || !st.block_hash || !st.block_height) continue;
        const txids = await blockTxids(st.block_hash);
        const idx = txids.indexOf(row.reveal_txid);
        if (idx < 0) continue;
        const ref = `${st.block_height}:${idx}`;
        // independent check by the Runes index: correct id, divisibility and premine
        {
          const e = await runeLookup(ref, k.hiro);
          if (e === null) {
            await set("waiting_index", { detail: "Etched, waiting for the Runes index to confirm." });
            continue;
          }
          if (e === "missing") {
            if (height - st.block_height > 6) await set("failed", { detail: `Reveal ${row.reveal_txid} did not create the Rune. Check manually.` });
            else await set("waiting_index", { detail: "Etched, waiting for the Runes index to confirm." });
            continue;
          }
          if (e.divisibility !== 18 || e.premine !== PREMINE.toString()) {
            await set("failed", { detail: `Index reports divisibility ${e.divisibility}, premine ${e.premine}. Check manually.` });
            continue;
          }
        }
        await D1.batch([
          D1.prepare("UPDATE btc_etch SET status = 'etched', rune_ref = ?, detail = ?, updated_at = ? WHERE rune_id = ?").bind(ref, `Etched in block ${st.block_height}.`, Date.now(), row.rune_id),
          D1.prepare("INSERT OR IGNORE INTO btc_custody (txid, vout, rune_id, rune_ref, amount, created_at) VALUES (?, 0, ?, ?, ?, ?)").bind(row.reveal_txid, row.rune_id, ref, PREMINE.toString(), Date.now()),
          D1.prepare("UPDATE runes SET rune_ref = ? WHERE id = ?").bind(ref, row.rune_id),
          D1.prepare("INSERT INTO activity (kind, rune_id, ticker, chain, text, tx, created_at) VALUES ('etch', ?, ?, 'bitcoin', ?, ?, ?)").bind(row.rune_id, row.ticker, `${row.ticker} etched on Bitcoin · Rune ${ref}`, row.reveal_txid, Date.now()),
        ]);
        log.push(`${row.ticker}: etched ${ref}`);
      }
    } catch (e) {
      await D1.prepare("UPDATE btc_etch SET attempts = attempts + 1, detail = ?, updated_at = ? WHERE rune_id = ?").bind(`Retrying: ${String((e as Error).message).slice(0, 200)}`, Date.now(), row.rune_id).run();
      log.push(`${row.ticker}: error ${(e as Error).message}`);
    }
  }
}

// ------------------------------------------------------------------ bridge out

type RawLog = { address: string; topics: Hex[]; data: Hex; transactionHash: string };
/** Store one BridgeOut log (idempotent). Returns the new id when it was inserted. */
export async function recordBridgeLog(chain: ChainId, l: RawLog): Promise<string | null> {
  const d = liveDeployment(chain);
  if (!d || !allBridges(d).some((b) => b.toLowerCase() === l.address.toLowerCase())) return null;
  let ev;
  try {
    ev = decodeEventLog({ abi: BRIDGE_ABI, topics: l.topics as [Hex, ...Hex[]], data: l.data });
  } catch {
    return null;
  }
  if (ev.eventName !== "BridgeOut") return null;
  const a = ev.args as { token: string; from: string; amount: bigint; btcAddress: string; nonce: bigint };
  const id = `${chain}:${l.address.toLowerCase()}:${a.nonce}`;
  const ins = await db()
    .prepare("INSERT OR IGNORE INTO btc_out (id, chain, bridge, nonce, token, from_addr, amount, btc_address, evm_tx, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)")
    .bind(id, chain, l.address.toLowerCase(), Number(a.nonce), a.token.toLowerCase(), a.from.toLowerCase(), a.amount.toString(), a.btcAddress, l.transactionHash, Date.now(), Date.now())
    .run();
  return ins.meta.changes ? id : null;
}

async function indexBridgeOuts(log: string[]) {
  const D1 = db();
  for (const c of CHAINS) {
    const d0 = liveDeployment(c.id);
    if (!d0) continue;
    const d = withPrivate(c.id, d0);
    const key = `bidx:${c.id}`;
    const row = await D1.prepare("SELECT v FROM cache WHERE k = ?").bind(key).first<{ v: string }>();
    let from = row ? Number(row.v) + 1 : firstBlock(d);
    try {
      const head = parseInt(await rpcCall<string>(d, "eth_blockNumber", []), 16) - 3; // small lag: load-balanced RPC nodes can trail the head
      let rounds = 0;
      while (from <= head && rounds++ < 6) {
        const to = Math.min(head, from + 4_999);
        const logs = await rpcCall<Array<{ address: string; topics: Hex[]; data: Hex; transactionHash: string }>>(d, "eth_getLogs", [
          { address: allBridges(d), fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` },
        ]);
        for (const l of logs) {
          const id = await recordBridgeLog(c.id, l);
          if (id) log.push(`bridge-out queued ${id}`);
        }
        await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(key, String(to), Date.now()).run();
        from = to + 1;
      }
    } catch (e) {
      log.push(`bridge index ${c.id}: ${(e as Error).message}`);
    }
  }
}

function withPrivate(chain: ChainId, d: Deployment): Deployment {
  const env = bindings();
  const k = chain === "ethereum" ? env.RPC_ETHEREUM : chain === "base" ? env.RPC_BASE : chain === "robinhood" ? env.RPC_ROBINHOOD : chain === "bsc" ? env.RPC_BSC : undefined;
  return k ? { ...d, rpcs: [k, ...d.rpcs] } : d;
}

function validBtcAddress(a: string): boolean {
  try {
    const dec = btc.Address(NET).decode(a);
    return ["tr", "wpkh", "wsh", "pkh", "sh"].includes(dec.type);
  } catch {
    return false;
  }
}

async function bridgeOutStep(k: Keys, log: string[]) {
  const D1 = db();
  const limit = Number(bindings().BTC_DAILY_OUT_LIMIT ?? "200");
  const today = (await D1.prepare("SELECT COUNT(*) AS n FROM btc_out WHERE status = 'sent' AND updated_at > ?").bind(Date.now() - 86_400_000).first<{ n: number }>())?.n ?? 0;
  if (today >= limit) {
    log.push("daily bridge limit reached");
    return;
  }
  const rows = (await D1.prepare("SELECT o.*, e.rune_ref, e.status AS etch_status FROM btc_out o LEFT JOIN btc_etch e ON e.rune_id = o.token WHERE o.status IN ('queued','signed') ORDER BY o.created_at LIMIT 5").all<Record<string, any>>()).results;
  for (const o of rows) {
    const set = (status: string, detail: string, txid = "") =>
      D1.prepare("UPDATE btc_out SET status = ?, detail = ?, btc_txid = CASE WHEN ? <> '' THEN ? ELSE btc_txid END, updated_at = ? WHERE id = ?").bind(status, detail, txid, txid, Date.now(), o.id).run();
    try {
      if (o.status === "signed") {
        await broadcast(o.tx_hex, o.btc_txid);
        await set("sent", "Sent on Bitcoin.", o.btc_txid);
        continue;
      }
      if (o.etch_status !== "etched" || !o.rune_ref) {
        await set("queued", "Waiting for the Rune to be etched on Bitcoin.");
        continue;
      }
      if (!validBtcAddress(o.btc_address)) {
        await set("manual", "Invalid Bitcoin address. Tokens are held for a manual refund.");
        continue;
      }
      const amount = BigInt(o.amount);
      const cus = (await D1.prepare("SELECT * FROM btc_custody WHERE rune_id = ? AND spent = 0 ORDER BY CAST(amount AS REAL) DESC").bind(o.token).all<Record<string, any>>()).results;
      const single = cus.find((c) => BigInt(c.amount) >= amount);
      const picked = single ? [single] : cus;
      const total = picked.reduce((a, c) => a + BigInt(c.amount), 0n);
      if (!picked.length || total < amount) {
        await set("manual", "Custody balance does not cover this amount. Held for manual review.");
        continue;
      }
      const [block, txIdx] = String(o.rune_ref).split(":").map(Number);
      const custodyScript = btc.p2tr(btc.utils.pubSchnorr(k.custody), undefined, NET).script;
      const feeUtxos = await spendableFeeUtxos(k);
      const rate = await feeRate();
      const need = 2000n * rate + 2n * RUNE_DUST;
      const feeIn = feeUtxos.find((u) => u.value >= need);
      if (!feeIn) {
        log.push(feeUtxos.length ? "fee UTXO in use by a pending tx, next run continues" : "fee wallet low");
        await set("queued", "Waiting for the fee wallet to be topped up.");
        return;
      }
      const tx = buildRuneTransfer({
        runeId: { block: BigInt(block), tx: txIdx },
        amount,
        toAddress: o.btc_address,
        custodyInputs: picked.map((c) => ({ txid: c.txid, vout: Number(c.vout), value: RUNE_DUST, script: custodyScript })),
        custodyKey: k.custody,
        custodyAddress: k.custodyAddr,
        feeInputs: [feeIn],
        feeKey: k.fee,
        feeChangeAddress: k.feeAddr,
        feeRate: rate,
        net: NET,
      });
      await reserve([feeIn]);
      await D1.batch([
        ...picked.map((c) => D1.prepare("UPDATE btc_custody SET spent = 1 WHERE txid = ? AND vout = ?").bind(c.txid, c.vout)),
        D1.prepare("INSERT OR IGNORE INTO btc_custody (txid, vout, rune_id, rune_ref, amount, created_at) VALUES (?, 1, ?, ?, ?, ?)").bind(tx.txid, o.token, o.rune_ref, (total - amount).toString(), Date.now()),
        D1.prepare("UPDATE btc_out SET status = 'signed', btc_txid = ?, tx_hex = ?, updated_at = ? WHERE id = ? AND status = 'queued'").bind(tx.txid, tx.hex, Date.now(), o.id),
        D1.prepare("UPDATE runes SET bridged = bridged + ? WHERE id = ?").bind(Number(amount) / 1e18, o.token),
      ]);
      await broadcast(tx.hex, tx.txid);
      await set("sent", "Sent on Bitcoin.", tx.txid);
      log.push(`bridge-out ${o.id} -> ${tx.txid}`);
    } catch (e) {
      const cur = await D1.prepare("SELECT status FROM btc_out WHERE id = ?").bind(o.id).first<{ status: string }>();
      await set(cur?.status === "signed" ? "signed" : "queued", `Retrying: ${String((e as Error).message).slice(0, 200)}`);
      log.push(`bridge-out ${o.id}: ${(e as Error).message}`);
    }
  }
}

export async function bitcoinStatus(runeId: string) {
  const D1 = db();
  const e = await D1.prepare("SELECT status, detail, commit_txid, reveal_txid, rune_ref, with_logo, created_at, updated_at FROM btc_etch WHERE rune_id = ?")
    .bind(runeId)
    .first<{ status: string; detail: string; commit_txid: string; reveal_txid: string; rune_ref: string; with_logo: number; created_at: number; updated_at: number }>();
  const outs = (
    await D1.prepare("SELECT id, from_addr, amount, btc_address, status, btc_txid, detail, created_at, updated_at FROM btc_out WHERE token = ? ORDER BY created_at DESC LIMIT 20")
      .bind(runeId)
      .all<{ id: string; from_addr: string; amount: string; btc_address: string; status: string; btc_txid: string; detail: string; created_at: number; updated_at: number }>()
  ).results;
  const cu = await D1.prepare("SELECT txid, vout, amount FROM btc_custody WHERE rune_id = ? AND spent = 0 LIMIT 1").bind(runeId).first<{ txid: string; vout: number; amount: string }>();
  // live confirmation counts so the page can show real progress + time left
  const etchLive = e
    ? {
        ...e,
        commit_confs: e.commit_txid && ["committed", "revealed", "waiting_index"].includes(e.status) ? await confirmations(e.commit_txid) : e.commit_txid ? 6 : 0,
        reveal_confs: e.reveal_txid && e.status !== "etched" ? await confirmations(e.reveal_txid) : e.reveal_txid ? 1 : 0,
      }
    : null;
  const outsLive = await Promise.all(outs.map(async (o) => ({ ...o, confs: o.btc_txid && (o.status === "sent" || o.status === "signed") && Date.now() - o.updated_at < 6 * 3600_000 ? await confirmations(o.btc_txid) : o.btc_txid ? 6 : 0 })));
  const tip = await tipHeightCached().catch(() => 0);
  return { etch: etchLive, outs: outsLive, tip, now: Date.now(), custody: cu ? { txid: cu.txid, vout: cu.vout, amount: cu.amount, address: custodyAddress() ?? "" } : null };
}

export const DEPLOYMENTS_FOR_BTC = DEPLOYMENTS;

// ------------------------------------------------------------------ bridge in (Bitcoin -> EVM)

function depositKeyFor(k: Keys, wallet: string): Uint8Array {
  const id = wallet.startsWith("0x") ? wallet.toLowerCase() : wallet; // Solana addresses are case-sensitive
  return sha256(new TextEncoder().encode(`carvy-deposit-v1:${bytesToHex(k.custody)}:${id}`));
}

/** Personal Bitcoin deposit address for an EVM wallet. Runes sent there are swept into custody and minted 1:1. */
export async function depositAddressFor(evm: string): Promise<string | null> {
  const k = keys();
  if (!k || !(/^0x[0-9a-fA-F]{40}$/.test(evm) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(evm))) return null;
  const addr = btc.p2tr(btc.utils.pubSchnorr(depositKeyFor(k, evm)), undefined, NET).address!;
  await db().prepare("INSERT OR IGNORE INTO btc_deposit (evm_address, btc_address, created_at) VALUES (?, ?, ?)").bind(evm.startsWith("0x") ? evm.toLowerCase() : evm, addr, Date.now()).run();
  return addr;
}

type IndexedBalance = { id: string; amount: bigint };

/** Rune balances of an address from the Xverse index, in raw units (18 decimals for Carvy Runes). */
async function runeBalances(addr: string): Promise<IndexedBalance[] | null> {
  try {
    const r = await fetch(`https://api.xverse.app/v2/address/${addr}/rune-balance`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    // amounts are raw u128 integers written as JSON numbers: quote them before parsing so no precision is lost
    const t = (await r.text()).replace(/"(amount|balance)"\s*:\s*(\d+)/g, '"$1":"$2"');
    const arr = JSON.parse(t) as Array<Record<string, unknown>>;
    const out: IndexedBalance[] = [];
    for (const x of arr) {
      const id = String(x.runeId ?? x.id ?? "");
      const div = Number(x.divisibility ?? 0);
      const raw = String(x.amount ?? x.balance ?? "");
      if (!/^\d+:\d+$/.test(id) || !raw) return null; // unknown format: never guess
      // amount may be given in display units (with decimals) or raw units
      let amt: bigint;
      if (raw.includes(".")) {
        const [i, f = ""] = raw.split(".");
        amt = BigInt(i) * 10n ** BigInt(div) + BigInt((f + "0".repeat(div)).slice(0, div) || "0");
      } else amt = BigInt(raw);
      out.push({ id, amount: amt });
    }
    return out;
  } catch {
    return null;
  }
}

async function depositsStep(k: Keys, log: string[]) {
  const D1 = db();
  const deps = (await D1.prepare("SELECT * FROM btc_deposit ORDER BY last_checked ASC LIMIT 15").all<{ evm_address: string; btc_address: string; note: string }>()).results;
  if (!deps.length) return;
  const height = await tipHeight();
  const carvy = new Map(
    (await D1.prepare("SELECT e.rune_id, e.rune_ref, r.chain FROM btc_etch e JOIN runes r ON r.id = e.rune_id WHERE e.status = 'etched'").all<{ rune_id: string; rune_ref: string; chain: string }>()).results.map((r) => [
      r.rune_ref,
      r,
    ]),
  );
  for (const d of deps) {
    await D1.prepare("UPDATE btc_deposit SET last_checked = ? WHERE evm_address = ?").bind(Date.now(), d.evm_address).run();
    const utxos = await addressUtxos(d.btc_address).catch(() => null);
    if (!utxos || !utxos.length) continue;
    if (utxos.some((u) => !u.status.confirmed || height - (u.status.block_height ?? height) + 1 < 3)) continue; // wait for 3 confirmations
    const bal = await runeBalances(d.btc_address);
    if (bal === null) continue;
    const snapshot = JSON.stringify(bal.map((b) => [b.id, b.amount.toString()]));
    if (snapshot !== d.note) {
      // require the same balance on two consecutive checks so a lagging index can never under/over-credit
      await D1.prepare("UPDATE btc_deposit SET note = ? WHERE evm_address = ?").bind(snapshot, d.evm_address).run();
      continue;
    }
    const mine = bal.filter((b) => b.amount > 0n);
    if (!mine.length) continue;
    if (mine.length !== 1 || !carvy.has(mine[0].id)) {
      await D1.prepare("UPDATE btc_deposit SET note = ? WHERE evm_address = ?").bind(`manual:${snapshot}`, d.evm_address).run();
      log.push(`deposit ${d.btc_address}: contains other Runes, held for review`);
      continue;
    }
    const rune = carvy.get(mine[0].id)!;
    const depKey = depositKeyFor(k, d.evm_address);
    const depScript = btc.p2tr(btc.utils.pubSchnorr(depKey), undefined, NET).script;
    const fees = await spendableFeeUtxos(k);
    const rate = await feeRate();
    const feeIn = fees.find((u) => u.value >= 3000n * rate);
    if (!feeIn) {
      log.push("fee wallet low (deposits)");
      return;
    }
    const sweep = buildSweep({
      depositInputs: utxos.map((u) => ({ txid: u.txid, vout: u.vout, value: BigInt(u.value), script: depScript })),
      depositKey: depKey,
      custodyAddress: k.custodyAddr,
      feeInputs: [feeIn],
      feeKey: k.fee,
      feeChangeAddress: k.feeAddr,
      feeRate: rate,
      net: NET,
    });
    await reserve([feeIn]);
    await D1.batch([
      D1.prepare("INSERT OR IGNORE INTO btc_in (id, evm_address, deposit_address, rune_id, rune_ref, amount, chain, status, tx_hex, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'swept', ?, ?, ?)").bind(
        sweep.txid,
        d.evm_address,
        d.btc_address,
        rune.rune_id,
        rune.rune_ref,
        mine[0].amount.toString(),
        rune.chain,
        sweep.hex,
        Date.now(),
        Date.now(),
      ),
      D1.prepare("UPDATE btc_deposit SET note = '' WHERE evm_address = ?").bind(d.evm_address),
    ]);
    await broadcast(sweep.hex, sweep.txid);
    log.push(`deposit swept ${sweep.txid} (${mine[0].amount} of ${rune.rune_ref})`);
  }
}

const BRIDGE_IN_ABI = parseAbi(["function bridgeIn(address token,address to,uint256 amount,bytes32 btcTxid,uint32 vout,bytes sig)"]);

async function mintStep(log: string[]) {
  const D1 = db();
  const signerKey = (bindings() as { EVM_SIGNER_KEY?: string }).EVM_SIGNER_KEY ?? "";
  const rows = (await D1.prepare("SELECT i.*, r.launchpad FROM btc_in i JOIN runes r ON r.id = i.rune_id WHERE i.status = 'swept' ORDER BY i.created_at LIMIT 5").all<Record<string, any>>()).results;
  if (!rows.length) return;
  const height = await tipHeight();
  const account = signerKey ? privateKeyToAccount((signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`) as Hex) : null;
  for (const row of rows) {
    try {
      const st = await txStatus(row.id).catch(async (e) => {
        if ((e as { notFound?: boolean }).notFound && row.tx_hex) await broadcast(row.tx_hex, row.id);
        throw e;
      });
      if (!st.confirmed || !st.block_height || height - st.block_height + 1 < 2) continue;
      if (row.chain === "solana") {
        const sig = await releaseFromSolVault(row.rune_id, row.evm_address, BigInt(row.amount));
        await D1.batch([
          D1.prepare("UPDATE btc_in SET status = 'minted', evm_tx = ?, updated_at = ? WHERE id = ?").bind(sig, Date.now(), row.id),
          D1.prepare("INSERT OR IGNORE INTO btc_custody (txid, vout, rune_id, rune_ref, amount, created_at) VALUES (?, 0, ?, ?, ?, ?)").bind(row.id, row.rune_id, row.rune_ref, row.amount, Date.now()),
          D1.prepare("UPDATE runes SET bridged = MAX(0, bridged - ?) WHERE id = ?").bind(Number(BigInt(row.amount) / 10n ** 12n) / 1e6, row.rune_id),
        ]);
        log.push(`released ${row.amount} on solana: ${sig}`);
        continue;
      }
      const d0 = liveDeployment(row.chain);
      if (!d0 || !account) continue;
      const d = withPrivate(row.chain, d0);
      const lp = String(row.launchpad || d.launchpad).toLowerCase();
      const bridge = (lp === d.launchpad.toLowerCase() ? d.bridge : d.legacy.find((l) => l.launchpad.toLowerCase() === lp)?.bridge ?? d.bridge) as Hex;
      const amount = BigInt(row.amount);
      const btcTxid = `0x${row.id}` as Hex;
      const sig = await account.signTypedData({
        domain: { name: "CarvyBridge", version: "1", chainId: d.chainId, verifyingContract: bridge },
        types: { BridgeIn: [{ name: "token", type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "btcTxid", type: "bytes32" }, { name: "vout", type: "uint32" }] },
        primaryType: "BridgeIn",
        message: { token: row.rune_id as Hex, to: row.evm_address as Hex, amount, btcTxid, vout: 0 },
      });
      const wallet = createWalletClient({ account, transport: http(d.rpcs[0]) });
      const hash = await wallet.sendTransaction({
        chain: { id: d.chainId, name: d.name, nativeCurrency: { name: d.native ?? "Ether", symbol: d.native ?? "ETH", decimals: 18 }, rpcUrls: { default: { http: [d.rpcs[0]] } } },
        to: bridge,
        data: encodeFunctionData({ abi: BRIDGE_IN_ABI, functionName: "bridgeIn", args: [row.rune_id as Hex, row.evm_address as Hex, amount, btcTxid, 0, sig] }),
      });
      await D1.batch([
        D1.prepare("UPDATE btc_in SET status = 'minted', evm_tx = ?, updated_at = ? WHERE id = ?").bind(hash, Date.now(), row.id),
        D1.prepare("INSERT OR IGNORE INTO btc_custody (txid, vout, rune_id, rune_ref, amount, created_at) VALUES (?, 0, ?, ?, ?, ?)").bind(row.id, row.rune_id, row.rune_ref, row.amount, Date.now()),
        D1.prepare("UPDATE runes SET bridged = MAX(0, bridged - ?) WHERE id = ?").bind(Number(amount) / 1e18, row.rune_id),
      ]);
      log.push(`minted ${row.amount} on ${row.chain}: ${hash}`);
    } catch (e) {
      const m = String((e as Error).message);
      if (/AlreadyProcessed/.test(m)) await D1.prepare("UPDATE btc_in SET status = 'minted', detail = 'already processed', updated_at = ? WHERE id = ?").bind(Date.now(), row.id).run();
      else await D1.prepare("UPDATE btc_in SET detail = ?, updated_at = ? WHERE id = ?").bind(`Retrying: ${m.slice(0, 200)}`, Date.now(), row.id).run();
      log.push(`mint ${row.id}: ${m.slice(0, 120)}`);
    }
  }
}

export async function depositsFor(evm: string) {
  const rows = (
    await db()
      .prepare("SELECT i.id, i.amount, i.status, i.evm_tx, i.chain, i.created_at, i.updated_at, r.ticker FROM btc_in i JOIN runes r ON r.id = i.rune_id WHERE i.evm_address = ? ORDER BY i.created_at DESC LIMIT 20")
      .bind(evm.startsWith("0x") ? evm.toLowerCase() : evm)
      .all<{ id: string; amount: string; status: string; evm_tx: string; chain: string; created_at: number; updated_at: number; ticker: string }>()
  ).results;
  return Promise.all(rows.map(async (r) => ({ ...r, confs: r.status === "swept" ? await confirmations(r.id) : r.status === "minted" ? 2 : 0 })));
}

/** Runes sent to a deposit address that are not swept yet (shown as "incoming" with confirmations). */
export async function incomingFor(depositAddress: string) {
  const utxos = await addressUtxos(depositAddress).catch(() => []);
  const tip = await tipHeightCached().catch(() => 0);
  const seen = new Set<string>();
  const out: Array<{ txid: string; confs: number }> = [];
  for (const u of utxos) {
    if (seen.has(u.txid)) continue;
    seen.add(u.txid);
    out.push({ txid: u.txid, confs: u.status.confirmed && u.status.block_height && tip ? tip - u.status.block_height + 1 : 0 });
  }
  return out;
}

// ------------------------------------------------------------------ automatic fee bump (CPFP)

/**
 * If a platform transaction (commit, etch, bridge, sweep) sits in the mempool below the half-hour fee rate,
 * spend its fee-wallet change output to ourselves with enough fee that the whole package confirms next block.
 */
async function feeBumpStep(k: Keys, log: string[]) {
  const D1 = db();
  const last = await D1.prepare("SELECT updated_at FROM cache WHERE k = 'btcbump'").first<{ updated_at: number }>();
  if (last && Date.now() - last.updated_at < 20 * 60_000) return;
  const reserved = new Set((await D1.prepare("SELECT v FROM cache WHERE k LIKE 'btcspent:%' AND updated_at > ?").bind(Date.now() - 6 * 3600_000).all<{ v: string }>()).results.map((x) => x.v));
  const pending = (await addressUtxos(k.feeAddr)).filter((u) => !u.status.confirmed && !reserved.has(`${u.txid}:${u.vout}`));
  if (!pending.length) return;
  const fees = await recommendedFees();
  for (const u of pending) {
    const info = await cpfpInfo(u.txid).catch(() => null);
    if (!info || info.effectiveFeePerVsize >= fees.halfHourFee) continue;
    const cluster = info.cluster?.txs ?? [];
    const pkgFee = cluster.reduce((a, t) => a + t.fee, 0);
    const pkgVsize = cluster.reduce((a, t) => a + Math.ceil(t.weight / 4), 0);
    const target = Math.max(2, fees.fastestFee + 1);
    const childVsize = 111;
    const fee = BigInt(Math.max(childVsize * target, target * (pkgVsize + childVsize) - pkgFee));
    if (BigInt(u.value) - fee < 1000n) continue;
    const script = btc.p2tr(btc.utils.pubSchnorr(k.fee), undefined, NET).script;
    const tx = new btc.Transaction();
    tx.addInput({ txid: u.txid, index: u.vout, witnessUtxo: { script, amount: BigInt(u.value) }, tapInternalKey: btc.utils.pubSchnorr(k.fee) });
    tx.addOutputAddress(k.feeAddr, BigInt(u.value) - fee, NET);
    tx.sign(k.fee);
    tx.finalize();
    await reserve([{ txid: u.txid, vout: u.vout, value: BigInt(u.value), script }]);
    await broadcast(tx.hex, tx.id);
    await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES ('btcbump', ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(tx.id, Date.now()).run();
    log.push(`fee bump ${tx.id}: ${fee} sats so ${cluster.length} waiting tx confirm at ~${target} sat/vB`);
    return;
  }
}

/** Release SPL tokens from the Solana bridge vault to a user (bridge in from Bitcoin). Returns the signature. */
async function releaseFromSolVault(mint: string, to: string, runeUnits: bigint): Promise<string> {
  const raw = (bindings() as { SOL_VAULT_KEY?: string }).SOL_VAULT_KEY;
  if (!raw) throw new Error("Solana vault key not configured");
  const { Connection, Keypair, PublicKey, Transaction } = await import("@solana/web3.js");
  const spl = await import("@solana/spl-token");
  const { SOL_RPCS, SOL_TO_RUNE } = await import("../sol/config");
  const vault = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  const conn = new Connection(SOL_RPCS[0], "confirmed");
  const mintPk = new PublicKey(mint);
  const toPk = new PublicKey(to);
  const from = spl.getAssociatedTokenAddressSync(mintPk, vault.publicKey);
  const dest = spl.getAssociatedTokenAddressSync(mintPk, toPk);
  const amount = runeUnits / SOL_TO_RUNE;
  const bal = await conn.getTokenAccountBalance(from).catch(() => null);
  if (!bal || BigInt(bal.value.amount) < amount) throw new Error("Solana vault does not hold enough tokens; held for review");
  const tx = new Transaction().add(
    spl.createAssociatedTokenAccountIdempotentInstruction(vault.publicKey, dest, toPk, mintPk),
    spl.createTransferCheckedInstruction(from, mintPk, dest, vault.publicKey, amount, 6),
  );
  tx.feePayer = vault.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(vault);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

// ------------------------------------------------------------------ automatic graduation (EVM V2)

/** A sold-out curve is moved to its DEX (Uniswap V4, or PancakeSwap on BNB Chain) by anyone calling migrate(); Carvy does it automatically. */
async function graduateStep(log: string[]) {
  const signerKey = (bindings() as { EVM_SIGNER_KEY?: string }).EVM_SIGNER_KEY;
  if (!signerKey) return;
  const D1 = db();
  const rows = (await D1.prepare("SELECT id, ticker, chain, launchpad FROM runes WHERE onchain = 1 AND graduated = 1 AND migrated = 0 AND chain <> 'solana' LIMIT 3").all<{ id: string; ticker: string; chain: ChainId; launchpad: string }>()).results;
  if (!rows.length) return;
  const account = privateKeyToAccount((signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`) as Hex);
  for (const r of rows) {
    const d0 = liveDeployment(r.chain);
    if (!d0 || (r.launchpad && r.launchpad.toLowerCase() !== d0.launchpad.toLowerCase())) continue; // V1 curves graduate differently
    const key = `grad:${r.id}`;
    const tried = await D1.prepare("SELECT updated_at FROM cache WHERE k = ?").bind(key).first<{ updated_at: number }>();
    if (tried && Date.now() - tried.updated_at < 10 * 60_000) continue;
    await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES (?, '', ?) ON CONFLICT(k) DO UPDATE SET updated_at = excluded.updated_at").bind(key, Date.now()).run();
    const d = withPrivate(r.chain, d0);
    const wallet = createWalletClient({ account, transport: http(d.rpcs[0]) });
    try {
      const hash = await wallet.sendTransaction({
        chain: { id: d.chainId, name: d.name, nativeCurrency: { name: d.native ?? "Ether", symbol: d.native ?? "ETH", decimals: 18 }, rpcUrls: { default: { http: [d.rpcs[0]] } } },
        to: d.launchpad as Hex,
        data: encodeFunctionData({ abi: parseAbi(["function migrate(address token)"]), functionName: "migrate", args: [r.id as Hex] }),
      });
      log.push(`${r.ticker}: graduation sent ${hash}`);
    } catch (e) {
      log.push(`${r.ticker}: graduation not possible yet (${String((e as Error).message).split("\n")[0].slice(0, 80)})`);
    }
  }
}
