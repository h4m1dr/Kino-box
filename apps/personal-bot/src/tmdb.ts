// TMDB client — search + details via raw fetch.
// Every function returns null on any failure (missing/invalid key, network,
// non-200). The placeholder key "later" is treated as no key.

export interface TmdbHit {
  tmdbId: number;
  type: "movie" | "series";
  title: string;
  year: number | null;
  overview: string | null;
}

export interface TmdbDetails extends TmdbHit {
  runtimeMin: number | null;
  genres: string | null;
  collection: string | null;
  imdbId: string | null;
  nextEpisodeAirDate: string | null; // series only, YYYY-MM-DD
  nextEpisodeLabel: string | null; // e.g. "S02E05"
}

function hasKey(apiKey: string): boolean {
  return !!apiKey && apiKey !== "later";
}

async function tmdbGet(
  apiKey: string,
  path: string,
  params: Record<string, string> = {}
): Promise<any | null> {
  if (!hasKey(apiKey)) return null;
  try {
    const qs = new URLSearchParams({ api_key: apiKey, ...params });
    const res = await fetch(`https://api.themoviedb.org/3${path}?${qs}`);
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

function yearOf(dateStr: unknown): number | null {
  if (typeof dateStr !== "string" || dateStr.length < 4) return null;
  const y = Number(dateStr.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/** Search movies and TV shows; returns the best single hit (first result of
 *  the combined multi-search, restricted to movie/tv), or null. */
export async function searchTmdb(
  apiKey: string,
  title: string
): Promise<TmdbHit | null> {
  const data = await tmdbGet(apiKey, "/search/multi", {
    query: title,
    include_adult: "false",
  });
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  for (const r of results) {
    if (r.media_type === "movie") {
      return {
        tmdbId: r.id,
        type: "movie",
        title: r.title ?? r.original_title ?? title,
        year: yearOf(r.release_date),
        overview: r.overview ?? null,
      };
    }
    if (r.media_type === "tv") {
      return {
        tmdbId: r.id,
        type: "series",
        title: r.name ?? r.original_name ?? title,
        year: yearOf(r.first_air_date),
        overview: r.overview ?? null,
      };
    }
  }
  return null;
}

export async function getDetails(
  apiKey: string,
  hit: TmdbHit
): Promise<TmdbDetails | null> {
  const base = hit.type === "movie" ? "/movie" : "/tv";
  const d = await tmdbGet(apiKey, `${base}/${hit.tmdbId}`, {
    append_to_response: "external_ids",
  });
  if (!d) return null;

  const genres: string | null = Array.isArray(d.genres)
    ? d.genres.map((g: any) => g.name).filter(Boolean).join(", ") || null
    : null;

  let runtimeMin: number | null = null;
  if (hit.type === "movie" && typeof d.runtime === "number" && d.runtime > 0) {
    runtimeMin = d.runtime;
  } else if (
    hit.type === "series" &&
    Array.isArray(d.episode_run_time) &&
    typeof d.episode_run_time[0] === "number"
  ) {
    runtimeMin = d.episode_run_time[0];
  }

  const collection: string | null =
    hit.type === "movie" && d.belongs_to_collection?.name
      ? String(d.belongs_to_collection.name)
      : null;

  const imdbId: string | null =
    d.external_ids?.imdb_id ?? d.imdb_id ?? null;

  let nextEpisodeAirDate: string | null = null;
  let nextEpisodeLabel: string | null = null;
  const next = d.next_episode_to_air;
  if (hit.type === "series" && next?.air_date) {
    nextEpisodeAirDate = String(next.air_date);
    const s = String(next.season_number ?? "").padStart(2, "0");
    const e = String(next.episode_number ?? "").padStart(2, "0");
    nextEpisodeLabel = `S${s}E${e}`;
  }

  return {
    ...hit,
    title: d.title ?? d.name ?? hit.title,
    year:
      yearOf(d.release_date ?? d.first_air_date) ?? hit.year,
    runtimeMin,
    genres,
    collection,
    imdbId,
    nextEpisodeAirDate,
    nextEpisodeLabel,
  };
}

/** Convenience: search + details in one call. Null if not found / no key. */
export async function lookupTmdb(
  apiKey: string,
  title: string
): Promise<TmdbDetails | null> {
  const hit = await searchTmdb(apiKey, title);
  if (!hit) return null;
  const details = await getDetails(apiKey, hit);
  if (details) return details;
  // Details failed but search hit exists — return a partial record.
  return {
    ...hit,
    runtimeMin: null,
    genres: null,
    collection: null,
    imdbId: null,
    nextEpisodeAirDate: null,
    nextEpisodeLabel: null,
  };
}

/** Next-episode info for a stored item, looked up by title. Null if unknown. */
export async function nextEpisodeFor(
  apiKey: string,
  title: string
): Promise<{ airDate: string; label: string | null } | null> {
  const hit = await searchTmdb(apiKey, title);
  if (!hit || hit.type !== "series") return null;
  const details = await getDetails(apiKey, hit);
  if (!details?.nextEpisodeAirDate) return null;
  return {
    airDate: details.nextEpisodeAirDate,
    label: details.nextEpisodeLabel,
  };
}

export function tmdbAvailable(apiKey: string): boolean {
  return hasKey(apiKey);
}
