import Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { GuardNPC } from "../sprites/GuardNPC";
import { placesOfType } from "../utils/mapPlaces";

export const CURIOSITY_KEY = "CURIOSITY";

const WINDOW_PX = 34;
const WINDOW_TELL_PX = 220;
const TALE_PX = 64;
const TALE_SIT_MS = 2200;
/** A guard tells one tale every this many in-game days at most. */
const TALE_EVERY_DAYS = 2;
/** The shop's box: day 0 breathing, 1 kittens, 2 tumbling, 3 rescued. */
const SHOP_STAGES = 3;

interface State {
  /** Rumour id → in-game day heard. */
  heard: Record<string, number>;
  /** Payoffs: zombies (day first seen), shop (day the tabby rumour started the clock), shopDone. */
  zombies?: number;
  shop?: number;
  shopDone?: number;
  /** Guard tales told (indices into TALES) and the day of the last one. */
  tales: number[];
  taleDay: number;
}

interface Rumour {
  id: string;
  cat: string;
  when: (s: State, day: number) => boolean;
  lines: string[];
  /** After it's heard (the loop opens, or a payoff lands). */
  then?: (s: State, day: number) => void;
}

/** Set by each cat's first conversation (CatDialogueController): a rumour never replaces a first meeting. */
const TALKED: Record<string, string> = { Blacky: "MET_BLACKY", Tiger: "TIGER_TALKS", Jayco: "JAYCO_TALKS" };

const RUMOURS: readonly Rumour[] = [
  // D1: "stay away from the other side of the road" → the zombies across Makati Ave
  {
    id: "d1_warn",
    cat: "Blacky",
    when: (s, day) => day >= 2 && s.zombies === undefined,
    lines: [
      "The big road east. Makati. Don't cross it.",
      "Cats who go over come back jumpy. They say the humans there walk wrong.",
    ],
  },
  {
    id: "d1_jayco",
    cat: "Jayco",
    when: (s) => s.heard.d1_warn !== undefined && s.zombies === undefined,
    lines: [
      "Walk wrong? ZOMBIES. Office zombies. I saw one eat a sandwich. Slowly. For an hour.",
      "If you're mad enough to go, go when the big road sleeps. Deep night, hardly a car.",
      "...But that's when the dark-clothes humans walk. So. Don't.",
    ],
  },
  {
    id: "d1_after_blacky",
    cat: "Blacky",
    when: (s) => s.zombies !== undefined,
    lines: ["You went. Of course you did.", "The cars stopped for you. They don't always stop for us."],
  },
  {
    id: "d1_after_jayco",
    cat: "Jayco",
    when: (s) => s.zombies !== undefined,
    lines: ["You WENT? ...Did they groan? They groan, right? I KNEW it."],
  },
  // D4: the locked door with a view: a tabby keeps slipping into the empty shop
  {
    id: "d4_tiger",
    cat: "Tiger",
    when: (_s, day) => day >= 2,
    lines: [
      "A fat tabby keeps squeezing under the door of the empty shop by the restaurants.",
      "On MY patch. Go and look, if you're so curious. Glass doesn't bite.",
    ],
    then: (s, day) => {
      s.shop ??= day;
    },
  },
  {
    id: "d4_after_tiger",
    cat: "Tiger",
    when: (s) => s.shopDone !== undefined,
    lines: ["Kittens? In a SHOP? ...Good. Safer than my patch."],
  },
];

/** What she sees through the empty shop's glass, by days since the tabby moved in. */
const SHOP_VIEWS: readonly string[][] = [
  ["Through the dusty glass: an empty shop, a stack of chairs, a cardboard box in the corner.", "The box is breathing."],
  ["Tiny mews from the box. Kittens! Four of them, eyes still shut.", "The tabby lifts her head and looks straight at you through the glass. She doesn't hiss."],
  ["The kittens tumble over each other like socks in a dryer.", "One of them has found the box flap and is VERY proud of it."],
  [
    "The box is empty. A note is taped to the inside of the glass:",
    "\"Mama and her kittens are safe with us. Thank you to whoever kept an eye on them! — ATG cat volunteers\"",
  ],
];

/** Friendly guards' stories: funny, sad, and a couple that open other questions. */
const TALES: readonly string[][] = [
  [
    "The guard crouches beside you. \"Psst, pusa. Want to hear something?\"",
    "\"This morning a tourist asked me where Ayala Triangle is. I said, 'Ma'am, you're standing in it.'\"",
    "\"She took a selfie with me anyway. Five takes.\"",
  ],
  [
    "The guard sits on his heels and looks at the fountain for a while.",
    "\"My Lola had a cat like you. Black and white. She called him Puti, even though he was mostly black.\"",
    "\"He waited at the gate every night for her jeepney. ...He kept waiting, after.\"",
  ],
  [
    "\"Pusa. Yesterday a man in a full suit tried to jog. Leather shoes. The whole triangle.\"",
    "\"He finished. I clapped. Nobody else clapped.\"",
  ],
  [
    "\"The volunteers came round with kibble again. Rose knows all your names, you know.\"",
    "\"She says you're new. Don't worry. Everyone here was new once. Even me. Twelve years on this post.\"",
  ],
  [
    "The guard lowers his voice. \"Night shift tip, pusa: the people across Makati Avenue? Not my jurisdiction.\"",
    "\"Very slow. Very rude. They never say good evening.\"",
  ],
  [
    "The guard turns his cap round in his hands.",
    "\"My daughter's a nurse in Dubai. We video call at eleven, when her shift ends.\"",
    "\"She asked what I do all night. I said I guard cats.\"",
  ],
  [
    "\"Lunch hour, a pigeon stole a whole siopao from an intern. Whole. He just watched it fly away.\"",
    "\"Respect. That pigeon has a career.\"",
  ],
  [
    "\"The old ones say a kapre lives in the biggest tree here. Sits up top at night, smoking a cigar.\"",
    "\"Me? I don't believe it.\" He glances up. \"...I don't walk under that tree after midnight, though.\"",
  ],
];

function sanitize(raw: unknown): State {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const heard: Record<string, number> = {};
  if (typeof r.heard === "object" && r.heard !== null)
    for (const [k, v] of Object.entries(r.heard)) if (typeof v === "number" && RUMOURS.some((x) => x.id === k)) heard[k] = v;
  return {
    heard,
    zombies: num(r.zombies),
    shop: num(r.shop),
    shopDone: num(r.shopDone),
    tales: Array.isArray(r.tales) ? r.tales.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < TALES.length) : [],
    taleDay: num(r.taleDay) ?? -Infinity,
  };
}

/**
 * Curiosity loops on the game's own ground: cats pass on rumours that point at real places (the
 * humans who walk wrong across Makati Ave; a tabby slipping into the empty shop on restaurant row),
 * the glass of that shop shows a little more each day, friendly guards tell a tale to a cat who sits
 * with them, and the Journal keeps the questions she hasn't answered yet.
 */
export class CuriositySystem {
  private state: State;
  private sitMs = 0;
  private windowTell: Phaser.GameObjects.Text | null = null;

  constructor(private readonly scene: GameScene) {
    this.state = sanitize(scene.registry.get(CURIOSITY_KEY));
  }

  get zombiesSeen(): boolean {
    return this.state.zombies !== undefined;
  }

  /** The zombie scare was really seen (the narration showed): pay off "the other side". */
  markZombiesSeen(): void {
    if (this.state.zombies !== undefined) return;
    this.state.zombies = this.scene.dayNight.dayCount;
    this.persist();
  }

  /**
   * A rumour this cat has for her right now, if any: it takes this Space press (her usual
   * conversation is the next one) and never touches trust.
   */
  takeRumour(catName: string): string[] | null {
    const day = this.scene.dayNight.dayCount;
    const talkedKey = TALKED[catName];
    if (!talkedKey || !this.scene.registry.get(talkedKey)) return null;
    const r = RUMOURS.find((x) => x.cat === catName && this.state.heard[x.id] === undefined && x.when(this.state, day));
    if (!r) return null;
    this.state.heard[r.id] = day;
    r.then?.(this.state, day);
    this.persist();
    return r.lines;
  }

  /** Space at the empty shop's glass. False when she isn't there. */
  tryWindow(): boolean {
    const w = placesOfType(this.scene.places, "shop_window")[0];
    const { player, dayNight } = this.scene;
    if (!w || Phaser.Math.Distance.Between(player.x, player.y, w.x, w.y) > WINDOW_PX) return false;
    player.faceToward(w.x, w.y - 16);
    const day = dayNight.dayCount;
    if (this.state.shop === undefined) {
      // before the rumour she sees only the box, and the clock starts anyway
      this.state.shop = day;
      this.state.heard.d4_tiger ??= day;
    }
    const stage = Math.min(SHOP_STAGES, day - this.state.shop);
    const lines = SHOP_VIEWS[stage] ?? SHOP_VIEWS[0]!;
    if (stage === SHOP_STAGES && this.state.shopDone === undefined) {
      this.state.shopDone = day;
      this.scene.scoring.recordFind(150);
    }
    if (stage === 1) this.scene.audio.playKitten();
    this.persist();
    this.scene.dialogue.show(lines);
    return true;
  }

  update(delta: number): void {
    this.tickWindowTell();
    this.tickTales(delta);
  }

  /** For the Journal: open questions ("?") and answered ones. */
  wonders(): Array<{ open: boolean; text: string }> {
    const s = this.state;
    const out: Array<{ open: boolean; text: string }> = [];
    if (s.heard.d1_warn !== undefined)
      out.push(
        s.zombies !== undefined
          ? { open: false, text: "You crossed Makati Avenue and saw the humans who walk wrong." }
          : { open: true, text: "Blacky says the humans across Makati Avenue walk wrong. Jayco says zombies." },
      );
    if (s.shop !== undefined)
      out.push(
        s.shopDone !== undefined
          ? { open: false, text: "The tabby and her kittens from the empty shop are safe with the volunteers." }
          : { open: true, text: "Something is living in the empty shop on restaurant row." },
      );
    if (s.tales.includes(7)) out.push({ open: true, text: "A guard says a kapre smokes in the biggest tree at night." });
    return out;
  }

  private tickWindowTell(): void {
    const w = placesOfType(this.scene.places, "shop_window")[0];
    if (!w) return;
    const { player } = this.scene;
    const open = this.state.shop !== undefined && this.state.shopDone === undefined;
    const near = Phaser.Math.Distance.Between(player.x, player.y, w.x, w.y) < WINDOW_TELL_PX;
    if (open && near && !this.windowTell) {
      this.windowTell = this.scene.add
        .text(w.x, w.y - 22, "?", { fontFamily: "Arial, Helvetica, sans-serif", fontSize: "13px", fontStyle: "bold", color: "#ffd34d", stroke: "#000000", strokeThickness: 3, resolution: 2 })
        .setOrigin(0.5)
        .setDepth(12);
      if (this.scene.registry.get("MOTION_REDUCED") !== true) {
        this.scene.tweens.add({ targets: this.windowTell, y: w.y - 27, yoyo: true, repeat: -1, duration: 650, ease: "Sine.easeInOut" });
      }
    } else if ((!open || !near) && this.windowTell) {
      this.windowTell.destroy();
      this.windowTell = null;
    }
  }

  /** Sit (stay still) beside a friendly guard and, every couple of days, he tells her something. */
  private tickTales(delta: number): void {
    const { player, dayNight, dialogue } = this.scene;
    const day = dayNight.dayCount;
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    const still = (body?.velocity.length() ?? 1) < 1;
    const guard = this.friendlyGuardNear();
    if (!guard || !still || dialogue.isActive || day - this.state.taleDay < TALE_EVERY_DAYS) {
      this.sitMs = 0;
      return;
    }
    this.sitMs += delta;
    if (this.sitMs < TALE_SIT_MS) return;
    this.sitMs = 0;
    const next = TALES.findIndex((_, i) => !this.state.tales.includes(i));
    const index = next >= 0 ? next : Math.floor(Math.random() * TALES.length);
    this.state.tales.push(index);
    this.state.taleDay = day;
    this.persist();
    guard.holdFor(12_000);
    this.scene.emotes.show(this.scene, guard, "heart");
    dialogue.show(TALES[index]!);
  }

  private friendlyGuardNear(): GuardNPC | null {
    const { player } = this.scene;
    for (const g of this.scene.ambientGuards) {
      if (g.disposition !== "friendly" || !g.active) continue;
      if (Phaser.Math.Distance.Between(player.x, player.y, g.x, g.y) < TALE_PX) return g;
    }
    return null;
  }

  private persist(): void {
    this.scene.registry.set(CURIOSITY_KEY, { ...this.state, heard: { ...this.state.heard }, tales: [...this.state.tales] });
  }
}
