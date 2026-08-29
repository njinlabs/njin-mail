import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, sqlite } from "./client";

migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("Migrations applied.");
sqlite.close();
