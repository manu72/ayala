import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import gameConfigSource from "../../src/config/GameConfig.ts?raw";

describe("touch input configuration", () => {
  it("provisions enough active pointers for joystick plus run button multitouch", () => {
    expect(gameConfigSource).toContain("input: {");
    expect(gameConfigSource).toContain("activePointers: 2");
  });

  it("disables browser gestures on the game surface so cardinal swipes reach Phaser", () => {
    expect(indexHtml).toContain("touch-action: none");
    expect(indexHtml).toContain("-webkit-touch-callout: none");
    expect(indexHtml).toContain("user-select: none");
  });
});
