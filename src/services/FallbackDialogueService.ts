import type {
  AIDialogueCallOptions,
} from "./AIDialogueService";
import type { DialogueRequest, DialogueResponse, DialogueService } from "./DialogueService";

/**
 * Tries the primary service (AI); on any failure, uses the secondary (scripted).
 *
 * The scripted secondary ignores `AIDialogueCallOptions` (it is synchronous),
 * but the primary `AIDialogueService` honours per-call `timeoutMs` / `signal`
 * so callers can apply tighter budgets (e.g. ambient bubbles at 1.5s) without
 * losing the scripted-fallback safety net.
 */
export class FallbackDialogueService implements DialogueService {
  constructor(
    private readonly primary: DialogueService,
    private readonly secondary: DialogueService,
  ) {}

  async getDialogue(
    request: DialogueRequest,
    callOpts?: AIDialogueCallOptions,
  ): Promise<DialogueResponse> {
    try {
      // Narrow: only AIDialogueService consumes callOpts. ScriptedDialogueService's
      // signature ignores extras; passing unknown args is harmless.
      return await (this.primary as DialogueService & {
        getDialogue(r: DialogueRequest, o?: AIDialogueCallOptions): Promise<DialogueResponse>;
      }).getDialogue(request, callOpts);
    } catch (err) {
      // AbortError is the designed abort path (player moved away, or the
      // caller's tight per-call budget elapsed). Log at debug so it doesn't
      // masquerade as a failure. Real upstream / parse errors stay at warn.
      const isAbort =
        err instanceof DOMException && err.name === "AbortError" ||
        (err instanceof Error && err.name === "AbortError");
      if (isAbort) {
        console.debug("[Dialogue] AI aborted; using scripted fallback", err);
      } else {
        console.warn("[Dialogue] AI failed; using scripted fallback", err);
      }
      return this.secondary.getDialogue(request);
    }
  }
}
