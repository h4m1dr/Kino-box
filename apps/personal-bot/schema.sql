-- Phase 1 — personal watchlist. Source of truth is the Google Sheet;
-- D1 mirrors it for fast search on Cloudflare.
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imdb_id TEXT,
  title TEXT NOT NULL,
  title_fa TEXT,
  type TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want', 'watching', 'watched')),
  seen INTEGER NOT NULL DEFAULT 0,
  runtime_min INTEGER,
  genres TEXT,
  collection TEXT,
  needs_previous INTEGER NOT NULL DEFAULT 0,
  has_series INTEGER NOT NULL DEFAULT 0,
  has_book INTEGER NOT NULL DEFAULT 0,
  rating_me INTEGER,
  rating_other INTEGER,
  note_me TEXT,
  note_other TEXT,
  bookmark TEXT,
  tags TEXT,
  source TEXT,
  in_mood INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_title ON items(title);
CREATE INDEX IF NOT EXISTS idx_items_imdb ON items(imdb_id);
CREATE INDEX IF NOT EXISTS idx_items_seen ON items(seen);
