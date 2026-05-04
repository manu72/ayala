import { describe, expect, it } from "vitest";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";

describe("GameScene game-over trigger wiring", () => {
  it("marks GAME_OVER inside triggerGameOver before launching GameOverScene", () => {
    const triggerStart = gameSceneSource.indexOf('triggerGameOver(reason: "collapse" | "snatched")');
    const launchStart = gameSceneSource.indexOf('this.scene.launch("GameOverScene"', triggerStart);
    const markStart = gameSceneSource.indexOf("markGameOver(this.registry)", triggerStart);

    expect(triggerStart).toBeGreaterThanOrEqual(0);
    expect(markStart).toBeGreaterThan(triggerStart);
    expect(launchStart).toBeGreaterThan(triggerStart);
    expect(markStart).toBeLessThan(launchStart);
  });
});
