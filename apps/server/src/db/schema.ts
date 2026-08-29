import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  tenantDomain: text("tenant_domain").notNull(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  lastLoginAt: text("last_login_at"),
});

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    delimiter: text("delimiter"),
    specialUse: text("special_use"),
    uidValidity: integer("uid_validity"),
    uidNext: integer("uid_next"),
    highestModseq: integer("highest_modseq"),
    lastSyncedAt: text("last_synced_at"),
  },
  (t) => [uniqueIndex("folders_user_name_unique").on(t.userId, t.name)]
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    folderId: text("folder_id")
      .notNull()
      .references(() => folders.id, { onDelete: "cascade" }),
    uid: integer("uid").notNull(),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    referencesHdr: text("references_hdr"),
    subject: text("subject"),
    fromAddr: text("from_addr"),
    toAddr: text("to_addr"),
    ccAddr: text("cc_addr"),
    bccAddr: text("bcc_addr"),
    date: text("date"),
    internalDate: text("internal_date"),
    flags: text("flags"),
    hasAttachments: integer("has_attachments").notNull().default(0),
    size: integer("size"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    bodyFetchedAt: text("body_fetched_at"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("messages_folder_uid_unique").on(t.folderId, t.uid),
    index("messages_folder_date_idx").on(t.folderId, t.date),
    index("messages_message_id_idx").on(t.messageId),
  ]
);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  partId: text("part_id").notNull(),
  filename: text("filename"),
  contentType: text("content_type"),
  size: integer("size"),
  contentId: text("content_id"),
});

export const syncState = sqliteTable("sync_state", {
  folderId: text("folder_id")
    .primaryKey()
    .references(() => folders.id, { onDelete: "cascade" }),
  lastUidSynced: integer("last_uid_synced").notNull().default(0),
  isSyncing: integer("is_syncing").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
