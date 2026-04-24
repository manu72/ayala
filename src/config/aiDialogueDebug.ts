/**
 * Toggle AI dialogue console debugging.
 *
 * When enabled, the browser console logs the full system prompt, chat messages
 * (user/assistant history + final user turn), request parameters, and raw
 * model output for each proxy call.
 *
 * Enable by either:
 * - Setting {@link AI_DIALOGUE_CONSOLE_DEBUG} to `true` below, or
 * - Setting `VITE_AI_DEBUG_DIALOGUE=true` in `.env` / `.env.local` (no code edit).
 */
export const AI_DIALOGUE_CONSOLE_DEBUG = true;

export function isAiDialogueConsoleDebugEnabled(): boolean {
  return AI_DIALOGUE_CONSOLE_DEBUG || import.meta.env.VITE_AI_DEBUG_DIALOGUE === "true";
}
