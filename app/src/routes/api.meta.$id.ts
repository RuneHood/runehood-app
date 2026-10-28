import { createFileRoute } from "@tanstack/react-router";

import { db } from "../lib/carvy.server";

/** Token metadata JSON (Metaplex standard) for Solana Runes: name, symbol, image, description, links. */
export const Route = createFileRoute("/api/meta/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = String(params.id).replace(/\.json$/, "");
        if (!/^[a-f0-9]{32}$/.test(id)) return new Response("not found", { status: 404 });
        const m = await db()
          .prepare("SELECT title, description, image_url, website, x_url, tg_url FROM rune_meta WHERE id = ?")
          .bind(id)
          .first<{ title: string; description: string; image_url: string; website: string; x_url: string; tg_url: string }>();
        if (!m) return new Response("not found", { status: 404 });
        const origin = new URL(request.url).origin;
        const sym = new URL(request.url).searchParams.get("s") ?? "";
        const image = m.image_url.startsWith("/") ? origin + m.image_url : m.image_url;
        const body = {
          name: m.title,
          symbol: sym,
          description: m.description || `${m.title} on Runehood, a Bitcoin Rune launchpad.`,
          image,
          external_url: m.website || origin,
          properties: { files: [{ uri: image, type: "image/webp" }], category: "image" },
          extensions: { website: m.website || origin, twitter: m.x_url, telegram: m.tg_url },
        };
        return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
      },
    },
  },
});
