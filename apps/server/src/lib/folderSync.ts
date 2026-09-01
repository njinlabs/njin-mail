import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { folders } from "../db/schema";
import { listMailboxes } from "./imapClient";

export interface SyncedFolder {
  id: string;
  name: string;
  displayName: string;
  specialUse: string | null;
  unreadCount: number;
}

/** Lists mailboxes over IMAP and upserts them into the folders table for this user. */
export async function syncFolders(
  userId: string,
  email: string,
  password: string
): Promise<SyncedFolder[]> {
  const mailboxes = await listMailboxes(email, password);
  const now = new Date().toISOString();
  const result: SyncedFolder[] = [];

  for (const mb of mailboxes) {
    const id = crypto.randomUUID();
    await db
      .insert(folders)
      .values({
        id,
        userId,
        name: mb.path,
        displayName: mb.name,
        delimiter: mb.delimiter,
        specialUse: mb.specialUse ?? null,
        uidValidity: mb.status?.uidValidity ? Number(mb.status.uidValidity) : null,
        uidNext: mb.status?.uidNext ?? null,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [folders.userId, folders.name],
        set: {
          displayName: mb.name,
          delimiter: mb.delimiter,
          specialUse: mb.specialUse ?? null,
          uidValidity: mb.status?.uidValidity ? Number(mb.status.uidValidity) : null,
          uidNext: mb.status?.uidNext ?? null,
          lastSyncedAt: now,
        },
      });

    const row = await db
      .select()
      .from(folders)
      .where(and(eq(folders.userId, userId), eq(folders.name, mb.path)))
      .limit(1);

    result.push({
      id: row[0]?.id ?? id,
      name: mb.path,
      displayName: mb.name,
      specialUse: mb.specialUse ?? null,
      unreadCount: mb.status?.unseen ?? 0,
    });
  }

  return result;
}
