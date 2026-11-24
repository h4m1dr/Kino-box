// Bot 1 — personal watchlist (Phase 1 skeleton).
// Full build list: docs/build.md. Fill in handlers per that list;
// do not add download links, subtitles, or scraping in Phase 1.
export interface Env {
  DB: D1Database;
  TELEGRAM_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OWNER_ID: string;
  TMDB_API_KEY: string;
  SHEET_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("ok");
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const update = await request.json() as any;
    const fromId = String(update?.message?.from?.id ?? update?.callback_query?.from?.id ?? "");
    if (fromId !== env.OWNER_ID) return new Response("ok"); // owner only
    // TODO: route to handlers.ts — /start /list /search /random /mood /add /schedule /export /account
    return new Response("ok");
  },
};
