import { describe, expect, it } from "vitest";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";
import colonySource from "../../src/systems/ColonyDynamicsSystem.ts?raw";

/**
 * Only Mamma Cat may walk on road tiles (tileset property `road`); everyone
 * else keeps colliding with them. Pins the scene wiring the pure helpers in
 * src/utils/roadTiles.ts rely on.
 */
const sources = import.meta.glob("../../src/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Arguments of a call, counting only top-level commas (not those inside nested calls, arrays or objects; a trailing comma adds none). */
const argCount = (args: string): number => {
  let depth = 0;
  let count = 1;
  for (const ch of args.replace(/,\s*$/, "")) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) count++;
  }
  return count;
};

describe("road crossing wiring", () => {
  it("lets only the player's ground collider skip road tiles", () => {
    const groundColliders = Object.entries(sources).flatMap(([file, src]) =>
      [...src.matchAll(/physics\.add\.collider\(([\s\S]*?)\);/g)]
        .map((m) => (m[1] ?? "").replace(/\s+/g, " ").trim())
        .filter((args) => /ground/i.test(args))
        .map((args) => ({ file: file.replace(/^.*\/src\//, ""), args })),
    );
    expect(groundColliders.filter((c) => c.args.includes("isRoadTile"))).toEqual([
      { file: "scenes/GameScene.ts", args: "this.player, this.groundLayer, undefined, (_player, tile) => !isRoadTile(tile as Phaser.Tilemaps.Tile)," },
    ]);
    // guard, NPC cats, humans, snatchers, Camille's group: plain two-argument colliders
    const others = groundColliders.filter((c) => !c.args.includes("isRoadTile"));
    expect(others.length).toBeGreaterThanOrEqual(6);
    for (const c of others) expect(argCount(c.args), `${c.file}: ${c.args}`).toBe(2);
    expect([argCount("cat, layerFor(a, b)"), argCount("cat, ground,"), argCount("a, b, (_a, t) => !isRoadTile(t)")]).toEqual([2, 2, 3]);
  });

  it("restores the buildings' road-side faces right after the ground layer's collision is set", () => {
    const setCollision = gameSceneSource.indexOf("this.groundLayer.setCollisionByProperty({ collides: true });");
    const expose = gameSceneSource.indexOf("exposeFacesTowardRoads(this.map.width, this.map.height");
    const objects = gameSceneSource.indexOf('createLayer("objects"');
    expect(setCollision).toBeGreaterThan(0);
    expect(expose).toBeGreaterThan(setCollision);
    expect(expose).toBeLessThan(objects);
  });

  it("restores saves on roads and keeps exploration flooded from the map spawn", () => {
    expect(gameSceneSource).toContain("if (sameMap && !this.isPlayerCellBlocked(savedTileX, savedTileY)) {");
    expect(gameSceneSource).toContain("this.initialiseTerritoryExploration(parkSpawn.x, parkSpawn.y);");
    expect(gameSceneSource).toMatch(/\n  isOnRoad\(x: number, y: number\): boolean \{/);
  });

  it("holds dumping events while Mamma Cat is off park ground, and the dumping car yields to her", () => {
    expect(colonySource).toContain("if (this.scene.isNearMakatiAve(x, y) && this.scene.isInPark(x, y)) {");
    expect(colonySource).toContain("this.yieldToMamma(car, arrive, stop);");
    expect(colonySource).toContain("this.yieldToMamma(car, leave, exit);");
  });

  it("feeds Mamma Cat to the traffic and routes its screech and horn to the audio", () => {
    const ctor = gameSceneSource.slice(gameSceneSource.indexOf("this.traffic = new TrafficSystem("));
    const options = ctor.slice(0, ctor.indexOf("});"));
    expect(options).toContain("cat: () => this.catForTraffic(),");
    expect(options).toContain("onScreech: (x, y) => this.onCarScreech(x, y),");
    expect(options).toContain("onHorn: (x, y) => this.audio?.playCarHorn(this.earVolume(x, y)),");
    expect(gameSceneSource).toContain("this.audio?.playTyreScreech(this.earVolume(x, y));");
    expect(gameSceneSource).toContain("settled: this.player.isResting || this.player.isCatloaf || this.stats.collapsed,");
  });
});
