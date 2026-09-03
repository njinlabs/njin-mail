import { existsSync } from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { authRoutes } from "./routes/auth";
import { folderRoutes } from "./routes/folders";
import { messageRoutes } from "./routes/messages";
import { settingsRoutes } from "./routes/settings";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.route("/api/folders", folderRoutes);
app.route("/api/messages", messageRoutes);
app.route("/api/settings", settingsRoutes);

// Any /api/* path that fell through the routers above didn't match a defined
// route — respond with a real 404 instead of letting it reach the SPA
// wildcard below, which would otherwise serve index.html with a 200.
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Production: serve the built frontend for any non-/api route, with SPA fallback.
// import.meta.dir pointed at the wrong directory once this ran as the bundled
// dist/index.js on Linux (worked in local dev only by coincidence). The "start"
// script always runs with cwd = apps/server (same assumption ../../.env relies
// on for env loading), so anchor off process.cwd() instead — verified against
// both possible locations so a future cwd change fails loudly instead of
// silently 404ing every route again.
const cwdWebDist = path.join(process.cwd(), "../web/dist");
const moduleWebDist = path.join(import.meta.dir, "../../web/dist");
const webDist = existsSync(path.join(cwdWebDist, "index.html")) ? cwdWebDist : moduleWebDist;
if (!existsSync(path.join(webDist, "index.html"))) {
  console.error(
    `apps/web/dist/index.html not found in either ${cwdWebDist} or ${moduleWebDist} — every route will 404. ` +
      `Did you run "bun run build" from the repo root (which builds both apps/web and apps/server), ` +
      `instead of from inside apps/server (which only rebuilds the server)?`
  );
}
app.use("/*", serveStatic({ root: webDist }));
app.get("*", serveStatic({ path: path.join(webDist, "index.html") }));
