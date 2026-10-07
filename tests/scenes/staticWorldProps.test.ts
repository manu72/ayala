import { describe, expect, it } from "vitest";
import bootSceneSource from "../../src/scenes/BootScene.ts?raw";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";
import colonyDynamicsSystemSource from "../../src/systems/ColonyDynamicsSystem.ts?raw";
import { STORY_SUV_COLOUR_CYCLE } from "../../src/data/vehicles";

describe("static world props", () => {
  it("preloads the carabao playground sculpture as a plain image", () => {
    expect(bootSceneSource).toContain('this.load.image("carabao_small", "assets/sprites/carabao_small.png")');
    expect(bootSceneSource).toContain('this.load.image("hornbill_small", "assets/sprites/hornbill_small.png")');
  });

  it("preloads the Starbucks cafe logo as a plain image", () => {
    expect(bootSceneSource).toContain('this.load.image("starbucks_logo", "assets/sprites/starbucks.png")');
  });

  it("preloads the top-down vehicle atlas for traffic and drop-off vehicle sequences", () => {
    expect(bootSceneSource).toContain(
      'this.load.atlas("vehicles", "assets/sprites/vehicles.png", "assets/sprites/vehicles.json")',
    );
    // The old side-view car art is no longer used anywhere.
    expect(bootSceneSource).not.toContain("suv_small");
    expect(bootSceneSource).not.toContain("corolla_small");
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

  it("places the Starbucks logo two tiles right of the Starbucks water POI", () => {
    const placementStart = gameSceneSource.indexOf("private placeStarbucksLogo()");
    const placementEnd = gameSceneSource.indexOf("\n  private ", placementStart + 1);
    const placementSource = gameSceneSource.slice(placementStart, placementEnd);
    const overheadDepthMatch = gameSceneSource.match(/this\.overheadLayer\.setDepth\((\d+)\)/);
    const overheadDepth = Number(overheadDepthMatch?.[1]);
    const logoDepths = [...placementSource.matchAll(/\.setDepth\((\d+)\)/g)].map((match) => Number(match[1]));

    expect(placementStart).toBeGreaterThanOrEqual(0);
    expect(overheadDepth).toBe(10);
    expect(gameSceneSource).toContain("this.placeStarbucksLogo();");
    expect(placementSource).toContain('obj.name === "poi_starbucks_water"');
    expect(placementSource).toContain("const logoX = (waterPoint?.x ?? 202 * TILE_SIZE) + TILE_SIZE * 2;");
    expect(placementSource).toContain("const logoY = (waterPoint?.y ?? 91 * TILE_SIZE) - TILE_SIZE;");
    expect(placementSource).toContain('this.add.image(logoX, logoY, "starbucks_logo")');
    expect(placementSource).toContain(".setOrigin(0.5, 0.5)");
    expect(placementSource).toContain(".setScale(0.3)");
    expect(logoDepths).toEqual([4]);
    expect(logoDepths.every((depth) => depth < overheadDepth)).toBe(true);
    expect(placementSource).not.toContain("physics.add.existing");
    expect(placementSource).not.toContain("physics.add.collider");
  });

  it("uses the top-down story SUV helper instead of generated placeholder car textures", () => {
    // Intro cinematic stays on GameScene; dumping sequence moved to
    // ColonyDynamicsSystem in commit A but continues to call back into
    // `scene.addDropoffVehicle` so both paths share the same helper.
    const introStart = gameSceneSource.indexOf("private startIntroCinematic(");
    const introEnd = gameSceneSource.indexOf("\n  private ", introStart + 1);
    const introSource = gameSceneSource.slice(introStart, introEnd);
    const dumpingStart = colonyDynamicsSystemSource.indexOf("private playDumpingSequence(");
    const dumpingEnd = colonyDynamicsSystemSource.indexOf("\n  private ", dumpingStart + 1);
    const dumpingSource = colonyDynamicsSystemSource.slice(dumpingStart, dumpingEnd);

    expect(introStart).toBeGreaterThanOrEqual(0);
    expect(dumpingStart).toBeGreaterThanOrEqual(0);
    expect(gameSceneSource).toContain("const DROPOFF_SUV_FRAME = STORY_VEHICLES.suv.frame;");
    expect(gameSceneSource).toContain("const DROPOFF_COROLLA_FRAME = STORY_VEHICLES.corolla.frame;");
    expect(gameSceneSource).toContain("addDropoffVehicle(x: number, y: number, options: DropoffVehicleOptions");
    expect(gameSceneSource).toContain("this.add.image(x, y, VEHICLE_ATLAS, frame)");
    expect(gameSceneSource).not.toContain("suv_small");
    expect(gameSceneSource).not.toContain("corolla_small");
    expect(gameSceneSource).not.toContain("generateCarTextures");
    expect(gameSceneSource).not.toContain("car_closed");
    expect(gameSceneSource).not.toContain("car_open");
    expect(introSource).toContain("this.addDropoffVehicle(carOffscreenX, roadY)");
    expect(dumpingSource).toContain(
      "this.scene.addDropoffVehicle(carStartX, roadY, this.scene.vehicleOptionsForDumpingEvent(eventNum))",
    );
  });

  it("uses the Corolla for the first dumping event and then cycles baked SUV colours", () => {
    const helperStart = gameSceneSource.indexOf("private frameForSuvDropoff(");
    const helperEnd = gameSceneSource.indexOf("\n  private ", helperStart + 1);
    const helperSource = gameSceneSource.slice(helperStart, helperEnd);
    const optionsStart = gameSceneSource.indexOf("vehicleOptionsForDumpingEvent(eventNum: number)");
    const optionsEnd = gameSceneSource.indexOf("\n  /**", optionsStart + 1);
    const optionsSource = gameSceneSource.slice(optionsStart, optionsEnd);
    const introStart = gameSceneSource.indexOf("private startIntroCinematic(");
    const introEnd = gameSceneSource.indexOf("\n  private ", introStart + 1);
    const introSource = gameSceneSource.slice(introStart, introEnd);
    const dumpingStart = colonyDynamicsSystemSource.indexOf("private playDumpingSequence(");
    const dumpingEnd = colonyDynamicsSystemSource.indexOf("\n  private ", dumpingStart + 1);
    const dumpingSource = colonyDynamicsSystemSource.slice(dumpingStart, dumpingEnd);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(optionsStart).toBeGreaterThanOrEqual(0);
    // Same order as the old tint cycle (0x111111, 0xffd43b, 0x2f9e44, 0xd9480f, 0x1c7ed6, untinted silver).
    expect(STORY_SUV_COLOUR_CYCLE).toEqual([
      "story_suv_black",
      "story_suv_yellow",
      "story_suv_green",
      "story_suv_orange",
      "story_suv_blue",
      "story_suv",
    ]);
    expect(helperSource).toContain("STORY_SUV_COLOUR_CYCLE[(sequenceIndex - 1) % STORY_SUV_COLOUR_CYCLE.length]");
    expect(optionsSource).toContain("if (eventNum === 1)");
    expect(optionsSource).toContain("return { frame: DROPOFF_COROLLA_FRAME };");
    expect(optionsSource).toContain("return { frame: this.frameForSuvDropoff(eventNum - 1) };");
    expect(introSource).toContain("this.addDropoffVehicle(carOffscreenX, roadY)");
    expect(introSource).not.toContain("vehicleOptionsForDumpingEvent");
    expect(dumpingSource).toContain(
      "this.scene.addDropoffVehicle(carStartX, roadY, this.scene.vehicleOptionsForDumpingEvent(eventNum))",
    );
  });
});
