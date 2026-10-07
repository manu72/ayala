import type { GameScene } from "../scenes/GameScene";
import { PETS } from "../data/pets";

type Pt = { x: number; y: number };

/** Friends greet when they come this close... */
export const PET_GREET_PX = 128;
/** ...after being this far apart since their last hello... */
export const PET_PART_PX = 192;
/** ...or, staying together (Cat cat and Mittens share a home), every so often. */
export const PET_REGREET_MS = 45_000;

/**
 * Which pairs of friends greet now: just met (closer than PET_GREET_PX after
 * being apart), or together long enough to say hello again. A pair with a
 * member missing (asleep, out of sight) counts as apart, so they greet as soon
 * as both can.
 */
export class Meetings {
  private readonly lastGreet = new Map<number, number>();

  update(pairs: ReadonlyArray<readonly [Pt | null, Pt | null]>, now: number): number[] {
    const greet: number[] = [];
    pairs.forEach(([a, b], i) => {
      const d = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
      const last = this.lastGreet.get(i);
      if (d > PET_PART_PX) {
        this.lastGreet.delete(i);
      } else if (d < PET_GREET_PX && (last === undefined || now - last >= PET_REGREET_MS)) {
        this.lastGreet.set(i, now);
        greet.push(i);
      }
    });
    return greet;
  }
}

/**
 * Ella (the long-haired dachshund, on her walker's leash), Cat cat and Mittens
 * know each other: whenever two of them are near, they greet (hearts, and Ella
 * tugs toward her friend). Ella greets Mamma Cat too, and the two cats are
 * friendly to her from the start (ColonyDynamicsSystem).
 */
export class PetFriends {
  private readonly meetings = new Meetings();

  constructor(private readonly scene: GameScene) {}

  update(): void {
    const s = this.scene;
    const ella = s.dogs.find((d) => d.friendly && d.visible) ?? null;
    const cat = (texture: string) => {
      const c = s.npcs.find((e) => e.cat.active && e.cat.texture.key === texture)?.cat;
      return c && c.state !== "sleeping" && c.state !== "fleeing" ? c : null;
    };
    const catcat = cat(PETS.catcat.texture);
    const mittens = cat(PETS.mittens.texture);
    const mamma = s.player.isResting ? null : s.player;
    const pairs = [
      [ella, catcat],
      [ella, mittens],
      [catcat, mittens],
      [ella, mamma],
    ] as const;
    for (const i of this.meetings.update(pairs, s.time.now)) {
      const [a, b] = pairs[i]!;
      if (!a || !b) continue;
      if (a === ella) ella.greet(b, s.emotes, s);
      else s.emotes.show(s, a, "heart");
      s.emotes.show(s, b, "heart");
    }
  }
}
