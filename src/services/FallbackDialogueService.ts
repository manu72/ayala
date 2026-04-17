import type { DialogueRequest, DialogueResponse, DialogueService } from "./DialogueService";

/**
 * Tries the primary service (AI); on any failure, uses the secondary (scripted).
 */
export class FallbackDialogueService implements DialogueService {
  constructor(
    private readonly primary: DialogueService,
    private readonly secondary: DialogueService,
  ) {}

  async getDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    try {
      return await this.primary.getDialogue(request);
    } catch (err) {
      console.warn("[Dialogue] AI failed; using scripted fallback", err);
      return this.secondary.getDialogue(request);
    }
  }
}
