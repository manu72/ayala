import Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import type { HumanNPC } from "../sprites/HumanNPC";
import { placeNamed, placesOfType, type Pt } from "../utils/mapPlaces";
import { fringeStarts, gatheringSlots } from "../utils/gathering";
import { mixSeed, seededRng } from "../utils/forage";
import type { NPCCat } from "../sprites/NPCCat";
import { StoryKeys } from "../registry/storyKeys";

/**
 * The secrets in docs/Ayala_Easter_Eggs.md: the Hidden Letter and the Stuffed Cat (carried in her
 * mouth to Camille / Kish), Pedigree's buried collar, the Balloon, the Hidden Kittens, the Sunset
 * Viewpoint, the Developer's Note, the Ghost of Mamma Cat's Past, Blacky's Midnight Story, the
 * Kittens Are Coming, and the Complete Colony Gathering before the last encounter. Each plays once
 * per save, never with a banner (easter egg principle 1), and never gates the story.
 */

export const EGGS_KEY = "EGGS";

const NAMED_CATS = ["Blacky", "Tiger", "Jayco", "Jayco Jr", "Fluffy", "Pedigree", "Ginger", "Ginger B"] as const;
const GATHERING_TRUST = 80;
/** Gathering cats further off than this appear this far away and walk the rest. */
const GATHER_WALK_PX = 240;
/** The fringe (every other cat she knows) appears further out, creeps in slowly, and stops once on the way. */
const FRINGE_WALK_PX = 260;
const FRINGE_WALK_SPEED = 22;
const NAMED_GAP_MS = 2200;
const FRINGE_FIRST_MS = 3500;
const FRINGE_SPREAD_MS = 13_000;
/** From the last cat setting off until the line: time to walk in and sit. */
const GATHER_SETTLE_MS = 14_000;
const GATHER_HOLD_MS = 7000;
/**
 * While they sit with her, strangers keep away: no crowd, joggers, guards, dog walkers or cats she
 * doesn't know within this of the gathering (wider than the pulled-back camera's view).
 */
const HUSH_RADIUS_PX = 480;
const HUSH_MS = 15 * 60_000;
/** Who may stay: the people of the story. */
const STORY_HUMANS: ReadonlySet<string> = new Set(["camille", "manu", "kish"]);
const BIRTH_TRUST = 50;
const BIRTH_CHANCE = 0.4;
const REACH_PX = 30;
const GIVE_PX = 56;
const KITTEN_FIND_PX = 56;
const KITTEN_SHOW_PX = 110;
const DIG_PRESSES = 3;
const DEV_NOTE_MS = 60_000;
const SUNSET_TILE_PX = 40;
const GHOST_TILE_PX = 30;
const STORY_HOURS: readonly [number, number] = [2.5, 3.5];
const MIDNIGHT: readonly [number, number] = [23.6, 0.4];

type Carry = "letter" | "plush";

interface State {
  letter: "hidden" | "carried" | "dropped" | "given";
  plush: "hidden" | "carried" | "dropped" | "given";
  letterAt?: Pt;
  plushAt?: Pt;
  kittens: number[];
  collar?: number;
  pedigreeThanked?: boolean;
  blackyStory?: boolean;
  balloon?: boolean;
  sunset?: boolean;
  devNote?: boolean;
  ghost?: boolean;
  birth?: number;
  gathered?: boolean;
}

const KITTEN_LINE = "You found a kitten hiding here. They're still too small to know you.";
const KITTEN_TEXTURES = ["fluffy", "tiger", "jayco", "blacky", "mammacat"];

const BLACKY_STORY = [
  "You're up too. I don't sleep at this hour any more.",
  "There was one before you. Grey, with a torn ear. She found me when I was small and stupid.",
  "She taught me the roads. Where the shade is. Which humans stop, and which don't.",
  "One night the dark-clothes humans came, and in the morning her place on the steps was empty.",
  "...Sleep by the shelters, new one. I'd rather not tell this story twice.",
];

const PEDIGREE_THANKS = [
  "You found it. That was hers. My friend's.",
  "She was old, and sick, and she couldn't see much at the end. I never left her side. Not once.",
  "Thank you. Leave it where it was. That's where she slept.",
];

function sanitize(raw: unknown): State {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const carryState = (v: unknown) => (v === "carried" || v === "dropped" || v === "given" ? v : "hidden");
  const pt = (v: unknown): Pt | undefined => {
    const p = v as Record<string, unknown> | undefined;
    return p && typeof p.x === "number" && typeof p.y === "number" ? { x: p.x, y: p.y } : undefined;
  };
  const flag = (v: unknown) => (v === true ? true : undefined);
  const day = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    // a save made mid-carry reloads with the item back where it lay (the sprite in her mouth isn't saved)
    letter: carryState(r.letter) === "carried" ? (pt(r.letterAt) ? "dropped" : "hidden") : carryState(r.letter),
    plush: carryState(r.plush) === "carried" ? (pt(r.plushAt) ? "dropped" : "hidden") : carryState(r.plush),
    letterAt: pt(r.letterAt),
    plushAt: pt(r.plushAt),
    kittens: Array.isArray(r.kittens) ? r.kittens.filter((n): n is number => Number.isInteger(n) && n >= 0) : [],
    collar: day(r.collar),
    pedigreeThanked: flag(r.pedigreeThanked),
    blackyStory: flag(r.blackyStory),
    balloon: flag(r.balloon),
    sunset: flag(r.sunset),
    devNote: flag(r.devNote),
    ghost: flag(r.ghost),
    birth: day(r.birth),
    gathered: flag(r.gathered),
  };
}

export class EasterEggSystem {
  private state: State;
  private carrying: Carry | null = null;
  private carryIcon: Phaser.GameObjects.Text | Phaser.GameObjects.Sprite | null = null;
  private birthMother: Phaser.GameObjects.Sprite | null = null;
  private letterProp: Phaser.GameObjects.Text | null = null;
  private plushProp: Phaser.GameObjects.Sprite | null = null;
  private kittens: Array<{ index: number; x: number; y: number; sprite: Phaser.GameObjects.Sprite }> = [];
  private collarDigs = 0;
  private collarGlyph: Phaser.GameObjects.Text | null = null;
  private balloon: { body: Phaser.GameObjects.Graphics; bob: number } | null = null;
  private stillMs = 0;
  private stillAt: Pt | null = null;
  private prevPhase: string;
  private ghostOn = false;
  private restWasOn = false;
  private gatheringUntil = 0;
  private hush: { x: number; y: number; r: number; until: number; guests: Set<NPCCat> } | null = null;
  private readonly hiddenCats = new Set<NPCCat>();
  private storyWoke = false;

  constructor(private readonly scene: GameScene) {
    this.state = sanitize(scene.registry.get(EGGS_KEY));
    this.prevPhase = scene.dayNight.currentPhase;
    this.placeProps();
    this.persist();
  }

  /** Camille's last encounter waits while the colony gathers. */
  get holdingEncounter(): boolean {
    return this.scene.time.now < this.gatheringUntil;
  }

  // ──────────── Space ────────────

  /** Space with no cat in reach: give, pick up, dig, bat, or set down. False when there's nothing here for it. */
  tryInteract(): boolean {
    const { player } = this.scene;
    const near = (p: Pt | undefined | null, r = REACH_PX) => !!p && Phaser.Math.Distance.Between(player.x, player.y, p.x, p.y) <= r;

    if (this.carrying === "letter") {
      const camille = this.scene.camille.activeCamilleNPC;
      if (camille?.visible && near(camille, GIVE_PX)) return this.giveLetter(camille), true;
    }
    if (this.carrying === "plush") {
      const kish = this.scene.camille.activeKishNPC;
      if (kish?.visible && near(kish, GIVE_PX)) return this.givePlush(kish), true;
    }
    if (!this.carrying) {
      if (this.state.letter !== "given" && this.state.letter !== "carried" && near(this.letterSpot())) return this.pickUp("letter"), true;
      if (this.state.plush !== "carried" && near(this.plushSpot())) return this.pickUp("plush"), true;
    }
    const collar = placeNamed(this.scene.places, "egg_collar");
    if (this.state.collar === undefined && near(collar)) return this.digCollar(collar!), true;
    const tree = placeNamed(this.scene.places, "egg_balloon_tree");
    if (!this.state.balloon && near(tree, 44)) return this.releaseBalloon(), true;
    if (this.carrying) return this.setDown(), true;
    return false;
  }

  /** Lines a named cat has for her right now from an egg (Blacky at 3am, Pedigree after the collar). */
  takeCatLines(catName: string): string[] | null {
    const h = this.scene.sunday.hour();
    if (catName === "Blacky" && !this.state.blackyStory && h >= STORY_HOURS[0] && h < STORY_HOURS[1]) {
      this.state.blackyStory = true;
      this.persist();
      return BLACKY_STORY;
    }
    if (catName === "Pedigree" && this.state.collar !== undefined && !this.state.pedigreeThanked) {
      this.state.pedigreeThanked = true;
      this.persist();
      return PEDIGREE_THANKS;
    }
    return null;
  }

  /** For the Journal: hidden kittens found so far, and how many there are. */
  kittenCount(): { found: number; total: number } {
    return { found: this.state.kittens.length, total: placesOfType(this.scene.places, "egg_kitten").length };
  }

  // ──────────── per frame ────────────

  update(time: number, delta: number): void {
    const { player, dayNight } = this.scene;
    if (!player?.active) return;
    const phase = dayNight.currentPhase;
    const h = this.scene.sunday.hour();

    if (this.carryIcon) this.carryIcon.setPosition(player.x + (player.flipX ? -9 : 9), player.y + 2);
    this.tickKittens();
    this.tickCollarGlyph();
    this.tickBalloon(delta);

    const body = player.body as Phaser.Physics.Arcade.Body | null;
    const still = (body?.velocity.length() ?? 1) < 1;
    if (still && this.stillAt && Phaser.Math.Distance.Between(player.x, player.y, this.stillAt.x, this.stillAt.y) < 4) this.stillMs += delta;
    else {
      this.stillMs = 0;
      this.stillAt = { x: player.x, y: player.y };
    }

    // The Sunset Viewpoint: on the pyramid steps as evening turns to night
    if (!this.state.sunset && this.prevPhase === "evening" && phase === "night" && this.at("poi_pyramid_steps", SUNSET_TILE_PX)) this.sunset();
    this.prevPhase = phase;

    // The Developer's Note: a full minute of stillness in the quiet corner
    if (!this.state.devNote && this.stillMs >= DEV_NOTE_MS && this.atPlace("egg_dev_corner", 40)) {
      this.state.devNote = true;
      this.persist();
      this.narrate("Made with love for Cam. For every cat we've ever fed. For Mamma Cat.");
    }

    // The Ghost of Mamma Cat's Past: sitting at the fountain's edge at midnight
    const midnight = h >= MIDNIGHT[0] || h < MIDNIGHT[1];
    if (!this.state.ghost && !this.ghostOn && midnight && this.stillMs > 1200 && this.atPlace("egg_ghost", GHOST_TILE_PX)) this.ghost();

    // Blacky's Midnight Story: he's awake at 3am
    if (!this.state.blackyStory && h >= STORY_HOURS[0] && h < STORY_HOURS[1]) {
      const blacky = this.scene.npcs.find((e) => e.cat.npcName === "Blacky")?.cat;
      if (blacky && blacky.state === "sleeping" && !this.storyWoke) {
        this.storyWoke = true;
        blacky.triggerAlert();
      }
    } else this.storyWoke = false;

    // The Kittens Are Coming: resting by the hidden bush, once, when the colony trusts her
    if (player.isResting && !this.restWasOn && this.state.birth === undefined) {
      if (this.atPlace("egg_birth", 56) && this.scene.trust.global >= BIRTH_TRUST && Math.random() < BIRTH_CHANCE) this.birth();
    }
    this.restWasOn = player.isResting;

    this.tickHush(time);

    // The Complete Colony Gathering: before the last encounter, if every named cat loves her
    if (!this.state.gathered && this.scene.camille.pendingEncounterNumber === 5 && phase === "evening") {
      if (NAMED_CATS.every((n) => this.scene.trust.getCatTrust(n) >= GATHERING_TRUST)) this.gather(time);
    }
  }

  // ──────────── the eggs ────────────

  private pickUp(item: Carry): void {
    const { player } = this.scene;
    this.carrying = item;
    if (item === "letter") {
      this.state.letter = "carried";
      this.letterProp?.destroy();
      this.letterProp = null;
      this.carryIcon = this.scene.add.text(player.x, player.y, "✉", { fontSize: "9px", color: "#f6f0d8", stroke: "#3a2a1a", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(6);
      this.float(player.x, player.y - 24, this.state.letterAt ? "The letter again." : "A folded piece of paper. It smells of someone kind.");
    } else {
      this.state.plush = "carried";
      this.plushProp?.destroy();
      this.plushProp = null;
      this.carryIcon = this.plushSprite(player.x, player.y).setDepth(6);
      this.float(player.x, player.y - 24, "A tiny stuffed cat! Somebody's lost plushie.");
    }
    player.startGreeting();
    this.persist();
  }

  private setDown(): void {
    const { player } = this.scene;
    const at = { x: player.x, y: player.y + 6 };
    if (this.carrying === "letter") {
      this.state.letter = "dropped";
      this.state.letterAt = at;
    } else if (this.carrying === "plush") {
      this.state.plush = "dropped";
      this.state.plushAt = at;
      if (this.at("poi_pyramid_steps", 220)) this.float(at.x, at.y - 20, "The little cat keeps watch on your steps now.");
      else if (this.at("poi_playground", 220)) this.float(at.x, at.y - 20, "Back on the playground, for the next kid to find.");
    }
    this.carryIcon?.destroy();
    this.carryIcon = null;
    this.carrying = null;
    this.placeProps();
    this.persist();
  }

  private giveLetter(camille: HumanNPC): void {
    const { player } = this.scene;
    player.faceToward(camille.x, camille.y);
    this.carrying = null;
    this.carryIcon?.destroy();
    this.carryIcon = null;
    this.state.letter = "given";
    this.persist();
    const cam = this.scene.cameras.main;
    const card = this.scene.add.container(cam.width / 2, cam.height / 2 - 40).setScrollFactor(0).setDepth(450).setAlpha(0);
    const dim = this.scene.add.rectangle(0, 40, cam.width * 2, cam.height * 2, 0x000000, 0.55);
    const paper = this.scene.add.rectangle(0, 0, 220, 130, 0xf6efdc).setStrokeStyle(2, 0xc8b89a);
    const fold = this.scene.add.rectangle(0, 0, 220, 1, 0xd8c8a8);
    const words = this.scene.add.text(0, -4, "nom noms", { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "26px", fontStyle: "italic", color: "#3a2a5a", resolution: 2 }).setOrigin(0.5);
    card.add([dim, paper, fold, words]);
    this.scene.tweens.add({ targets: card, alpha: 1, duration: 600 });
    this.scene.dialogue.show(["Camille unfolds the paper. She reads it once, and laughs, and reads it again.", "\"nom noms\"", "She holds it to her chest for a long moment."], () => {
      this.scene.tweens.add({ targets: card, alpha: 0, duration: 500, onComplete: () => card.destroy() });
      this.scene.autoSave();
    });
  }

  private givePlush(kish: HumanNPC): void {
    const { player, humans } = this.scene;
    player.faceToward(kish.x, kish.y);
    this.carrying = null;
    this.carryIcon?.destroy();
    this.carryIcon = null;
    this.state.plush = "given";
    // Kish puts it back where its owner will look for it
    const spot = placeNamed(this.scene.places, "egg_plush");
    this.state.plushAt = spot ? { x: spot.x, y: spot.y } : undefined;
    this.persist();
    humans.renderHumanBubble(kish, "OMG it's a TINY cat! Can we keep it?");
    const camille = this.scene.camille.activeCamilleNPC;
    if (camille?.visible) {
      this.scene.time.delayedCall(2600, () => {
        if (camille.active) humans.renderHumanBubble(camille, "It belongs to some other kid, Kish. Let's put it back where they'll find it.");
      });
    }
    this.scene.time.delayedCall(5000, () => this.placeProps());
  }

  private digCollar(collar: Pt): void {
    const { player } = this.scene;
    player.faceToward(collar.x, collar.y);
    player.startGreeting();
    this.collarDigs += 1;
    if (this.collarDigs < DIG_PRESSES) {
      this.float(collar.x, collar.y - 10, this.collarDigs === 1 ? "dig…" : "dig, dig…", "#c8a070");
      return;
    }
    this.state.collar = this.scene.dayNight.dayCount;
    this.collarGlyph?.destroy();
    this.collarGlyph = null;
    this.persist();
    this.scene.dialogue.show(["An old collar, the leather gone soft. A little bell, and a tag worn smooth.", "The name on the tag is faded. But someone called her this, once. Before they left."]);
  }

  private releaseBalloon(): void {
    const b = this.balloon;
    this.state.balloon = true;
    this.persist();
    this.scene.player.startGreeting();
    if (!b) return;
    this.balloon = null;
    const reduced = this.scene.registry.get("MOTION_REDUCED") === true;
    this.scene.tweens.add({ targets: b.body, y: b.body.y - 420, x: b.body.x + 60, alpha: 0, duration: reduced ? 1500 : 7000, ease: "Sine.easeIn", onComplete: () => b.body.destroy() });
    const kish = this.scene.camille.activeKishNPC;
    if (kish?.visible && Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, kish.x, kish.y) < 320) {
      this.scene.humans.renderHumanBubble(kish, "Oh! There's a balloon! Bye balloon!");
    } else this.float(this.scene.player.x, this.scene.player.y - 24, "Pop! No. It floats away, up and up.");
  }

  private sunset(): void {
    this.state.sunset = true;
    this.persist();
    const scene = this.scene;
    const cam = scene.cameras.main;
    const zoom = cam.zoom;
    cam.zoomTo(Math.max(1.2, zoom * 0.55), 1600, "Sine.easeInOut", true);
    const w = cam.width;
    const g = scene.add.graphics().setScrollFactor(0).setDepth(420).setAlpha(0);
    const horizon = cam.height * 0.42;
    g.fillGradientStyle(0x2a1a4a, 0x2a1a4a, 0xff8a3d, 0xffb35c, 0.95);
    g.fillRect(0, 0, w, horizon);
    g.fillStyle(0x0d0a14, 1);
    // the Makati skyline against the last light
    let x = 0;
    const rng = new Phaser.Math.RandomDataGenerator(["makati"]);
    while (x < w) {
      const bw = rng.between(18, 46);
      const bh = rng.between(30, Math.round(horizon * 0.8));
      g.fillRect(x, horizon - bh, bw, bh);
      if (rng.frac() < 0.3) g.fillRect(x + bw / 2 - 1, horizon - bh - 10, 2, 10); // a mast
      x += bw + rng.between(0, 6);
    }
    g.fillGradientStyle(0x0d0a14, 0x0d0a14, 0x0d0a14, 0x0d0a14, 1, 1, 0, 0);
    g.fillRect(0, horizon, w, cam.height * 0.12);
    scene.tweens.add({
      targets: g,
      alpha: 0.92,
      duration: 1800,
      yoyo: true,
      hold: 4200,
      onComplete: () => g.destroy(),
    });
    scene.time.delayedCall(1400, () => this.narrate("You will remember this."));
    scene.time.delayedCall(7800, () => cam.zoomTo(zoom, 1400, "Sine.easeInOut", true));
    scene.autoSave();
  }

  private ghost(): void {
    this.ghostOn = true;
    const scene = this.scene;
    const { player } = scene;
    // the reflection lies in the nearest water, a step or two from her tile
    const ts = scene.map.tileWidth;
    const px = Math.floor(player.x / ts);
    const py = Math.floor(player.y / ts);
    let best: Pt | null = null;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        if (!scene.isWaterAt(px + dx, py + dy)) continue;
        const c = { x: (px + dx) * ts + ts / 2, y: (py + dy) * ts + ts / 2 };
        if (!best || Phaser.Math.Distance.Between(player.x, player.y, c.x, c.y) < Phaser.Math.Distance.Between(player.x, player.y, best.x, best.y)) best = c;
      }
    if (!best) {
      this.ghostOn = false;
      return;
    }
    const rx = best.x;
    const ry = best.y;
    const self = scene.add.sprite(rx, ry, player.texture.key, player.frame.name).setScale(player.scaleX, -player.scaleY).setTint(0x9fb8d8).setAlpha(0).setDepth(2);
    const kitten = scene.add.sprite(rx + 18, ry + 2, "mammacat", 0).setScale(0.55, -0.55).setTint(0xc8d8f0).setAlpha(0).setDepth(2);
    scene.tweens.add({ targets: [self, kitten], alpha: { from: 0, to: 0.42 }, duration: 2200, yoyo: true, hold: 6000, onComplete: () => {
      self.destroy();
      kitten.destroy();
      this.ghostOn = false;
    } });
    scene.time.delayedCall(2600, () => this.narrate("You don't remember being that small. But something in you does."));
    this.state.ghost = true;
    this.persist();
  }

  private birth(): void {
    const scene = this.scene;
    this.state.birth = scene.dayNight.dayCount;
    this.persist();
    const spot = placeNamed(scene.places, "egg_birth")!;
    const mother = this.catSprite("tiger", spot.x - 14, spot.y - 4, 0.95).setAlpha(0);
    scene.tweens.add({ targets: mother, alpha: 1, duration: 1800 });
    scene.time.delayedCall(4000, () => {
      scene.cameras.main.fadeOut(1400, 0, 0, 0);
      scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.spawnLitter(spot);
        scene.cameras.main.fadeIn(1800, 0, 0, 0);
        scene.time.delayedCall(1200, () => this.narrate("Life goes on here. Even now. Even with all this."));
      });
    });
    this.birthMother = mother;
  }

  private spawnLitter(spot: Pt): void {
    if (!this.birthMother) this.birthMother = this.catSprite("tiger", spot.x - 14, spot.y - 4, 0.95);
    [[-2, 8], [6, 10], [12, 6]].forEach(([dx, dy], i) => this.catSprite(KITTEN_TEXTURES[i % KITTEN_TEXTURES.length]!, spot.x + dx!, spot.y + dy!, 0.45));
  }

  private gather(time: number): void {
    this.state.gathered = true;
    this.persist();
    const scene = this.scene;
    const { player } = scene;
    const centre = { x: player.x, y: player.y };
    const named = NAMED_CATS.map((n) => scene.npcs.find((e) => e.cat.npcName === n)?.cat).filter((c): c is NonNullable<typeof c> => !!c?.active);
    // every other cat she knows by name: the colony she greeted, Cat cat and Mittens, settled newcomers, the street cats
    const fringe = scene.npcs.map((e) => e.cat).filter((c) => c.active && !named.includes(c) && scene.colony.knowsCat(c));
    const rng = seededRng(mixSeed(scene.dayNight.dayCount, 5150));
    const slots = gatheringSlots(centre, named.length, fringe.length, rng);
    this.hush = { ...centre, r: HUSH_RADIUS_PX, until: time + HUSH_MS, guests: new Set([...named, ...fringe]) };
    scene.hushCrowd(this.hush);
    const lastNamedMs = (named.length - 1) * NAMED_GAP_MS;
    const fringeAt = fringeStarts(fringe.length, FRINGE_FIRST_MS, FRINGE_SPREAD_MS, rng);
    const settledMs = Math.max(lastNamedMs, fringeAt[fringeAt.length - 1] ?? 0) + GATHER_SETTLE_MS;
    this.gatheringUntil = time + settledMs + GATHER_HOLD_MS;

    // no names, no moods over anyone: just the cats
    for (const e of scene.npcs) if (named.includes(e.cat) || fringe.includes(e.cat)) e.indicator.setHidden(true);
    named.forEach((cat, i) => scene.time.delayedCall(i * NAMED_GAP_MS, () => this.comeTo(cat, slots.inner[i]!, centre, GATHER_WALK_PX)));
    // the rest come slowly, almost shyly: from further off, at a creep, stopping once on the way to look at her
    fringe.forEach((cat, i) =>
      scene.time.delayedCall(fringeAt[i]!, () => {
        cat.setManner(FRINGE_WALK_SPEED);
        this.comeTo(cat, slots.fringe[i]!, centre, FRINGE_WALK_PX, 1200 + rng() * 2000);
      }),
    );

    const cam = scene.cameras.main;
    const zoom = cam.zoom;
    scene.time.delayedCall(settledMs, () => {
      // wide enough to take in the fringe, so she can see them all
      cam.zoomTo(Math.max(fringe.length > 0 ? 1.05 : 1.4, zoom * (fringe.length > 0 ? 0.42 : 0.6)), 2400, "Sine.easeInOut", true);
      this.narrate("They came. All of them. To say goodbye.");
      scene.time.delayedCall(GATHER_HOLD_MS, () => cam.zoomTo(zoom, 2000, "Sine.easeInOut", true));
    });
  }

  /**
   * Strangers keep away from the gathering until it's over (the last encounter done, or the cats
   * get up again): the crowd and guards (via the crowd system), anyone who isn't Camille, Manu or
   * Kish, and any cat that isn't one of her guests.
   */
  private tickHush(time: number): void {
    const h = this.hush;
    if (!h) return;
    const scene = this.scene;
    const over = time > h.until || scene.registry.get(StoryKeys.ENCOUNTER_5_COMPLETE) === true;
    const inside = (o: { x: number; y: number }) => !over && (o.x - h.x) ** 2 + (o.y - h.y) ** 2 < h.r * h.r;
    for (const human of scene.humans.humans) human.setHushed(!STORY_HUMANS.has(human.humanType) && inside(human));
    for (const { cat, indicator } of scene.npcs) {
      if (h.guests.has(cat)) continue;
      const hide = inside(cat);
      if (hide && !this.hiddenCats.has(cat)) {
        this.hiddenCats.add(cat);
        cat.setVisible(false);
        indicator.setHidden(true);
      } else if (!hide && this.hiddenCats.has(cat)) {
        this.hiddenCats.delete(cat);
        cat.setVisible(true);
        indicator.setHidden(false);
      }
    }
    if (over) {
      scene.hushCrowd(null);
      this.hush = null;
    }
  }

  /**
   * One cat comes to its place round her and sits there facing her. From far off it appears `walkPx`
   * away and walks the rest; with `pauseMs` it stops halfway to look at her first.
   */
  private comeTo(cat: NPCCat, slot: Pt, centre: Pt, walkPx: number, pauseMs = 0): void {
    const scene = this.scene;
    const sit = () => {
      cat.setHome(slot.x, slot.y, 6);
      // if the story moves on without them, they get up again in the end, names and all
      cat.drink(centre, 15 * 60_000, () => scene.npcs.find((e) => e.cat === cat)?.indicator.setHidden(false));
    };
    const fadeIn = () => {
      cat.setAlpha(0);
      scene.tweens.add({ targets: cat, alpha: 1, duration: 1600 });
    };
    if (Phaser.Math.Distance.Between(cat.x, cat.y, slot.x, slot.y) > walkPx) {
      const a = Phaser.Math.Angle.Between(slot.x, slot.y, cat.x, cat.y);
      const entry = { x: slot.x + Math.cos(a) * walkPx, y: slot.y + Math.sin(a) * walkPx };
      if (scene.isInPark(entry.x, entry.y)) cat.setPosition(entry.x, entry.y);
      else cat.setPosition(slot.x, slot.y);
      fadeIn();
    }
    const walk = () => {
      const route = scene.catRoute(cat, slot);
      if (route) cat.followRoute(route, sit);
      else {
        cat.setPosition(slot.x, slot.y);
        sit();
      }
    };
    if (pauseMs <= 0) return walk();
    const mid = { x: (cat.x + slot.x) / 2, y: (cat.y + slot.y) / 2 };
    const toMid = scene.catRoute(cat, mid);
    if (!toMid) return walk();
    cat.followRoute(toMid, () => cat.drink(centre, pauseMs, walk));
  }

  // ──────────── props ────────────

  private placeProps(): void {
    const scene = this.scene;
    this.letterProp?.destroy();
    this.letterProp = null;
    this.plushProp?.destroy();
    this.plushProp = null;
    const letter = this.letterSpot();
    if (letter && this.state.letter !== "carried" && this.state.letter !== "given") {
      this.letterProp = scene.add.text(letter.x, letter.y, "✉", { fontSize: "8px", color: "#f6f0d8", stroke: "#3a2a1a", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(2.5).setAngle(-12);
    }
    const plush = this.plushSpot();
    if (plush && this.state.plush !== "carried") this.plushProp = this.plushSprite(plush.x, plush.y).setDepth(2.5);

    if (this.kittens.length === 0) {
      placesOfType(scene.places, "egg_kitten").forEach((p, i) => {
        const sprite = this.catSprite(KITTEN_TEXTURES[i % KITTEN_TEXTURES.length]!, p.x, p.y, 0.45).setAlpha(this.state.kittens.includes(i) ? 0.9 : 0);
        this.kittens.push({ index: i, x: p.x, y: p.y, sprite });
      });
    }
    if (!this.state.balloon && !this.balloon) {
      const tree = placeNamed(scene.places, "egg_balloon_tree");
      if (tree) {
        const g = scene.add.graphics({ x: tree.x + 6, y: tree.y - 30 }).setDepth(11);
        g.lineStyle(1, 0xf0f0f0, 0.9).lineBetween(0, 7, 2, 22);
        g.fillStyle(0xe8443a).fillEllipse(0, 0, 11, 13);
        g.fillStyle(0xffffff, 0.6).fillCircle(-2, -3, 1.6);
        this.balloon = { body: g, bob: 0 };
      }
    }
    if (this.state.birth !== undefined && !this.birthMother) {
      const spot = placeNamed(scene.places, "egg_birth");
      if (spot) this.spawnLitter(spot);
    }
  }

  private tickKittens(): void {
    const { player } = this.scene;
    for (const k of this.kittens) {
      const d = Phaser.Math.Distance.Between(player.x, player.y, k.x, k.y);
      if (this.state.kittens.includes(k.index)) continue;
      // hidden until she's close: a pair of eyes in the leaves, then a kitten
      k.sprite.setAlpha(Phaser.Math.Clamp((KITTEN_SHOW_PX - d) / (KITTEN_SHOW_PX - KITTEN_FIND_PX), 0, 0.9));
      if (d <= KITTEN_FIND_PX) {
        this.state.kittens.push(k.index);
        this.persist();
        this.scene.audio.playKitten();
        this.scene.emotes.show(this.scene, k.sprite, "curious");
        this.float(k.x, k.y - 18, KITTEN_LINE);
      }
    }
  }

  private tickCollarGlyph(): void {
    const collar = placeNamed(this.scene.places, "egg_collar");
    if (!collar || this.state.collar !== undefined) return;
    const near = Phaser.Math.Distance.Between(this.scene.player.x, this.scene.player.y, collar.x, collar.y) < 70;
    if (near && !this.collarGlyph) {
      this.collarGlyph = this.scene.add.text(collar.x, collar.y, "∴", { fontSize: "11px", color: "#c8a070", stroke: "#000000", strokeThickness: 2, resolution: 2 }).setOrigin(0.5).setDepth(12);
    } else if (!near && this.collarGlyph) {
      this.collarGlyph.destroy();
      this.collarGlyph = null;
      this.collarDigs = 0;
    }
  }

  private tickBalloon(delta: number): void {
    if (!this.balloon || this.scene.registry.get("MOTION_REDUCED") === true) return;
    this.balloon.bob += delta / 900;
    this.balloon.body.setAngle(Math.sin(this.balloon.bob) * 6);
  }

  // ──────────── helpers ────────────

  private letterSpot(): Pt | null {
    if (this.state.letterAt) return this.state.letterAt;
    return placeNamed(this.scene.places, "egg_letter") ?? null;
  }

  private plushSpot(): Pt | null {
    if (this.state.plushAt) return this.state.plushAt;
    return placeNamed(this.scene.places, "egg_plush") ?? null;
  }

  private plushSprite(x: number, y: number): Phaser.GameObjects.Sprite {
    return this.scene.add.sprite(x, y, "fluffy", 0).setScale(0.32).setTint(0xf2b8d0);
  }

  private catSprite(texture: string, x: number, y: number, scale: number): Phaser.GameObjects.Sprite {
    const s = this.scene.add.sprite(x, y, texture, 0).setScale(scale).setDepth(2.6);
    if (this.scene.anims.exists(`${texture}-sit-down`)) s.play(`${texture}-sit-down`);
    return s;
  }

  private at(spawnName: string, r: number): boolean {
    const o = this.scene.map.findObject("spawns", (s) => s.name === spawnName);
    const { player } = this.scene;
    return !!o && Phaser.Math.Distance.Between(player.x, player.y, o.x ?? 0, o.y ?? 0) <= r;
  }

  private atPlace(name: string, r: number): boolean {
    const p = placeNamed(this.scene.places, name);
    const { player } = this.scene;
    return !!p && Phaser.Math.Distance.Between(player.x, player.y, p.x, p.y) <= r;
  }

  private float(x: number, y: number, text: string, color = "#f6f0d8"): void {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: "9px", fontStyle: "bold", color, stroke: "#000000", strokeThickness: 2, align: "center", wordWrap: { width: 170 }, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(100);
    this.scene.tweens.add({ targets: t, alpha: 0, y: y - 14, delay: 2200, duration: 900, onComplete: () => t.destroy() });
  }

  private narrate(line: string): void {
    (this.scene.scene.get("HUDScene") as HUDScene | undefined)?.showNarration(line);
  }

  private persist(): void {
    this.scene.registry.set(EGGS_KEY, { ...this.state, kittens: [...this.state.kittens] });
  }
}
