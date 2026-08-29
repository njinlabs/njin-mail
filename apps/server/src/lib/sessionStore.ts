import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "./crypto";

export interface SessionData {
  userId: string;
  email: string;
  tenantDomain: string;
  encryptedPassword: Buffer;
  createdAt: number;
}

const sessions = new Map<string, SessionData>();

export function createSession(params: {
  userId: string;
  email: string;
  tenantDomain: string;
  password: string;
}): string {
  const sessionId = randomBytes(32).toString("base64url");
  sessions.set(sessionId, {
    userId: params.userId,
    email: params.email,
    tenantDomain: params.tenantDomain,
    encryptedPassword: encryptSecret(params.password),
    createdAt: Date.now(),
  });
  return sessionId;
}

export function getSession(sessionId: string): SessionData | undefined {
  return sessions.get(sessionId);
}

/** Decrypts the password for a session, for opening an IMAP/SMTP connection. */
export function getSessionPassword(sessionId: string): string | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  return decryptSecret(session.encryptedPassword);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Iterates all active sessions — used by the background sync loop. */
export function listActiveSessions(): [string, SessionData][] {
  return [...sessions.entries()];
}
