// Holders fee mode: accrue the creator share of Holders-mode Runes, track token balances, and every epoch publish a
// cumulative Merkle root on CarvyHolderRewards so holders can claim pro rata.
import { createWalletClient, decodeEventLog, encodeAbiParameters, encodeFunctionData, http, keccak256, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { db } from "./carvy.server";
import { bindings } from "./bindings.server";
import { CHAINS, type ChainId } from "./carvy";
import { DEPLOYMENTS, HOLDER_REWARDS, allBridges, allLaunchpads, firstBlock, liveDeployment, rpcCall, type Deployment } from "./onchain";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const EPOCH_MS = 6 * 3600_000;
const V4_POOL_MANAGER: Partial<Record<ChainId, string>> = {
  ethereum: "0x000000000004444c5dc75cb358380d2e3de08a90",
  base: "0x498581ff718922c3f8e6a244956af099b2652b2b",
  robinhood: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  bsc: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df",
};
/** Uniswap V4 hooks of the V2 launchpads (graduated-pool taxes are paid by them). */
const HOOKS: Partial<Record<ChainId, string[]>> = {
  ethereum: ["0xce8321f8414344dcce44a552937ded3dc586e0cc"],
  base: ["0x2595a0758982f618b742c73aa4eca1aeba6320cc"],
  robinhood: ["0xa7812a2bae16112df08f54c77f2b329829f4a0cc"],
  bsc: ["0x1548df721bfbc76dae64241d56368817f43120cc"],
};
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HOOK_ABI = parseAbi(["event Taxed(bytes32 indexed id, bool buy, address currency, uint256 amount)"]);
const REWARDS_ABI = parseAbi([
  "function setRoot(bytes32 root, string uri)",
  "function pull(address launchpad, address quote)",
  "function claimed(address holder, address asset) view returns (uint256)",
]);
const PAD_ABI = parseAbi(["function claimable(address,address) view returns (uint256)"]);

function withPrivate(chain: ChainId, d: Deployment): Deployment {
  const env = bindings();
  const k = chain === "ethereum" ? env.RPC_ETHEREUM : chain === "base" ? env.RPC_BASE : chain === "robinhood" ? env.RPC_ROBINHOOD : chain === "bsc" ? env.RPC_BSC : undefined;
  return k ? { ...d, rpcs: [k, ...d.rpcs] } : d;
}

async function addAccrued(chain: ChainId, rune: string, asset: string, amount: bigint) {
  if (amount <= 0n) return;
  const D1 = db();
  const row = await D1.prepare("SELECT accrued FROM holder_accrued WHERE chain = ? AND rune_id = ? AND asset = ?").bind(chain, rune, asset).first<{ accrued: string }>();
  const next = (BigInt(row?.accrued ?? "0") + amount).toString();
  await D1.prepare("INSERT INTO holder_accrued (chain, rune_id, asset, accrued) VALUES (?, ?, ?, ?) ON CONFLICT(chain, rune_id, asset) DO UPDATE SET accrued = excluded.accrued").bind(chain, rune, asset, next).run();
}

/** Called by the indexer for every curve Trade of a Holders-mode Rune: creator share + creator tax. */
export async function accrueCurveTrade(chain: ChainId, rune: string, quoteAddress: string, isBuy: boolean, quoteAmount: bigint, feePlusTax: bigint) {
  const gross = isBuy ? quoteAmount : quoteAmount + feePlusTax;
  const fee = (gross * 100n) / 10_000n;
  const platform = fee - (fee * 5_000n) / 10_000n;
  await addAccrued(chain, rune, (quoteAddress || ZERO).toLowerCase(), feePlusTax - platform);
}

const exclusions = (chain: ChainId, d: Deployment) =>
  new Set(
    [ZERO, DEAD, HOLDER_REWARDS[chain] ?? "", V4_POOL_MANAGER[chain] ?? "", ...allLaunchpads(d), ...allBridges(d), ...(HOOKS[chain] ?? [])].map((a) => a.toLowerCase()),
  );

/** Track balances of Holders-mode tokens and attribute graduated-pool taxes (V4 hook / PancakeSwap token tax). */
async function syncHolderLogs(chain: ChainId, d: Deployment) {
  const D1 = db();
  const vault = (HOLDER_REWARDS[chain] ?? "").toLowerCase();
  if (!vault) return;
  const runes = (await D1.prepare("SELECT id, quote_address, pool_id, dex FROM runes WHERE chain = ? AND fee_mode = 'holders' AND onchain = 1").bind(chain).all<{ id: string; quote_address: string; pool_id: string; dex: string }>()).results;
  if (!runes.length) return;
  const head = parseInt(await rpcCall<string>(d, "eth_blockNumber", []), 16) - 3;
  const byPool = new Map(runes.filter((r) => r.pool_id).map((r) => [r.pool_id.toLowerCase(), r]));
  // one cursor per source so a Rune that shows up later is still read from its first block
  const sources: Array<{ key: string; addresses: string[] }> = [
    ...runes.map((r) => ({ key: `hidx:${chain}:${r.id}`, addresses: [r.id] })),
    ...((HOOKS[chain] ?? []).length && byPool.size ? [{ key: `hidx:${chain}:hooks`, addresses: HOOKS[chain]! }] : []),
  ];
  for (const src0 of sources) {
    const row = await D1.prepare("SELECT v FROM cache WHERE k = ?").bind(src0.key).first<{ v: string }>();
    let from = row ? Number(row.v) + 1 : firstBlock(d);
    let rounds = 0;
    while (from <= head && rounds++ < 4) {
      const to = Math.min(head, from + 4_999);
      const logs = await rpcCall<Array<{ address: string; topics: Hex[]; data: Hex }>>(d, "eth_getLogs", [
        { address: src0.addresses, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` },
      ]);
      for (const l of logs) await applyHolderLog(chain, l, vault, byPool);
      await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at").bind(src0.key, String(to), Date.now()).run();
      from = to + 1;
    }
  }
}

async function applyHolderLog(chain: ChainId, l: { address: string; topics: Hex[]; data: Hex }, vault: string, byPool: Map<string, { id: string }>) {
  const D1 = db();
  const addr = l.address.toLowerCase();
  if (l.topics[0] === TRANSFER && l.topics.length === 3) {
    const src = `0x${l.topics[1].slice(26)}`.toLowerCase();
    const dst = `0x${l.topics[2].slice(26)}`.toLowerCase();
    const v = BigInt(l.data);
    for (const [who, delta] of [
      [src, -v],
      [dst, v],
    ] as const) {
      if (who === ZERO) continue;
      const b = await D1.prepare("SELECT balance FROM token_bal WHERE chain = ? AND token = ? AND holder = ?").bind(chain, addr, who).first<{ balance: string }>();
      const nb = BigInt(b?.balance ?? "0") + delta;
      await D1.prepare("INSERT INTO token_bal (chain, token, holder, balance) VALUES (?, ?, ?, ?) ON CONFLICT(chain, token, holder) DO UPDATE SET balance = excluded.balance").bind(chain, addr, who, (nb < 0n ? 0n : nb).toString()).run();
    }
    // PancakeSwap: creator tax is paid in the token itself to the vault
    if (dst === vault && src !== ZERO) await addAccrued(chain, addr, addr, v);
  } else if ((HOOKS[chain] ?? []).includes(addr)) {
    try {
      const ev = decodeEventLog({ abi: HOOK_ABI, topics: l.topics as [Hex, ...Hex[]], data: l.data });
      const a = ev.args as { id: Hex; currency: string; amount: bigint };
      const r = byPool.get(a.id.toLowerCase());
      if (r) await addAccrued(chain, r.id, a.currency.toLowerCase(), a.amount);
    } catch {
      /* other hook events */
    }
  }
}

// ---------------------------------------------------------------- Merkle (OpenZeppelin-compatible, sorted pairs)
const leafOf = (holder: string, asset: string, cumulative: bigint) =>
  keccak256(keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [holder as Hex, asset as Hex, cumulative])));
const hashPair = (a: Hex, b: Hex): Hex => (BigInt(a) < BigInt(b) ? keccak256(`0x${a.slice(2)}${b.slice(2)}`) : keccak256(`0x${b.slice(2)}${a.slice(2)}`));

function buildTree(leaves: Hex[]): { root: Hex; proofs: Hex[][] } {
  if (!leaves.length) return { root: `0x${"0".repeat(64)}`, proofs: [] };
  const layers: Hex[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: Hex[] = [];
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i]);
    layers.push(next);
  }
  const proofs = leaves.map((_, idx) => {
    const p: Hex[] = [];
    let i = idx;
    for (let l = 0; l < layers.length - 1; l++) {
      const sib = i ^ 1;
      if (sib < layers[l].length) p.push(layers[l][sib]);
      i = Math.floor(i / 2);
    }
    return p;
  });
  return { root: layers[layers.length - 1][0], proofs };
}

/** Every 6 hours: pull fees into the vault, allocate new rewards pro rata, publish a new root. */
export async function holdersStep(log: string[], force = false) {
  const D1 = db();
  const last = await D1.prepare("SELECT updated_at FROM cache WHERE k = 'holders-epoch'").first<{ updated_at: number }>();
  const signerKey = (bindings() as { EVM_SIGNER_KEY?: string }).EVM_SIGNER_KEY;
  if (!signerKey) return;
  const account = privateKeyToAccount((signerKey.startsWith("0x") ? signerKey : `0x${signerKey}`) as Hex);
  for (const c of CHAINS) {
    const base = liveDeployment(c.id);
    const vault = HOLDER_REWARDS[c.id];
    if (!base || !vault) continue;
    const d = withPrivate(c.id, base);
    try {
      await syncHolderLogs(c.id, d);
    } catch (e) {
      log.push(`holders ${c.id}: ${(e as Error).message.slice(0, 120)}`);
      continue;
    }
    if (!force && last && Date.now() - last.updated_at < EPOCH_MS) continue;
    const pending = (await D1.prepare("SELECT rune_id, asset, accrued, allocated FROM holder_accrued WHERE chain = ?").bind(c.id).all<{ rune_id: string; asset: string; accrued: string; allocated: string }>()).results.filter(
      (r) => BigInt(r.accrued) > BigInt(r.allocated),
    );
    if (!pending.length) continue;
    const wallet = createWalletClient({ account, transport: http(d.rpcs[0]) });
    const chainDef = { id: d.chainId, name: d.name, nativeCurrency: { name: d.native ?? "Ether", symbol: d.native ?? "ETH", decimals: 18 }, rpcUrls: { default: { http: [d.rpcs[0]] } } };
    // 1) pull curve fees accrued to the vault on every launchpad
    for (const lp of allLaunchpads(d)) {
      for (const q of Object.values(d.quotes)) {
        const owed = BigInt(
          await rpcCall<string>(d, "eth_call", [{ to: lp, data: encodeFunctionData({ abi: PAD_ABI, functionName: "claimable", args: [vault as Hex, q!.address as Hex] }) }, "latest"]).catch(() => "0x0"),
        );
        if (owed > 0n) {
          const h = await wallet.sendTransaction({ chain: chainDef, to: vault as Hex, data: encodeFunctionData({ abi: REWARDS_ABI, functionName: "pull", args: [lp as Hex, q!.address as Hex] }) }).catch(() => null);
          if (h) log.push(`holders ${c.id}: pulled ${owed} of ${q!.address} (${h})`);
        }
      }
    }
    // 2) allocate pro rata by current balances
    const ex = exclusions(c.id, d);
    for (const p of pending) {
      const amount = BigInt(p.accrued) - BigInt(p.allocated);
      let holders = (await D1.prepare("SELECT holder, balance FROM token_bal WHERE chain = ? AND token = ?").bind(c.id, p.rune_id).all<{ holder: string; balance: string }>()).results
        .filter((h) => !ex.has(h.holder) && BigInt(h.balance) > 0n);
      // PancakeSwap pair holds pool tokens, not holders
      const pair = await rpcCall<string>(d, "eth_call", [{ to: p.rune_id, data: "0xa8aa1b31" }, "latest"]).catch(() => "");
      if (pair && pair.length >= 66) holders = holders.filter((h) => h.holder !== `0x${pair.slice(26)}`.toLowerCase());
      const total = holders.reduce((a, h) => a + BigInt(h.balance), 0n);
      if (total === 0n) continue;
      let given = 0n;
      for (const h of holders) {
        const share = (amount * BigInt(h.balance)) / total;
        if (share === 0n) continue;
        given += share;
        const cur = await D1.prepare("SELECT cumulative FROM holder_cum WHERE chain = ? AND holder = ? AND asset = ?").bind(c.id, h.holder, p.asset).first<{ cumulative: string }>();
        await D1.prepare("INSERT INTO holder_cum (chain, holder, asset, cumulative) VALUES (?, ?, ?, ?) ON CONFLICT(chain, holder, asset) DO UPDATE SET cumulative = excluded.cumulative")
          .bind(c.id, h.holder, p.asset, (BigInt(cur?.cumulative ?? "0") + share).toString())
          .run();
      }
      await D1.prepare("UPDATE holder_accrued SET allocated = ? WHERE chain = ? AND rune_id = ? AND asset = ?").bind((BigInt(p.allocated) + given).toString(), c.id, p.rune_id, p.asset).run();
    }
    // 3) new root + proofs
    const rows = (await D1.prepare("SELECT holder, asset, cumulative FROM holder_cum WHERE chain = ? AND cumulative <> '0' ORDER BY holder, asset").bind(c.id).all<{ holder: string; asset: string; cumulative: string }>()).results;
    const leaves = rows.map((r) => leafOf(r.holder, r.asset, BigInt(r.cumulative)));
    const { root, proofs } = buildTree(leaves);
    const h = await wallet
      .sendTransaction({ chain: chainDef, to: vault as Hex, data: encodeFunctionData({ abi: REWARDS_ABI, functionName: "setRoot", args: [root, `epoch:${c.id}:${Date.now()}`] }) })
      .catch((e) => (log.push(`holders ${c.id}: setRoot failed ${(e as Error).message.slice(0, 80)}`), null));
    if (!h) continue;
    for (let i = 0; i < rows.length; i++) {
      await D1.prepare("UPDATE holder_cum SET proof = ?, published = ?, epoch = ? WHERE chain = ? AND holder = ? AND asset = ?")
        .bind(JSON.stringify(proofs[i]), rows[i].cumulative, Date.now(), c.id, rows[i].holder, rows[i].asset)
        .run();
    }
    log.push(`holders ${c.id}: root ${root} for ${rows.length} entries (${h})`);
  }
  if (force || !last || Date.now() - last.updated_at >= EPOCH_MS)
    await D1.prepare("INSERT INTO cache (k, v, updated_at) VALUES ('holders-epoch', '1', ?) ON CONFLICT(k) DO UPDATE SET updated_at = excluded.updated_at").bind(Date.now()).run();
}

/** Claimable holder rewards of a wallet across chains (published cumulative minus already claimed on chain). */
export async function holderRewardsFor(wallet: string) {
  const D1 = db();
  const rows = (await D1.prepare("SELECT chain, asset, published, proof FROM holder_cum WHERE holder = ? AND published <> '0'").bind(wallet.toLowerCase()).all<{ chain: ChainId; asset: string; published: string; proof: string }>()).results;
  const out: Array<{ chain: ChainId; vault: string; asset: string; cumulative: string; claimable: string; proof: Hex[] }> = [];
  for (const r of rows) {
    const d = DEPLOYMENTS[r.chain];
    const vault = HOLDER_REWARDS[r.chain];
    if (!d || !vault) continue;
    const claimed = BigInt(
      await rpcCall<string>(withPrivate(r.chain, d), "eth_call", [{ to: vault, data: encodeFunctionData({ abi: REWARDS_ABI, functionName: "claimed", args: [wallet as Hex, r.asset as Hex] }) }, "latest"]).catch(() => "0x0"),
    );
    const left = BigInt(r.published) - claimed;
    if (left > 0n) out.push({ chain: r.chain, vault, asset: r.asset, cumulative: r.published, claimable: left.toString(), proof: JSON.parse(r.proof || "[]") });
  }
  return out;
}
