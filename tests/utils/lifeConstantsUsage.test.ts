import { describe, expect, it } from "vitest";
import hudSceneSource from "../../src/scenes/HUDScene.ts?raw";
import saveSystemSource from "../../src/systems/SaveSystem.ts?raw";

describe("life constants usage", () => {
  it("keeps SaveSystem validation synced to the shared life-flow default", () => {
    expect(saveSystemSource).toMatch(/import\s+\{[^}]*DEFAULT_LIVES[^}]*\}\s+from\s+['"]\.\.\/utils\/lifeFlow['"]/);
    expect(saveSystemSource).not.toMatch(/const\s+DEFAULT_LIVES\s*=\s*3/);
  });

  it("renders HUD lives using the shared default life count", () => {
    expect(hudSceneSource).toMatch(/import\s+\{[^}]*DEFAULT_LIVES[^}]*\}\s+from\s+['"]\.\.\/utils\/lifeFlow['"]/);
    expect(hudSceneSource).toContain("Math.min(DEFAULT_LIVES, gameScene.lives ?? 0)");
    expect(hudSceneSource).toContain("DEFAULT_LIVES - lives");
    expect(hudSceneSource).not.toMatch(/Math\.min\(3,/);
    expect(hudSceneSource).not.toMatch(/3\s*-\s*lives/);
  });
});
