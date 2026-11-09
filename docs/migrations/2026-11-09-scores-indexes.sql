-- Mini Golf Masters — tournament concurrency plan, Phase 2.1.
-- Run this manually in the Supabase SQL editor. Not applied automatically.
--
-- Supports the new scoped score queries in backend/sheets.py:
--   get_scores_by_tournament() joins scores to rounds on round_id and
--   filters rounds by tournament_id — the two indexes below back that join.
--
-- CREATE INDEX (without CONCURRENTLY) takes a brief exclusive lock on the
-- table while it builds. These tables are small enough that this should be
-- sub-second, but prefer running it during a quiet period rather than
-- mid-tournament.

CREATE INDEX IF NOT EXISTS idx_scores_round_id ON scores (round_id);
CREATE INDEX IF NOT EXISTS idx_rounds_tournament_id ON rounds (tournament_id);

-- get_scores_by_registration() filters on registration_id alone. Confirm
-- the unique constraint below exists — sheets.upsert_score's
-- "ON CONFLICT (registration_id, round_id, hole_id)" depends on it, and
-- Postgres backs a UNIQUE constraint with its own index, which also covers
-- registration_id-only lookups (as its leading column) without a separate
-- index. Check with \d scores in psql; if it's missing, add it before
-- relying on this file:
--
--   ALTER TABLE scores
--     ADD CONSTRAINT scores_registration_round_hole_key
--     UNIQUE (registration_id, round_id, hole_id);
