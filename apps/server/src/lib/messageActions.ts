import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { folders, messages } from "../db/schema";
import {
  createMailboxIfMissing,
  moveMessage as imapMoveMessage,
  updateMessageFlags,
} from "./imapClient";
import { syncFolders } from "./folderSync";

type Message = typeof messages.$inferSelect;
type Folder = typeof folders.$inferSelect;

function parseFlags(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

/** Removes \Seen on the server and locally — the counterpart of the auto-mark-read on open. */
export async function markMessageUnread(
  email: string,
  password: string,
  message: Message,
  folder: Folder
): Promise<void> {
  await updateMessageFlags(email, password, folder.name, message.uid, { remove: ["\\Seen"] });
  const nextFlags = parseFlags(message.flags).filter((f) => f !== "\\Seen");
  await db.update(messages).set({ flags: JSON.stringify(nextFlags) }).where(eq(messages.id, message.id));
}

/** Toggles \Flagged on the server and locally. Returns the new flagged state. */
export async function toggleMessageFlagged(
  email: string,
  password: string,
  message: Message,
  folder: Folder
): Promise<boolean> {
  const current = parseFlags(message.flags);
  const isFlagged = current.includes("\\Flagged");

  await updateMessageFlags(
    email,
    password,
    folder.name,
    message.uid,
    isFlagged ? { remove: ["\\Flagged"] } : { add: ["\\Flagged"] }
  );

  const nextFlags = isFlagged
    ? current.filter((f) => f !== "\\Flagged")
    : [...current, "\\Flagged"];
  await db.update(messages).set({ flags: JSON.stringify(nextFlags) }).where(eq(messages.id, message.id));

  return !isFlagged;
}

export type MoveDestination = "junk" | "trash" | "archive";

const SPECIAL_USE_BY_DESTINATION: Record<Exclude<MoveDestination, "archive">, string> = {
  junk: "\\Junk",
  trash: "\\Trash",
};

/**
 * Moves a message to the folder for a given destination, creating an "Archive"
 * mailbox on first use (the server has no \Archive special-use folder, so it's
 * matched/created by name instead). Deletes the local row for the source
 * location — the destination folder picks the message back up, with its new
 * UID, the next time it's opened (existing sync-on-open behavior).
 */
export async function moveMessageTo(
  userId: string,
  email: string,
  password: string,
  message: Message,
  sourceFolder: Folder,
  destination: MoveDestination
): Promise<{ moved: boolean }> {
  let destFolder: Folder | undefined;

  if (destination === "archive") {
    const [existing] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.userId, userId), eq(folders.name, "Archive")))
      .limit(1);
    destFolder = existing;

    if (!destFolder) {
      await createMailboxIfMissing(email, password, "Archive");
      await syncFolders(userId, email, password);
      const [created] = await db
        .select()
        .from(folders)
        .where(and(eq(folders.userId, userId), eq(folders.name, "Archive")))
        .limit(1);
      destFolder = created;
    }
  } else {
    const [found] = await db
      .select()
      .from(folders)
      .where(
        and(eq(folders.userId, userId), eq(folders.specialUse, SPECIAL_USE_BY_DESTINATION[destination]))
      )
      .limit(1);
    destFolder = found;
  }

  if (!destFolder) {
    throw new Error(`No destination folder available for "${destination}"`);
  }
  if (destFolder.id === sourceFolder.id) {
    return { moved: false };
  }

  await imapMoveMessage(email, password, sourceFolder.name, destFolder.name, message.uid);
  await db.delete(messages).where(eq(messages.id, message.id));

  return { moved: true };
}
