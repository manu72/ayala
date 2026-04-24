import { afterEach, describe, expect, it, vi } from "vitest";
import { isAiDialogueConsoleDebugEnabled } from "../../src/config/aiDialogueDebug";

describe("aiDialogueDebug", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled by default", () => {
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_AI_DEBUG_DIALOGUE", "false");

    expect(isAiDialogueConsoleDebugEnabled()).toBe(false);
  });

  it("can be enabled by env outside production", () => {
    vi.stubEnv("PROD", false);
    vi.stubEnv("VITE_AI_DEBUG_DIALOGUE", "true");

    expect(isAiDialogueConsoleDebugEnabled()).toBe(true);
  });

  it("stays disabled in production even if env requests logging", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_AI_DEBUG_DIALOGUE", "true");

    expect(isAiDialogueConsoleDebugEnabled()).toBe(false);
  });
});
