import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { folders, messages } from "../db/schema";
import { sessionMiddleware } from "../middleware/session";
import { getSessionPassword } from "../lib/sessionStore";
import { syncFolders } from "../lib/folderSync";
import { syncMessagesForFolder } from "../lib/messageSync";
import { toMessageListItemDto } from "../lib/messageDto";

const MAX_MESSAGES_LIMIT = 100;
const DEFAULT_MESSAGES_LIMIT = 50;

export const folderRoutes = new Hono();

folderRoutes.get("/", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const password = getSessionPassword(c.get("sessionId"));
  if (!password) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const folders = await syncFolders(session.userId, session.email, password);
    return c.json({ folders });
  } catch {
    return c.json({ error: "Failed to sync folders" }, 502);
  }
});

folderRoutes.post("/:folderId/sync", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const password = getSessionPassword(c.get("sessionId"));
  if (!password) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const folderId = c.req.param("folderId");
  if (!folderId) {
    return c.json({ error: "Not found" }, 404);
  }
  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, session.userId)))
    .limit(1);
  if (!folder) {
    return c.json({ error: "Not found" }, 404);
  }

  try {
    const result = await syncMessagesForFolder(session.email, password, folder);
    return c.json(result);
  } catch {
    return c.json({ error: "Failed to sync messages" }, 502);
  }
});

folderRoutes.get("/:folderId/messages", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const folderId = c.req.param("folderId");
  if (!folderId) {
    return c.json({ error: "Not found" }, 404);
  }

  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, session.userId)))
    .limit(1);
  if (!folder) {
    return c.json({ error: "Not found" }, 404);
  }

  const requestedLimit = Number(c.req.query("limit") ?? DEFAULT_MESSAGES_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_MESSAGES_LIMIT)
    : DEFAULT_MESSAGES_LIMIT;
  const requestedOffset = Number(c.req.query("offset") ?? 0);
  const offset = Number.isFinite(requestedOffset) ? Math.max(Math.trunc(requestedOffset), 0) : 0;

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.folderId, folder.id))
    .orderBy(desc(sql`coalesce(${messages.date}, ${messages.internalDate})`))
    .limit(limit)
    .offset(offset);

  return c.json({ messages: rows.map(toMessageListItemDto) });
});
