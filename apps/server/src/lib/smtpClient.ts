import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { env } from "../env";

export interface InlineAttachmentInput {
  cid: string;
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface AttachmentInput {
  filename: string;
  contentType: string;
  contentBase64: string;
}

export interface SendMailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  /** Images referenced from `html` via `cid:` — embedded as MIME parts, not linked externally. */
  inlineAttachments?: InlineAttachmentInput[];
  /** Regular downloadable file attachments (documents, archives, etc). */
  attachments?: AttachmentInput[];
}

export interface SendMailResult {
  messageId: string;
  raw: Buffer;
}

/** Sends a message over SMTP and returns its raw RFC822 source for archiving into Sent. */
export async function sendMail(
  email: string,
  password: string,
  input: SendMailInput
): Promise<SendMailResult> {
  const domain = email.split("@")[1] ?? "njin-mail.local";
  const messageId = `<${crypto.randomUUID()}@${domain}>`;

  const mailOptions = {
    from: email,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    inReplyTo: input.inReplyTo,
    references: input.references?.join(" "),
    messageId,
    attachments: [
      ...(input.attachments ?? []).map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.contentBase64, "base64"),
        contentType: att.contentType,
      })),
      ...(input.inlineAttachments ?? []).map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.contentBase64, "base64"),
        contentType: att.contentType,
        cid: att.cid,
      })),
    ],
  };

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED },
  });

  await transport.sendMail(mailOptions);
  const raw = await new MailComposer(mailOptions).compile().build();

  return { messageId, raw };
}
