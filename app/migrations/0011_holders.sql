-- Holders fee mode: creator share of Holders-mode Runes is paid to holders pro rata through CarvyHolderRewards.
ALTER TABLE runes ADD COLUMN pool_id TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS holder_accrued (
  chain TEXT NOT NULL,
  rune_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  accrued TEXT NOT NULL DEFAULT '0',
  allocated TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (chain, rune_id, asset)
);
CREATE TABLE IF NOT EXISTS token_bal (
  chain TEXT NOT NULL,
  token TEXT NOT NULL,
  holder TEXT NOT NULL,
  balance TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (chain, token, holder)
);
CREATE TABLE IF NOT EXISTS holder_cum (
  chain TEXT NOT NULL,
  holder TEXT NOT NULL,
  asset TEXT NOT NULL,
  cumulative TEXT NOT NULL DEFAULT '0',
  proof TEXT NOT NULL DEFAULT '',
  published TEXT NOT NULL DEFAULT '0',
  epoch INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chain, holder, asset)
);
CREATE INDEX IF NOT EXISTS holder_cum_holder ON holder_cum (holder);
