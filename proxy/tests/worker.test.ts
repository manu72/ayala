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
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.8,
      max_tokens: 150,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.provider).toBe("deepseek");
  });

  it("rejects bad provider", () => {
    const r = validateChatBody({
      provider: "evil",
      messages: [{ role: "user", content: "x" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects oversized messages", () => {
    const r = validateChatBody({
      provider: "openai",
      messages: [{ role: "user", content: "x".repeat(20_000) }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects max_tokens above cap", () => {
    const r = validateChatBody({
      provider: "deepseek",
      messages: [{ role: "user", content: "a" }],
      max_tokens: 9999,
    });
    expect(r.ok).toBe(false);
  });
});

describe("handleRequest", () => {
  it("returns 403 without allowed Origin", async () => {
    const req = new Request("https://example.com/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepseek",
        messages: [{ role: "user", content: "hi" }],
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
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 50,
      }),
    });
    const res = await handleRequest(req, {});
    expect(res.status).toBe(500);
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
        messages: [{ role: "user", content: "hi" }],
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
        messages: [{ role: "user", content: "hi" }],
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
