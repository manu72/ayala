import { describe, expect, it } from "vitest";
import { PETS, PET_COLS, PET_FRAME, petAnims, petBody } from "../../src/data/pets";
import { backgroundCatLook } from "../../src/utils/colonySpawn";

const sheets = import.meta.glob("../../public/assets/sprites/pets/*.png", { query: "?inline", import: "default", eager: true }) as Record<string, string>;
const pngSize = (dataUrl: string) => {
  const bytes = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const u32 = (at: number) => [0, 1, 2, 3].reduce((n, i) => n * 256 + bytes.charCodeAt(at + i), 0);
  return { w: u32(16), h: u32(20) };
};

describe("PixelLab pets", () => {
  it("ship a 92 px, 8x9 sheet each", () => {
    for (const pet of Object.values(PETS)) {
      const png = sheets[`../../public/assets/sprites/pets/${pet.texture.replace("pet_", "")}.png`];
      expect(png, pet.texture).toBeDefined();
      expect(pngSize(png ?? "")).toEqual({ w: PET_COLS * PET_FRAME, h: 9 * PET_FRAME });
    }
  });

  it("provide every animation NPCCat and DogNPC ask for, inside the sheet", () => {
    const keys = petAnims("p").map((a) => a.key);
    for (const d of ["down", "right", "up", "left"]) {
      expect(keys).toContain(`p-walk-${d}`);
      expect(keys).toContain(`p-run-${d}`);
      expect(keys).toContain(`p-sit-${d}`);
    }
    for (const k of ["p-walk", "p-run", "p-rest", "p-idle"]) expect(keys).toContain(k);
    for (const a of petAnims("p")) for (const f of a.frames) expect(f).toBeLessThan(PET_COLS * 9);
    expect(petAnims("p").find((a) => a.key === "p-rest")?.repeat).toBe(0); // lies down once and stays down
  });

  it("collide with the same 18 px box at the feet as the other cats", () => {
    for (const pet of Object.values(PETS)) {
      const b = petBody(pet.scale);
      expect(Math.abs(b.w * pet.scale - 18)).toBeLessThan(0.5);
      expect(b.offsetY + b.h).toBe(76);
    }
  });

  it("always cast Cat cat and Mittens in the opening colony roster", () => {
    expect(backgroundCatLook(0)).toMatchObject({ spriteKey: PETS.catcat.texture, layout: "pixellab" });
    expect(backgroundCatLook(1)).toMatchObject({ spriteKey: PETS.mittens.texture, layout: "pixellab" });
    expect(backgroundCatLook(4)).toEqual({ spriteKey: "fluffy" }); // later cats: the legacy sheets, fixed per index
    expect(backgroundCatLook(9)).toEqual(backgroundCatLook(4));
  });
});
