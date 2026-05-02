import { describe, expect, it } from "vitest";
import bootSceneSource from "../../src/scenes/BootScene.ts?raw";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";

describe("static world props", () => {
  it("preloads the carabao playground sculpture as a plain image", () => {
    expect(bootSceneSource).toContain('this.load.image("carabao_small", "assets/sprites/carabao_small.png")');
    expect(bootSceneSource).toContain('this.load.image("hornbill_small", "assets/sprites/hornbill_small.png")');
  });

  it("preloads the SUV sprite for drop-off vehicle sequences", () => {
    expect(bootSceneSource).toContain('this.load.image("suv_small", "assets/sprites/suv_small.png")');
  });

  it("places the carabao and hornbill without adding physics or collision", () => {
    const placementStart = gameSceneSource.indexOf("private placePlaygroundCarabao()");
    const placementEnd = gameSceneSource.indexOf("\n  private ", placementStart + 1);
    const placementSource = gameSceneSource.slice(placementStart, placementEnd);
    const overheadDepthMatch = gameSceneSource.match(/this\.overheadLayer\.setDepth\((\d+)\)/);
    const overheadDepth = Number(overheadDepthMatch?.[1]);
    const sculptureDepths = [...placementSource.matchAll(/\.setDepth\((\d+)\)/g)].map((match) => Number(match[1]));

    expect(placementStart).toBeGreaterThanOrEqual(0);
    expect(overheadDepth).toBe(10);
    expect(placementSource).toContain('this.add.image(carabaoX, carabaoY, "carabao_small")');
    expect(placementSource).toContain(".setOrigin(0.5, 1)");
    expect(placementSource).toContain(".setScale(0.5)");
    expect(sculptureDepths).toEqual([4, 4]);
    expect(sculptureDepths.every((depth) => depth < overheadDepth)).toBe(true);
    expect(placementSource).not.toContain(".setDepth(11)");
    expect(placementSource).toContain("const hornbillX = carabaoX - TILE_SIZE * 3;");
    expect(placementSource).toContain("const hornbillY = carabaoY - TILE_SIZE * 3;");
    expect(placementSource).toContain('this.add.image(hornbillX, hornbillY, "hornbill_small")');
    expect(placementSource).toContain(".setScale(0.3)");
    expect(placementSource).not.toContain("physics.add.existing");
    expect(placementSource).not.toContain("physics.add.collider");
  });

  it("uses the SUV image helper instead of generated placeholder car textures", () => {
    const introStart = gameSceneSource.indexOf("private startIntroCinematic(");
    const introEnd = gameSceneSource.indexOf("\n  private ", introStart + 1);
    const introSource = gameSceneSource.slice(introStart, introEnd);
    const dumpingStart = gameSceneSource.indexOf("private playDumpingSequence(");
    const dumpingEnd = gameSceneSource.indexOf("\n  private ", dumpingStart + 1);
    const dumpingSource = gameSceneSource.slice(dumpingStart, dumpingEnd);

    expect(introStart).toBeGreaterThanOrEqual(0);
    expect(dumpingStart).toBeGreaterThanOrEqual(0);
    expect(gameSceneSource).toContain('const DROPOFF_SUV_TEXTURE = "suv_small";');
    expect(gameSceneSource).toContain("private addDropoffVehicle(");
    expect(gameSceneSource).not.toContain("generateCarTextures");
    expect(gameSceneSource).not.toContain("car_closed");
    expect(gameSceneSource).not.toContain("car_open");
    expect(introSource).toContain("this.addDropoffVehicle(carOffscreenX, roadY)");
    expect(dumpingSource).toContain("this.addDropoffVehicle(carStartX, roadY)");
  });
});
