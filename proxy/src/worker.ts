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

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "") {
    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
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
): Promise<Response> {
  const { url, model, key } = upstreamUrlAndModel(provider, env);
  if (!key) {
    return new Response(JSON.stringify({ error: `Missing API key for ${provider}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
      },
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return new Response(JSON.stringify({ error: aborted ? "upstream timeout" : "upstream error" }), {
      status: 504,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  if (!url.pathname.endsWith("/api/ai/chat")) {
    return new Response("Not Found", { status: 404 });
  }

  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const origin = request.headers.get("Origin");
  if (!isOriginAllowed(origin, allowed)) {
    return new Response(JSON.stringify({ error: "forbidden origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validated = validateChatBody(parsed);
  if (!validated.ok) {
    return new Response(JSON.stringify({ error: validated.error }), {
      status: validated.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  return forwardChat(validated.data.provider, validated.data, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
