import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = String((params as { _splat?: string })._splat ?? "");
        const m = key.match(/^uploads\/[a-f0-9]{24}\.(png|jpg|webp|gif)$/);
        if (!m) return new Response("Not found", { status: 404 });
        const { STORAGE } = bindings();
        if (!STORAGE) return new Response("Not found", { status: 404 });
        const obj = await STORAGE.get(key);
        if (!obj) return new Response("Not found", { status: 404 });
        return new Response(obj.body as unknown as ReadableStream, {
          headers: {
            "content-type": TYPES[m[1]],
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
