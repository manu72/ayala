/**
 * Toggle AI dialogue console debugging.
 *
 * Dev/test-only toggle for AI dialogue console debugging.
 *
 * When enabled, the browser console logs the full system prompt, chat messages
 * (user/assistant history + final user turn), request parameters, and raw
 * model output for each proxy call.
 *
 * Production builds always disable this logging, even if the code switch or
 * environment variable is accidentally enabled.
 *
 * Enable by either:
 * - Setting {@link AI_DIALOGUE_CONSOLE_DEBUG} to `true` below, or
 * - Setting `VITE_AI_DEBUG_DIALOGUE=true` in `.env` / `.env.local` (no code edit).
 */
export const AI_DIALOGUE_CONSOLE_DEBUG = false;

export function isAiDialogueConsoleDebugEnabled(): boolean {
  if (import.meta.env.PROD) return false;
  return AI_DIALOGUE_CONSOLE_DEBUG || import.meta.env.VITE_AI_DEBUG_DIALOGUE === "true";
}
