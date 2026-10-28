// Dependency-free base58 (Bitcoin alphabet, used by Solana) and address helpers. Safe on client and server.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function b58encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return "1".repeat(zeros) + out;
}

export function b58decode(s: string): Uint8Array {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros++;
  let n = 0n;
  for (const c of s) {
    const v = MAP.get(c);
    if (v === undefined) throw new Error("Invalid base58 character.");
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes]);
}

/** Solana address: base58 of a 32-byte public key. Case sensitive, never lowercase it. */
export const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function isSolAddress(a: string): boolean {
  if (!SOL_ADDR_RE.test(a)) return false;
  try {
    return b58decode(a).length === 32;
  } catch {
    return false;
  }
}

/** Normalise any wallet id for storage: EVM addresses lowercase, Solana addresses untouched. */
export const normAddr = (a: string) => (/^0x[0-9a-fA-F]{40}$/.test(a) ? a.toLowerCase() : a.trim());
