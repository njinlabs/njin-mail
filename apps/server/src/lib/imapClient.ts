import { ImapFlow } from "imapflow";
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
