import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { resolveTenantDomain, emailMatchesTenantDomain } from "../lib/tenant";
import { verifyImapCredentials } from "../lib/imapClient";
import { createSession, deleteSession } from "../lib/sessionStore";
import { sessionMiddleware, SESSION_COOKIE_NAME } from "../middleware/session";

export const authRoutes = new Hono();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoutes.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const { email, password } = parsed.data;

  const tenantDomain = resolveTenantDomain(c.req.header("host") ?? null);
  if (!tenantDomain || !emailMatchesTenantDomain(email, tenantDomain)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const ok = await verifyImapCredentials(email, password);
  if (!ok) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const now = new Date().toISOString();
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
    await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, userId));
  } else {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email,
      tenantDomain,
      lastLoginAt: now,
    });
  }

  const sessionId = createSession({ userId, email, tenantDomain, password });

  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return c.json({ user: { id: userId, email, tenantDomain } });
});

authRoutes.post("/logout", sessionMiddleware, async (c) => {
  deleteSession(c.get("sessionId"));
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/session", sessionMiddleware, async (c) => {
  const session = c.get("session");
  return c.json({
    user: { id: session.userId, email: session.email, tenantDomain: session.tenantDomain },
  });
});
