import type { FolderDto, MessageDetailDto, MessageListItemDto } from "@njin-mail/shared";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export interface SessionUser {
  id: string;
  email: string;
  tenantDomain: string;
}

export function login(email: string, password: string) {
  return apiFetch<{ user: SessionUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function getSession() {
  return apiFetch<{ user: SessionUser }>("/api/auth/session");
}

export function getFolders() {
  return apiFetch<{ folders: FolderDto[] }>("/api/folders");
}

export function getMessages(folderId: string, opts?: { limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return apiFetch<{ messages: MessageListItemDto[] }>(
    `/api/folders/${folderId}/messages${qs ? `?${qs}` : ""}`
  );
}

export function getMessage(messageId: string) {
  return apiFetch<MessageDetailDto>(`/api/messages/${messageId}`);
}

export function attachmentDownloadUrl(messageId: string, attachmentId: string): string {
  return `/api/messages/${messageId}/attachments/${attachmentId}`;
}

export function syncFolderMessages(folderId: string) {
  return apiFetch<{ folderId: string; synced: number; uidNext: number }>(
    `/api/folders/${folderId}/sync`,
    { method: "POST" }
  );
}

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

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyToMessageId?: string;
  inlineAttachments?: InlineAttachmentInput[];
  attachments?: AttachmentInput[];
}

export function sendMessage(input: SendMessageInput) {
  return apiFetch<{ ok: true }>("/api/messages/send", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function markMessageUnread(messageId: string) {
  return apiFetch<{ ok: true }>(`/api/messages/${messageId}/unread`, { method: "POST" });
}

export function toggleMessageFlag(messageId: string) {
  return apiFetch<{ flagged: boolean }>(`/api/messages/${messageId}/flag`, { method: "POST" });
}

export function getSettings() {
  return apiFetch<{ displayName: string | null }>("/api/settings");
}

export function updateSettings(displayName: string | null) {
  return apiFetch<{ displayName: string | null }>("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ displayName }),
  });
}

export type MoveDestination = "junk" | "trash" | "archive";

export function moveMessage(messageId: string, destination: MoveDestination) {
  return apiFetch<{ moved: boolean }>(`/api/messages/${messageId}/move`, {
    method: "POST",
    body: JSON.stringify({ destination }),
  });
}
