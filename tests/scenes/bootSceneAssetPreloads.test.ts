import { describe, expect, it } from "vitest";
import bootSceneSource from "../../src/scenes/BootScene.ts?raw";

describe("BootScene asset preloads", () => {
  it("preloads both snatcher sprite variants", () => {
    for (const [key, file] of [
      ["snatcher_stand", "snatcher1_stand"],
      ["snatcher_walk_e", "snatcher1_walk_east"],
      ["snatcher_walk_w", "snatcher1_walk_west"],
      ["snatcher_walk_n", "snatcher1_walk_north"],
      ["snatcher_walk_s", "snatcher1_walk_south"],
      ["snatcher2_stand", "snatcher2_stand"],
      ["snatcher2_walk_e", "snatcher2_walk_east"],
      ["snatcher2_walk_w", "snatcher2_walk_west"],
      ["snatcher2_walk_n", "snatcher2_walk_north"],
      ["snatcher2_walk_s", "snatcher2_walk_south"],
    ] as const) {
      expect(bootSceneSource).toContain(`["${key}", "${file}"]`);
    }
  });
});
