// Telegram Bot API helpers — raw fetch, no dependencies.

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

async function callApi(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<any> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function sendMessage(
  token: string,
  chatId: string | number,
  text: string,
  keyboard?: InlineKeyboard
): Promise<any> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (keyboard) body.reply_markup = keyboard;
  return callApi(token, "sendMessage", body);
}

export async function editMessageText(
  token: string,
  chatId: string | number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard
): Promise<any> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
  };
  if (keyboard) body.reply_markup = keyboard;
  return callApi(token, "editMessageText", body);
}

export async function answerCallbackQuery(
  token: string,
  callbackQueryId: string,
  text?: string
): Promise<any> {
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) body.text = text;
  return callApi(token, "answerCallbackQuery", body);
}

export async function sendDocument(
  token: string,
  chatId: string | number,
  filename: string,
  content: string,
  caption?: string
): Promise<any> {
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption);
    form.append(
      "document",
      new Blob([content], { type: "text/csv;charset=utf-8" }),
      filename
    );
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendDocument`,
      { method: "POST", body: form }
    );
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

/** Download a Telegram file (by file_id) and return its text content, or null. */
export async function downloadFileText(
  token: string,
  fileId: string
): Promise<string | null> {
  try {
    const meta = await callApi(token, "getFile", { file_id: fileId });
    const filePath: string | undefined = meta?.result?.file_path;
    if (!filePath) return null;
    const res = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
