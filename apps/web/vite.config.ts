import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Bind both IPv4 and IPv6 loopback — a hosts-file tenant entry (e.g.
    // mail.jadiweb.id -> 127.0.0.1) is IPv4, but Vite's default "localhost"
    // binding can resolve to ::1 only and silently refuse those connections.
    host: true,
    // Multi-tenant domain enforcement reads the browser's original Host header
    // (see apps/server/src/lib/tenant.ts) — don't rewrite it when proxying to
    // the backend, and don't reject tenant hostnames pointed at this dev server
    // via a hosts-file entry (e.g. mail.jadiweb.id -> 127.0.0.1).
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: false,
      },
    },
  },
});
