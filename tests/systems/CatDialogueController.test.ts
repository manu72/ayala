import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: {} }));

import { CatDialogueController } from "../../src/systems/CatDialogueController";
import type { GameScene } from "../../src/scenes/GameScene";
import type { NPCCat } from "../../src/sprites/NPCCat";
import { colonyIntroLine, newcomerLine } from "../../src/data/cat-dialogue";

describe("CatDialogueController — greeting a colony cat", () => {
  it("a dumped pet gives its name only once it is half settled; until then the greeting is its fear", () => {
    const cases: Array<[comfort: number | null, line: string]> = [
      [10, newcomerLine(10)],
      [49, newcomerLine(49)],
      [50, colonyIntroLine("Kape")],
      [null, colonyIntroLine("Kape")], // an ordinary colony cat
    ];
    for (const [comfort, line] of cases) {
      const learnName = vi.fn(() => ({ name: "Kape", isNew: true }));
      const show = vi.fn();
      const scene = {
        colony: { tryCreditDumpedPetComfort: vi.fn(), newcomers: { greet: vi.fn(() => comfort) }, learnName },
        dialogue: { show },
        time: { now: 0 },
      };
      new CatDialogueController(scene as unknown as GameScene).show({ npcName: "Colony Cat 11" } as NPCCat);
      expect(learnName).toHaveBeenCalledTimes(comfort === null || comfort >= 50 ? 1 : 0);
      expect(show).toHaveBeenCalledWith([line]);
    }
  });
});
