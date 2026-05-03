import type {
  AIDialogueCallOptions,
} from "./AIDialogueService";
import type { DialogueRequest, DialogueResponse, DialogueService } from "./DialogueService";

type ScriptedFirstDialogueService = DialogueService & {
  getUnplayedDialogue?: (request: DialogueRequest) => Promise<DialogueResponse | null>;
  getFallbackDialogue?: (request: DialogueRequest) => Promise<DialogueResponse>;
};

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
    const scripted = this.secondary as ScriptedFirstDialogueService;
    const unplayedScripted = await scripted.getUnplayedDialogue?.(request);
    if (unplayedScripted) return unplayedScripted;

    try {
      // Narrow: only AIDialogueService consumes callOpts. ScriptedDialogueService's
      // signature ignores extras; passing unknown args is harmless.
      return await (this.primary as DialogueService & {
        getDialogue(r: DialogueRequest, o?: AIDialogueCallOptions): Promise<DialogueResponse>;
      }).getDialogue(request, callOpts);
    } catch (err) {
      // AbortError is the designed abort path. It can originate from two
      // different places and those two cases have opposite desired behaviours:
      //
      //   1. CALLER-initiated abort (callOpts.signal fired): the caller told
      //      us to stop and expects to own cleanup. Falling back to scripted
      //      discards caller intent and — for unscripted speakers like Camille
      //      — surfaces ScriptedDialogueService's default "..." response as a
      //      speech bubble. We rethrow so the caller's own catch can decide
      //      (render authored fallback, render nothing, etc).
      //
      //   2. INTERNAL-timeout abort (AIDialogueService's per-call timer
      //      fires; no caller signal involved): this is an AI-side failure
      //      and scripted is the designed fallback. Engaged cat dialogue
      //      relies on this path.
      //
      // We distinguish by inspecting the caller's signal.aborted flag —
      // bridged into AIDialogueService's internal controller but never
      // flipped by the internal timer.
      const isAbort =
        err instanceof DOMException && err.name === "AbortError" ||
        (err instanceof Error && err.name === "AbortError");
      if (isAbort && callOpts?.signal?.aborted) {
        console.debug("[Dialogue] AI aborted by caller; rethrowing", err);
        throw err;
      }
      if (isAbort) {
        console.debug("[Dialogue] AI aborted (internal timeout); using scripted fallback", err);
      } else {
        console.warn("[Dialogue] AI failed; using scripted fallback", err);
      }
      return scripted.getFallbackDialogue ? scripted.getFallbackDialogue(request) : this.secondary.getDialogue(request);
    }
  }
}
