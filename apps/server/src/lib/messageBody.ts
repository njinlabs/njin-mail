import { simpleParser } from "mailparser";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { attachments, folders, messages } from "../db/schema";
import { fetchMessageSource } from "./imapClient";

type Message = typeof messages.$inferSelect;
type Folder = typeof folders.$inferSelect;

function buildSnippet(text: string | null): string | null {
  if (!text) return null;
  const flattened = text.replace(/\s+/g, " ").trim();
  return flattened.length > 200 ? `${flattened.slice(0, 200)}…` : flattened || null;
}

/** Fetches and persists a message's body/attachments on first access; a no-op if already cached. */
export async function ensureMessageBody(
  email: string,
  password: string,
  message: Message,
  folder: Folder
): Promise<Message> {
  if (message.bodyFetchedAt) return message;

  const source = await fetchMessageSource(email, password, folder.name, message.uid);
  if (!source) return message;

  const parsed = await simpleParser(source);
  const bodyText = parsed.text ?? null;
  const bodyHtml = typeof parsed.html === "string" ? parsed.html : null;
  const snippet = buildSnippet(bodyText);
  const now = new Date().toISOString();

  await db
    .update(messages)
    .set({ bodyText, bodyHtml, snippet, bodyFetchedAt: now })
    .where(eq(messages.id, message.id));

  for (const att of parsed.attachments) {
    await db.insert(attachments).values({
      id: crypto.randomUUID(),
      messageId: message.id,
      partId: att.cid ?? att.filename ?? crypto.randomUUID(),
      filename: att.filename ?? null,
      contentType: att.contentType ?? null,
      size: att.size ?? null,
      contentId: att.cid ?? null,
    });
  }

  return { ...message, bodyText, bodyHtml, snippet, bodyFetchedAt: now };
}
