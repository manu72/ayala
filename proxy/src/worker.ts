/**
 * Same-origin chat-completions proxy for Ayala (Deepseek primary, OpenAI fallback).
 * API keys never ship to the browser — only this Worker holds them.
 */

export interface Env {
  DEEPSEEK_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  OPENAI_MODEL?: string;
  /** Comma-separated origins allowed in the Origin header (browser requests). */
  ALLOWED_ORIGINS?: string;
}

const MAX_MESSAGES_CHARS = 12_000;
const MAX_TOKENS_CAP = 300;
const MAX_TEMP = 1.5;
const UPSTREAM_TIMEOUT_MS = 15_000;

const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

const DEEPSEEK_BASE = "https://api.deepseek.com/v1/chat/completions";
const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";

const CHAT_PATH = "/api/ai/chat";
const ALLOWED_METHODS = "POST, OPTIONS";
const ALLOWED_REQUEST_HEADERS = "Content-Type, Authorization";
const PREFLIGHT_MAX_AGE_SECONDS = "86400";

type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatRequestBody {
  provider: "deepseek" | "openai";
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

/**
 * Normalize a single origin string for comparison:
 *   - trim surrounding whitespace
 *   - strip a single trailing slash
 *   - lowercase (Origin scheme + host are case-insensitive per RFC 6454)
 *
 * Browsers already send canonical Origin headers, but operators edit
 * `ALLOWED_ORIGINS` by hand and casing/trailing-slash typos are a common
 * foot-gun that otherwise produces a silent 403 forbidden-origin.
 */
function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim();
  const noTrailingSlash = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  return noTrailingSlash.toLowerCase();
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") {
    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }
  return raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(normalizeOrigin(origin));
}

/**
 * CORS headers returned to an *allowed* origin. We echo the exact Origin header
 * back (no wildcard) and set `Vary: Origin` so caches don't serve the wrong
 * allow-list entry to a different origin. `Access-Control-Allow-Headers` is a
 * fixed allow-list — we do not reflect `Access-Control-Request-Headers`.
 */
function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_REQUEST_HEADERS,
    "Access-Control-Max-Age": PREFLIGHT_MAX_AGE_SECONDS,
    Vary: "Origin",
  };
}

/**
 * Build a JSON response, merging CORS headers when the caller's origin is
 * allow-listed. Disallowed origins receive no CORS headers at all — the
 * browser will surface an opaque failure, which is the intended behaviour.
 */
function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string> | null,
  extra?: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(cors ?? {}),
    ...(extra ?? {}),
  };
  return new Response(JSON.stringify(body), { status, headers });
}

export function validateChatBody(body: unknown):
  | { ok: true; data: ChatRequestBody }
  | { ok: false; error: string; status: number } {
  if (body === null || typeof body !== "object") {
    return { ok: false, error: "Invalid JSON body", status: 400 };
  }
  const b = body as Record<string, unknown>;
  const provider = b["provider"];
  if (provider !== "deepseek" && provider !== "openai") {
    return { ok: false, error: 'provider must be "deepseek" or "openai"', status: 400 };
  }
  const messages = b["messages"];
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "messages must be a non-empty array", status: 400 };
  }
  const out: ChatMessage[] = [];
  let totalChars = 0;
  for (const m of messages) {
    if (m === null || typeof m !== "object") {
      return { ok: false, error: "invalid message entry", status: 400 };
    }
    const mr = m as Record<string, unknown>;
    const role = mr["role"];
    const content = mr["content"];
    if (role !== "system" && role !== "user" && role !== "assistant") {
      return { ok: false, error: "invalid message role", status: 400 };
    }
    if (typeof content !== "string") {
      return { ok: false, error: "message content must be a string", status: 400 };
    }
    totalChars += content.length;
    out.push({ role, content });
  }
  if (totalChars > MAX_MESSAGES_CHARS) {
    return { ok: false, error: "messages exceed size limit", status: 400 };
  }

  let temperature = typeof b["temperature"] === "number" ? b["temperature"] : 0.8;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > MAX_TEMP) {
    return { ok: false, error: "temperature out of range", status: 400 };
  }

  let max_tokens = typeof b["max_tokens"] === "number" ? b["max_tokens"] : 150;
  if (!Number.isFinite(max_tokens) || max_tokens < 1 || max_tokens > MAX_TOKENS_CAP) {
    return { ok: false, error: "max_tokens out of range", status: 400 };
  }

  return {
    ok: true,
    data: { provider, messages: out, temperature, max_tokens },
  };
}

function upstreamUrlAndModel(provider: "deepseek" | "openai", env: Env): { url: string; model: string; key: string | undefined } {
  if (provider === "deepseek") {
    return {
      url: DEEPSEEK_BASE,
      model: env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
      key: env.DEEPSEEK_API_KEY,
    };
  }
  return {
    url: OPENAI_BASE,
    model: env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    key: env.OPENAI_API_KEY,
  };
}

async function forwardChat(
  provider: "deepseek" | "openai",
  data: ChatRequestBody,
  env: Env,
  cors: Record<string, string>,
): Promise<Response> {
  const { url, model, key } = upstreamUrlAndModel(provider, env);
  if (!key) {
    return jsonResponse({ error: `Missing API key for ${provider}` }, 500, cors);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: data.messages,
        temperature: data.temperature,
        max_tokens: data.max_tokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
        ...cors,
      },
    });
  } catch (e) {
    // 504 only when our own timeout fired (AbortController → AbortError).
    // 502 for everything else fetch() can reject with: DNS failure, TCP
    // reset, TLS error, connection refused, etc. — classic "bad gateway"
    // cases where the upstream never produced a usable response.
    const aborted = e instanceof Error && e.name === "AbortError";
    const status = aborted ? 504 : 502;
    return jsonResponse(
      { error: aborted ? "upstream timeout" : "upstream error" },
      status,
      cors,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const origin = request.headers.get("Origin");
  const originAllowed = isOriginAllowed(origin, allowed);
  // Non-null assertion is safe: isOriginAllowed returns false when origin is null.
  const cors = originAllowed ? corsHeaders(origin as string) : null;

  // 1) CORS preflight. Must be answered before any routing so browsers can
  //    complete their preflight cache even for not-yet-existent sub-paths.
  if (request.method === "OPTIONS") {
    if (!cors) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: cors });
  }

  // 2) Route: only /api/ai/chat is served. Everything else is 404.
  //    `endsWith` keeps parity with the original behaviour (accounts for
  //    deployments behind a path-stripping proxy).
  if (!url.pathname.endsWith(CHAT_PATH)) {
    return jsonResponse({ error: "not found" }, 404, cors);
  }

  // 3) Method gate: preflight handled above, POST below, nothing else.
  if (request.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405, cors, {
      Allow: ALLOWED_METHODS,
    });
  }

  // 4) Origin check for the actual request. Disallowed origins get a bare
  //    403 with no CORS headers (strict, per spec).
  if (!cors) {
    return jsonResponse({ error: "forbidden origin" }, 403, null);
  }

  // 5) JSON body.
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400, cors);
  }

  const validated = validateChatBody(parsed);
  if (!validated.ok) {
    return jsonResponse({ error: validated.error }, validated.status, cors);
  }

  return forwardChat(validated.data.provider, validated.data, env, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
