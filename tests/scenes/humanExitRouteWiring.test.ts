import { describe, expect, it } from "vitest";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";

describe("human exit route wiring", () => {
  it("preserves the exact current position as waypoint 0 before routed exit points", () => {
    const helperStart = gameSceneSource.indexOf("private routeHumanConfig(");
    const helperEnd = gameSceneSource.indexOf("\n  private ", helperStart + 1);
    const helperSource = gameSceneSource.slice(helperStart, helperEnd);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperSource).toContain("if (!nearest) return [from];");
    expect(helperSource).toContain("return [from, ...routeHumanPath([from, nearest], navigationGrid).path];");
    expect(helperSource).not.toContain("return nearest ? routeHumanPath([from, nearest], navigationGrid).path : [from];");
  });

  it("reuses one navigation grid across multi-snatcher night spawns", () => {
    const checkStart = gameSceneSource.indexOf("private checkSnatcherSpawn()");
    const checkEnd = gameSceneSource.indexOf("\n  private ", checkStart + 1);
    const checkSource = gameSceneSource.slice(checkStart, checkEnd);
    const spawnStart = gameSceneSource.indexOf("private spawnSnatcher(");
    const spawnEnd = gameSceneSource.indexOf("\n  private ", spawnStart + 1);
    const spawnSource = gameSceneSource.slice(spawnStart, spawnEnd);

    expect(checkStart).toBeGreaterThanOrEqual(0);
    expect(spawnStart).toBeGreaterThanOrEqual(0);
    expect(checkSource).toContain("const navigationGrid = this.createHumanNavigationGrid();");
    expect(checkSource).toContain("this.spawnSnatcher(i, false, navigationGrid);");
    expect(spawnSource).toContain("navigationGrid = this.createHumanNavigationGrid()");
    expect(spawnSource).toContain("this.routeHumanConfig(config, navigationGrid)");
    expect(spawnSource).not.toContain("this.routeHumanConfig(config, this.createHumanNavigationGrid())");
  });

  it("wires local detour routing and clearance-aware human navigation grid", () => {
    const gridStart = gameSceneSource.indexOf("private createHumanNavigationGrid()");
    const gridEnd = gameSceneSource.indexOf("\n  private ", gridStart + 1);
    const gridSource = gameSceneSource.slice(gridStart, gridEnd);
    const routeConfigStart = gameSceneSource.indexOf("private routeHumanConfig(");
    const routeConfigEnd = gameSceneSource.indexOf("\n  private ", routeConfigStart + 1);
    const routeConfigSource = gameSceneSource.slice(routeConfigStart, routeConfigEnd);

    expect(gridStart).toBeGreaterThanOrEqual(0);
    expect(gridSource).toContain("HUMAN_NAV_CLEARANCE_CHEBYSHEV_TILES");
    expect(gridSource).toContain("isExplorationCellBlocked");
    expect(routeConfigSource).toContain("routeLocalDetour: (from, to) => {");
    expect(routeConfigSource).toContain("routeHumanPath([from, to], navigationGrid)");
    expect(routeConfigSource).toContain("routeToExit: (from, exits) => {");
  });
});
