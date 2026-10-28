// Carvy Bitcoin engine: etch a Rune (commit + reveal, name commitment, optional logo inscription) with the full
// 1,000,000,000 premine into the Rune's custody address, and move Runes out of custody (bridge to Bitcoin).
// Pure transaction building + signing; the caller supplies UTXOs, broadcasts and waits for confirmations.
import * as btc from "@scure/btc-signer";
import { schnorr } from "@noble/curves/secp256k1";
import { randomBytes } from "@noble/hashes/utils";
import { encodeRunestone } from "@magiceden-oss/runestone-lib";

export const REGTEST = { bech32: "bcrt", pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef };
export type Net = typeof btc.NETWORK;

export const DIVISIBILITY = 18; // 1 token on EVM (18 decimals) == 1 Rune unit with 18 decimals: exact 1:1
export const PREMINE = 1_000_000_000n * 10n ** 18n;
export const RUNE_DUST = 546n; // sats on every Rune-carrying output
export const COMMIT_CONFIRMATIONS = 6;

const enc = new TextEncoder();

export type Utxo = { txid: string; vout: number; value: bigint; script: Uint8Array };

/** "RUBY•DOGE" / "RUBY.DOGE" -> { name: "RUBYDOGE", spacers bitmask } */
export function parseRuneName(display: string): { name: string; spacers: number; spaced: string } {
  const s = display.toUpperCase().replace(/[.•]/g, "•");
  let name = "";
  let spacers = 0;
  for (const ch of s) {
    if (ch === "•") {
      if (!name.length) throw new Error("Rune name cannot start with a spacer");
      spacers |= 1 << (name.length - 1);
    } else if (/[A-Z]/.test(ch)) name += ch;
    else throw new Error(`Invalid Rune name character: ${ch}`);
  }
  if (!name.length || name.length > 26) throw new Error("Rune name must have 1 to 26 letters");
  if (s.endsWith("•")) throw new Error("Rune name cannot end with a spacer");
  return { name, spacers, spaced: s };
}

/** Mainnet rule: shortest name allowed at a height (names unlock one letter every 17,500 blocks from 840,000). */
export function minimumNameLength(height: number, firstRuneHeight = 840_000, interval = 17_500): number {
  if (height < firstRuneHeight) return 13;
  const steps = Math.floor((height - firstRuneHeight) / interval);
  return Math.max(1, 13 - steps);
}

/** Tapscript: <key> CHECKSIG, then an ord envelope carrying the Rune commitment (tag 13) and optional logo. */
export function commitScript(xonly: Uint8Array, commitment: Uint8Array, logo?: { contentType: string; body: Uint8Array }): Uint8Array {
  const parts: (string | Uint8Array)[] = [xonly, "CHECKSIG", "OP_0", "IF", enc.encode("ord")];
  if (logo) parts.push(new Uint8Array([1]), enc.encode(logo.contentType));
  parts.push(new Uint8Array([13]), commitment);
  if (logo) {
    parts.push("OP_0");
    for (let i = 0; i < logo.body.length; i += 520) parts.push(logo.body.subarray(i, i + 520));
  }
  parts.push("ENDIF");
  return btc.Script.encode(parts as never);
}

export type EtchPlan = {
  runeName: string;
  spacers: number;
  symbol: string;
  commitment: Uint8Array;
  runestone: Uint8Array;
  script: Uint8Array;
  commitAddress: string;
  commitValue: bigint; // what the commit output must hold
  revealFee: bigint;
};

/** Plan an etching. `revealKey` signs the reveal; `custodyAddress` receives the premine (and the logo inscription). */
export function planEtch(opts: {
  displayName: string;
  symbol: string;
  revealKey: Uint8Array; // 32-byte private key
  custodyAddress: string;
  feeRate: bigint; // sat/vB
  net: Net;
  logo?: { contentType: string; body: Uint8Array };
}): EtchPlan {
  const { name, spacers } = parseRuneName(opts.displayName);
  const symbol = [...(opts.symbol || "¤")][0];
  const { encodedRunestone, etchingCommitment } = encodeRunestone({
    etching: { runeName: spacedName(name, spacers), divisibility: DIVISIBILITY, premine: PREMINE, symbol, turbo: true },
    pointer: 0,
  });
  if (!etchingCommitment) throw new Error("Etching commitment missing");
  const xonly = schnorr.getPublicKey(opts.revealKey);
  const script = commitScript(xonly, etchingCommitment, opts.logo);
  const p2tr = btc.p2tr(btc.TAPROOT_UNSPENDABLE_KEY, { script }, opts.net, true);
  // reveal vsize estimate: 1 script-path input (control block + script + sig) + 2 outputs
  const witnessBytes = 64 + 1 + script.length + 3 + 33 + 3;
  const vbytes = BigInt(Math.ceil(10.5 + 41 + 43 + (encodedRunestone.length + 11) + witnessBytes / 4)) + 4n;
  const revealFee = vbytes * opts.feeRate;
  return {
    runeName: name,
    spacers,
    symbol,
    commitment: etchingCommitment,
    runestone: encodedRunestone,
    script,
    commitAddress: p2tr.address!,
    commitValue: RUNE_DUST + revealFee,
    revealFee,
  };
}

function spacedName(name: string, spacers: number) {
  let out = "";
  for (let i = 0; i < name.length; i++) {
    out += name[i];
    if (spacers & (1 << i)) out += "•";
  }
  return out;
}

/** Build + sign the reveal (must be mined >= 6 blocks after the commit). Output 0 = custody (premine + logo). */
export function buildReveal(plan: EtchPlan, commit: { txid: string; vout: number }, opts: { revealKey: Uint8Array; custodyAddress: string; net: Net }) {
  const xonly = schnorr.getPublicKey(opts.revealKey);
  const p2tr = btc.p2tr(btc.TAPROOT_UNSPENDABLE_KEY, { script: plan.script }, opts.net, true);
  const tx = new btc.Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true });
  tx.addInput({ txid: commit.txid, index: commit.vout, witnessUtxo: { script: p2tr.script, amount: plan.commitValue } });
  tx.addOutputAddress(opts.custodyAddress, RUNE_DUST, opts.net);
  tx.addOutput({ script: plan.runestone, amount: 0n });
  // script-path spend of the envelope leaf: <sig> <script> <control block>
  const [cb, leafWithVer] = p2tr.tapLeafScript![0];
  const leafVer = leafWithVer[leafWithVer.length - 1];
  const msg = tx.preimageWitnessV1(0, [p2tr.script], btc.SigHash.DEFAULT, [plan.commitValue], undefined, plan.script, leafVer);
  const sig = schnorr.sign(msg, opts.revealKey, randomBytes(32));
  if (!schnorr.verify(sig, msg, xonly)) throw new Error("reveal signature check failed");
  tx.updateInput(0, { finalScriptWitness: [sig, plan.script, btc.TaprootControlBlock.encode(cb)] });
  return { hex: tx.hex, txid: tx.id, vsize: tx.vsize };
}

/** Pay to an address from simple key-path UTXOs (P2TR or P2WPKH of `key`). Used to fund commits. */
export function buildPayment(opts: {
  inputs: Utxo[];
  key: Uint8Array;
  to: { address: string; amount: bigint }[];
  changeAddress: string;
  feeRate: bigint;
  net: Net;
}) {
  const sel = btc.selectUTXO(
    opts.inputs.map((u) => ({ txid: u.txid, index: u.vout, witnessUtxo: { script: u.script, amount: u.value }, ...tapInternal(u.script, opts.key) })),
    opts.to.map((o) => ({ address: o.address, amount: o.amount })),
    "default",
    { changeAddress: opts.changeAddress, feePerByte: opts.feeRate, bip69: false, createTx: true, network: opts.net, allowUnknownOutputs: true },
  );
  if (!sel || !sel.tx) throw new Error("Not enough BTC in the fee wallet");
  sel.tx.sign(opts.key);
  sel.tx.finalize();
  return { hex: sel.tx.hex, txid: sel.tx.id, fee: sel.fee };
}

function tapInternal(script: Uint8Array, key: Uint8Array) {
  // P2TR key-path inputs need the internal key for signing
  if (script.length === 34 && script[0] === 0x51) return { tapInternalKey: schnorr.getPublicKey(key) };
  return {};
}

/**
 * Bridge out: move `amount` of a Rune from custody to a user's Bitcoin address.
 * Inputs: custody Rune UTXOs (key path) + fee UTXOs. Outputs: 0 user (edict), 1 custody change (pointer), 2 OP_RETURN,
 * 3 BTC change. Unallocated Runes go to the pointer (custody), so nothing can be lost.
 */
export function buildRuneTransfer(opts: {
  runeId: { block: bigint; tx: number };
  amount: bigint;
  toAddress: string;
  custodyInputs: Utxo[];
  custodyKey: Uint8Array;
  custodyAddress: string;
  feeInputs: Utxo[];
  feeKey: Uint8Array;
  feeChangeAddress: string;
  feeRate: bigint;
  net: Net;
}) {
  const { encodedRunestone } = encodeRunestone({ edicts: [{ id: opts.runeId, amount: opts.amount, output: 0 }], pointer: 1 });
  const tx = new btc.Transaction({ allowUnknownOutputs: true });
  let inValue = 0n;
  for (const u of opts.custodyInputs) {
    tx.addInput({ txid: u.txid, index: u.vout, witnessUtxo: { script: u.script, amount: u.value }, ...tapInternal(u.script, opts.custodyKey) });
    inValue += u.value;
  }
  const feeStart = opts.custodyInputs.length;
  for (const u of opts.feeInputs) {
    tx.addInput({ txid: u.txid, index: u.vout, witnessUtxo: { script: u.script, amount: u.value }, ...tapInternal(u.script, opts.feeKey) });
    inValue += u.value;
  }
  tx.addOutputAddress(opts.toAddress, RUNE_DUST, opts.net);
  tx.addOutputAddress(opts.custodyAddress, RUNE_DUST, opts.net);
  tx.addOutput({ script: encodedRunestone, amount: 0n });
  const vbytes = BigInt(11 + 58 * (opts.custodyInputs.length + opts.feeInputs.length) + 43 * 3 + encodedRunestone.length + 11);
  const fee = vbytes * opts.feeRate;
  const change = inValue - RUNE_DUST * 2n - fee;
  if (change < 0n) throw new Error("Not enough BTC for the transfer fee");
  if (change >= 330n) tx.addOutputAddress(opts.feeChangeAddress, change, opts.net);
  for (let i = 0; i < feeStart; i++) tx.signIdx(opts.custodyKey, i);
  for (let i = feeStart; i < feeStart + opts.feeInputs.length; i++) tx.signIdx(opts.feeKey, i);
  tx.finalize();
  return { hex: tx.hex, txid: tx.id, fee };
}

export const p2trAddress = (key: Uint8Array, net: Net) => btc.p2tr(schnorr.getPublicKey(key), undefined, net).address!;
export const p2trScript = (key: Uint8Array, net: Net) => btc.p2tr(schnorr.getPublicKey(key), undefined, net).script;

/**
 * Bridge in: sweep everything at a user's deposit address into custody. Runestone with only `pointer: 0`, so every
 * Rune in the inputs lands on the custody output. Fee paid from the platform wallet.
 */
export function buildSweep(opts: {
  depositInputs: Utxo[];
  depositKey: Uint8Array;
  custodyAddress: string;
  feeInputs: Utxo[];
  feeKey: Uint8Array;
  feeChangeAddress: string;
  feeRate: bigint;
  net: Net;
}) {
  const { encodedRunestone } = encodeRunestone({ pointer: 0 });
  const tx = new btc.Transaction({ allowUnknownOutputs: true });
  let inValue = 0n;
  for (const u of opts.depositInputs) {
    tx.addInput({ txid: u.txid, index: u.vout, witnessUtxo: { script: u.script, amount: u.value }, ...tapInternal(u.script, opts.depositKey) });
    inValue += u.value;
  }
  const feeStart = opts.depositInputs.length;
  for (const u of opts.feeInputs) {
    tx.addInput({ txid: u.txid, index: u.vout, witnessUtxo: { script: u.script, amount: u.value }, ...tapInternal(u.script, opts.feeKey) });
    inValue += u.value;
  }
  tx.addOutputAddress(opts.custodyAddress, RUNE_DUST, opts.net);
  tx.addOutput({ script: encodedRunestone, amount: 0n });
  const vbytes = BigInt(11 + 58 * (opts.depositInputs.length + opts.feeInputs.length) + 43 * 2 + encodedRunestone.length + 11);
  const fee = vbytes * opts.feeRate;
  const change = inValue - RUNE_DUST - fee;
  if (change < 0n) throw new Error("Not enough BTC for the sweep fee");
  if (change >= 330n) tx.addOutputAddress(opts.feeChangeAddress, change, opts.net);
  for (let i = 0; i < feeStart; i++) tx.signIdx(opts.depositKey, i);
  for (let i = feeStart; i < feeStart + opts.feeInputs.length; i++) tx.signIdx(opts.feeKey, i);
  tx.finalize();
  return { hex: tx.hex, txid: tx.id, fee };
}
