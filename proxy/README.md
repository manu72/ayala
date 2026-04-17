# Ayala AI proxy (Cloudflare Worker)

Forwards `POST /api/ai/chat` to Deepseek or OpenAI chat-completions with **server-held API keys only**.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` in this folder and fill in keys (file is gitignored).
2. From repo root: `npm run dev` (Vite) and in another terminal: `npm run dev:proxy`.
3. Ensure the game has `VITE_AI_PROXY_URL=/api/ai/chat` in `.env` (see root `.env.example`). Vite proxies `/api/ai/chat` to `http://127.0.0.1:8787`.

## Deploy

```bash
cd proxy
npx wrangler deploy
```

Set secrets in the Cloudflare dashboard or via `wrangler secret put DEEPSEEK_API_KEY` and `wrangler secret put OPENAI_API_KEY`.

Set `ALLOWED_ORIGINS` to a comma-separated list of exact `Origin` values the browser will send (e.g. `https://yourname.github.io` for GitHub Pages). Defaults include `http://localhost:5173` for local dev.

Bind the Worker to the same hostname as your static site so the browser calls `/api/ai/chat` same-origin, or configure a route such as `yourdomain.com/api/*` → this Worker.

## Tests

```bash
npm test
```
