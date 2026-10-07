import { describe, expect, it, vi } from "vitest";
import { Meetings, PET_GREET_PX, PET_PART_PX, PET_REGREET_MS, PetFriends } from "../../src/systems/PetFriends";
import { PETS } from "../../src/data/pets";
import type { GameScene } from "../../src/scenes/GameScene";

const at = (x: number) => ({ x, y: 0 });

describe("Meetings", () => {
  it("greets on meeting, again after parting, and now and then while together", () => {
    const m = new Meetings();
    const pair = (d: number | null) => [[at(0), d === null ? null : at(d)]] as const;
    expect(m.update(pair(PET_PART_PX + 50), 0)).toEqual([]); // apart
    expect(m.update(pair(PET_GREET_PX - 10), 1_000)).toEqual([0]); // they meet
    expect(m.update(pair(PET_GREET_PX - 30), 2_000)).toEqual([]); // still together
    expect(m.update(pair(PET_GREET_PX + 20), 3_000)).toEqual([]); // drifting, not parted
    expect(m.update(pair(PET_GREET_PX - 10), 4_000)).toEqual([]);
    expect(m.update(pair(PET_GREET_PX - 10), 1_000 + PET_REGREET_MS)).toEqual([0]); // housemates say hello again
    expect(m.update(pair(PET_PART_PX + 1), 50_000)).toEqual([]); // parted
    expect(m.update(pair(PET_GREET_PX - 1), 50_100)).toEqual([0]); // back: hello
    expect(m.update(pair(null), 50_200)).toEqual([]); // one fell asleep
    expect(m.update(pair(PET_GREET_PX - 1), 50_300)).toEqual([0]); // awake again, still near: hello
  });
});

describe("PetFriends", () => {
  function world() {
    const show = vi.fn();
    const greet = vi.fn();
    const ella = { friendly: true, visible: true, x: 0, y: 0, greet };
    const pet = (texture: string, x: number) => ({ cat: { active: true, state: "idle", x, y: 0, texture: { key: texture } } });
    const catcat = pet(PETS.catcat.texture, 1000);
    const mittens = pet(PETS.mittens.texture, 1060);
    const stranger = pet("tiger", 20);
    const player = { x: 5000, y: 0, isResting: false };
    const scene = {
      dogs: [{ friendly: false, visible: true, x: 10, y: 0 }, ella],
      npcs: [catcat, mittens, stranger],
      player,
      emotes: { show },
      time: { now: 0 },
    };
    return { scene, show, greet, ella, catcat, mittens, player, friends: new PetFriends(scene as unknown as GameScene) };
  }

  it("has Cat cat and Mittens greet each other, and Ella greet them and Mamma Cat, but nobody else", () => {
    const w = world();
    w.friends.update();
    // the two cats, side by side: a heart each; Ella is far from them and from Mamma Cat
    expect(w.show.mock.calls.map((c) => c[1])).toEqual([w.catcat.cat, w.mittens.cat]);
    expect(w.greet).not.toHaveBeenCalled(); // the tiger-striped stranger next to her gets nothing

    w.show.mockClear();
    w.player.x = 60; // Mamma Cat walks up to Ella
    w.friends.update();
    expect(w.greet).toHaveBeenCalledWith(w.player, w.scene.emotes, w.scene);
    expect(w.show.mock.calls.map((c) => c[1])).toEqual([w.player]);

    w.ella.x = 1030; // Ella's walk takes her past the cats
    w.friends.update();
    expect(w.greet.mock.calls.map((c) => c[0])).toEqual([w.player, w.catcat.cat, w.mittens.cat]);
  });

  it("waits for a sleeping friend, and never greets Mamma Cat while she sleeps", () => {
    const w = world();
    w.mittens.cat.state = "sleeping";
    w.player.isResting = true;
    w.player.x = 60;
    w.friends.update();
    expect(w.show).not.toHaveBeenCalled();
    expect(w.greet).not.toHaveBeenCalled();
    w.mittens.cat.state = "idle";
    w.friends.update();
    expect(w.show.mock.calls.map((c) => c[1])).toEqual([w.catcat.cat, w.mittens.cat]);
  });
});
