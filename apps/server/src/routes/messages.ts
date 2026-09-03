import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { simpleParser } from "mailparser";
import { db } from "../db/client";
import { attachments, folders, messages, users } from "../db/schema";
import { sessionMiddleware } from "../middleware/session";
import { getSessionPassword } from "../lib/sessionStore";
import { ensureMessageBody } from "../lib/messageBody";
import { toMessageDetailDto } from "../lib/messageDto";
import { sendMail } from "../lib/smtpClient";
import { appendMessage, fetchMessageSource, markMessageSeen } from "../lib/imapClient";
import { markMessageUnread, moveMessageTo, toggleMessageFlagged } from "../lib/messageActions";

export const messageRoutes = new Hono();

async function loadMessageAndFolder(userId: string, messageId: string) {
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.userId, userId)))
    .limit(1);
  if (!message) return null;

  const [folder] = await db.select().from(folders).where(eq(folders.id, message.folderId)).limit(1);
  if (!folder) return null;

  return { message, folder };
}

const emailAddress = z.string().email();

const MAX_INLINE_ATTACHMENT_BASE64_LENGTH = 7 * 1024 * 1024; // ~5MB binary
const MAX_FILE_ATTACHMENT_BASE64_LENGTH = 20 * 1024 * 1024; // ~15MB binary

const inlineAttachmentSchema = z.object({
  cid: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentBase64: z.string().min(1).max(MAX_INLINE_ATTACHMENT_BASE64_LENGTH),
});

const fileAttachmentSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentBase64: z.string().min(1).max(MAX_FILE_ATTACHMENT_BASE64_LENGTH),
});

const sendSchema = z
  .object({
    to: z.array(emailAddress).min(1),
    cc: z.array(emailAddress).optional(),
    bcc: z.array(emailAddress).optional(),
    subject: z.string().min(1),
    text: z.string().optional(),
    html: z.string().optional(),
    replyToMessageId: z.string().optional(),
    inlineAttachments: z.array(inlineAttachmentSchema).max(10).optional(),
    attachments: z.array(fileAttachmentSchema).max(10).optional(),
  })
  .refine((d) => d.text || d.html, { message: "Either text or html is required" });

messageRoutes.post("/send", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const password = getSessionPassword(c.get("sessionId"));
  if (!password) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const {
    to,
    cc,
    bcc,
    subject,
    text,
    html,
    replyToMessageId,
    inlineAttachments,
    attachments: fileAttachments,
  } = parsed.data;

  let inReplyTo: string | undefined;
  let references: string[] | undefined;
  if (replyToMessageId) {
    const [original] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, replyToMessageId), eq(messages.userId, session.userId)))
      .limit(1);
    if (original?.messageId) {
      inReplyTo = original.messageId;
      const priorRefs = original.referencesHdr?.split(/\s+/).filter(Boolean) ?? [];
      references = [...priorRefs, original.messageId];
    }
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);

  let raw: Buffer;
  try {
    const result = await sendMail(session.email, password, {
      fromName: user?.displayName,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      inReplyTo,
      references,
      inlineAttachments,
      attachments: fileAttachments,
    });
    raw = result.raw;
  } catch {
    return c.json({ error: "Failed to send message" }, 502);
  }

  const [sentFolder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.userId, session.userId), eq(folders.specialUse, "\\Sent")))
    .limit(1);
  if (sentFolder) {
    try {
      await appendMessage(session.email, password, sentFolder.name, raw);
    } catch {
      // Sending already succeeded; failing to archive a local copy in Sent isn't fatal.
    }
  }

  return c.json({ ok: true });
});

messageRoutes.get("/:messageId", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const messageId = c.req.param("messageId");
  if (!messageId) {
    return c.json({ error: "Not found" }, 404);
  }

  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.userId, session.userId)))
    .limit(1);
  if (!message) {
    return c.json({ error: "Not found" }, 404);
  }

  let current = message;
  const existingFlags: string[] = current.flags ? JSON.parse(current.flags) : [];
  const needsBody = !current.bodyFetchedAt;
  const needsSeen = !existingFlags.includes("\\Seen");

  if (needsBody || needsSeen) {
    const password = getSessionPassword(c.get("sessionId"));
    const [folder] = await db.select().from(folders).where(eq(folders.id, message.folderId)).limit(1);

    if (password && folder) {
      if (needsBody) {
        try {
          current = await ensureMessageBody(session.email, password, current, folder);
        } catch {
          // Leave the message as-is (metadata-only); the client can retry the fetch.
        }
      }

      if (needsSeen) {
        try {
          await markMessageSeen(session.email, password, folder.name, current.uid);
          const updatedFlags = JSON.stringify([...existingFlags, "\\Seen"]);
          await db.update(messages).set({ flags: updatedFlags }).where(eq(messages.id, current.id));
          current = { ...current, flags: updatedFlags };
        } catch {
          // Non-fatal — the message just stays marked unread until a later open/sync.
        }
      }
    }
  }

  const attachmentRows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, current.id));

  return c.json(toMessageDetailDto(current, attachmentRows));
});

messageRoutes.post("/:messageId/unread", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const messageId = c.req.param("messageId");
  if (!messageId) {
    return c.json({ error: "Not found" }, 404);
  }

  const password = getSessionPassword(c.get("sessionId"));
  if (!password) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const loaded = await loadMessageAndFolder(session.userId, messageId);
  if (!loaded) {
    return c.json({ error: "Not found" }, 404);
  }

  try {
    await markMessageUnread(session.email, password, loaded.message, loaded.folder);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "Failed to update message" }, 502);
  }
});

messageRoutes.post("/:messageId/flag", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const messageId = c.req.param("messageId");
  if (!messageId) {
    return c.json({ error: "Not found" }, 404);
  }

  const password = getSessionPassword(c.get("sessionId"));
  if (!password) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const loaded = await loadMessageAndFolder(session.userId, messageId);
  if (!loaded) {
    return c.json({ error: "Not found" }, 404);
  }

  try {
    const flagged = await toggleMessageFlagged(session.email, password, loaded.message, loaded.folder);
    return c.json({ flagged });
  } catch {
    return c.json({ error: "Failed to update message" }, 502);
  }
});

const moveSchema = z.object({ destination: z.enum(["junk", "trash", "archive"]) });

messageRoutes.post("/:messageId/move", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const messageId = c.req.param("messageId");
  if (!messageId) {
    return c.json({ error: "Not found" }, 404);
  }

  const password = getSessionPassword(c.get("sessionId"));
  if (!password) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const parsed = moveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const loaded = await loadMessageAndFolder(session.userId, messageId);
  if (!loaded) {
    return c.json({ error: "Not found" }, 404);
  }

  try {
    const result = await moveMessageTo(
      session.userId,
      session.email,
      password,
      loaded.message,
      loaded.folder,
      parsed.data.destination
    );
    return c.json(result);
  } catch {
    return c.json({ error: "Failed to move message" }, 502);
  }
});

messageRoutes.get("/:messageId/attachments/:attachmentId", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const messageId = c.req.param("messageId");
  const attachmentId = c.req.param("attachmentId");
  if (!messageId || !attachmentId) {
    return c.json({ error: "Not found" }, 404);
  }

  const loaded = await loadMessageAndFolder(session.userId, messageId);
  if (!loaded) {
    return c.json({ error: "Not found" }, 404);
  }

  const [attachmentRow] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.messageId, messageId)))
    .limit(1);
  if (!attachmentRow) {
    return c.json({ error: "Not found" }, 404);
  }

  const password = getSessionPassword(c.get("sessionId"));
  if (!password) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const source = await fetchMessageSource(session.email, password, loaded.folder.name, loaded.message.uid);
    if (!source) {
      return c.json({ error: "Message no longer exists" }, 404);
    }

    const parsed = await simpleParser(source);
    const match =
      parsed.attachments.find(
        (a) => (a.filename ?? null) === attachmentRow.filename && a.size === attachmentRow.size
      ) ?? parsed.attachments.find((a) => (a.filename ?? null) === attachmentRow.filename);
    if (!match) {
      return c.json({ error: "Attachment not found" }, 404);
    }

    c.header("Content-Type", attachmentRow.contentType ?? "application/octet-stream");
    c.header(
      "Content-Disposition",
      `attachment; filename="${(attachmentRow.filename ?? "file").replace(/"/g, "")}"`
    );
    return c.body(new Uint8Array(match.content));
  } catch {
    return c.json({ error: "Failed to fetch attachment" }, 502);
  }
});
