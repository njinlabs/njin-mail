import { env } from "./env";
import { app } from "./app";

if (env.DEV_TENANT_DOMAIN && env.NODE_ENV !== "production") {
  console.warn(
    `⚠️  DEV_TENANT_DOMAIN=${env.DEV_TENANT_DOMAIN} is set — tenant Host-header enforcement is BYPASSED for every request. Never set this in production.`
  );
}

// Bound to loopback only — Caddy (prod) or Vite's dev proxy is always the
// front door; the app never needs to be reachable on any other interface.
Bun.serve({
  port: env.PORT,
  hostname: "127.0.0.1",
  fetch: app.fetch,
});

console.log(`njin-mail server listening on http://localhost:${env.PORT}`);
