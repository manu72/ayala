import { describe, expect, it } from "vitest";
import bootSceneSource from "../../src/scenes/BootScene.ts?raw";
import gameSceneSource from "../../src/scenes/GameScene.ts?raw";

/**
 * The ground the player sees is the baked art (groundArt/shade/roofArt); the
 * gameplay `ground` layer only carries collision. Phaser ignores Tiled's layer
 * `visible` flag, so GameScene must hide it itself, and the mostly-empty art
 * layers must not allocate a Tile object per empty cell.
 */
describe("tilemap layer setup", () => {
  it("loads the baked ground-art tileset and creates the art layers around the gameplay ones", () => {
    expect(bootSceneSource).toContain('this.load.image("atg-ground", "assets/tilesets/atg-ground.png")');
    expect(gameSceneSource).toContain('this.map.addTilesetImage("atg-ground", "atg-ground")');
    const order = ['createLayer("ground"', 'createLayer("groundArt"', 'createLayer("shade"', 'createLayer("objects"', 'createLayer("overhead"', 'createLayer("roofArt"'].map((s) =>
      gameSceneSource.indexOf(s),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("hides the gameplay ground layer at runtime and skips Tile objects for empty cells", () => {
    expect(gameSceneSource).toMatch(/this\.groundLayer\.setVisible\(false\)/);
    expect(gameSceneSource).toMatch(/make\.tilemap\(\{ key: "atg", insertNull: true \}\)/);
  });
});
