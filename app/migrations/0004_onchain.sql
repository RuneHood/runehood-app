-- On-chain launchpad indexing (Ethereum, Base, Robinhood Chain). Additive.
ALTER TABLE runes ADD COLUMN onchain INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runes ADD COLUMN quote_address TEXT NOT NULL DEFAULT '';
ALTER TABLE runes ADD COLUMN quote_decimals INTEGER NOT NULL DEFAULT 18;
ALTER TABLE runes ADD COLUMN v_quote REAL NOT NULL DEFAULT 0;
ALTER TABLE runes ADD COLUMN create_tx TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS rune_meta (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  x_url TEXT NOT NULL DEFAULT '',
  tg_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
