# Kino-box

Private — © All rights reserved. Not open source, no open licence.

Three Telegram bots for films and series (see `docs/plan.md` for the full plan):

| Bot | What it does | Phase |
|---|---|---|
| **1 — personal** (`apps/personal-bot`) | Private watchlist: add (single/bulk, preview + confirm), random, mood, seen tick, per-person rating/opinion, bookmark, airing schedule, Google Sheet import/export, account section | 1 — core bot, 2 — Mini App cards |
| **2 — public** (`apps/public-bot`) | Inline search, actor search, genres, schedule, info (TMDB/OMDb), download + subtitle links from the YAML index | 3 |
| **3 — admin** (`apps/admin-bot`) | Manages the server system: manual sync, rebuild master YAML, add source, link health | 3 |

## Rules

- **Private repo only.** Never publish, never add a licence file.
- **No data in git.** Watchlist, database, tokens and `.env` are never committed.
  Only code, docs and config templates live here (`.gitignore` enforces this).
- **Work on `codr1` only**, never directly on `main`. The owner reviews and merges.
- **Source is always cited** under anything taken from outside:
  "اطلاعات از «نام منبع» جمع‌آوری شده؛ مسئولیت صحت با منبع است."

## Bot 1 — quick start (Phase 1)

Full install guide (token file, parameterized commands): [INSTALL.md](INSTALL.md).

```bash
cd apps/personal-bot
npm install
cp .dev.vars.example .dev.vars   # TELEGRAM_TOKEN, SHEET_ID, OWNER_ID
npx wrangler d1 create movie-watch
npx wrangler d1 execute movie-watch --file=schema.sql
npm run dev
```

Deploy (free, no card): `npx wrangler deploy`, then set the Telegram webhook
to `https://<worker>.workers.dev/webhook` with a secret token.

## Layout

```
apps/personal-bot/   Bot 1 — TypeScript, Cloudflare Workers + D1
apps/public-bot/     Bot 2 — Phase 3 (scaffold only)
apps/admin-bot/      Bot 3 — Phase 3 (scaffold only)
docs/plan.md         Full plan (Persian)
docs/build.md        Build list for Gemini — what to write, in what order
```

## Data

- Private watchlist source of truth: the owner's Google Sheet.
- Public download/subtitle index: `master.yaml` built on the server (Phase 3),
  loaded into D1/SQLite for search. Info comes from TMDB/OMDb (IMDb ID).
