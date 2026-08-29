import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

const id = crypto.randomUUID();
await db.insert(users).values({
  id,
  email: "test@example.com",
  tenantDomain: "example.com",
  displayName: "Test User",
});

const rows = await db.select().from(users).where(eq(users.id, id));
console.log(rows);

await db.delete(users).where(eq(users.id, id));
console.log("seed test ok, row cleaned up");
