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
 *   - Split into two paired-beat phases with a 10-second player
 *     DECISION window between them (see
 *     {@link CAMILLE_ENCOUNTER_5_PREDECISION_STEPS},
 *     {@link CAMILLE_ENCOUNTER_5_JOURNEY_STEPS}).
 *     Predecision runs Camille's question; the player must then walk
 *     Mamma Cat to Camille and press Space to greet. On acceptance the
 *     journey phase runs with the pickup tween; on timeout Camille
 *     speaks {@link CAMILLE_BEAT5_TIMEOUT_LINE} and the beat re-arms.
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

/**
 * Phase A of beat 5: Camille asks. Runs before the player decision window.
 * After the final predecision step advances (Space), the 10-second decision
 * gate opens in {@link ../scenes/GameScene.GameScene.beginBeat5Decision}.
 */
export const CAMILLE_ENCOUNTER_5_PREDECISION_STEPS: EncounterStep[] = [
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
];

/**
 * Phase C of beat 5: the journey home. Runs only after the player accepts
 * (walks Mamma Cat to Camille and greets within the decision window). The
 * first narrator line is the cue for the pickup tween — see
 * {@link ../scenes/GameScene.GameScene.runBeat5Pickup}.
 */
export const CAMILLE_ENCOUNTER_5_JOURNEY_STEPS: EncounterStep[] = [
  {
    narrator: "The garden shrinks behind you. The smells change. The sounds change.",
  },
  {
    narrator:
      "But the hand on the carrier is warm. And for the first time in a long time... you're not afraid.",
  },
];

/**
 * Camille's spoken line when the player accepts by greeting her within the
 * beat 5 decision window. Rendered as a bubble above Camille; a heart emote
 * is spawned in parallel so the heartbeat reads visually without embedding
 * an emoji glyph in the UI text.
 */
export const CAMILLE_BEAT5_ACCEPT_LINE =
  "I guess that means yes. Let's go home, little one. I promise I'll always take care of you.";

/**
 * Camille's spoken line when the decision window expires without Mamma Cat
 * greeting her. Camille stands down gracefully and her circuit resumes; the
 * beat re-arms for the next proximity trigger.
 */
export const CAMILLE_BEAT5_TIMEOUT_LINE = "Maybe another time, little one.";

/**
 * Back-compat export retained for any external references / docs. Equivalent
 * to the predecision steps concatenated with the journey steps — but the
 * scene no longer plays this verbatim because the decision gate sits between
 * them. Prefer the split exports above for new code.
 */
export const CAMILLE_ENCOUNTER_5_STEPS: EncounterStep[] = [
  ...CAMILLE_ENCOUNTER_5_PREDECISION_STEPS,
  ...CAMILLE_ENCOUNTER_5_JOURNEY_STEPS,
];

/**
 * Merge AI-generated spoken lines into an authored beat, producing the
 * exact `steps` array that {@link ../scenes/GameScene.GameScene.playPairedBeat}
 * will render AND the `spokenRendered` list that will be persisted to the
 * conversation store.
 *
 * Mapping rules (contract — covered by tests in
 * `tests/data/camille-encounter-beats.test.ts`):
 *
 *  - AI lines fill authored-spoken slots in step order. A step is an
 *    "authored-spoken slot" iff `s.spoken` is a non-empty string in the
 *    source beat.
 *  - Narrator-only steps (no authored `spoken`) NEVER receive an AI
 *    line — they represent Mamma Cat's inner POV and must stay silent.
 *    The previous purely-positional merge could leak AI lines into
 *    these slots (see v0.3.x bug: beat 3 step [1] "You've seen other
 *    cats do this" accidentally rendered Camille speaking).
 *  - Missing AI lines fall back to the authored `s.spoken` at that slot.
 *  - Surplus AI lines (more responses than authored slots) are dropped.
 *  - Blank / whitespace-only AI lines fall back to the authored slot so
 *    an upstream regression cannot render an empty bubble.
 *
 * `spokenRendered` is the ground truth for persistence: it lists what
 * the player will see Camille say, in order, authored fallbacks
 * included. Persisting this (rather than the raw AI payload) keeps
 * conversation history consistent with gameplay — the LLM's next call
 * is then grounded in what Camille actually said on screen.
 */
export function mergeCamilleBeatSteps(
  sourceSteps: ReadonlyArray<EncounterStep>,
  aiSpokenLines: ReadonlyArray<string> | null,
): { steps: EncounterStep[]; spokenRendered: string[] } {
  let aiIdx = 0;
  const steps: EncounterStep[] = sourceSteps.map((s) => {
    if (s.spoken === undefined) {
      return { narrator: s.narrator };
    }
    const aiLine = aiSpokenLines?.[aiIdx++];
    const useAi = typeof aiLine === "string" && aiLine.trim().length > 0;
    return {
      narrator: s.narrator,
      spoken: useAi ? aiLine : s.spoken,
    };
  });

  const spokenRendered = steps.flatMap((s) => (s.spoken ? [s.spoken] : []));
  return { steps, spokenRendered };
}
