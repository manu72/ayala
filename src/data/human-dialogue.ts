import type { DialogueScript, DialogueRequest } from "../services/DialogueService";

function isFirstMeeting(req: DialogueRequest): boolean {
  return req.conversationHistory.length === 0;
}

/** A record from an earlier game day: no "You remembered us!" seconds after the first line. */
function metOnEarlierDay(req: DialogueRequest): boolean {
  return req.conversationHistory.some((entry) => entry.gameDay !== undefined && entry.gameDay < req.gameState.daysSurvived);
}

const camilleScripts: DialogueScript[] = [
  {
    id: "camille_first",
    condition: isFirstMeeting,
    response: {
      lines: ["And who are you, sweetheart?"],
      speakerPose: "friendly",
      emote: "heart",
    },
  },
  {
    id: "camille_return",
    condition: metOnEarlierDay,
    response: {
      lines: ["There you are. I hoped you'd come."],
      speakerPose: "friendly",
      emote: "heart",
    },
  },
];

const manuScripts: DialogueScript[] = [
  {
    id: "manu_first",
    condition: isFirstMeeting,
    response: {
      lines: ["Hey, little one. We won't crowd you."],
      speakerPose: "friendly",
      emote: "curious",
    },
  },
  {
    id: "manu_return",
    condition: metOnEarlierDay,
    response: {
      lines: ["Still here. That's good."],
      speakerPose: "friendly",
      emote: "heart",
    },
  },
];

const kishScripts: DialogueScript[] = [
  {
    id: "kish_first",
    condition: isFirstMeeting,
    response: {
      lines: ["Hi, kitty. I'll be gentle."],
      speakerPose: "curious",
      emote: "curious",
    },
  },
  {
    id: "kish_return",
    condition: metOnEarlierDay,
    response: {
      lines: ["You remembered us!"],
      speakerPose: "friendly",
      emote: "heart",
    },
  },
];

const roseScripts: DialogueScript[] = [
  {
    id: "rose_first",
    condition: isFirstMeeting,
    response: {
      lines: ["Hello, sweetie. Food is here."],
      speakerPose: "friendly",
      emote: "heart",
    },
  },
  {
    id: "rose_return",
    condition: metOnEarlierDay,
    response: {
      lines: ["Come eat when you're ready."],
      speakerPose: "friendly",
      emote: "heart",
    },
  },
];

const benScripts: DialogueScript[] = [
  {
    id: "ben_first",
    condition: isFirstMeeting,
    response: {
      lines: ["Easy there. You're safe by the bowls."],
      speakerPose: "friendly",
      emote: "curious",
    },
  },
  {
    id: "ben_return",
    condition: metOnEarlierDay,
    response: {
      lines: ["There's enough for you too."],
      speakerPose: "friendly",
      emote: "heart",
    },
  },
];

export const HUMAN_DIALOGUE_SCRIPTS: Record<string, DialogueScript[]> = {
  Camille: camilleScripts,
  Manu: manuScripts,
  Kish: kishScripts,
  Rose: roseScripts,
  Ben: benScripts,
};
