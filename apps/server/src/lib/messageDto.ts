import type { MessageDetailDto, MessageListItemDto } from "@njin-mail/shared";
import type { attachments, messages } from "../db/schema";

type Message = typeof messages.$inferSelect;
type Attachment = typeof attachments.$inferSelect;

interface Address {
  name: string | null;
  address: string | null;
}

function parseAddresses(json: string | null): Address[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Address[];
  } catch {
    return [];
  }
}

function parseFlags(json: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

export function toMessageListItemDto(message: Message): MessageListItemDto {
  return {
    id: message.id,
    subject: message.subject,
    from: parseAddresses(message.fromAddr)[0] ?? null,
    date: message.date,
    snippet: message.snippet,
    flags: parseFlags(message.flags),
    hasAttachments: Boolean(message.hasAttachments),
  };
}

export function toMessageDetailDto(message: Message, attachmentRows: Attachment[]): MessageDetailDto {
  return {
    ...toMessageListItemDto(message),
    to: parseAddresses(message.toAddr),
    cc: parseAddresses(message.ccAddr),
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    attachments: attachmentRows.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
    })),
  };
}
