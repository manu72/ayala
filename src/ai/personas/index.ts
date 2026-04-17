/**
 * Persona markdown for AI system prompts, keyed by exact `npcName` from GameScene.
 */

import blacky from "./blacky.md?raw";
import tiger from "./tiger.md?raw";
import jayco from "./jayco.md?raw";
import jaycoJunior from "./jayco-junior.md?raw";
import fluffy from "./fluffy.md?raw";
import pedigree from "./pedigree.md?raw";
import gingerTwin1 from "./ginger-twin-1.md?raw";
import gingerTwin2 from "./ginger-twin-2.md?raw";

export const CAT_PERSONAS: Record<string, string> = {
  Blacky: blacky,
  Tiger: tiger,
  Jayco: jayco,
  "Jayco Jr": jaycoJunior,
  Fluffy: fluffy,
  Pedigree: pedigree,
  Ginger: gingerTwin1,
  "Ginger B": gingerTwin2,
};
