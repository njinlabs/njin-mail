import { z } from "zod";

const boolFromString = z
  .string()
  .transform((v) => v.toLowerCase() === "true" || v === "1");

const envSchema = z.object({
  IMAP_HOST: z.string().min(1),
  IMAP_PORT: z.coerce.number().int().positive(),
  IMAP_SECURE: boolFromString,
  IMAP_REJECT_UNAUTHORIZED: boolFromString,

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: boolFromString,
  SMTP_REJECT_UNAUTHORIZED: boolFromString,

  PORT: z.coerce.number().int().positive().default(3001),
  DB_PATH: z.string().min(1).default("./data/njin-mail.sqlite"),
  SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60000),

  CREDENTIAL_ENCRYPTION_KEY: z.string().min(1, "CREDENTIAL_ENCRYPTION_KEY is required"),
  SESSION_SECRET: z.string().min(1, "SESSION_SECRET is required"),
});

export const env = envSchema.parse(process.env);
