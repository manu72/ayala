import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // New on every build: asset URLs carry it so the service worker can cache them forever (public/sw.js).
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    proxy: {
      // Cloudflare Worker (`cd proxy && wrangler dev` on :8787) — same path as production.
      "/api/ai/chat": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
