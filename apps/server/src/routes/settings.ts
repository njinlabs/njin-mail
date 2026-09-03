import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { sessionMiddleware } from "../middleware/session";

export const settingsRoutes = new Hono();

settingsRoutes.get("/", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ displayName: user.displayName });
});

const updateSettingsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .transform((v) => (v === "" ? null : v)),
});

settingsRoutes.put("/", sessionMiddleware, async (c) => {
  const session = c.get("session");
  const parsed = updateSettingsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  await db
    .update(users)
    .set({ displayName: parsed.data.displayName })
    .where(eq(users.id, session.userId));

  return c.json({ displayName: parsed.data.displayName });
});
