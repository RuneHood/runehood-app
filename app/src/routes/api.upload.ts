import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "../lib/bindings.server";

const MAX = 3 * 1024 * 1024;

/** Sniff the real file type from magic bytes (never trust the browser's content type). SVG is refused. */
function sniff(b: Uint8Array): { ext: string; type: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: "gif", type: "image/gif" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", type: "image/webp" };
  return null;
}

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { STORAGE } = bindings();
        if (!STORAGE) return json({ error: "Uploads are not available yet." }, 503);
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX + 64 * 1024) return json({ error: "Image is larger than 3 MB." }, 413);
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Send the image as form data." }, 400);
        }
        const file = form.get("file");
        if (!file || typeof file === "string") return json({ error: "No file received." }, 400);
        if (file.size > MAX) return json({ error: "Image is larger than 3 MB." }, 413);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const kind = sniff(bytes);
        if (!kind) return json({ error: "Use a PNG, JPG, WebP or GIF image." }, 415);
        const id = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");
        const key = `uploads/${id}.${kind.ext}`;
        await STORAGE.put(key, bytes, { httpMetadata: { contentType: kind.type, cacheControl: "public, max-age=31536000, immutable" } });
        return json({ url: `/media/${key}` });
      },
    },
  },
});
