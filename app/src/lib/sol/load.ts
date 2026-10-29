// Browser-only loader: the Meteora/Raydium/Anchor SDKs must never land in the Worker bundle.
// They are CommonJS code that expects Node's Buffer, so a browser Buffer is installed before they load.
export const loadSol = async (): Promise<typeof import("./actions")> => {
  if (import.meta.env.SSR) throw new Error("Solana actions run in the browser");
  const { Buffer } = await import("buffer");
  const g = globalThis as unknown as { Buffer?: typeof Buffer };
  if (!g.Buffer) g.Buffer = Buffer;
  return import("./actions");
};
