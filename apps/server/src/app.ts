import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { authRoutes } from "./routes/auth";

export const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);

// Production: serve the built frontend for any non-/api route, with SPA fallback.
const webDist = "../web/dist";
app.use("/*", serveStatic({ root: webDist }));
app.get("*", serveStatic({ path: `${webDist}/index.html` }));
