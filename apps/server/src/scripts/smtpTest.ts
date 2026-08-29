import nodemailer from "nodemailer";
import { env } from "../env";

const [email, password, to] = process.argv.slice(2);
if (!email || !password || !to) {
  console.error("Usage: bun src/scripts/smtpTest.ts <email> <password> <to>");
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: { user: email, pass: password },
  tls: { rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED },
});

await transport.verify();
console.log("SMTP connection verified.");

const info = await transport.sendMail({
  from: email,
  to,
  subject: "njin-mail SMTP test",
  text: "This is a test email from the njin-mail smtpTest.ts script.",
});

console.log("Sent:", info.messageId);
