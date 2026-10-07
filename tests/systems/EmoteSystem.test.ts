import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: {} }));

import { EmoteSystem } from "../../src/systems/EmoteSystem";
import type Phaser from "phaser";

describe("EmoteSystem cooldown", () => {
  it("shows a sprite's first emote whatever the clock says, then holds the next for 3 s", () => {
    const text = { setOrigin: () => text, setDepth: () => text, destroy: vi.fn() };
    const addText = vi.fn(() => text);
    const scene = {
      time: { now: 0 },
      add: { text: addText },
      tweens: { add: vi.fn() },
      registry: { get: () => false },
    };
    const sprite = { x: 0, y: 0 } as Phaser.GameObjects.Sprite;
    const emotes = new EmoteSystem();
    const show = (now: number) => {
      scene.time.now = now;
      emotes.show(scene as unknown as Phaser.Scene, sprite, "heart");
      return addText.mock.calls.length;
    };
    expect(show(0)).toBe(1); // the scene clock has barely started: still shown
    expect(show(2_999)).toBe(1); // cooling down
    expect(show(3_000)).toBe(2);
  });
});
