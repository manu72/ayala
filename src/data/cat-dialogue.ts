/**
 * Scripted dialogue data for all named NPC cats.
 *
 * Each cat has an ordered array of DialogueScript entries. The first matching
 * condition wins. Order matters: place specific/early conditions before
 * broad fallbacks.
 *
 * Conditions use a hybrid of conversationHistory length and trust to handle
 * both fresh games and saves that predate the conversation store.
 */

import type { DialogueScript, DialogueRequest } from "../services/DialogueService";

// ── Helpers ─────────────────────────────────────────────────────────

/** True when this is the speaker's first-ever conversation. */
function isFirstMeeting(req: DialogueRequest): boolean {
  return req.conversationHistory.length === 0 && req.gameState.trustWithSpeaker < 5;
}

/** Approximate talk count, using history length with trust-based fallback. */
function talkCount(req: DialogueRequest): number {
  if (req.conversationHistory.length > 0) return req.conversationHistory.length;
  // Fallback for saves that predate IndexedDB: estimate from trust
  if (req.gameState.trustWithSpeaker >= 15) return 2;
  if (req.gameState.trustWithSpeaker >= 5) return 1;
  return 0;
}

// ── Blacky ──────────────────────────────────────────────────────────

const blackyScripts: DialogueScript[] = [
  {
    condition: isFirstMeeting,
    response: {
      lines: [
        "Mrrp. New here, are you?",
        "This is Ayala Triangle. The gardens are home to all of us.",
        "Find shade. Find food. Stay away from the roads.",
        "And at night... stay hidden. Not all humans are kind.",
      ],
      speakerPose: "curious",
      emote: "curious",
      narration: "This black cat watches you with calm, knowing eyes.",
      trustChange: 10,
      event: "blacky_first",
    },
  },
  {
    condition: () => true,
    response: {
      lines: ["Still here? Good. You're tougher than you look."],
      speakerPose: "friendly",
      emote: "heart",
      trustChange: 5,
      event: "blacky_return",
    },
  },
];

// ── Tiger ────────────────────────────────────────────────────────────

const tigerScripts: DialogueScript[] = [
  {
    condition: isFirstMeeting,
    response: {
      lines: [
        "*The cat's ears flatten slightly. Its tail flicks once.*",
        '"Ssss. This is my spot."',
      ],
      speakerPose: "hostile",
      emote: "hostile",
      trustChange: 10,
      event: "tiger_first",
    },
  },
  {
    condition: (req) => talkCount(req) === 1,
    response: {
      lines: [
        "*The cat watches you approach but doesn't hiss this time.*",
        "\"...You again. There's food by the stone building at evening. Don't tell anyone.\"",
      ],
      speakerPose: "wary",
      emote: "curious",
      trustChange: 5,
      event: "tiger_warmup",
    },
  },
  {
    condition: () => true,
    response: {
      lines: ['"Mrrp. You can rest here. Under this tree. I\'ll keep watch."'],
      speakerPose: "friendly",
      emote: "heart",
      trustChange: 5,
      event: "tiger_return",
    },
  },
];

// ── Jayco ───────────────────────────────────────────────────────────

const jaycoScripts: DialogueScript[] = [
  {
    condition: isFirstMeeting,
    response: {
      lines: [
        "*This cat approaches with tail up. Curious.*",
        '"Prrrp! New face! I\'m Jayco. I know every corner of these steps."',
        '"The humans below, the coffee place, they leave good scraps. But watch for the guard."',
      ],
      speakerPose: "friendly",
      emote: "heart",
      trustChange: 10,
      event: "jayco_first",
    },
  },
  {
    condition: () => true,
    response: {
      lines: [
        '"The ginger ones fight over the bench near the fountain. Stay clear at dusk."',
      ],
      speakerPose: "friendly",
      emote: "heart",
      trustChange: 5,
      event: "jayco_return",
    },
  },
];

// ── Jayco Jr ────────────────────────────────────────────────────────

const jaycoJrScripts: DialogueScript[] = [
  {
    condition: isFirstMeeting,
    response: {
      lines: [
        "*A tiny cat bounces toward you, tail straight up.*",
        "\"Mrrp! Mrrp! You're new! Dad says I shouldn't talk to strangers but you smell okay!\"",
      ],
      speakerPose: "friendly",
      emote: "heart",
      trustChange: 10,
      event: "jaycojr_first",
    },
  },
  {
    condition: () => true,
    response: {
      lines: [
        '"Did you find the water bowls? They\'re near the big trees! I can show you!"',
      ],
      speakerPose: "friendly",
      emote: "heart",
      trustChange: 5,
      event: "jaycojr_return",
    },
  },
];

// ── Fluffy ──────────────────────────────────────────────────────────

const fluffyScripts: DialogueScript[] = [
  {
    condition: isFirstMeeting,
    response: {
      lines: [
        "*This cat regards you with half-closed eyes. Its long fur is immaculate.*",
        '"..."',
        "*It returns to grooming. You've been dismissed.*",
      ],
      speakerPose: "wary",
      emote: "curious",
      trustChange: 10,
      event: "fluffy_first",
    },
  },
  {
    condition: (req) => req.gameState.trustWithSpeaker >= 20,
    response: {
      lines: [
        "\"You're still alive. That's something, I suppose.\"",
        '"The humans with the bags come at dawn and dusk. Follow the sound of rustling."',
      ],
      speakerPose: "curious",
      emote: "curious",
      trustChange: 5,
      event: "fluffy_return",
    },
  },
  {
    condition: () => true,
    response: {
      lines: ["*The cat flicks an ear in your direction but doesn't look up.*"],
      speakerPose: "wary",
      emote: "curious",
      trustChange: 5,
      event: "fluffy_return",
    },
  },
];

// ── Pedigree ────────────────────────────────────────────────────────

const pedigreeScripts: DialogueScript[] = [
  {
    condition: isFirstMeeting,
    response: {
      lines: [
        "*This cat has a look you recognise. Well-groomed but confused. A former pet, like you.*",
        '"I had a home once. A bed. A name they called me."',
        '"They moved away. I didn\'t."',
      ],
      speakerPose: "submissive",
      emote: "curious",
      trustChange: 10,
      event: "pedigree_first",
    },
  },
  {
    condition: () => true,
    response: {
      lines: [
        '"The ones in dark clothes at night... they took my friend. Stay hidden after dark."',
      ],
      speakerPose: "wary",
      emote: "alert",
      trustChange: 5,
      event: "pedigree_return",
    },
  },
];

// ── Ginger ──────────────────────────────────────────────────────────

const gingerScripts: DialogueScript[] = [
  {
    condition: isFirstMeeting,
    response: {
      lines: [
        "*Two orange cats glare at you from beside the fountain. One hisses.*",
        '"SSSS! This water is OURS."',
      ],
      speakerPose: "hostile",
      emote: "hostile",
      trustChange: 10,
      event: "ginger_first",
    },
  },
  {
    condition: (req) => req.gameState.trustWithSpeaker >= 30,
    response: {
      lines: [
        "*The ginger cat flicks an ear at you.*",
        '"...Fine. Drink. But don\'t bring anyone else."',
      ],
      speakerPose: "wary",
      emote: "curious",
      trustChange: 5,
      event: "ginger_return",
    },
  },
  {
    condition: () => true,
    response: {
      lines: ["*The ginger cat hisses softly.*"],
      speakerPose: "hostile",
      emote: "hostile",
      trustChange: 5,
      event: "ginger_return",
    },
  },
];

// ── Ginger B ────────────────────────────────────────────────────────

const gingerBScripts: DialogueScript[] = [
  {
    condition: isFirstMeeting,
    response: {
      lines: [
        "*This one just watches. It doesn't speak. Its twin does the talking.*",
      ],
      speakerPose: "wary",
      emote: "curious",
      trustChange: 10,
      event: "gingerb_first",
    },
  },
  {
    condition: () => true,
    response: {
      lines: ["*The cat stares at you, unblinking.*"],
      speakerPose: "curious",
      emote: "curious",
      trustChange: 5,
      event: "gingerb_return",
    },
  },
];

// ── Colony Cat (generic) ────────────────────────────────────────────

const COLONY_LINES = [
  "*This cat ignores you.*",
  "*This cat hisses softly and turns away.*",
  "*This cat sniffs in your direction, then goes back to sleep.*",
  "*This cat watches you for a moment, then loses interest.*",
  "*This cat's ear twitches, but it doesn't move.*",
];

const colonyScripts: DialogueScript[] = [
  {
    condition: () => true,
    response: {
      lines: [COLONY_LINES[Math.floor(Math.random() * COLONY_LINES.length)]!],
    },
  },
];

// ── Export ───────────────────────────────────────────────────────────

/**
 * All cat dialogue scripts, keyed by NPC name.
 * "Colony Cat" is a fallback key for unnamed background cats.
 */
export const CAT_DIALOGUE_SCRIPTS: Record<string, DialogueScript[]> = {
  Blacky: blackyScripts,
  Tiger: tigerScripts,
  Jayco: jaycoScripts,
  "Jayco Jr": jaycoJrScripts,
  Fluffy: fluffyScripts,
  Pedigree: pedigreeScripts,
  Ginger: gingerScripts,
  "Ginger B": gingerBScripts,
  "Colony Cat": colonyScripts,
};

/**
 * Returns a random colony dialogue line (for unnamed cats).
 * Colony cats bypass the normal DialogueService flow since
 * they don't track conversation history or trust.
 */
export function getRandomColonyLine(): string {
  return COLONY_LINES[Math.floor(Math.random() * COLONY_LINES.length)]!;
}
