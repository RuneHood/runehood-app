// Pure wallet signature verification. No runtime bindings: safe to unit test.
// Solana: ed25519 signature over the UTF-8 message (Phantom signMessage). EVM kept for legacy sessions.
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

import { b58decode } from "./base58";

const enc = new TextEncoder();
export const toHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array((h.replace(/^0x/, "").match(/../g) ?? []).map((x) => parseInt(x, 16)));

/** True when `signatureB58` is a valid ed25519 signature of `message` by the Solana address. */
export function verifySolana(message: string, signatureB58: string, address: string): boolean {
  try {
    const sig = b58decode(signatureB58);
    const pub = b58decode(address);
    if (sig.length !== 64 || pub.length !== 32) return false;
    return ed25519.verify(sig, enc.encode(message), pub);
  } catch {
    return false;
  }
}

/** Recover the signer of a personal_sign message. Returns a lowercase 0x address. */
export function recoverPersonal(message: string, signature: string): string {
  const sig = fromHex(signature);
  if (sig.length !== 65) throw new Error("Bad signature length.");
  const msg = enc.encode(message);
  const prefix = enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`);
  const full = new Uint8Array(prefix.length + msg.length);
  full.set(prefix);
  full.set(msg, prefix.length);
  const hash = keccak_256(full);
  let v = sig[64];
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) throw new Error("Bad signature recovery id.");
  const pub = secp256k1.Signature.fromCompact(sig.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(hash).toRawBytes(false);
  return `0x${toHex(keccak_256(pub.slice(1)).slice(-20))}`;
}
