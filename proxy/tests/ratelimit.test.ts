import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest, rateLimitKey, type Env } from "../src/worker";

const ORIGIN = "https://manu72.github.io";

/** In-memory stand-in for the RateLimit binding (same contract: limit({key}) → {success}). */
function fakeLimiter(limit: number) {
  const counts = new Map<string, number>();
  return {
    limit: vi.fn(async ({ key }: { key: string }) => {
      const n = counts.get(key) ?? 0;
      if (n >= limit) return { success: false };
      counts.set(key, n + 1);
      return { success: true };
    }),
  };
}

const asBinding = (l: ReturnType<typeof fakeLimiter>) => l as unknown as RateLimit;

function chatPost(ip: string | null, headers: Record<string, string> = {}): Request {
  const h: Record<string, string> = { Origin: ORIGIN, "Content-Type": "application/json", ...headers };
  if (ip) h["CF-Connecting-IP"] = ip;
  return new Request("https://proxy.test/api/ai/chat", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      provider: "deepseek",
      messages: [
        { role: "system", content: "persona" },
        { role: "user", content: "hi" },
      ],
      max_tokens: 50,
    }),
  });
}

// No API key: an admitted request ends at 500 "Missing API key" — never reaches the network.
const baseEnv = (over: Partial<Env> = {}): Env => ({ ALLOWED_ORIGINS: ORIGIN, ...over });

afterEach(() => vi.restoreAllMocks());

describe("rate limiting", () => {
  it("fails open with a single warning when no binding is configured", async () => {
    vi.resetModules();
    const fresh = await import("../src/worker");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await fresh.handleRequest(chatPost("203.0.113.9"), baseEnv())).status).toBe(500);
    expect((await fresh.handleRequest(chatPost("203.0.113.9"), baseEnv())).status).toBe(500);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns 429 with CORS, Retry-After and the rate_limited body once the burst limit is hit", async () => {
    const env = baseEnv({ AI_RATE_LIMIT_BURST: asBinding(fakeLimiter(2)) });
    expect((await handleRequest(chatPost("203.0.113.9"), env)).status).toBe(500);
    expect((await handleRequest(chatPost("203.0.113.9"), env)).status).toBe(500);
    const res = await handleRequest(chatPost("203.0.113.9"), env);
    expect(res.status).toBe(429);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(await res.json()).toEqual({ error: "rate_limited", retryAfterSeconds: 30 });
  });

  it("enforces the per-minute binding too", async () => {
    const env = baseEnv({
      AI_RATE_LIMIT_BURST: asBinding(fakeLimiter(100)),
      AI_RATE_LIMIT_MINUTE: asBinding(fakeLimiter(1)),
    });
    expect((await handleRequest(chatPost("203.0.113.9"), env)).status).toBe(500);
    expect((await handleRequest(chatPost("203.0.113.9"), env)).status).toBe(429);
  });

  it("keys per client IP", async () => {
    const env = baseEnv({ AI_RATE_LIMIT_BURST: asBinding(fakeLimiter(1)) });
    expect((await handleRequest(chatPost("203.0.113.9"), env)).status).toBe(500);
    expect((await handleRequest(chatPost("198.51.100.7"), env)).status).toBe(500);
    expect((await handleRequest(chatPost("203.0.113.9"), env)).status).toBe(429);
  });

  it("does not consume tokens for preflight, forbidden origin, unknown path or wrong method", async () => {
    const limiter = fakeLimiter(100);
    const env = baseEnv({ AI_RATE_LIMIT_BURST: asBinding(limiter), AI_RATE_LIMIT_MINUTE: asBinding(limiter) });
    const at = (path: string, init: RequestInit) => new Request(`https://proxy.test${path}`, init);
    expect((await handleRequest(at("/api/ai/chat", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env)).status).toBe(204);
    expect((await handleRequest(chatPost("203.0.113.9", { Origin: "https://evil.test" }), env)).status).toBe(403);
    expect((await handleRequest(at("/api/other", { method: "POST", headers: { Origin: ORIGIN }, body: "{}" }), env)).status).toBe(404);
    expect((await handleRequest(at("/api/ai/chat", { method: "GET", headers: { Origin: ORIGIN } }), env)).status).toBe(405);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("fails open when the binding throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const env = baseEnv({
      AI_RATE_LIMIT_BURST: { limit: vi.fn().mockRejectedValue(new Error("boom")) } as unknown as RateLimit,
    });
    expect((await handleRequest(chatPost("203.0.113.9"), env)).status).toBe(500);
  });
});

describe("kill switch", () => {
  it("returns 503 ai_disabled with CORS and Retry-After, before touching the limiter", async () => {
    const limiter = fakeLimiter(100);
    const env = baseEnv({ AI_DISABLED: "1", AI_RATE_LIMIT_BURST: asBinding(limiter) });
    const res = await handleRequest(chatPost("203.0.113.9"), env);
    expect(res.status).toBe(503);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(await res.json()).toEqual({ error: "ai_disabled", retryAfterSeconds: 300 });
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("is off for any value other than \"1\"", async () => {
    expect((await handleRequest(chatPost("203.0.113.9"), baseEnv({ AI_DISABLED: "0" }))).status).toBe(500);
  });
});

describe("rateLimitKey", () => {
  it("buckets IPv6 by /64 and keeps IPv4 per address", () => {
    expect(rateLimitKey("2001:db8:1:2:aaaa::1")).toBe("ip6:2001:0db8:0001:0002::/64");
    expect(rateLimitKey("2001:DB8:1:2:bbbb:cccc:dddd:eeee")).toBe("ip6:2001:0db8:0001:0002::/64");
    expect(rateLimitKey("2001:db8::1")).toBe("ip6:2001:0db8:0000:0000::/64");
    expect(rateLimitKey("::1")).toBe("ip6:0000:0000:0000:0000::/64");
    expect(rateLimitKey("203.0.113.9")).toBe("ip4:203.0.113.9");
    expect(rateLimitKey(null)).toBe("ip:unknown");
  });

  it("keys IPv4-mapped IPv6 by the embedded IPv4 address (not one shared ::/64 bucket)", () => {
    expect(rateLimitKey("::ffff:203.0.113.9")).toBe("ip4:203.0.113.9");
    expect(rateLimitKey("::ffff:198.51.100.7")).toBe("ip4:198.51.100.7");
  });
});
