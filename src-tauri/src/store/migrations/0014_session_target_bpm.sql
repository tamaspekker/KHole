-- Fixed tempo (Setup): every track previews at this BPM, within the ±16 % tempo range.
-- NULL: off, each track plays at its own tempo.
ALTER TABLE sessions ADD COLUMN target_bpm REAL;
