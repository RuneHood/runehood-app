-- Which site a Rune was launched from (carvy.fun or runehood.fun); both share the engine and contracts.
ALTER TABLE runes ADD COLUMN site TEXT NOT NULL DEFAULT 'carvy';
ALTER TABLE rune_meta ADD COLUMN site TEXT NOT NULL DEFAULT 'carvy';
CREATE INDEX IF NOT EXISTS runes_site ON runes(site);
