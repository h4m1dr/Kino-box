// D1 helpers — items CRUD, pending previews, bot_state, public-bot requests.

export interface Item {
  id: number;
  imdb_id: string | null;
  title: string;
  title_fa: string | null;
  type: "movie" | "series";
  year: number | null;
  status: "want" | "watching" | "watched";
  seen: number;
  runtime_min: number | null;
  genres: string | null;
  collection: string | null;
  needs_previous: number;
  has_series: number;
  has_book: number;
  rating_me: number | null;
  rating_other: number | null;
  note_me: string | null;
  note_other: string | null;
  bookmark: string | null;
  tags: string | null;
  source: string | null;
  in_mood: number;
  added_at: string;
}

export interface NewItem {
  imdb_id?: string | null;
  title: string;
  title_fa?: string | null;
  type: "movie" | "series";
  year?: number | null;
  status?: "want" | "watching" | "watched";
  seen?: number;
  runtime_min?: number | null;
  genres?: string | null;
  collection?: string | null;
  needs_previous?: number;
  has_series?: number;
  has_book?: number;
  rating_me?: number | null;
  rating_other?: number | null;
  note_me?: string | null;
  note_other?: string | null;
  bookmark?: string | null;
  tags?: string | null;
  source?: string | null;
  in_mood?: number;
}

export interface BotState {
  awaiting: string | null;
  item_id: number | null;
}

export async function insertItem(db: D1Database, it: NewItem): Promise<number> {
  const r = await db
    .prepare(
      `INSERT INTO items (imdb_id, title, title_fa, type, year, status, seen,
        runtime_min, genres, collection, needs_previous, has_series, has_book,
        rating_me, rating_other, note_me, note_other, bookmark, tags, source, in_mood)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      it.imdb_id ?? null,
      it.title,
      it.title_fa ?? null,
      it.type,
      it.year ?? null,
      it.status ?? "want",
      it.seen ?? 0,
      it.runtime_min ?? null,
      it.genres ?? null,
      it.collection ?? null,
      it.needs_previous ?? 0,
      it.has_series ?? 0,
      it.has_book ?? 0,
      it.rating_me ?? null,
      it.rating_other ?? null,
      it.note_me ?? null,
      it.note_other ?? null,
      it.bookmark ?? null,
      it.tags ?? null,
      it.source ?? null,
      it.in_mood ?? 0
    )
    .run();
  return Number(r.meta.last_row_id);
}

export async function getItem(db: D1Database, id: number): Promise<Item | null> {
  return db.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<Item>();
}

export async function findDuplicate(
  db: D1Database,
  title: string,
  year: number | null,
  imdbId: string | null
): Promise<Item | null> {
  if (imdbId) {
    const byImdb = await db
      .prepare("SELECT * FROM items WHERE imdb_id = ?")
      .bind(imdbId)
      .first<Item>();
    if (byImdb) return byImdb;
  }
  if (year != null) {
    return db
      .prepare(
        "SELECT * FROM items WHERE lower(title) = lower(?) AND year = ?"
      )
      .bind(title, year)
      .first<Item>();
  }
  return db
    .prepare("SELECT * FROM items WHERE lower(title) = lower(?)")
    .bind(title)
    .first<Item>();
}

export async function listItems(
  db: D1Database,
  filter?: string
): Promise<Item[]> {
  let where = "";
  if (filter === "movie" || filter === "series") where = `WHERE type = '${filter}'`;
  else if (filter === "seen") where = "WHERE seen = 1";
  else if (filter === "unseen") where = "WHERE seen = 0";
  else if (filter === "mood") where = "WHERE in_mood = 1";
  const r = await db
    .prepare(`SELECT * FROM items ${where} ORDER BY added_at DESC, id DESC`)
    .all<Item>();
  return r.results ?? [];
}

export async function searchItems(
  db: D1Database,
  text: string
): Promise<Item[]> {
  const like = `%${text}%`;
  const r = await db
    .prepare(
      "SELECT * FROM items WHERE title LIKE ? OR title_fa LIKE ? ORDER BY added_at DESC, id DESC"
    )
    .bind(like, like)
    .all<Item>();
  return r.results ?? [];
}

export async function randomUnseen(
  db: D1Database,
  type?: string
): Promise<Item | null> {
  const typeClause =
    type === "movie" || type === "series" ? `AND type = '${type}'` : "";
  return db
    .prepare(
      `SELECT * FROM items WHERE seen = 0 ${typeClause} ORDER BY RANDOM() LIMIT 1`
    )
    .first<Item>();
}

export async function followedSeries(db: D1Database): Promise<Item[]> {
  const r = await db
    .prepare(
      "SELECT * FROM items WHERE type = 'series' AND (seen = 0 OR status = 'watching') ORDER BY title"
    )
    .all<Item>();
  return r.results ?? [];
}

export async function moodItems(db: D1Database): Promise<Item[]> {
  const r = await db
    .prepare("SELECT * FROM items WHERE in_mood = 1 ORDER BY type, title")
    .all<Item>();
  return r.results ?? [];
}

export async function moodCount(
  db: D1Database,
  type: "movie" | "series"
): Promise<number> {
  const r = await db
    .prepare("SELECT COUNT(*) AS c FROM items WHERE in_mood = 1 AND type = ?")
    .bind(type)
    .first<{ c: number }>();
  return r?.c ?? 0;
}

export async function updateItemField(
  db: D1Database,
  id: number,
  column: string,
  value: string | number | null
): Promise<void> {
  const allowed = [
    "seen",
    "status",
    "rating_me",
    "rating_other",
    "note_me",
    "note_other",
    "bookmark",
    "in_mood",
    "tags",
  ];
  if (!allowed.includes(column)) return;
  await db
    .prepare(`UPDATE items SET ${column} = ? WHERE id = ?`)
    .bind(value, id)
    .run();
}

export async function markSeen(db: D1Database, id: number): Promise<void> {
  await db
    .prepare("UPDATE items SET seen = 1, status = 'watched' WHERE id = ?")
    .bind(id)
    .run();
}

export async function deleteItem(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
}

export async function counts(db: D1Database): Promise<{
  total: number;
  movies: number;
  series: number;
  seen: number;
  unseen: number;
  mood: number;
}> {
  const one = async (sql: string) =>
    (await db.prepare(sql).first<{ c: number }>())?.c ?? 0;
  return {
    total: await one("SELECT COUNT(*) AS c FROM items"),
    movies: await one("SELECT COUNT(*) AS c FROM items WHERE type = 'movie'"),
    series: await one("SELECT COUNT(*) AS c FROM items WHERE type = 'series'"),
    seen: await one("SELECT COUNT(*) AS c FROM items WHERE seen = 1"),
    unseen: await one("SELECT COUNT(*) AS c FROM items WHERE seen = 0"),
    mood: await one("SELECT COUNT(*) AS c FROM items WHERE in_mood = 1"),
  };
}

// ---- pending previews ----

export async function savePending(
  db: D1Database,
  payload: unknown
): Promise<number> {
  const r = await db
    .prepare("INSERT INTO pending (payload) VALUES (?)")
    .bind(JSON.stringify(payload))
    .run();
  return Number(r.meta.last_row_id);
}

export async function getPending<T>(
  db: D1Database,
  id: number
): Promise<T | null> {
  const r = await db
    .prepare("SELECT payload FROM pending WHERE id = ?")
    .bind(id)
    .first<{ payload: string }>();
  if (!r) return null;
  try {
    return JSON.parse(r.payload) as T;
  } catch {
    return null;
  }
}

export async function deletePending(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM pending WHERE id = ?").bind(id).run();
}

// ---- bot_state (awaiting input) ----

export async function getState(db: D1Database): Promise<BotState> {
  const r = await db
    .prepare("SELECT awaiting, item_id FROM bot_state WHERE id = 1")
    .first<BotState>();
  return r ?? { awaiting: null, item_id: null };
}

export async function setState(
  db: D1Database,
  awaiting: string | null,
  itemId: number | null
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO bot_state (id, awaiting, item_id) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET awaiting = excluded.awaiting, item_id = excluded.item_id"
    )
    .bind(awaiting, itemId)
    .run();
}

export async function clearState(db: D1Database): Promise<void> {
  await setState(db, null, null);
}

// ---- public-bot requests (Phase 3 stub log) ----

export async function saveRequest(
  db: D1Database,
  title: string
): Promise<void> {
  await db.prepare("INSERT INTO requests (title) VALUES (?)").bind(title).run();
}
