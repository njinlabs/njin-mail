import { ImapFlow } from "imapflow";
import { env } from "../env";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: bun src/scripts/imapTest.ts <email> <password>");
  process.exit(1);
}

const client = new ImapFlow({
  host: env.IMAP_HOST,
  port: env.IMAP_PORT,
  secure: env.IMAP_SECURE,
  auth: { user: email, pass: password },
  tls: { rejectUnauthorized: env.IMAP_REJECT_UNAUTHORIZED },
  logger: false,
});

await client.connect();
console.log("Connected as", email);

const mailboxes = await client.list();
for (const mb of mailboxes) {
  console.log(`- ${mb.path} (specialUse: ${mb.specialUse ?? "-"}, delimiter: ${mb.delimiter})`);
}

await client.logout();
console.log("Logged out.");
