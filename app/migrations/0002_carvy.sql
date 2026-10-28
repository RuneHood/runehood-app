-- Carvy core schema (testnet MVP). Additive only.
CREATE TABLE IF NOT EXISTS runes (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  rune_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  creator TEXT NOT NULL,
  chain TEXT NOT NULL,
  quote TEXT NOT NULL,
  fee_mode TEXT NOT NULL DEFAULT 'dev',
  fee_route TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  x_url TEXT NOT NULL DEFAULT '',
  tg_url TEXT NOT NULL DEFAULT '',
  v_sats REAL NOT NULL,
  v_tokens REAL NOT NULL,
  real_sats REAL NOT NULL DEFAULT 0,
  sold REAL NOT NULL DEFAULT 0,
  bridged REAL NOT NULL DEFAULT 0,
  volume_sats REAL NOT NULL DEFAULT 0,
  creator_fees_sats REAL NOT NULL DEFAULT 0,
  platform_fees_sats REAL NOT NULL DEFAULT 0,
  graduated INTEGER NOT NULL DEFAULT 0,
  rune_ref TEXT NOT NULL DEFAULT '',
  etch_at INTEGER NOT NULL,
  is_platform INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runes_created ON runes(created_at DESC);
CREATE INDEX IF NOT EXISTS runes_ticker ON runes(ticker);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rune_id TEXT NOT NULL,
  trader TEXT NOT NULL,
  side TEXT NOT NULL,
  sats REAL NOT NULL,
  tokens REAL NOT NULL,
  quote TEXT NOT NULL,
  quote_amount REAL NOT NULL,
  usd REAL NOT NULL,
  mcap_sats REAL NOT NULL,
  tx TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_rune ON trades(rune_id, created_at);
CREATE INDEX IF NOT EXISTS trades_time ON trades(created_at DESC);

CREATE TABLE IF NOT EXISTS holdings (
  rune_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  balance REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (rune_id, wallet)
);

CREATE TABLE IF NOT EXISTS balances (
  wallet TEXT NOT NULL,
  chain TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (wallet, chain, asset)
);

CREATE TABLE IF NOT EXISTS faucet_claims (
  wallet TEXT PRIMARY KEY,
  claimed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  rune_id TEXT NOT NULL DEFAULT '',
  ticker TEXT NOT NULL DEFAULT '',
  chain TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  usd REAL NOT NULL DEFAULT 0,
  tx TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_time ON activity(created_at DESC);

CREATE TABLE IF NOT EXISTS bridges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rune_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  btc_address TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  issued TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cache (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
