import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { getSession, type SessionData } from "../lib/sessionStore";

export const SESSION_COOKIE_NAME = "njin_sid";

declare module "hono" {
  interface ContextVariableMap {
    sessionId: string;
    session: SessionData;
  }
}

export async function sessionMiddleware(c: Context, next: Next) {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  const session = sessionId ? getSession(sessionId) : undefined;

  if (!sessionId || !session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("sessionId", sessionId);
  c.set("session", session);
  await next();
}
