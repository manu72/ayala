import { describe, expect, it } from "vitest";

import { StoryKeys, type StoryRegistry } from "../../src/registry/storyKeys";
import { markGameOver } from "../../src/utils/gameOverState";

function makeRegistry(): StoryRegistry & {
  data: Map<string, unknown>;
} {
  const data = new Map<string, unknown>();
  return {
    data,
    get(key: string) {
      return data.get(key);
    },
    set(key: string, value: unknown) {
      data.set(key, value);
      return this;
    },
  };
}

describe("game over state", () => {
  it("marks the shared game-over story flag", () => {
    const registry = makeRegistry();

    markGameOver(registry);

    expect(registry.data.get(StoryKeys.GAME_OVER)).toBe(true);
  });
});
