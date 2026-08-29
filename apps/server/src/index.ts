import { env } from "./env";
import { app } from "./app";

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`njin-mail server listening on http://localhost:${env.PORT}`);
