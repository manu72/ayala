import type { SpeakerPose } from "../services/DialogueService";

/**
 * How {@link SpeakerPose} maps to NPC cat sprite rows when dedicated wary/crouch/arch
 * animations are not available on the sheet.
 */
export type DialogueAnimMode = "sit" | "walk_paused" | "rest" | "rest_dim";

/**
 * Maps dialogue tone to animation strategy for {@link NPCCat.engageDialogue}.
 */
export function speakerPoseToAnimMode(pose: SpeakerPose | undefined): DialogueAnimMode {
  switch (pose) {
    case "sleeping":
      return "rest_dim";
    case "submissive":
      return "rest";
    case "wary":
    case "hostile":
      return "walk_paused";
    case "curious":
    case "friendly":
    default:
      return "sit";
  }
}
