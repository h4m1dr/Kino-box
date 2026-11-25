// Google Sheet CSV import/export (Phase 1: CSV only; Sheets API is Phase 1b).
// Column order is fixed by sheets-columns.csv.

import type { Item, NewItem } from "./db";

export const SHEET_COLUMNS = [
  "title",
  "type",
  "status",
  "seen",
  "runtime_min",
  "genres",
  "collection",
  "needs_previous",
  "rating_me",
  "rating_other",
  "note_me",
  "note_other",
  "bookmark",
  "tags",
  "source",
] as const;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function itemsToCsv(items: Item[]): string {
  const lines: string[] = [SHEET_COLUMNS.join(",")];
  for (const it of items) {
    const row: Record<string, string> = {
      title: it.title ?? "",
      type: it.type ?? "",
      status: it.status ?? "",
      seen: String(it.seen ?? 0),
      runtime_min: it.runtime_min != null ? String(it.runtime_min) : "",
      genres: it.genres ?? "",
      collection: it.collection ?? "",
      needs_previous: String(it.needs_previous ?? 0),
      rating_me: it.rating_me != null ? String(it.rating_me) : "",
      rating_other: it.rating_other != null ? String(it.rating_other) : "",
      note_me: it.note_me ?? "",
      note_other: it.note_other ?? "",
      bookmark: it.bookmark ?? "",
      tags: it.tags ?? "",
      source: it.source ?? "",
    };
    lines.push(SHEET_COLUMNS.map((c) => csvEscape(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Parse CSV text into rows of fields. Handles quoted fields, escaped quotes
 *  (""), commas/newlines inside quotes, and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, ""); // strip BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

export interface ImportResult {
  items: NewItem[];
  errors: string[];
}

function toInt(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFlag(v: string | undefined): number {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" ? 1 : 0;
}

/** Convert CSV text (with the sheet header row) into NewItems.
 *  Rows without a title or with an invalid type are reported as errors. */
export function csvToItems(text: string): ImportResult {
  const rows = parseCsv(text);
  const items: NewItem[] = [];
  const errors: string[] = [];
  if (rows.length === 0) {
    return { items, errors: ["فایل خالی است"] };
  }
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iTitle = idx("title");
  if (iTitle === -1) {
    return { items, errors: ["ستون title پیدا نشد"] };
  }
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (name: string): string => {
      const i = idx(name);
      return i >= 0 && i < row.length ? row[i].trim() : "";
    };
    const title = get("title");
    if (!title) {
      errors.push(`ردیف ${r + 1}: عنوان خالی`);
      continue;
    }
    const typeRaw = get("type").toLowerCase();
    const type: "movie" | "series" | null =
      typeRaw === "movie" || typeRaw === "film"
        ? "movie"
        : typeRaw === "series" || typeRaw === "tv" || typeRaw === "show"
          ? "series"
          : null;
    if (!type) {
      errors.push(`ردیف ${r + 1}: نوع نامعتبر (${get("type")})`);
      continue;
    }
    const statusRaw = get("status").toLowerCase();
    const status: "want" | "watching" | "watched" =
      statusRaw === "watching" || statusRaw === "watched"
        ? (statusRaw as "watching" | "watched")
        : "want";
    const seen = toFlag(get("seen"));
    items.push({
      title,
      type,
      status: seen === 1 ? "watched" : status,
      seen,
      runtime_min: toInt(get("runtime_min")),
      genres: get("genres") || null,
      collection: get("collection") || null,
      needs_previous: toFlag(get("needs_previous")),
      rating_me: toInt(get("rating_me")),
      rating_other: toInt(get("rating_other")),
      note_me: get("note_me") || null,
      note_other: get("note_other") || null,
      bookmark: get("bookmark") || null,
      tags: get("tags") || null,
      source: get("source") || "Sheet",
    });
  }
  return { items, errors };
}
