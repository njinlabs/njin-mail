export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface FolderDto {
  id: string;
  name: string;
  displayName: string;
  specialUse: string | null;
  unreadCount: number;
}

export interface MessageListItemDto {
  id: string;
  subject: string | null;
  from: { name: string | null; address: string | null } | null;
  date: string | null;
  snippet: string | null;
  flags: string[];
  hasAttachments: boolean;
}

export interface MessageDetailDto extends MessageListItemDto {
  to: { name: string | null; address: string | null }[];
  cc: { name: string | null; address: string | null }[];
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: {
    id: string;
    filename: string | null;
    contentType: string | null;
    size: number | null;
  }[];
}
