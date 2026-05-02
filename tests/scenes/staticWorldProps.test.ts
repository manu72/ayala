import { describe, expect, it } from "vitest";
import bootSceneSource from "../../src/scenes/BootScene.ts?raw";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";

describe("static world props", () => {
  it("preloads the carabao playground sculpture as a plain image", () => {
    expect(bootSceneSource).toContain('this.load.image("carabao_small", "assets/sprites/carabao_small.png")');
    expect(bootSceneSource).toContain('this.load.image("hornbill_small", "assets/sprites/hornbill_small.png")');
  });

  it("places the carabao and hornbill without adding physics or collision", () => {
    const placementStart = gameSceneSource.indexOf("private placePlaygroundCarabao()");
    const placementEnd = gameSceneSource.indexOf("\n  private ", placementStart + 1);
    const placementSource = gameSceneSource.slice(placementStart, placementEnd);

    expect(placementStart).toBeGreaterThanOrEqual(0);
    expect(placementSource).toContain('this.add.image(carabaoX, carabaoY, "carabao_small")');
    expect(placementSource).toContain(".setOrigin(0.5, 1)");
    expect(placementSource).toContain(".setScale(0.5)");
    expect(placementSource).toContain(".setDepth(11)");
    expect(placementSource).toContain("const hornbillX = carabaoX - TILE_SIZE * 3;");
    expect(placementSource).toContain("const hornbillY = carabaoY - TILE_SIZE * 3;");
    expect(placementSource).toContain('this.add.image(hornbillX, hornbillY, "hornbill_small")');
    expect(placementSource).toContain(".setScale(0.4)");
    expect(placementSource).not.toContain("physics.add.existing");
    expect(placementSource).not.toContain("physics.add.collider");
  });
});
