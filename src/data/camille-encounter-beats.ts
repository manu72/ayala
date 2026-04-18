/**
 * Camille's 5-encounter narrative, expressed as paired narrator + spoken
 * steps. All human-spoken dialogue in the game lives in the floating
 * bubble channel above the speaker's head; the narrator POV lives in
 * the modal dialogue box. Each step's pair advances together on Space.
 *
 * Beats 2–4:
 *   - `objective` is the LLM prompt for Camille's spoken voice.
 *   - `steps[i].narrator` is always authored and always runs.
 *   - `steps[i].spoken` is the scripted fallback. On successful AI
 *     calls, `GameScene.runCamilleEncounterBeat` substitutes AI line
 *     `i` positionally; surplus AI lines are dropped.
 *
 * Beat 5:
 *   - Scripted only — this is the Chapter 6 handoff and must run
 *     verbatim regardless of LLM availability.
 *   - Uses the same paired narrator + spoken shape for consistency
 *     so Camille's voice appears as a bubble, not in the modal.
 *
 * Invariant enforced by `tests/data/camille-encounter-beats.test.ts`:
 *   - Every step has a non-empty `narrator`.
 *   - `spoken`, when present, is non-empty.
 *   - No step may have `spoken === narrator` (a sign the author
 *     accidentally double-voiced a narration line).
 */
export interface EncounterStep {
  narrator: string;
  spoken?: string;
}

export interface AIEncounterBeat {
  objective: string;
  steps: EncounterStep[];
}

export const CAMILLE_ENCOUNTER_BEATS: Record<2 | 3 | 4, AIEncounterBeat> = {
  2: {
    objective:
      "Second meeting. She recognises Mamma Cat. She stays a respectful distance, crouches, and places a treat on the ground between them. She does not reach; she waits. Produce 1–2 short spoken lines in Camille's voice only — no narration.",
    steps: [
      {
        narrator: "She sees you. She's not coming closer. She's... waiting. For you.",
        spoken: "Hey, mama. You came back.",
      },
      {
        narrator: "She places a treat on the ground between you. Doesn't move closer.",
        spoken: "Take your time. I'll wait.",
      },
    ],
  },
  3: {
    objective:
      "Third meeting. She slow-blinks at Mamma Cat — cat trust language she's learnt — and invites a slow blink back. Produce 2 short spoken lines in Camille's voice only — no narration.",
    steps: [
      {
        narrator: "She closes her eyes. Slowly. Opens them again. That means... trust.",
        spoken: "There you are.",
      },
      {
        narrator: "You've seen other cats do this.",
        // Narrator-only: Mamma Cat's memory; Camille is silent here.
      },
      {
        narrator: "Slow blink back?",
        spoken: "Good girl.",
      },
    ],
  },
  4: {
    objective:
      "Fourth meeting. Mamma Cat finally lets her fingers touch — first physical contact. Her niece Kish is loud nearby; Camille keeps her steady. Produce 1–2 short spoken lines in Camille's voice only — no narration.",
    steps: [
      {
        narrator: "Her hand smells like fish treats and soap. And something else. Home.",
        spoken: "Hi, sweetie. It's okay.",
      },
      {
        narrator: "You push your head against her fingers. You haven't done this since... before.",
        spoken: "I've got you.",
      },
    ],
  },
};

export const CAMILLE_ENCOUNTER_5_STEPS: EncounterStep[] = [
  {
    narrator: "She has a box. You've seen boxes before. Cats go in. They don't come back.",
    spoken: "Would you like to come home with me, little one?",
  },
  {
    narrator: "This is different. She's not grabbing. She's asking.",
    spoken: "I promise. No grabbing.",
  },
  {
    narrator: "And you... you want to say yes.",
  },
  {
    narrator: "The garden shrinks behind you. The smells change. The sounds change.",
  },
  {
    narrator:
      "But the hand on the carrier is warm. And for the first time in a long time... you're not afraid.",
  },
];
