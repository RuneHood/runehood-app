-- Bridge in (Bitcoin -> EVM): per-user deposit addresses, sweeps and mints. Additive.
CREATE TABLE IF NOT EXISTS btc_deposit (
  evm_address TEXT PRIMARY KEY,
  btc_address TEXT NOT NULL UNIQUE,
  last_checked INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS btc_in (
  id TEXT PRIMARY KEY,                -- sweep txid
  evm_address TEXT NOT NULL,
  deposit_address TEXT NOT NULL,
  rune_id TEXT NOT NULL,              -- EVM token address
  rune_ref TEXT NOT NULL,
  amount TEXT NOT NULL,
  chain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'swept', -- swept | minted | manual
  tx_hex TEXT NOT NULL DEFAULT '',
  evm_tx TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS btc_in_status ON btc_in(status);
CREATE INDEX IF NOT EXISTS btc_in_evm ON btc_in(evm_address);
