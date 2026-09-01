import { ImapFlow, type FetchMessageObject, type ListResponse } from "imapflow";
import { env } from "../env";

export function createImapClient(email: string, password: string): ImapFlow {
  return new ImapFlow({
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    secure: env.IMAP_SECURE,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: env.IMAP_REJECT_UNAUTHORIZED },
    logger: false,
  });
}

/** Verifies IMAP credentials by connecting and immediately logging out. */
export async function verifyImapCredentials(email: string, password: string): Promise<boolean> {
  const client = createImapClient(email, password);
  try {
    await client.connect();
    await client.logout();
    return true;
  } catch {
    return false;
  }
}

/** Connects, lists all mailboxes with status counters, and logs out. */
export async function listMailboxes(email: string, password: string): Promise<ListResponse[]> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    return await client.list({
      statusQuery: { messages: true, unseen: true, uidNext: true, uidValidity: true },
    });
  } finally {
    await client.logout();
  }
}

/**
 * Opens a mailbox and fetches envelope/flags/structure for every message with
 * UID greater than `sinceUid`. Returns the mailbox's current uidNext/uidValidity
 * alongside the fetched messages so the caller can persist sync progress.
 */
export async function fetchNewMessages(
  email: string,
  password: string,
  folderPath: string,
  sinceUid: number
): Promise<{ uidNext: number; uidValidity: number; messages: FetchMessageObject[] }> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    const mailbox = await client.mailboxOpen(folderPath);
    const uidNext = mailbox.uidNext;
    const uidValidity = Number(mailbox.uidValidity);
    const startUid = sinceUid + 1;

    const fetched: FetchMessageObject[] = [];
    if (startUid < uidNext) {
      for await (const msg of client.fetch(
        `${startUid}:*`,
        { uid: true, envelope: true, flags: true, size: true, internalDate: true, bodyStructure: true },
        { uid: true }
      )) {
        // IMAP "N:*" ranges can include one message below N; filter it back out.
        if (msg.uid >= startUid) fetched.push(msg);
      }
    }

    return { uidNext, uidValidity, messages: fetched };
  } finally {
    await client.logout();
  }
}

/** Fetches the full RFC822 source of a single message by UID, or null if it no longer exists. */
export async function fetchMessageSource(
  email: string,
  password: string,
  folderPath: string,
  uid: number
): Promise<Buffer | null> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    await client.mailboxOpen(folderPath);
    const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!msg || !msg.source) return null;
    return msg.source;
  } finally {
    await client.logout();
  }
}

/** Adds the \Seen flag to a message on the server (marks it read). */
export async function markMessageSeen(
  email: string,
  password: string,
  folderPath: string,
  uid: number
): Promise<void> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    await client.mailboxOpen(folderPath);
    await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
  } finally {
    await client.logout();
  }
}

/** Adds and/or removes flags on a message on the server. */
export async function updateMessageFlags(
  email: string,
  password: string,
  folderPath: string,
  uid: number,
  changes: { add?: string[]; remove?: string[] }
): Promise<void> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    await client.mailboxOpen(folderPath);
    if (changes.add?.length) await client.messageFlagsAdd(uid, changes.add, { uid: true });
    if (changes.remove?.length) await client.messageFlagsRemove(uid, changes.remove, { uid: true });
  } finally {
    await client.logout();
  }
}

/** Moves a message from one mailbox to another (source's UID is invalidated). */
export async function moveMessage(
  email: string,
  password: string,
  sourceFolderPath: string,
  destinationFolderPath: string,
  uid: number
): Promise<void> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    await client.mailboxOpen(sourceFolderPath);
    await client.messageMove(uid, destinationFolderPath, { uid: true });
  } finally {
    await client.logout();
  }
}

/** Creates a mailbox if it doesn't already exist (idempotent). */
export async function createMailboxIfMissing(
  email: string,
  password: string,
  name: string
): Promise<void> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    await client.mailboxCreate(name);
  } catch (err) {
    const isAlreadyExists = err instanceof Error && /already\s*exists/i.test(err.message);
    if (!isAlreadyExists) throw err;
  } finally {
    await client.logout();
  }
}

/** Appends a raw RFC822 message to a mailbox (used to archive sent mail into Sent). */
export async function appendMessage(
  email: string,
  password: string,
  folderPath: string,
  raw: Buffer
): Promise<void> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    await client.append(folderPath, raw, ["\\Seen"]);
  } finally {
    await client.logout();
  }
}
