-- Bitcoin side: etching pipeline, custody UTXOs, bridge-out queue. Additive.
CREATE TABLE IF NOT EXISTS btc_etch (
  rune_id TEXT PRIMARY KEY,
  rune_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  detail TEXT NOT NULL DEFAULT '',
  script_hex TEXT NOT NULL DEFAULT '',
  runestone_hex TEXT NOT NULL DEFAULT '',
  commit_value INTEGER NOT NULL DEFAULT 0,
  commit_txid TEXT NOT NULL DEFAULT '',
  commit_hex TEXT NOT NULL DEFAULT '',
  commit_vout INTEGER NOT NULL DEFAULT 0,
  reveal_txid TEXT NOT NULL DEFAULT '',
  reveal_hex TEXT NOT NULL DEFAULT '',
  rune_ref TEXT NOT NULL DEFAULT '',
  with_logo INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS btc_etch_status ON btc_etch(status);

CREATE TABLE IF NOT EXISTS btc_custody (
  txid TEXT NOT NULL,
  vout INTEGER NOT NULL,
  rune_id TEXT NOT NULL,
  rune_ref TEXT NOT NULL,
  amount TEXT NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (txid, vout)
);
CREATE INDEX IF NOT EXISTS btc_custody_rune ON btc_custody(rune_id, spent);

CREATE TABLE IF NOT EXISTS btc_out (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  bridge TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  token TEXT NOT NULL,
  from_addr TEXT NOT NULL,
  amount TEXT NOT NULL,
  btc_address TEXT NOT NULL,
  evm_tx TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  btc_txid TEXT NOT NULL DEFAULT '',
  tx_hex TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS btc_out_status ON btc_out(status);
CREATE INDEX IF NOT EXISTS btc_out_token ON btc_out(token);
