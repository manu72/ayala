import { describe, expect, it } from "vitest";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";
import snatcherSystemSource from "../../src/systems/SnatcherSystem.ts?raw";

describe("human exit route wiring", () => {
  it("preserves the exact current position as waypoint 0 before routed exit points", () => {
    const helperStart = gameSceneSource.indexOf("routeHumanConfig(config: HumanConfig");
    const helperEnd = gameSceneSource.indexOf("\n  private ", helperStart + 1);
    const helperSource = gameSceneSource.slice(helperStart, helperEnd);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperSource).toContain("if (!nearest) return [from];");
    expect(helperSource).toContain("return [from, ...routeHumanPath([from, nearest], navigationGrid).path];");
    expect(helperSource).not.toContain("return nearest ? routeHumanPath([from, nearest], navigationGrid).path : [from];");
  });

  it("reuses one navigation grid across multi-snatcher night spawns", () => {
    // Snatcher spawn + detection policy moved to SnatcherSystem in commit A.
    const checkStart = snatcherSystemSource.indexOf("updateSpawnCheck(): void {");
    // Walk to the first method boundary after `updateSpawnCheck()`. Methods
    // in SnatcherSystem are separated by a blank line followed by either
    // another method (including doc-commented ones) or the closing brace.
    const checkEnd = snatcherSystemSource.indexOf("\n  /**", checkStart + 1);
    const checkSource = snatcherSystemSource.slice(checkStart, checkEnd);
    const spawnStart = snatcherSystemSource.indexOf("private spawnSnatcher(");
    const spawnEnd = snatcherSystemSource.indexOf("\n  private ", spawnStart + 1);
    const spawnSource = snatcherSystemSource.slice(spawnStart, spawnEnd);

    expect(checkStart).toBeGreaterThanOrEqual(0);
    expect(spawnStart).toBeGreaterThanOrEqual(0);
    expect(checkSource).toContain("const navigationGrid = this.scene.createHumanNavigationGrid();");
    expect(checkSource).toContain("this.spawnSnatcher(i, false, navigationGrid);");
    expect(spawnSource).toContain('const snatcherType = index % 2 === 0 ? "snatcher" : "snatcher2";');
    expect(spawnSource).toContain("type: snatcherType");
    expect(spawnSource).toContain("this.scene.routeHumanConfig(config, grid)");
    // A single resolved `grid` is used per spawn call; no inline `createHumanNavigationGrid()` at the routing site.
    expect(spawnSource).not.toContain("this.scene.routeHumanConfig(config, this.scene.createHumanNavigationGrid())");
  });

  it("wires local detour routing and clearance-aware human navigation grid", () => {
    const gridStart = gameSceneSource.indexOf("createHumanNavigationGrid(): NavigationGrid");
    const gridEnd = gameSceneSource.indexOf("\n  private ", gridStart + 1);
    const gridSource = gameSceneSource.slice(gridStart, gridEnd);
    const routeConfigStart = gameSceneSource.indexOf("routeHumanConfig(config: HumanConfig");
    const routeConfigEnd = gameSceneSource.indexOf("\n  private ", routeConfigStart + 1);
    const routeConfigSource = gameSceneSource.slice(routeConfigStart, routeConfigEnd);

    expect(gridStart).toBeGreaterThanOrEqual(0);
    expect(gridSource).toContain("HUMAN_NAV_CLEARANCE_CHEBYSHEV_TILES");
    expect(gridSource).toContain("isExplorationCellBlocked");
    expect(routeConfigSource).toContain("routeLocalDetour: (from, to) => {");
    expect(routeConfigSource).toContain("routeHumanPath([from, to], navigationGrid)");
    expect(routeConfigSource).toContain("segment.path.slice(1, -1)");
    expect(routeConfigSource).toContain("routeToExit: (from, exits) => {");
  });
});
