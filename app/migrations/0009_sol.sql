-- Solana support: Bitcoin Rune name stored with the token metadata. Additive.
ALTER TABLE rune_meta ADD COLUMN rune_name TEXT NOT NULL DEFAULT '';
