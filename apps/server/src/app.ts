import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { authRoutes } from "./routes/auth";
import { folderRoutes } from "./routes/folders";
import { messageRoutes } from "./routes/messages";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.route("/api/folders", folderRoutes);
app.route("/api/messages", messageRoutes);

// Production: serve the built frontend for any non-/api route, with SPA fallback.
// Resolved from this module's own location (not process.cwd()) so it works
// the same whether the process is launched from apps/server or elsewhere.
const webDist = path.join(import.meta.dir, "../../web/dist");
app.use("/*", serveStatic({ root: webDist }));
app.get("*", serveStatic({ path: path.join(webDist, "index.html") }));
