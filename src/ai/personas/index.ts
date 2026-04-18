/**
 * Persona markdown for AI system prompts, keyed by exact speaker name.
 *
 * Speaker names must match what is passed into `DialogueRequest.speaker` — for
 * cats that is `NPCCat.npcName`; for humans it is `HumanNPC.identityName` as
 * set on the config (Camille/Manu/Kish/Rose/Ben).
 */

import blacky from "./blacky.md?raw";
import tiger from "./tiger.md?raw";
import jayco from "./jayco.md?raw";
import jaycoJunior from "./jayco-junior.md?raw";
import fluffy from "./fluffy.md?raw";
import pedigree from "./pedigree.md?raw";
import gingerTwin1 from "./ginger-twin-1.md?raw";
import gingerTwin2 from "./ginger-twin-2.md?raw";
import camille from "./camille.md?raw";
import manu from "./manu.md?raw";
import kish from "./kish.md?raw";
import rose from "./rose.md?raw";
import ben from "./ben.md?raw";

/**
 * All AI personas (cats + humans).
 *
 * Consumers should import `AI_PERSONAS`. `CAT_PERSONAS` remains as a backward
 * compatible alias so older callers and tests that expected cat-only content
 * keep working; new code should use `AI_PERSONAS`.
 */
export const AI_PERSONAS: Record<string, string> = {
  Blacky: blacky,
  Tiger: tiger,
  Jayco: jayco,
  "Jayco Jr": jaycoJunior,
  Fluffy: fluffy,
  Pedigree: pedigree,
  Ginger: gingerTwin1,
  "Ginger B": gingerTwin2,
  Camille: camille,
  Manu: manu,
  Kish: kish,
  Rose: rose,
  Ben: ben,
};

export const CAT_PERSONAS: Record<string, string> = AI_PERSONAS;

/**
 * Persona depth tier — drives conversation-history window size in
 * `buildMessages`. Tier 1 personas get richer context (20 turns), Tier 2
 * a shorter window (10 turns). Unknown speakers default to Tier 1.
 */
export type PersonaTier = "tier1" | "tier2";

export const PERSONA_TIER: Record<string, PersonaTier> = {
  Blacky: "tier1",
  Tiger: "tier1",
  Jayco: "tier1",
  Camille: "tier1",
  "Jayco Jr": "tier2",
  Fluffy: "tier2",
  Pedigree: "tier2",
  Ginger: "tier2",
  "Ginger B": "tier2",
  Manu: "tier2",
  Kish: "tier2",
  Rose: "tier2",
  Ben: "tier2",
};
