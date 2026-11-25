// All command / callback logic for Bot 1 (personal watchlist), Phase 1.
// Persian UI. OWNER_ID is already enforced in index.ts before routing here.

import type { Env } from "./index";
import {
  answerCallbackQuery,
  downloadFileText,
  editMessageText,
  sendDocument,
  sendMessage,
  type InlineKeyboard,
} from "./telegram";
import {
  clearState,
  counts,
  deleteItem,
  deletePending,
  findDuplicate,
  followedSeries,
  getItem,
  getPending,
  getState,
  insertItem,
  listItems,
  markSeen,
  moodCount,
  moodItems,
  randomUnseen,
  savePending,
  saveRequest,
  searchItems,
  setState,
  updateItemField,
  type Item,
  type NewItem,
} from "./db";
import { lookupTmdb, nextEpisodeFor, tmdbAvailable } from "./tmdb";
import { csvToItems, itemsToCsv } from "./sheet";

const MOOD_MAX_SERIES = 2;
const MOOD_MAX_MOVIES = 10;
const LIST_LIMIT = 30;

const WEEKDAYS_FA = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
];

interface PendingAdd {
  title: string;
  type: "movie" | "series" | null; // null = manual, type not chosen yet
  year: number | null;
  runtime_min: number | null;
  genres: string | null;
  collection: string | null;
  imdb_id: string | null;
  fromTmdb: boolean;
}

// ---------- formatting helpers ----------

function typeFa(t: string): string {
  return t === "series" ? "سریال" : "فیلم";
}

function itemLine(it: Item): string {
  const parts: string[] = [];
  parts.push(it.seen ? "✅" : "⬜");
  parts.push(`${it.title}${it.year ? ` (${it.year})` : ""} — ${typeFa(it.type)}`);
  if (it.runtime_min) parts.push(`⏱ ${it.runtime_min} دقیقه`);
  if (it.genres) parts.push(`🎭 ${it.genres}`);
  if (it.collection) parts.push(`📚 کالکشن: ${it.collection}`);
  if (it.rating_me != null) parts.push(`⭐ امتیاز من: ${it.rating_me}/10`);
  if (it.bookmark) parts.push(`🔖 ${it.bookmark}`);
  if (it.in_mood) parts.push("🎲 در لیست مود");
  if (it.source) parts.push(`منبع: ${it.source}`);
  return parts.join("\n");
}

function itemKeyboard(it: Item): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "دیده شد ✅", callback_data: `seen:${it.id}` },
        { text: "امتیاز ⭐", callback_data: `rate:${it.id}` },
        { text: "نظر ✍️", callback_data: `note:${it.id}` },
      ],
      [
        { text: "بوک‌مارک 🔖", callback_data: `bm:${it.id}` },
        {
          text: it.in_mood ? "حذف از مود ➖" : "افزودن به مود ➕",
          callback_data: `mood:${it.id}`,
        },
        { text: "حذف 🗑", callback_data: `del:${it.id}` },
      ],
    ],
  };
}

async function sendItem(
  env: Env,
  chatId: string,
  it: Item,
  prefix = ""
): Promise<void> {
  await sendMessage(
    env.TELEGRAM_TOKEN,
    chatId,
    (prefix ? prefix + "\n" : "") + itemLine(it),
    itemKeyboard(it)
  );
}

async function sendItemList(
  env: Env,
  chatId: string,
  items: Item[],
  emptyText: string
): Promise<void> {
  if (items.length === 0) {
    await sendMessage(env.TELEGRAM_TOKEN, chatId, emptyText);
    return;
  }
  const shown = items.slice(0, LIST_LIMIT);
  for (const it of shown) {
    await sendItem(env, chatId, it);
  }
  if (items.length > LIST_LIMIT) {
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      `… و ${items.length - LIST_LIMIT} مورد دیگر (برای دیدن بقیه از /search استفاده کن)`
    );
  }
}

// ---------- add flow ----------

async function handleAddTitles(
  env: Env,
  chatId: string,
  titles: string[]
): Promise<void> {
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) {
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      "عنوان رو بنویس: /add اسم فیلم — یا چند عنوان رو هر کدوم توی یه خط بفرست."
    );
    return;
  }
  for (const title of clean) {
    await handleAddOne(env, chatId, title);
  }
}

async function handleAddOne(
  env: Env,
  chatId: string,
  title: string
): Promise<void> {
  const details = await lookupTmdb(env.TMDB_API_KEY, title);

  if (details) {
    const dup = await findDuplicate(
      env.DB,
      details.title,
      details.year,
      details.imdbId
    );
    if (dup) {
      await sendMessage(
        env.TELEGRAM_TOKEN,
        chatId,
        `«${details.title}» قبلاً توی لیستت هست.`
      );
      return;
    }
    const pending: PendingAdd = {
      title: details.title,
      type: details.type,
      year: details.year,
      runtime_min: details.runtimeMin,
      genres: details.genres,
      collection: details.collection,
      imdb_id: details.imdbId,
      fromTmdb: true,
    };
    const pid = await savePending(env.DB, pending);
    const lines = [
      `پیش‌نمایش: ${details.title}${details.year ? ` (${details.year})` : ""} — ${typeFa(details.type)}`,
    ];
    if (details.runtimeMin) lines.push(`⏱ مدت: ${details.runtimeMin} دقیقه`);
    if (details.genres) lines.push(`🎭 ژانر: ${details.genres}`);
    if (details.collection) lines.push(`📚 کالکشن: ${details.collection}`);
    lines.push("منبع: TMDB");
    lines.push("اضافه کنم؟");
    await sendMessage(env.TELEGRAM_TOKEN, chatId, lines.join("\n"), {
      inline_keyboard: [
        [
          { text: "✅ تایید", callback_data: `ok:${pid}` },
          { text: "❌ رد", callback_data: `no:${pid}` },
        ],
      ],
    });
    return;
  }

  // No TMDB result (no key, key is "later", lookup failed, or not found).
  const dup = await findDuplicate(env.DB, title, null, null);
  if (dup) {
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      `«${title}» قبلاً توی لیستت هست.`
    );
    return;
  }
  const pending: PendingAdd = {
    title,
    type: null,
    year: null,
    runtime_min: null,
    genres: null,
    collection: null,
    imdb_id: null,
    fromTmdb: false,
  };
  const pid = await savePending(env.DB, pending);
  const note = tmdbAvailable(env.TMDB_API_KEY)
    ? "توی TMDB پیدا نشد."
    : "اطلاعات TMDB در دسترس نیست (کلید تنظیم نشده).";
  await sendMessage(
    env.TELEGRAM_TOKEN,
    chatId,
    `${note}\n«${title}» رو دستی اضافه کنم؟ نوعش چیه؟`,
    {
      inline_keyboard: [
        [
          { text: "🎬 فیلم", callback_data: `man:${pid}:movie` },
          { text: "📺 سریال", callback_data: `man:${pid}:series` },
        ],
        [
          { text: "درخواست از بات عمومی", callback_data: `req:${pid}` },
          { text: "❌ رد", callback_data: `no:${pid}` },
        ],
      ],
    }
  );
}

async function confirmPending(
  env: Env,
  chatId: string,
  messageId: number | undefined,
  pid: number,
  manualType?: "movie" | "series"
): Promise<void> {
  const pending = await getPending<PendingAdd>(env.DB, pid);
  if (!pending) {
    await sendMessage(env.TELEGRAM_TOKEN, chatId, "این پیش‌نمایش منقضی شده.");
    return;
  }
  const type = manualType ?? pending.type;
  if (!type) {
    await sendMessage(env.TELEGRAM_TOKEN, chatId, "نوع (فیلم/سریال) مشخص نیست.");
    return;
  }
  const dup = await findDuplicate(
    env.DB,
    pending.title,
    pending.year,
    pending.imdb_id
  );
  await deletePending(env.DB, pid);
  if (dup) {
    const text = `«${pending.title}» قبلاً توی لیستت هست.`;
    if (messageId) await editMessageText(env.TELEGRAM_TOKEN, chatId, messageId, text);
    else await sendMessage(env.TELEGRAM_TOKEN, chatId, text);
    return;
  }
  const newItem: NewItem = {
    title: pending.title,
    type,
    year: pending.year,
    runtime_min: pending.runtime_min,
    genres: pending.genres,
    collection: pending.collection,
    imdb_id: pending.imdb_id,
    source: pending.fromTmdb ? "TMDB" : "دستی",
  };
  const id = await insertItem(env.DB, newItem);
  const text = `✅ «${pending.title}» به لیستت اضافه شد.`;
  if (messageId) await editMessageText(env.TELEGRAM_TOKEN, chatId, messageId, text);
  else await sendMessage(env.TELEGRAM_TOKEN, chatId, text);
  const saved = await getItem(env.DB, id);
  if (saved) await sendItem(env, chatId, saved);
}

// ---------- mood ----------

async function handleMood(env: Env, chatId: string): Promise<void> {
  const items = await moodItems(env.DB);
  await sendMessage(
    env.TELEGRAM_TOKEN,
    chatId,
    "🎲 لیست مود — حداکثر ۲ سریال و ۱۰ فیلم.",
    {
      inline_keyboard: [
        [{ text: "پیشنهاد مود ✨", callback_data: "moodpick" }],
      ],
    }
  );
  await sendItemList(env, chatId, items, "لیست مود خالیه. از زیر هر آیتم با دکمه «افزودن به مود» پرش کن.");
}

function splitTags(s: string | null): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function handleMoodSuggest(
  env: Env,
  chatId: string,
  titlesText: string
): Promise<void> {
  const titles = titlesText
    .split(/[\n,،]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (titles.length === 0) {
    await sendMessage(env.TELEGRAM_TOKEN, chatId, "دو تا عنوان قدیمی بنویس.");
    return;
  }
  const wanted = new Set<string>();
  const foundTitles: string[] = [];
  for (const t of titles) {
    const matches = await searchItems(env.DB, t);
    const m = matches[0];
    if (m) {
      foundTitles.push(m.title);
      for (const g of splitTags(m.genres)) wanted.add(g);
      for (const g of splitTags(m.tags)) wanted.add(g);
    }
  }
  if (wanted.size === 0) {
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      "این عنوان‌ها توی لیستت پیدا نشدن یا ژانر/تگ ندارن — پیشنهادی ندارم."
    );
    return;
  }
  const all = await listItems(env.DB, "unseen");
  const scored = all
    .map((it) => {
      let score = 0;
      for (const g of splitTags(it.genres)) if (wanted.has(g)) score++;
      for (const g of splitTags(it.tags)) if (wanted.has(g)) score++;
      return { it, score };
    })
    .filter((x) => x.score > 0 && !foundTitles.includes(x.it.title))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (scored.length === 0) {
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      "چیزی با ژانر/تگ مشترک توی دیده‌نشده‌ها پیدا نشد."
    );
    return;
  }
  await sendMessage(
    env.TELEGRAM_TOKEN,
    chatId,
    `بر اساس «${foundTitles.join("» و «")}» اینا رو پیشنهاد می‌دم:`
  );
  for (const { it } of scored) {
    await sendItem(env, chatId, it);
  }
}

// ---------- schedule ----------

interface ScheduleEntry {
  title: string;
  airDate: string;
  label: string | null;
}

async function collectSchedule(env: Env): Promise<ScheduleEntry[]> {
  const series = await followedSeries(env.DB);
  const entries: ScheduleEntry[] = [];
  for (const it of series) {
    const next = await nextEpisodeFor(env.TMDB_API_KEY, it.title);
    if (next) {
      entries.push({ title: it.title, airDate: next.airDate, label: next.label });
    }
  }
  entries.sort((a, b) => a.airDate.localeCompare(b.airDate));
  return entries;
}

async function handleSchedule(env: Env, chatId: string): Promise<void> {
  if (!tmdbAvailable(env.TMDB_API_KEY)) {
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      "جدول پخش به کلید TMDB نیاز داره که هنوز تنظیم نشده."
    );
    return;
  }
  const entries = await collectSchedule(env);
  if (entries.length === 0) {
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      "سریال دنبال‌شده‌ای با قسمت بعدی مشخص پیدا نشد. (منبع: TMDB)"
    );
    return;
  }
  const byDay = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    const d = new Date(e.airDate + "T00:00:00Z");
    const day = WEEKDAYS_FA[d.getUTCDay()];
    const arr = byDay.get(day) ?? [];
    arr.push(e);
    byDay.set(day, arr);
  }
  const lines: string[] = ["📅 جدول پخش سریال‌های دنبال‌شده:"];
  for (const [day, arr] of byDay) {
    lines.push(`\n${day}:`);
    for (const e of arr) {
      lines.push(`• ${e.title}${e.label ? ` ${e.label}` : ""} — ${e.airDate}`);
    }
  }
  lines.push("\nمنبع: TMDB");
  await sendMessage(env.TELEGRAM_TOKEN, chatId, lines.join("\n"));
}

/** Cron entry: remind the owner about series airing today (UTC). */
export async function runDailyReminder(env: Env): Promise<void> {
  if (!tmdbAvailable(env.TMDB_API_KEY)) return;
  const entries = await collectSchedule(env);
  const today = new Date().toISOString().slice(0, 10);
  const todays = entries.filter((e) => e.airDate === today);
  if (todays.length === 0) return;
  const lines = ["📺 امروز قسمت جدید داری:"];
  for (const e of todays) {
    lines.push(`• ${e.title}${e.label ? ` ${e.label}` : ""}`);
  }
  lines.push("منبع: TMDB");
  await sendMessage(env.TELEGRAM_TOKEN, env.OWNER_ID, lines.join("\n"));
}

// ---------- import ----------

async function handleImport(
  env: Env,
  chatId: string,
  fileId: string
): Promise<void> {
  const text = await downloadFileText(env.TELEGRAM_TOKEN, fileId);
  if (text == null) {
    await sendMessage(env.TELEGRAM_TOKEN, chatId, "فایل خونده نشد.");
    return;
  }
  const { items, errors } = csvToItems(text);
  let added = 0;
  let duplicates = 0;
  for (const it of items) {
    const dup = await findDuplicate(env.DB, it.title, null, null);
    if (dup) {
      duplicates++;
      continue;
    }
    await insertItem(env.DB, it);
    added++;
  }
  const lines = [
    "📥 ایمپورت تموم شد:",
    `✅ اضافه شد: ${added}`,
    `🔁 تکراری (رد شد): ${duplicates}`,
  ];
  if (errors.length > 0) {
    lines.push(`⚠️ خطاها (${errors.length}):`);
    lines.push(...errors.slice(0, 10));
  }
  await sendMessage(env.TELEGRAM_TOKEN, chatId, lines.join("\n"));
}

// ---------- awaiting input ----------

async function handleAwaiting(
  env: Env,
  chatId: string,
  text: string
): Promise<boolean> {
  const state = await getState(env.DB);
  if (!state.awaiting) return false;
  const kind = state.awaiting;
  const itemId = state.item_id;

  if (kind === "mood_titles") {
    await clearState(env.DB);
    await handleMoodSuggest(env, chatId, text);
    return true;
  }

  if (itemId == null) {
    await clearState(env.DB);
    return false;
  }
  const item = await getItem(env.DB, itemId);
  if (!item) {
    await clearState(env.DB);
    await sendMessage(env.TELEGRAM_TOKEN, chatId, "این آیتم دیگه وجود نداره.");
    return true;
  }

  if (kind === "rating") {
    const n = Number(text.trim());
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      await sendMessage(
        env.TELEGRAM_TOKEN,
        chatId,
        "امتیاز باید عدد صحیح بین ۱ تا ۱۰ باشه. دوباره بنویس:"
      );
      return true; // stay in awaiting state
    }
    await updateItemField(env.DB, itemId, "rating_me", n);
    await clearState(env.DB);
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      `⭐ امتیاز «${item.title}» ثبت شد: ${n}/10`
    );
    return true;
  }

  if (kind === "note") {
    await updateItemField(env.DB, itemId, "note_me", text.trim());
    await clearState(env.DB);
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      `✍️ نظرت برای «${item.title}» ثبت شد.`
    );
    return true;
  }

  if (kind === "bookmark") {
    await updateItemField(env.DB, itemId, "bookmark", text.trim());
    await clearState(env.DB);
    await sendMessage(
      env.TELEGRAM_TOKEN,
      chatId,
      `🔖 بوک‌مارک «${item.title}»: ${text.trim()}`
    );
    return true;
  }

  await clearState(env.DB);
  return false;
}

// ---------- commands ----------

const START_TEXT = `سلام! 🎬 به واچ‌لیست شخصی‌ت خوش اومدی.

دستورها:
/list — لیست (با فیلتر: movie / series / seen / unseen)
/search متن — جستجو توی لیست خودت
/add عنوان — اضافه کردن (چند عنوان: هر کدوم یه خط)
/random — یه فیلم/سریال ندیده رندوم (با فیلتر movie / series)
/mood — لیست مود و پیشنهاد
/schedule — جدول پخش سریال‌های دنبال‌شده
/export — خروجی CSV برای گوگل‌شیت
/account — آمار و پروفایل

برای ایمپورت، فایل CSV رو بفرست.`;

async function handleCommand(
  env: Env,
  chatId: string,
  text: string
): Promise<void> {
  const [rawCmd, ...rest] = text.trim().split(/\s+/);
  const cmd = rawCmd.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/start":
    case "/help":
      await sendMessage(env.TELEGRAM_TOKEN, chatId, START_TEXT);
      return;

    case "/list": {
      const filter = arg.toLowerCase();
      const items = await listItems(
        env.DB,
        ["movie", "series", "seen", "unseen"].includes(filter)
          ? filter
          : undefined
      );
      await sendItemList(env, chatId, items, "لیست خالیه. با /add شروع کن.");
      return;
    }

    case "/search": {
      if (!arg) {
        await sendMessage(env.TELEGRAM_TOKEN, chatId, "چی رو بگردم؟ /search متن");
        return;
      }
      const items = await searchItems(env.DB, arg);
      await sendItemList(
        env,
        chatId,
        items,
        `«${arg}» توی لیستت پیدا نشد.`
      );
      return;
    }

    case "/random": {
      const f = arg.toLowerCase();
      const it = await randomUnseen(
        env.DB,
        f === "movie" || f === "series" ? f : undefined
      );
      if (!it) {
        await sendMessage(
          env.TELEGRAM_TOKEN,
          chatId,
          "آیتم ندیده‌ای نیست که رندوم بدم 🎉"
        );
        return;
      }
      await sendItem(env, chatId, it, "🎲 پیشنهاد رندوم:");
      return;
    }

    case "/mood":
      await handleMood(env, chatId);
      return;

    case "/add": {
      // /add may span multiple lines (bulk): re-split the original text.
      const body = text.trim().slice(rawCmd.length).trim();
      await handleAddTitles(env, chatId, body.split("\n"));
      return;
    }

    case "/schedule":
      await handleSchedule(env, chatId);
      return;

    case "/export": {
      const items = await listItems(env.DB);
      const csv = itemsToCsv(items);
      await sendDocument(
        env.TELEGRAM_TOKEN,
        chatId,
        "watchlist.csv",
        csv,
        `خروجی واچ‌لیست — ${items.length} آیتم`
      );
      return;
    }

    case "/account": {
      const c = await counts(env.DB);
      const lines = [
        "👤 حساب تو:",
        `🎬 کل آیتم‌ها: ${c.total} (فیلم: ${c.movies}، سریال: ${c.series})`,
        `✅ دیده‌شده: ${c.seen} — ندیده: ${c.unseen}`,
        `🎲 در لیست مود: ${c.mood}`,
        "",
        "تنظیمات: منبع حقیقت گوگل‌شیته؛ ایمپورت/اکسپورت با CSV انجام می‌شه.",
      ];
      await sendMessage(env.TELEGRAM_TOKEN, chatId, lines.join("\n"));
      return;
    }

    default:
      await sendMessage(
        env.TELEGRAM_TOKEN,
        chatId,
        "این دستور رو نمی‌شناسم. /start رو بزن تا لیست دستورها رو ببینی."
      );
  }
}

// ---------- callbacks ----------

async function handleCallback(
  env: Env,
  chatId: string,
  messageId: number | undefined,
  callbackId: string,
  data: string
): Promise<void> {
  const [action, a, b] = data.split(":");
  const id = Number(a);

  switch (action) {
    case "ok":
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId);
      await confirmPending(env, chatId, messageId, id);
      return;

    case "no": {
      await deletePending(env.DB, id);
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "رد شد");
      if (messageId) {
        await editMessageText(env.TELEGRAM_TOKEN, chatId, messageId, "❌ رد شد.");
      }
      return;
    }

    case "man": {
      const type = b === "series" ? "series" : "movie";
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId);
      await confirmPending(env, chatId, messageId, id, type);
      return;
    }

    case "req": {
      const pending = await getPending<PendingAdd>(env.DB, id);
      if (pending) {
        await saveRequest(env.DB, pending.title);
        await deletePending(env.DB, id);
      }
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "ثبت شد");
      const text = "درخواست ثبت شد (بات عمومی فاز ۳).";
      if (messageId) await editMessageText(env.TELEGRAM_TOKEN, chatId, messageId, text);
      else await sendMessage(env.TELEGRAM_TOKEN, chatId, text);
      return;
    }

    case "moodpick": {
      await setState(env.DB, "mood_titles", null);
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId);
      await sendMessage(
        env.TELEGRAM_TOKEN,
        chatId,
        "دو تا عنوان قدیمی که دوست داشتی رو بنویس (هر کدوم یه خط یا با ویرگول جدا کن):"
      );
      return;
    }

    case "seen": {
      const it = await getItem(env.DB, id);
      if (!it) {
        await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "پیدا نشد");
        return;
      }
      await markSeen(env.DB, id);
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "دیده شد ✅");
      if (messageId) {
        const updated = await getItem(env.DB, id);
        if (updated) {
          await editMessageText(
            env.TELEGRAM_TOKEN,
            chatId,
            messageId,
            itemLine(updated),
            itemKeyboard(updated)
          );
        }
      }
      return;
    }

    case "rate": {
      await setState(env.DB, "rating", id);
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId);
      await sendMessage(env.TELEGRAM_TOKEN, chatId, "امتیازت از ۱ تا ۱۰ چنده؟");
      return;
    }

    case "note": {
      await setState(env.DB, "note", id);
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId);
      await sendMessage(env.TELEGRAM_TOKEN, chatId, "نظرت رو بنویس:");
      return;
    }

    case "bm": {
      await setState(env.DB, "bookmark", id);
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId);
      await sendMessage(
        env.TELEGRAM_TOKEN,
        chatId,
        "بوک‌مارک رو بنویس (سریال: قسمت + دقیقه، فیلم: دقیقه):"
      );
      return;
    }

    case "mood": {
      const it = await getItem(env.DB, id);
      if (!it) {
        await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "پیدا نشد");
        return;
      }
      if (it.in_mood) {
        await updateItemField(env.DB, id, "in_mood", 0);
        await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "از مود حذف شد");
      } else {
        const max = it.type === "series" ? MOOD_MAX_SERIES : MOOD_MAX_MOVIES;
        const current = await moodCount(env.DB, it.type);
        if (current >= max) {
          await answerCallbackQuery(
            env.TELEGRAM_TOKEN,
            callbackId,
            `لیست مود برای ${typeFa(it.type)} پره (${max} تا)`
          );
          return;
        }
        await updateItemField(env.DB, id, "in_mood", 1);
        await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "به مود اضافه شد 🎲");
      }
      if (messageId) {
        const updated = await getItem(env.DB, id);
        if (updated) {
          await editMessageText(
            env.TELEGRAM_TOKEN,
            chatId,
            messageId,
            itemLine(updated),
            itemKeyboard(updated)
          );
        }
      }
      return;
    }

    case "del": {
      const it = await getItem(env.DB, id);
      if (!it) {
        await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "پیدا نشد");
        return;
      }
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId);
      await sendMessage(
        env.TELEGRAM_TOKEN,
        chatId,
        `مطمئنی «${it.title}» حذف بشه؟ این کار برگشت نداره.`,
        {
          inline_keyboard: [
            [
              { text: "بله، حذف کن", callback_data: `delok:${id}` },
              { text: "نه، نگهش دار", callback_data: `delno:${id}` },
            ],
          ],
        }
      );
      return;
    }

    case "delok": {
      const it = await getItem(env.DB, id);
      await deleteItem(env.DB, id);
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "حذف شد");
      const text = it ? `🗑 «${it.title}» حذف شد.` : "حذف شد.";
      if (messageId) await editMessageText(env.TELEGRAM_TOKEN, chatId, messageId, text);
      else await sendMessage(env.TELEGRAM_TOKEN, chatId, text);
      return;
    }

    case "delno": {
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId, "لغو شد");
      if (messageId) {
        await editMessageText(env.TELEGRAM_TOKEN, chatId, messageId, "حذف لغو شد.");
      }
      return;
    }

    default:
      await answerCallbackQuery(env.TELEGRAM_TOKEN, callbackId);
  }
}

// ---------- update router ----------

export async function handleUpdate(env: Env, update: any): Promise<void> {
  try {
    if (update?.callback_query) {
      const cq = update.callback_query;
      const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? "");
      await handleCallback(
        env,
        chatId,
        cq.message?.message_id,
        String(cq.id),
        String(cq.data ?? "")
      );
      return;
    }

    const msg = update?.message;
    if (!msg) return;
    const chatId = String(msg.chat?.id ?? msg.from?.id ?? "");

    // CSV document import
    if (msg.document?.file_id) {
      const name: string = msg.document.file_name ?? "";
      const mime: string = msg.document.mime_type ?? "";
      if (name.toLowerCase().endsWith(".csv") || mime.includes("csv")) {
        await handleImport(env, chatId, String(msg.document.file_id));
      } else {
        await sendMessage(
          env.TELEGRAM_TOKEN,
          chatId,
          "فقط فایل CSV برای ایمپورت قبول می‌کنم."
        );
      }
      return;
    }

    const text: string = typeof msg.text === "string" ? msg.text : "";
    if (!text) return;

    if (text.startsWith("/")) {
      await clearState(env.DB); // a new command cancels any pending input
      await handleCommand(env, chatId, text);
      return;
    }

    // Plain text: awaiting input first, otherwise treat as bulk/single add.
    const consumed = await handleAwaiting(env, chatId, text);
    if (consumed) return;
    await handleAddTitles(env, chatId, text.split("\n"));
  } catch {
    // Never let a handler error break the webhook response.
  }
}
