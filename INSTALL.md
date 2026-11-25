# Install & run — Kino-box (personal bot)

Custom install method for the owner. **Token rule:** real tokens live only in a local `.dev.vars` file on your Linux/WSL machine. That file is in `.gitignore` and is never committed. Every command below reads values from that file or passes them as parameters — no token is ever typed into git, chat, or a URL by hand.

## 1. Clone and install

```bash
git clone https://github.com/h4m1dr/Kino-box.git
cd Kino-box/apps/personal-bot
npm install
```

## 2. Create the token file (local only)

```bash
cat > .dev.vars <<'EOF'
TELEGRAM_TOKEN=<token from @BotFather>
TELEGRAM_WEBHOOK_SECRET=<long random string>
OWNER_ID=<your numeric Telegram ID>
TMDB_API_KEY=<TMDB API key>
SHEET_ID=<Google Sheet ID>
WORKER_URL=<filled in after first deploy>
EOF
```

Generate the random secret with `openssl rand -hex 32` and keep it — the webhook step needs the same value. Get your numeric ID from @userinfobot.

## 3. Cloudflare and the database (once)

Wrangler is **global** (v4) with named profiles — `cf1` is the first account (hamara), `cf2` is the second account, and **Kino-box lives on `cf2`**. The `cf2` shortcut runs `wrangler --profile cf2` from anywhere. Never use `npx wrangler` or `npm run deploy` here — those would run a stale local Wrangler without the profile. Login is already done (`wrangler auth list` shows both profiles); if a profile is ever missing, recreate it with `wrangler auth create cf2` while the browser is signed into that account and proxy env vars are unset.

```bash
cf2 d1 create movie-watch
```

Paste the returned `database_id` into `wrangler.toml` (replacing `REPLACE_WITH_D1_ID`). The database ID is not a secret, so it is safe to commit. Then apply the schema:

```bash
cf2 d1 execute movie-watch --remote --file=schema.sql
```

## 4. Upload the secrets

Each value is pasted at the prompt — it never goes into git:

```bash
cf2 secret put TELEGRAM_TOKEN
cf2 secret put TELEGRAM_WEBHOOK_SECRET
cf2 secret put OWNER_ID
cf2 secret put TMDB_API_KEY
cf2 secret put SHEET_ID
```

## 5. Deploy and connect the bot

```bash
cf2 deploy
```

Copy the printed `https://…workers.dev` URL into `WORKER_URL` in `.dev.vars`, then:

```bash
npm run webhook
```

This runs `scripts/set-webhook.sh`, which reads `.dev.vars` and calls Telegram's `setWebhook` with parameters — the token is not written into the command. Expected output: `{"ok":true,"result":true,"description":"Webhook was set"}`.

> **WSL network note:** if `api.telegram.org` times out from WSL, set a proxy first:
> ```bash
> export http_proxy=http://127.0.0.1:10808 https_proxy=http://127.0.0.1:10808
> npm run webhook
> ```

## 6. Update (every change)

```bash
cd Kino-box
git pull
cd apps/personal-bot
npm install
npm run check
cf2 deploy
```

If `schema.sql` changed, re-apply it (step 3) before deploying. If the worker URL or webhook secret changed, re-run `npm run webhook`.

## 7. First test

Send `/start` to the bot in Telegram. Phase 1 test order: `/start` → `/add` (preview + confirm) → `/list` → `/random` → seen tick → `/export` and CSV import.
