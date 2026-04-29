import { describe, expect, it } from "vitest";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";
import hudSceneSource from "../../src/scenes/HUDScene.ts?raw";
import journalSceneSource from "../../src/scenes/JournalScene.ts?raw";

describe("touch input scene wiring", () => {
  it("routes JournalScene wheel and drag scrolling through the same clamp helper", () => {
    expect(journalSceneSource).toContain("private setScrollY(nextScrollY: number): void");
    expect(journalSceneSource).toContain('this.input.on("pointermove"');
    expect(journalSceneSource).toContain("this.dragStartScrollY + this.dragStartY - pointer.y");
    expect(journalSceneSource).toContain("this.setScrollY(this.scrollY + dy * 0.5)");
  });

  it("keeps HUD touch controls above dialogue and clears them on mobile interruptions", () => {
    expect(hudSceneSource).toContain("this.add.container(0, 0).setDepth(101)");
    expect(hudSceneSource).toContain('this.input.on("pointerupoutside"');
    expect(hudSceneSource).toContain('this.game.events.on("blur"');
    expect(hudSceneSource).toContain("private cancelActiveTouchControls(): void");
    expect(hudSceneSource).toContain("this.dialogue.isActive ? -120 : 0");
  });

  it("guards pause and peek touch requests while player input is frozen", () => {
    expect(gameSceneSource).toContain("if (pauseRequested) {\n      if (this.playerInputFrozen) return;");
    expect(gameSceneSource).toContain("if (peekRequested) {\n      if (this.playerInputFrozen) return;");
  });

  it("clears touch input state on GameScene lifecycle entry and shutdown", () => {
    const resetCalls = gameSceneSource.match(/this\.clearTouchInputState\(true\);/g) ?? [];
    expect(resetCalls).toHaveLength(2);
  });
});
