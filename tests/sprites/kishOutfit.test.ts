import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { Physics: { Arcade: { Sprite: class {} } } } }));
import { KISHDALE_PROFILE, kishProfileForDay, profileForType } from "../../src/sprites/SpriteProfiles";

const sheets = import.meta.glob("../../public/assets/sprites/*ishdale*.png", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
const pngSize = (dataUrl: string) => {
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const u32 = (at: number) => [0, 1, 2, 3].reduce((n, i) => n * 256 + bytes.charCodeAt(at + i), 0);
  return { w: u32(16), h: u32(20) };
};

describe("Kish's two outfits", () => {
  it("alternates by in-game day, starting in her usual clothes", () => {
    expect(kishProfileForDay(1).key).toBe("kish");
    expect(kishProfileForDay(2).key).toBe("kishdale");
    expect(kishProfileForDay(3)).toBe(profileForType("kish"));
  });

  it("keeps Kish's size, body and motion; only the art changes", () => {
    const kish = profileForType("kish");
    expect({ ...KISHDALE_PROFILE, key: kish.key, directionalKeys: kish.directionalKeys }).toEqual(kish);
  });

  it("ships the kishdale strips in the same 68 px, 8-frame layout as Kish's", () => {
    for (const file of ["Kishdale_stand", "kishdale_walk_east", "kishdale_walk_west", "kishdale_walk_north", "kishdale_walk_south"]) {
      const png = sheets[`../../public/assets/sprites/${file}.png`];
      expect(png, `${file}.png`).toBeDefined();
      expect(pngSize(png ?? "")).toEqual({ w: 8 * 68, h: 68 });
    }
  });
});
