import { describe, expect, it } from "vitest";
import bootSceneSource from "../../src/scenes/BootScene.ts?raw";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";

describe("static world props", () => {
  it("preloads the carabao playground sculpture as a plain image", () => {
    expect(bootSceneSource).toContain('this.load.image("carabao_small", "assets/sprites/carabao_small.png")');
    expect(bootSceneSource).toContain('this.load.image("hornbill_small", "assets/sprites/hornbill_small.png")');
  });

  it("preloads the car sprites for drop-off vehicle sequences", () => {
    expect(bootSceneSource).toContain('this.load.image("suv_small", "assets/sprites/suv_small.png")');
    expect(bootSceneSource).toContain('this.load.image("corolla_small", "assets/sprites/corolla_small.png")');
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
    expect(gameSceneSource).toContain('const DROPOFF_COROLLA_TEXTURE = "corolla_small";');
    expect(gameSceneSource).toContain("private addDropoffVehicle(");
    expect(gameSceneSource).not.toContain("generateCarTextures");
    expect(gameSceneSource).not.toContain("car_closed");
    expect(gameSceneSource).not.toContain("car_open");
    expect(introSource).toContain("this.addDropoffVehicle(carOffscreenX, roadY)");
    expect(dumpingSource).toContain("this.addDropoffVehicle(carStartX, roadY, this.vehicleOptionsForDumpingEvent(eventNum))");
  });

  it("uses the Corolla for the first dumping event and then cycles SUV tints", () => {
    const helperStart = gameSceneSource.indexOf("private tintForSuvDropoff(");
    const helperEnd = gameSceneSource.indexOf("\n  private ", helperStart + 1);
    const helperSource = gameSceneSource.slice(helperStart, helperEnd);
    const optionsStart = gameSceneSource.indexOf("private vehicleOptionsForDumpingEvent(");
    const optionsEnd = gameSceneSource.indexOf("\n  private ", optionsStart + 1);
    const optionsSource = gameSceneSource.slice(optionsStart, optionsEnd);
    const introStart = gameSceneSource.indexOf("private startIntroCinematic(");
    const introEnd = gameSceneSource.indexOf("\n  private ", introStart + 1);
    const introSource = gameSceneSource.slice(introStart, introEnd);
    const dumpingStart = gameSceneSource.indexOf("private playDumpingSequence(");
    const dumpingEnd = gameSceneSource.indexOf("\n  private ", dumpingStart + 1);
    const dumpingSource = gameSceneSource.slice(dumpingStart, dumpingEnd);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(optionsStart).toBeGreaterThanOrEqual(0);
    expect(gameSceneSource).toContain("const DROPOFF_SUV_TINT_CYCLE: ReadonlyArray<number | null> = [");
    expect(gameSceneSource).toContain("0x111111");
    expect(gameSceneSource).toContain("0xffd43b");
    expect(gameSceneSource).toContain("0x2f9e44");
    expect(gameSceneSource).toContain("0xd9480f");
    expect(gameSceneSource).toContain("0x1c7ed6");
    expect(helperSource).toContain("DROPOFF_SUV_TINT_CYCLE[(sequenceIndex - 1) % DROPOFF_SUV_TINT_CYCLE.length]");
    expect(optionsSource).toContain("if (eventNum === 1)");
    expect(optionsSource).toContain("texture: DROPOFF_COROLLA_TEXTURE");
    expect(optionsSource).toContain("return { tint: this.tintForSuvDropoff(eventNum - 1) };");
    expect(introSource).toContain("this.addDropoffVehicle(carOffscreenX, roadY)");
    expect(introSource).not.toContain("vehicleOptionsForDumpingEvent");
    expect(dumpingSource).toContain("this.addDropoffVehicle(carStartX, roadY, this.vehicleOptionsForDumpingEvent(eventNum))");
  });
});
