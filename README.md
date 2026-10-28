# Runehood

Launchpad for real Bitcoin Runes: launch in one click, trade on Ethereum, Base, BNB Chain, Solana or Robinhood Chain (incl. Robinhood Stock Token pairs), bridge 1:1 to Bitcoin.

- `app/` – React + TanStack Start site on Cloudflare Workers (D1, R2)
- `scripts/deploy_runehood.sh` – deploy (needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in env)

Secrets (RPC URLs, keys) are set as Worker secrets, never in the repo.

https://runehood.fun
