import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";

/** Operator endpoint: run the indexer + Bitcoin jobs now (same work as the cron). Needs the ADMIN_TOKEN secret. */
export const Route = createFileRoute("/api/admin/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (bindings() as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
        if (!token || request.headers.get("authorization") !== `Bearer ${token}`) return new Response("forbidden", { status: 403 });
        const { syncAllChains, applyReceipt } = await import("../lib/indexer.server");
        const body = (await request.json().catch(() => null)) as { receipts?: Array<{ chain: string; tx: string }>; holdersEpoch?: boolean } | null;
        for (const r of body?.receipts ?? []) {
          if (r.chain === "solana") {
            const { recordSolTx } = await import("../lib/sol/indexer.server");
            await recordSolTx(r.tx).catch((e) => console.error("replay sol", e));
          } else await applyReceipt(r.chain as "bsc", r.tx).catch(() => false);
        }
        const { runBitcoinJobs } = await import("../lib/btc/service.server");
        await syncAllChains(true).catch(() => {});
        const { syncSolana } = await import("../lib/sol/indexer.server");
        await syncSolana().catch(() => {});
        const log = await runBitcoinJobs().catch((e) => [`error ${(e as Error).message}`]);
        if (body?.holdersEpoch) {
          const { holdersStep } = await import("../lib/holders.server");
          await holdersStep(log, true).catch((e) => log.push(`holders: ${(e as Error).message}`));
        }
        return new Response(JSON.stringify({ log }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
