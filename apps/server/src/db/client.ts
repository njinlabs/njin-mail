import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { env } from "../env";
import * as schema from "./schema";

// bun:sqlite's `create: true` only creates the file, not its parent
// directory — a fresh clone/deploy won't have DB_PATH's dir yet (it's
// gitignored), so create it up front.
mkdirSync(path.dirname(env.DB_PATH), { recursive: true });

const sqlite = new Database(env.DB_PATH, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });
export { sqlite };
