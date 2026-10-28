// Browser-only loader: the Meteora/Anchor SDK must never land in the Worker bundle.
export const loadSol = (): Promise<typeof import("./actions")> =>
  import.meta.env.SSR ? Promise.reject(new Error("Solana actions run in the browser")) : import("./actions");
