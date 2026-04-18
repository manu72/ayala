import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
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
