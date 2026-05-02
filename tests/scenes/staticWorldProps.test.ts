import { describe, expect, it } from "vitest";
import bootSceneSource from "../../src/scenes/BootScene.ts?raw";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";

describe("static world props", () => {
  it("preloads the carabao playground sculpture as a plain image", () => {
    expect(bootSceneSource).toContain('this.load.image("carabao_small", "assets/sprites/carabao_small.png")');
  });

  it("places the carabao without adding physics or collision", () => {
    const placementStart = gameSceneSource.indexOf("private placePlaygroundCarabao()");
    const placementEnd = gameSceneSource.indexOf("\n  private ", placementStart + 1);
    const placementSource = gameSceneSource.slice(placementStart, placementEnd);

    expect(placementStart).toBeGreaterThanOrEqual(0);
    expect(placementSource).toContain('this.add.image(carabaoX, carabaoY, "carabao_small")');
    expect(placementSource).toContain(".setOrigin(0.5, 1)");
    expect(placementSource).toContain(".setScale(0.5)");
    expect(placementSource).toContain(".setDepth(11)");
    expect(placementSource).not.toContain("physics.add.existing");
    expect(placementSource).not.toContain("physics.add.collider");
  });
});
