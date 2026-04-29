import { describe, expect, it } from "vitest";

import { StoryKeys, type StoryRegistry } from "../../src/registry/storyKeys";
import {
  consumeSnatchedThisNight,
  markSnatchedThisNight,
  restoreSnatchedThisNight,
} from "../../src/utils/snatcherNightState";

function makeRegistry(initial: Record<string, unknown> = {}): StoryRegistry & {
  data: Map<string, unknown>;
} {
  const data = new Map<string, unknown>(Object.entries(initial));
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

describe("snatcher night state", () => {
  it("restores a pending snatch from either scene restart data or saved registry state", () => {
    expect(restoreSnatchedThisNight(makeRegistry(), true)).toBe(true);
    expect(restoreSnatchedThisNight(makeRegistry({ [StoryKeys.SNATCHED_THIS_NIGHT]: true }), false)).toBe(true);
    expect(restoreSnatchedThisNight(makeRegistry({ [StoryKeys.SNATCHED_THIS_NIGHT]: false }), false)).toBe(false);
  });

  it("marks a pending non-clean night before autosave", () => {
    const registry = makeRegistry();
    markSnatchedThisNight(registry);
    expect(registry.data.get(StoryKeys.SNATCHED_THIS_NIGHT)).toBe(true);
  });

  it("converts the pending flag into clean-night scoring and clears persisted state", () => {
    const registry = makeRegistry({ [StoryKeys.SNATCHED_THIS_NIGHT]: true });

    expect(consumeSnatchedThisNight(registry, true)).toEqual({ clean: false });
    expect(registry.data.get(StoryKeys.SNATCHED_THIS_NIGHT)).toBe(false);

    expect(consumeSnatchedThisNight(registry, false)).toEqual({ clean: true });
  });
});
