import type Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { NPCCat } from "../sprites/NPCCat";
import { StoryKeys } from "../registry/storyKeys";
import {
  comfortCeiling,
  comfortFloor,
  hidesWhenScared,
  mammaAlarmRadius,
  readNewcomers,
  SETTLED,
  type NewcomerRecord,
} from "../utils/newcomerCat";

/** A frightened newcomer creeps; a hider skulks once it dares out of its bush (an ordinary cat walks at 35). */
const CREEP_SPEED = 12;
const SKULK_SPEED = 18;
/** Too scared to nap: it mostly keeps still, and now and then creeps a little. */
const STILL = { idle: 0.75, walking: 0.25, sleeping: 0 };
const NEWCOMER_HABITS = { dawn: STILL, day: STILL, evening: STILL, night: STILL };
/** In its bush it doesn't stir. */
const HIDING = { idle: 1, walking: 0, sleeping: 0 };
const HIDING_HABITS = { dawn: HIDING, day: HIDING, evening: HIDING, night: HIDING };
const HOME_PX = 60;
const HUMAN_ALARM_PX = 110;
const CAT_ALARM_PX = 44;
/** A freezer creeps off from anything this close, this far. */
const CREEP_AWAY_PX = 48;
/** Hidden in a bush, it bolts again only when someone (or Mamma Cat, walking upright) comes this close. */
const FLUSHED_PX = 36;
const BUSH_SEARCH_PX = 640;
/** In the plants tileset (16 wide) the shrubs start on row 8; above them are flower beds, no cover at all. */
const FIRST_SHRUB = 8 * 16;
/** It comes out of its bush after this long without a fright. */
const HIDE_QUIET_MS = 90_000;
const HIDDEN_ALPHA = 0.45;
/** Mamma Cat sitting quietly (resting or loafing) this close settles it. */
const SIT_WITH_PX = 96;
const SIT_COMFORT_PER_MS = 0.5 / 1000;
const GREET_COMFORT = 4;
const GREET_COOLDOWN_MS = 60_000;
/** Every fright sets it back a little. */
const FRIGHT_COMFORT = 2;
const SYNC_MS = 1_000;

const MILESTONES: ReadonlyArray<readonly [number, string]> = [
  [25, "The new cat has stopped trembling. It watches you from the corner of its eye."],
  [50, "The new cat creeps a little closer, sniffs the air your way, and looks off as if it hadn't."],
  [75, "The new cat barely flinches at the traffic now. Barely."],
  [SETTLED, "The new cat has found its feet. The gardens are its home now, too."],
];

type Point = { x: number; y: number };

interface Newcomer {
  cat: NPCCat;
  index: number;
  rec: NewcomerRecord;
  /** Saved once Mamma Cat has seen it arrive (a dumping she missed plays again later, with another cat). */
  saved: boolean;
  hides: boolean;
  bush: Point | null;
  hidden: boolean;
  frightened: boolean;
  quietMs: number;
  greetedAt: number;
  /** Highest comfort this session (each milestone is told once). */
  best: number;
}

/**
 * Pets dumped on the Makati Ave sidewalk ({@link ColonyDynamicsSystem}'s dumping
 * events): bewildered house cats, overwhelmed by the noise and the people. Half of
 * them stay low, keep still and creep; the rest bolt for the nearest bush and hide.
 * They shy from Mamma Cat (unless she keeps still or creeps up crouched), from
 * people and from other cats. Sitting with them, greeting them gently, and days
 * passing settle them (registry `COLONY_NEWCOMERS`, a few game days at the least);
 * settled, each is an ordinary colony cat that lives where it settled.
 */
export class NewcomerCats {
  private readonly scene: GameScene;
  private readonly list: Newcomer[] = [];
  /** Saved newcomers by background index, settled ones too (they come back where they settled). */
  private records = new Map<number, NewcomerRecord>();
  private coverList: Point[] | null = null;
  private syncMs = 0;

  constructor(scene: GameScene) {
    this.scene = scene;
  }

  /** The saved newcomers, read from the registry after a save is restored. */
  load(): ReadonlyMap<number, NewcomerRecord> {
    this.records = readNewcomers(this.scene.registry.get(StoryKeys.COLONY_NEWCOMERS));
    return this.records;
  }

  /** Background cat `index` is a newcomer still finding its feet (`saved`: Mamma Cat has seen it arrive). */
  track(cat: NPCCat, index: number, rec: NewcomerRecord, saved: boolean): void {
    const n: Newcomer = { cat, index, rec, saved, hides: hidesWhenScared(index), bush: null, hidden: false, frightened: false, quietMs: 0, greetedAt: -Infinity, best: rec.comfort };
    this.list.push(n);
    cat.setManner(n.hides ? SKULK_SPEED : CREEP_SPEED, NEWCOMER_HABITS);
    cat.setHome(cat.x, cat.y, HOME_PX);
    // a hider is back in its bush when Mamma Cat comes again
    if (saved && n.hides) this.hide(n, { x: cat.x, y: cat.y });
    if (saved) this.records.set(index, rec);
  }

  /** Mamma Cat saw it arrive: it is part of the colony now, and saved. */
  keep(cat: NPCCat): void {
    const n = this.find(cat);
    if (!n || n.saved) return;
    n.saved = true;
    this.records.set(n.index, n.rec);
    this.persist();
  }

  /** Snatched: gone for good. */
  forget(cat: NPCCat): void {
    const n = this.find(cat);
    if (!n) return;
    this.list.splice(this.list.indexOf(n), 1);
    if (this.records.delete(n.index)) this.persist();
  }

  has(cat: NPCCat): boolean {
    return this.find(cat) !== undefined;
  }

  /**
   * Mamma Cat greets it: if it isn't busy running from her it bears it, and is a
   * little more at ease. Its comfort after, or null if it isn't a newcomer.
   */
  greet(cat: NPCCat): number | null {
    const n = this.find(cat);
    if (!n) return null;
    const now = this.scene.time.now;
    if (!cat.onErrand && cat.state !== "fleeing" && now - n.greetedAt >= GREET_COOLDOWN_MS) {
      n.greetedAt = now;
      this.settleBy(n, GREET_COMFORT);
    }
    return n.rec.comfort;
  }

  /** Every frame, after the cats' own updates. */
  update(delta: number): void {
    if (this.list.length === 0) return;
    // an idle cat stands up into full view; one in its bush stays hidden
    for (const n of this.list) if (n.hidden) n.cat.setAlpha(HIDDEN_ALPHA);
    if (this.scene.dialogue.isActive) return;
    const p = this.scene.player;
    const sitting = p.isResting || p.isCatloaf;
    for (const n of [...this.list]) {
      const { cat } = n;
      if (!cat.active) {
        this.list.splice(this.list.indexOf(n), 1);
        continue;
      }
      if (cat.inDialogue) continue;
      const sat = sitting && Math.hypot(p.x - cat.x, p.y - cat.y) <= SIT_WITH_PX;
      this.settleBy(n, sat ? delta * SIT_COMFORT_PER_MS : 0);
      if (this.list.includes(n)) this.react(n, delta);
    }
    this.syncMs += delta;
    if (this.syncMs >= SYNC_MS) {
      this.syncMs = 0;
      this.persist();
    }
  }

  private find(cat: NPCCat): Newcomer | undefined {
    return this.list.find((n) => n.cat === cat);
  }

  /** Raise (or lower) its comfort within what the days it has been here allow; settled, it's one of the colony. */
  private settleBy(n: Newcomer, amount: number): void {
    const before = n.rec.comfort;
    const day = this.scene.dayNight.dayCount;
    const ceiling = Math.max(before, comfortCeiling(n.rec.since, day));
    n.rec.comfort = Math.min(Math.max(before + amount, comfortFloor(n.rec.since, day)), ceiling);
    for (const [at, line] of MILESTONES) if (n.best < at && n.rec.comfort >= at) this.scene.narrateIfPerceivable(line, n.cat, 200);
    n.best = Math.max(n.best, n.rec.comfort);
    if (n.rec.comfort < SETTLED) return;
    const { cat } = n;
    this.list.splice(this.list.indexOf(n), 1);
    cat.setAlpha(1);
    cat.setManner();
    cat.setHome(cat.x, cat.y, 100);
    n.rec.x = cat.x;
    n.rec.y = cat.y;
    this.persist();
  }

  private react(n: Newcomer, delta: number): void {
    const { cat } = n;
    if (cat.onErrand || cat.state === "fleeing") return; // already creeping off, or running for its bush
    const threat = this.threat(n);
    if (!threat) {
      n.frightened = false;
      n.quietMs += delta;
      if (n.hidden && n.quietMs >= HIDE_QUIET_MS) this.emerge(n);
      return;
    }
    n.quietMs = 0;
    if (!n.frightened) {
      n.frightened = true;
      this.settleBy(n, -FRIGHT_COMFORT);
      this.scene.emotes.show(this.scene, cat, "alert");
    }
    if (n.hides) this.bolt(n, threat);
    else if (Math.hypot(threat.x - cat.x, threat.y - cat.y) < CREEP_AWAY_PX) this.creepAway(n, threat);
    else if (cat.state !== "alert") cat.triggerAlert(); // freeze, and hope not to be seen
  }

  /** What frightens it now: Mamma Cat on the move, people, other cats. */
  private threat(n: Newcomer): Point | null {
    const { cat } = n;
    const p = this.scene.player;
    const mammaR = n.hidden ? (p.isMoving && !p.isCrouching ? FLUSHED_PX : 0) : mammaAlarmRadius(p, n.rec.comfort);
    if (Math.hypot(p.x - cat.x, p.y - cat.y) <= mammaR) return p;
    const person = this.scene.personNear(cat.x, cat.y, n.hidden ? FLUSHED_PX : HUMAN_ALARM_PX);
    if (person || n.hidden) return person;
    const other = this.scene.npcs.find(
      ({ cat: o }) => o !== cat && o.active && o.state !== "sleeping" && !this.has(o) && Math.hypot(o.x - cat.x, o.y - cat.y) <= CAT_ALARM_PX,
    );
    return other?.cat ?? null;
  }

  /** Run for the nearest cover on its side of the fright (not the bush it was flushed from), or just run. */
  private bolt(n: Newcomer, from: Point): void {
    const { cat } = n;
    const far = (b: Point) => Math.hypot(b.x - cat.x, b.y - cat.y);
    const flushedFrom = n.hidden ? n.bush : null;
    const bushes = this.cover()
      .filter((b) => b !== flushedFrom && far(b) <= BUSH_SEARCH_PX && Math.hypot(b.x - from.x, b.y - from.y) >= far(b))
      .sort((a, b) => far(a) - far(b))
      .slice(0, 3);
    n.hidden = false;
    cat.setAlpha(1);
    for (const bush of bushes) {
      const route = this.scene.catRoute(cat, bush);
      if (!route) continue;
      n.bush = bush;
      cat.setHome(bush.x, bush.y, 8);
      cat.followRoute(route, () => this.hide(n, bush), true);
      return;
    }
    cat.triggerFlee(from.x, from.y);
  }

  private hide(n: Newcomer, bush: Point): void {
    n.bush = bush;
    n.hidden = true;
    n.quietMs = 0;
    n.rec.x = bush.x;
    n.rec.y = bush.y;
    n.cat.setManner(CREEP_SPEED, HIDING_HABITS);
    n.cat.setHome(bush.x, bush.y, 8);
    n.cat.setAlpha(HIDDEN_ALPHA);
  }

  /** All quiet for a good while: it dares out, but stays by its bush. */
  private emerge(n: Newcomer): void {
    n.hidden = false;
    n.cat.setAlpha(1);
    n.cat.setManner(SKULK_SPEED, NEWCOMER_HABITS);
    n.cat.setHome(n.cat.x, n.cat.y, HOME_PX);
  }

  private creepAway(n: Newcomer, from: Point): void {
    const { cat } = n;
    const d = Math.hypot(cat.x - from.x, cat.y - from.y) || 1;
    cat.followRoute([{ x: cat.x + ((cat.x - from.x) / d) * CREEP_AWAY_PX, y: cat.y + ((cat.y - from.y) / d) * CREEP_AWAY_PX }], () => undefined);
  }

  /** Somewhere to hide: in a shrub, or deep under a tree's low canopy (drawn over the cats), off its trunk. */
  private cover(): Point[] {
    if (this.coverList) return this.coverList;
    const { map, groundLayer, objectsLayer, overheadLayer } = this.scene;
    const plants = map.getTileset("plants");
    const shrubs = objectsLayer && plants ? objectsLayer.filterTiles((t: Phaser.Tilemaps.Tile) => t.index >= plants.firstgid + FIRST_SHRUB && t.index < plants.firstgid + plants.total) : [];
    const leafy = (x: number, y: number) => (overheadLayer?.getTileAt(x, y)?.index ?? -1) > 0;
    const open = (x: number, y: number) => !groundLayer?.getTileAt(x, y)?.collides && !objectsLayer?.getTileAt(x, y)?.collides;
    const canopy = overheadLayer
      ? overheadLayer.filterTiles((t: Phaser.Tilemaps.Tile) => t.index > 0 && open(t.x, t.y) && leafy(t.x - 1, t.y) && leafy(t.x + 1, t.y) && leafy(t.x, t.y - 1) && leafy(t.x, t.y + 1))
      : [];
    this.coverList = [...shrubs, ...canopy].map((t) => ({ x: t.pixelX + t.width / 2, y: t.pixelY + t.height / 2 }));
    return this.coverList;
  }

  private persist(): void {
    this.scene.registry.set(StoryKeys.COLONY_NEWCOMERS, Object.fromEntries([...this.records].map(([i, r]) => [i, { ...r }])));
  }
}
