# Build list — Bot 1 (personal watchlist), Phase 1

Give this file to Gemini (or any coder) to write the base code. Then Muse
adds it to GitHub on the `codr1` branch. Stack is fixed: **TypeScript,
Cloudflare Workers + D1, Google Sheets (CSV first, Sheets API live later)**.
No Python, no server, no Playwright in Phase 1 — it must run fully on
Cloudflare's free tier, no card.

## 1. What to build, in order

1. **Webhook skeleton** — `src/index.ts`: verify `X-Telegram-Bot-Api-Secret-Token`,
   reject non-owner `OWNER_ID`, route Telegram updates to handlers.
2. **D1 schema** — `schema.sql` (already in this repo): `items` table with the
   columns in `docs/plan.md` §3. `wrangler.toml` binds D1 + vars.
3. **Commands** — `/start`, `/list` (filter movie/series/seen/unseen, genre/mood),
   `/search <text>` (private list only), `/random [movie|series]`,
   `/mood` (ask for 2 old titles, suggest from own list by shared tags),
   `/add <title>` (single), bulk add (paste a list, one title per line).
4. **Preview + confirm** — after add/bulk, fetch info for each title (TMDB API,
   key in secret), show a preview list (title, year, runtime, genres, collection?)
   with ✅/❌ per item; only confirmed items go to the watchlist.
   Before saving, check the Sheet/D1: "already in your list / already have it".
5. **Item actions** — inline buttons under each item: seen ✅ (ticks `seen` in
   Sheet, item stays), rate (1–10, per person), note/opinion (per person),
   bookmark (series episode + minute, or film minute), mood add/remove,
   delete (exceptional only, with confirm).
6. **Mood list** — separate list, max 2 series + 5–10 films; deleting from mood
   deletes only from mood.
7. **Airing schedule** — `/schedule`: followed series, next episode date (TMDB),
   grouped by weekday; reminder on air day (Workers Cron Trigger).
8. **Sheet import/export** — `/export` sends a CSV with the Sheet columns;
   sending a CSV file imports it (new items added, duplicates reported).
   Live Sheets API write is Phase 1b, same file layout.
9. **Account section** — `/account`: profile, lists, watched count, stats, settings.
10. **Request to public bot** — when a title is not found, send a direct
    bot-to-bot webhook request to Bot 2 (Phase 3 stub: log the request for now).

## 2. Files to write

```
apps/personal-bot/
  package.json          # wrangler, typescript, grammy (or raw fetch — no heavy deps)
  wrangler.toml         # workers.dev, d1 binding movie-watch, cron: 0 7 * * *
  tsconfig.json
  schema.sql            # already here — do not change columns without asking
  .dev.vars.example     # TELEGRAM_TOKEN, TELEGRAM_WEBHOOK_SECRET, OWNER_ID, TMDB_API_KEY, SHEET_ID
  src/index.ts          # webhook entry, secret check, router
  src/handlers.ts       # commands above
  src/sheet.ts          # CSV export/import; Sheets API later
  src/tmdb.ts           # TMDB search + details (title, year, runtime, genres, cast)
  src/db.ts             # D1 helpers
```

## 3. Rules for the code

- No secrets in code or git. No watchlist data in git. No licence file.
- Every external fact shown to the user carries its source name.
- Persian UI, English titles in search (TMDB search is English-first).
- One owner only: every handler checks `OWNER_ID` first.
- Keep Workers CPU low: no scraping, no browser, only TMDB/Sheets fetch calls.
- Tests: `npm run check` (tsc) must pass; dry-run the handlers with 3 sample
  titles before calling it done.

## 4. What NOT to build now

- Mini App cards (Phase 2), public bot, admin bot, YAML collectors (Phase 3).
- No download links, no subtitles, no Telegram channel reading in Phase 1.
