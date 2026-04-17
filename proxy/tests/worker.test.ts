import { describe, expect, it } from "vitest";
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
});

describe("isOriginAllowed", () => {
  it("matches exact origin", () => {
    expect(isOriginAllowed("http://localhost:5173", ["http://localhost:5173"])).toBe(true);
    expect(isOriginAllowed("http://evil.test", ["http://localhost:5173"])).toBe(false);
  });

  it("rejects missing origin", () => {
    expect(isOriginAllowed(null, ["http://localhost:5173"])).toBe(false);
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
