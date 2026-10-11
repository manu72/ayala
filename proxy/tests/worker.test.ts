import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleRequest,
  isOriginAllowed,
  parseAllowedOrigins,
  validateChatBody,
} from "../src/worker";

describe("parseAllowedOrigins", () => {
  it("defaults to local Vite dev origins", () => {
    expect(parseAllowedOrigins(undefined)).toContain("http://localhost:5173");
  });

  it("parses comma-separated list", () => {
    expect(parseAllowedOrigins("https://a.test, https://b.test")).toEqual([
      "https://a.test",
      "https://b.test",
    ]);
  });

  it("normalizes trailing slash and casing (operator-typo tolerance)", () => {
    expect(parseAllowedOrigins("HTTPS://Example.com/, https://b.TEST ")).toEqual([
      "https://example.com",
      "https://b.test",
    ]);
  });
});

describe("isOriginAllowed", () => {
  it("matches exact origin", () => {
    expect(isOriginAllowed("http://localhost:5173", ["http://localhost:5173"])).toBe(true);
    expect(isOriginAllowed("http://evil.test", ["http://localhost:5173"])).toBe(false);
  });

  it("rejects missing origin", () => {
    expect(isOriginAllowed(null, ["http://localhost:5173"])).toBe(false);
  });

  it("matches regardless of trailing slash or case differences between config and header", () => {
    const allowed = parseAllowedOrigins("https://Example.com/");
    expect(isOriginAllowed("https://example.com", allowed)).toBe(true);
    expect(isOriginAllowed("https://EXAMPLE.com/", allowed)).toBe(true);
  });
});

describe("validateChatBody", () => {
  it("accepts a minimal valid body", () => {
    const r = validateChatBody({
      provider: "deepseek",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
      temperature: 0.8,
      max_tokens: 150,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.provider).toBe("deepseek");
  });

  it("rejects bad provider", () => {
    const r = validateChatBody({
      provider: "evil",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "x" }],
    });
    expect(r).toMatchObject({ ok: false, error: 'provider must be "deepseek" or "openai"' });
  });

  it("rejects oversized messages", () => {
    const r = validateChatBody({
      provider: "openai",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "x".repeat(40_000) }],
    });
    expect(r).toMatchObject({ ok: false, error: "messages exceed size limit" });
  });

  it("rejects max_tokens above cap", () => {
    const r = validateChatBody({
      provider: "deepseek",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "a" }],
      max_tokens: 9999,
    });
    expect(r).toMatchObject({ ok: false, error: "max_tokens out of range" });
  });
});

describe("validateChatBody request shape", () => {
  const sys = { role: "system", content: "s" };
  const u = { role: "user", content: "u" };
  const a = { role: "assistant", content: "a" };
  const check = (messages: unknown[], extra: Record<string, unknown> = {}) =>
    validateChatBody({ provider: "deepseek", messages, temperature: 0.8, max_tokens: 220, ...extra });

  it("accepts the game's shape: system, (user, assistant)*, user", () => {
    expect(check([sys, u]).ok).toBe(true);
    expect(check([sys, u, a, u, a, u]).ok).toBe(true);
  });

  it("requires exactly one system message, first, and a trailing user turn", () => {
    for (const messages of [[u], [u, sys, u], [sys, sys, u], [sys, u, sys, u], [sys], [sys, u, a]]) {
      expect(check(messages)).toMatchObject({ ok: false, error: "unexpected message order" });
    }
  });

  it("caps the message count at 202 (1 system + 100 exchanges + 1 current turn)", () => {
    const exchanges = (n: number) => Array.from({ length: n }, () => [u, a]).flat();
    expect(check([sys, ...exchanges(100), u]).ok).toBe(true);
    expect(check([sys, ...exchanges(101), u])).toMatchObject({ ok: false, error: "too many messages" });
  });

  it("caps total content at 32,000 characters", () => {
    const sized = (n: number) => [sys, { role: "user", content: "x".repeat(n - 1) }];
    expect(check(sized(32_000)).ok).toBe(true);
    expect(check(sized(32_001))).toMatchObject({ ok: false, error: "messages exceed size limit" });
  });

  it("caps max_tokens at 256 (the client sends 220)", () => {
    expect(check([sys, u], { max_tokens: 256 }).ok).toBe(true);
    expect(check([sys, u], { max_tokens: 257 })).toMatchObject({ ok: false, error: "max_tokens out of range" });
  });
});

describe("handleRequest", () => {
  it("returns 403 without allowed Origin", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepseek",
        messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
      }),
    });
    const res = await handleRequest(req, {});
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON shape", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ provider: "deepseek" }),
    });
    const res = await handleRequest(req, {});
    expect(res.status).toBe(400);
  });

  it("returns 500 when key missing (valid body)", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({
        provider: "deepseek",
        messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
        max_tokens: 50,
      }),
    });
    const res = await handleRequest(req, {});
    expect(res.status).toBe(500);
  });

  it("returns 413 with CORS when the body exceeds 65,536 bytes (multi-byte chars counted as bytes)", async () => {
    // ~35k chars but ~70k UTF-8 bytes: a char-length check would let it through to JSON.parse.
    const body = JSON.stringify({
      provider: "deepseek",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "é".repeat(35_000) }],
    });
    expect(body.length).toBeLessThan(65_536);
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body,
    });
    const res = await handleRequest(req, {});
    expect(res.status).toBe(413);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(await res.json()).toEqual({ error: "body too large" });
  });

  it("stops reading a chunked body with no Content-Length as soon as it passes the cap", async () => {
    const chunk = new Uint8Array(16_384).fill(0x20);
    let sent = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
      body: endless,
      duplex: "half",
    } as RequestInit);
    expect(req.headers.get("Content-Length")).toBeNull();

    const res = await handleRequest(req, {});

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "body too large" });
    await vi.waitFor(() => expect(cancelled).toBe(true));
    expect(sent).toBeLessThan(65_536 + 4 * chunk.byteLength);
  });
});

describe("CORS", () => {
  const ALLOWED = "https://manu72.github.io";
  const env = { ALLOWED_ORIGINS: ALLOWED };

  it("answers preflight from an allowed origin with 204 + CORS headers", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization",
    );
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("rejects preflight from a disallowed origin with 403 and no CORS headers", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.test" },
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects preflight with no Origin header", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "OPTIONS",
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns 405 with Allow + CORS headers for GET from an allowed origin", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "GET",
      headers: { Origin: ALLOWED },
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("returns 404 with CORS headers for an unknown path from an allowed origin", async () => {
    const req = new Request("https://example.com/api/unknown", {
      method: "POST",
      headers: { Origin: ALLOWED, "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
  });

  it("includes CORS headers on 400 invalid-JSON response for an allowed origin", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: { Origin: ALLOWED, "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("does not leak CORS headers on 403 for a disallowed origin POST", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepseek",
        messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
      }),
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns 403 (not 405) for a disallowed origin GET — origin gates before method", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "GET",
      headers: { Origin: "https://evil.test" },
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(403);
    expect(res.headers.get("Allow")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns 403 (not 404) for a disallowed origin on an unknown path — origin gates before routing", async () => {
    const req = new Request("https://example.com/api/anything", {
      method: "POST",
      headers: { Origin: "https://evil.test", "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects prefix-matched paths (exact route match only)", async () => {
    const req = new Request("https://example.com/foo/api/ai/chat", {
      method: "POST",
      headers: { Origin: ALLOWED, "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
  });
});

describe("upstream failure semantics", () => {
  const ALLOWED = "http://localhost:5173";
  const env = {
    ALLOWED_ORIGINS: ALLOWED,
    DEEPSEEK_API_KEY: "test-key",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function buildPost(): Request {
    return new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: { Origin: ALLOWED, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepseek",
        messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
        max_tokens: 16,
      }),
    });
  }

  it("returns 502 when upstream fetch rejects with a non-abort error", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const res = await handleRequest(buildPost(), env);
    expect(res.status).toBe(502);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("upstream error");
  });

  it("returns 504 when the upstream call is aborted (timeout)", async () => {
    vi.stubGlobal("fetch", () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const res = await handleRequest(buildPost(), env);
    expect(res.status).toBe(504);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("upstream timeout");
  });
});

describe("upstream request body", () => {
  const ALLOWED = "http://localhost:5173";
  const env = { ALLOWED_ORIGINS: ALLOWED, DEEPSEEK_API_KEY: "test-key", OPENAI_API_KEY: "test-key" };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function upstreamBodyFor(provider: "deepseek" | "openai", e: Record<string, string> = env) {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: { Origin: ALLOWED, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
        max_tokens: 220,
      }),
    });
    expect((await handleRequest(req, e)).status).toBe(200);
    const init = fetchMock.mock.calls[0]?.[1];
    return JSON.parse(String(init?.body)) as Record<string, unknown>;
  }

  it("sends deepseek-flash with thinking disabled by default", async () => {
    const body = await upstreamBodyFor("deepseek");
    expect(body["model"]).toBe("deepseek-flash");
    expect(body["thinking"]).toEqual({ type: "disabled" });
    expect(body["max_tokens"]).toBe(220);
  });

  it("honours DEEPSEEK_MODEL and still disables thinking", async () => {
    const body = await upstreamBodyFor("deepseek", { ...env, DEEPSEEK_MODEL: "deepseek-v4-pro" });
    expect(body["model"]).toBe("deepseek-v4-pro");
    expect(body["thinking"]).toEqual({ type: "disabled" });
  });

  it("never sends the DeepSeek-only thinking field to OpenAI", async () => {
    const body = await upstreamBodyFor("openai");
    expect(body).not.toHaveProperty("thinking");
  });
});
