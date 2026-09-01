import { eq } from "drizzle-orm";
import type { MessageAddressObject, MessageStructureObject } from "imapflow";
import { db } from "../db/client";
import { folders, messages, syncState } from "../db/schema";
import { fetchNewMessages } from "./imapClient";

type Folder = typeof folders.$inferSelect;

export interface MessageSyncResult {
  folderId: string;
  synced: number;
  uidNext: number;
}

function serializeAddresses(list?: MessageAddressObject[]): string | null {
  if (!list || list.length === 0) return null;
  return JSON.stringify(list.map((a) => ({ name: a.name ?? null, address: a.address ?? null })));
}

function nodeHasAttachment(node?: MessageStructureObject): boolean {
  if (!node) return false;
  if (node.disposition?.toLowerCase() === "attachment") return true;
  return (node.childNodes ?? []).some(nodeHasAttachment);
}

/** Fetches messages newer than the folder's last-synced UID and persists them. */
export async function syncMessagesForFolder(
  email: string,
  password: string,
  folder: Folder
): Promise<MessageSyncResult> {
  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.folderId, folder.id))
    .limit(1);
  const lastUidSynced = state?.lastUidSynced ?? 0;

  await db
    .insert(syncState)
    .values({ folderId: folder.id, lastUidSynced, isSyncing: 1 })
    .onConflictDoUpdate({
      target: syncState.folderId,
      set: { isSyncing: 1, lastError: null },
    });

  try {
    const { uidNext, uidValidity, messages: fetched } = await fetchNewMessages(
      email,
      password,
      folder.name,
      lastUidSynced
    );

    let maxUid = lastUidSynced;
    for (const msg of fetched) {
      const envelope = msg.envelope;
      await db
        .insert(messages)
        .values({
          id: crypto.randomUUID(),
          userId: folder.userId,
          folderId: folder.id,
          uid: msg.uid,
          messageId: envelope?.messageId ?? null,
          inReplyTo: envelope?.inReplyTo ?? null,
          subject: envelope?.subject ?? null,
          fromAddr: serializeAddresses(envelope?.from),
          toAddr: serializeAddresses(envelope?.to),
          ccAddr: serializeAddresses(envelope?.cc),
          bccAddr: serializeAddresses(envelope?.bcc),
          date: envelope?.date ? new Date(envelope.date).toISOString() : null,
          internalDate: msg.internalDate ? new Date(msg.internalDate).toISOString() : null,
          flags: msg.flags ? JSON.stringify([...msg.flags]) : null,
          hasAttachments: nodeHasAttachment(msg.bodyStructure) ? 1 : 0,
          size: msg.size ?? null,
        })
        .onConflictDoNothing({ target: [messages.folderId, messages.uid] });

      if (msg.uid > maxUid) maxUid = msg.uid;
    }

    const now = new Date().toISOString();
    await db
      .update(folders)
      .set({ uidNext, uidValidity, lastSyncedAt: now })
      .where(eq(folders.id, folder.id));

    await db
      .update(syncState)
      .set({ lastUidSynced: maxUid, isSyncing: 0, lastError: null, updatedAt: now })
      .where(eq(syncState.folderId, folder.id));

    return { folderId: folder.id, synced: fetched.length, uidNext };
  } catch (err) {
    await db
      .update(syncState)
      .set({
        isSyncing: 0,
        lastError: err instanceof Error ? err.message : "Unknown error",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncState.folderId, folder.id));
    throw err;
  }
}
