-- DEX / launcher family of a Rune: meteora | raydium | pancake | '' (Uniswap V4 / legacy). Additive.
ALTER TABLE runes ADD COLUMN dex TEXT NOT NULL DEFAULT '';
UPDATE runes SET dex = 'meteora' WHERE chain = 'solana' AND onchain = 1;
