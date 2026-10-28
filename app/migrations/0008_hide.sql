-- Hide Runes that cannot be bridged (TEST: 4-letter name, cannot be etched on Bitcoin) and keep 3 testnet demos.
ALTER TABLE runes ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
UPDATE runes SET hidden = 1 WHERE id = '0x13eea8406445115a3e9660fbff623655b1917599';
UPDATE runes SET hidden = 1 WHERE onchain = 0 AND ticker IN ('PIZZA', 'SATO');
