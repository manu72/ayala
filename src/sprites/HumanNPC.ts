import Phaser from "phaser";
import type { TimeOfDay } from "../systems/DayNightCycle";
import { BaseNPC } from "./BaseNPC";
import {
  createSpriteProfileAnimations,
  profileForType,
  type HumanType,
  type SpriteProfile,
} from "./SpriteProfiles";
import { isFeederHumanType } from "../utils/humanSpawnPolicy";

export type { HumanType } from "./SpriteProfiles";

export interface HumanConfig {
  type: HumanType;
  path: Array<{ x: number; y: number }>;
  speed: number;
  activePhases: TimeOfDay[];
  /**
   * Optional persona identity name — must match a key in
   * {@link ../ai/personas.AI_PERSONAS} when this human should use AI-driven
   * dialogue. Examples: "Camille", "Manu", "Kish", "Rose", "Ben".
   * Unset = scripted-only (joggers, dogwalkers, snatchers).
   */
  identityName?: string;
  /** Seconds to linger at feeding station (feeders only). */
  lingerSec?: number;
  /** Waypoint index where feeder should linger (defaults to 1). */
  lingerWaypointIndex?: number;
  /** If true, deactivate after completing one full path traversal. */
  exitAfterLinger?: boolean;
  /**
   * If set (>0), the NPC will softly steer around neighbours (cats and
   * other humans) within this many world pixels of its current position.
   * Only nudges laterally; does not override pathing. See
   * {@link HumanNPC.applySteeringAvoidance}.
   */
  avoidanceRadius?: number;
  /**
   * If set (>0), after completing a full path traversal the NPC becomes
   * invisible for this many seconds (simulating exiting the map), then
   * respawns at path[0] and restarts the loop. Useful for perimeter
   * patrols that should visibly "leave" and "return" rather than
   * teleport-wrap from the last waypoint to the first.
   */
  loopPauseSec?: number;
  /**
   * When true, after one full traversal of {@link path} the NPC walks to
   * the nearest park exit and deactivates instead of looping.
   */
  exitAfterRoute?: boolean;
  /**
   * When true, leaving an `activePhases` window (e.g. dawn ends) does not
   * force {@link startExiting} while the NPC is still mid-route. Used for
   * Camille-era care visits that must finish their circuit across phases.
   */
  sustainAcrossInactivePhases?: boolean;
  /**
   * Optional per-waypoint dwell (ms) after reaching each point: crouch,
   * pause, greet nearby cats. Index aligns with {@link path}. Missing or
   * shorter entries default to 0 (no pause).
   */
  waypointPauseMs?: number[];
  /**
   * Set false for hand-authored routes that should keep their macro waypoints.
   * Exit routing can still be injected separately via {@link routeToExit}.
   */
  routePath?: boolean;
  /**
   * Fired once when the NPC reaches the perimeter exit after
   * {@link exitAfterRoute}, after the NPC has been deactivated.
   */
  onExitParkComplete?: () => void;
  /**
   * Optional collision-aware route builder for the exit walk. The scene owns
   * navigation data; HumanNPC only follows the returned waypoints.
   */
  routeToExit?: (
    from: { x: number; y: number },
    exits: ReadonlyArray<{ x: number; y: number }>,
  ) => Array<{ x: number; y: number }>;
}

/**
 * Default identity name per `HumanType` when `config.identityName` is unset.
 * Named characters have a single canonical identity; feeders are anonymous by
 * default (two feeder instances would otherwise share the same key) so the
 * caller must pass `identityName` explicitly to opt a feeder into AI dialogue.
 */
function defaultIdentityNameFor(type: HumanType): string | null {
  switch (type) {
    case "camille":
      return "Camille";
    case "manu":
      return "Manu";
    case "kish":
      return "Kish";
    case "ben":
      return "Ben";
    default:
      return null;
  }
}

/** Park exit waypoints — on the road perimeter, avoiding interior obstacles. */
const PARK_EXITS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 2400, y: 380 },   // Paseo de Roxas (northeast, past the escalator)
  { x: 2850, y: 1200 },  // Makati Ave (east edge)
  { x: 700, y: 1500 },   // Ayala Ave (southwest edge)
];

/**
 * A human NPC that follows a waypoint path during active time-of-day phases.
 * When their active phase ends, they walk to the nearest park exit before
 * becoming invisible rather than vanishing in place — unless
 * {@link HumanConfig.sustainAcrossInactivePhases} keeps them on-route until
 * the circuit completes.
 */
export class HumanNPC extends BaseNPC {
  readonly humanType: HumanType;
  readonly config: HumanConfig;
  /**
   * Persona identity name used to key into `AI_PERSONAS` and
   * `ConversationStore` when this human participates in AI dialogue.
   * `null` means scripted-only. Camille/Manu/Kish/Rose/Ben get a value here.
   */
  readonly identityName: string | null;

  private waypointPath: Array<{ x: number; y: number }>;
  private currentWaypoint = 0;
  private activePhases: Set<TimeOfDay>;
  private isActive = false;
  private lingerTimer = 0;
  private lingering = false;
  private readonly normalizedLingerIndex: number;
  private readonly scratchVec = new Phaser.Math.Vector2(0, 0);
  private readonly profile: SpriteProfile;

  private greetingActive = false;
  private greetingTimer = 0;
  private greetedCats = new WeakSet<object>();
  private glanceTimer = 0;

  /**
   * Caller-controlled pause for encounter beats. While true, {@link update}
   * zeroes velocity and does not advance the waypoint path. Crouch anim is
   * played once in {@link pauseForEncounter}; callers must not rely on any
   * automatic timeout — {@link resumeFromEncounter} is the only release path.
   */
  private encounterPaused = false;

  /**
   * Count of automatic proximity greetings this human has fired at a
   * stationary Mamma Cat since her last significant movement. Reset by the
   * scene (via {@link resetStationaryGreet}) once Mamma moves beyond
   * STATIONARY_MOVE_THRESHOLD_PX. The scene enforces the cap; this class
   * just records and exposes the count.
   */
  private stationaryGreet = 0;

  /** Manu greets only every 3rd eligible cat (Phase 4.5). */
  private manuGreetWave = 0;
  /** Simple bowl graphic while feeder lingers at a station. */
  private feedingStationProp: Phaser.GameObjects.Graphics | null = null;

  private exiting = false;
  private exitTarget: { x: number; y: number } | null = null;
  private exitPath: Array<{ x: number; y: number }> = [];
  private exitWaypoint = 0;

  // Between-loop "off-map" pause (see HumanConfig.loopPauseSec).
  private loopPausing = false;
  private loopPauseTimer = 0;

  /** Per-waypoint crouch / greet dwell (see HumanConfig.waypointPauseMs). */
  private waypointPausing = false;
  private waypointPauseTimer = 0;

  constructor(scene: Phaser.Scene, config: HumanConfig) {
    const prof = profileForType(config.type);
    const start = config.path[0]!;
    const textureKey = prof.directionalKeys?.walkDown ?? prof.key;
    super(scene, start.x, start.y, textureKey);
    this.humanType = config.type;
    this.config = config;
    this.identityName = config.identityName ?? defaultIdentityNameFor(config.type);
    this.profile = prof;
    this.waypointPath = config.path;
    this.activePhases = new Set(config.activePhases);
    const rawLingerIndex = config.lingerWaypointIndex ?? 1;
    this.normalizedLingerIndex = Math.max(
      0,
      Math.min(rawLingerIndex, this.waypointPath.length - 1),
    );

    if (prof.scale && prof.scale !== 1) {
      this.setScale(prof.scale);
    }

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setSize(prof.bodyW, prof.bodyH);
    body?.setOffset(
      (prof.frameW - prof.bodyW) / 2,
      prof.frameH - prof.bodyH,
    );

    createSpriteProfileAnimations(scene, prof);
    this.setVisible(false);
    this.setActive(false);
    body?.setEnable(false);

    // Feeders no longer need a tint — they have dedicated sprites.
    // To restore the old green tint: this.setTint(0x88ff88);
  }

  get isGreeting(): boolean {
    return this.greetingActive;
  }

  get isCatPerson(): boolean {
    return (
      isFeederHumanType(this.humanType) ||
      this.humanType === "camille" ||
      this.humanType === "manu" ||
      this.humanType === "kish"
    );
  }

  startGreeting(targetX: number, targetY: number): void {
    this.greetingActive = true;
    this.setVelocity(0);

    const facingRight = targetX >= this.x;
    const crouchAnim = `${this.profile.key}-crouch-${facingRight ? "right" : "left"}`;
    if (this.scene.anims.exists(crouchAnim)) {
      this.anims.play(crouchAnim, true);
    } else {
      const dir = this.directionFromVector(
        this.scratchVec.set(targetX - this.x, targetY - this.y),
      );
      this.anims.play(`${this.profile.key}-walk-${dir}`, true);
      this.anims.pause();
    }

    const durationMs =
      this.humanType === "camille" ? 6000 : this.humanType === "kish" ? 3000 : 4000;
    this.greetingTimer = durationMs;
  }

  hasGreeted(target: object): boolean {
    return this.greetedCats.has(target);
  }

  markGreeted(target: object): void {
    this.greetedCats.add(target);
  }

  /**
   * For Manu only: returns true when this greeting should be skipped (quiet pass).
   * Call before {@link markGreeted} / {@link startGreeting}.
   */
  shouldDeferManuGreet(): boolean {
    if (this.humanType !== "manu") return false;
    this.manuGreetWave++;
    return this.manuGreetWave % 3 !== 0;
  }

  resetGreeted(): void {
    this.greetedCats = new WeakSet<object>();
  }

  /**
   * Pause this human for an encounter beat. Movement is zeroed and the
   * crouch animation (if the profile defines one) is played facing the
   * target world X. {@link update} will early-return for subsequent ticks
   * until {@link resumeFromEncounter} is called.
   *
   * Idempotent: safe to call repeatedly (e.g. to re-face the player
   * between paired-beat steps).
   */
  pauseForEncounter(faceTargetX: number): void {
    this.encounterPaused = true;
    this.setVelocity(0);
    const facingRight = faceTargetX >= this.x;
    const crouchAnim = `${this.profile.key}-crouch-${facingRight ? "right" : "left"}`;
    if (this.scene.anims.exists(crouchAnim)) {
      this.anims.play(crouchAnim, true);
    }
  }

  /** Release an encounter pause. Path-following resumes on the next update. */
  resumeFromEncounter(): void {
    this.encounterPaused = false;
  }

  /** Is this human currently frozen for an encounter beat? */
  get isEncounterPaused(): boolean {
    return this.encounterPaused;
  }

  /** See {@link stationaryGreet}. */
  get stationaryGreetCount(): number {
    return this.stationaryGreet;
  }

  /** Increment this human's stationary-greet counter. */
  incrementStationaryGreet(): void {
    this.stationaryGreet += 1;
  }

  /** Reset this human's stationary-greet counter (call when Mamma moves). */
  resetStationaryGreet(): void {
    this.stationaryGreet = 0;
  }

  glanceAt(targetX: number, targetY: number): void {
    if (this.glanceTimer > 0) return;
    this.glanceTimer = 1500;
    const dir = this.directionFromVector(
      this.scratchVec.set(targetX - this.x, targetY - this.y),
    );
    this.anims.play(`${this.profile.key}-walk-${dir}`, true);
  }

  setPhase(phase: TimeOfDay): void {
    const shouldBeActive = this.activePhases.has(phase);
    if (shouldBeActive && !this.isActive && !this.exiting) {
      this.activate();
    } else if (
      !shouldBeActive &&
      this.isActive &&
      !this.exiting &&
      this.config.sustainAcrossInactivePhases
    ) {
      // Stay on the care route across dawn/day/evening/night until the path
      // completes and exitAfterRoute drives a perimeter walk-off.
      return;
    } else if (!shouldBeActive && this.isActive && !this.exiting) {
      if (this.loopPausing) {
        // Already off-map between loops; deactivate quietly — don't try to
        // walk to an exit since we're effectively already gone.
        this.deactivate();
        return;
      }
      this.startExiting();
    }
  }

  update(delta: number): void {
    if (!this.isActive) return;

    if (this.loopPausing) {
      this.loopPauseTimer -= delta;
      if (this.loopPauseTimer <= 0) {
        this.endLoopPause();
      }
      return;
    }

    if (this.exiting) {
      this.updateExiting();
      return;
    }

    if (this.encounterPaused) {
      this.setVelocity(0);
      return;
    }

    if (this.waypointPausing) {
      this.setVelocity(0);
      this.waypointPauseTimer -= delta;
      if (this.waypointPauseTimer <= 0) {
        this.waypointPausing = false;
        this.advanceWaypoint();
      }
      return;
    }

    const key = this.profile.key;

    if (this.greetingActive) {
      this.setVelocity(0);
      this.greetingTimer -= delta;
      if (this.greetingTimer <= 0) {
        this.greetingActive = false;
        this.anims.play(`${key}-idle`, true);
      }
      return;
    }

    if (this.glanceTimer > 0) {
      this.glanceTimer -= delta;
    }

    if (this.lingering) {
      this.setVelocity(0);
      if (this.feedingStationProp) {
        this.feedingStationProp.setPosition(this.x, this.y);
      }
      this.lingerTimer -= delta;
      if (this.lingerTimer <= 0) {
        this.lingering = false;
        this.feedingStationProp?.destroy();
        this.feedingStationProp = null;
        this.advanceWaypoint();
      }
      return;
    }

    const target = this.waypointPath[this.currentWaypoint];
    if (!target) {
      this.currentWaypoint = 0;
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
    if (dist < 20) {
      if (
        isFeederHumanType(this.humanType) &&
        this.config.lingerSec &&
        this.config.lingerSec > 0 &&
        this.currentWaypoint === this.normalizedLingerIndex
      ) {
        this.lingering = true;
        this.lingerTimer = this.config.lingerSec * 1000;
        this.setVelocity(0);
        this.anims.play(`${key}-idle`, true);
        if (!this.feedingStationProp) {
          const g = this.scene.add.graphics();
          g.fillStyle(0x6b4423, 0.95);
          g.fillEllipse(0, 10, 18, 10);
          g.lineStyle(1, 0x3d2817, 0.8);
          g.strokeEllipse(0, 10, 18, 10);
          g.setPosition(this.x, this.y);
          g.setDepth(3);
          this.feedingStationProp = g;
        }
        return;
      }
      const pauseMs = this.config.waypointPauseMs?.[this.currentWaypoint] ?? 0;
      if (pauseMs > 0) {
        this.waypointPausing = true;
        this.waypointPauseTimer = pauseMs;
        this.greetedCats = new WeakSet<object>();
        const nextWp = this.waypointPath[this.currentWaypoint + 1];
        const faceX = nextWp?.x ?? this.x + 1;
        this.playCrouchToward(faceX);
        return;
      }
      this.advanceWaypoint();
    } else {
      const speedMod = this.glanceTimer > 0 ? 0.3 : 1;
      this.scratchVec.set(target.x - this.x, target.y - this.y).normalize();
      this.setVelocity(
        this.scratchVec.x * this.config.speed * speedMod,
        this.scratchVec.y * this.config.speed * speedMod,
      );
      if (this.glanceTimer <= 0) {
        this.playWalkAnim(this.scratchVec);
      }
    }
  }

  private advanceWaypoint(): void {
    const next = this.currentWaypoint + 1;
    if (next >= this.waypointPath.length) {
      if (this.config.exitAfterRoute) {
        this.startExiting();
        return;
      }
      if (this.config.exitAfterLinger) {
        this.startExiting();
        return;
      }
      if (this.config.loopPauseSec && this.config.loopPauseSec > 0) {
        this.beginLoopPause();
        return;
      }
      this.currentWaypoint = 0;
      this.greetedCats = new WeakSet<object>();
      this.manuGreetWave = 0;
    } else {
      this.currentWaypoint = next;
    }
  }

  /**
   * Enter the between-loops "off-map" pause. The NPC is hidden and its
   * body is disabled so it can't be collided with or steered around while
   * offstage. {@link endLoopPause} restores it at path[0] once the timer
   * elapses.
   */
  private beginLoopPause(): void {
    this.loopPausing = true;
    this.loopPauseTimer = (this.config.loopPauseSec ?? 0) * 1000;
    this.setVelocity(0);
    this.setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(false);
  }

  private endLoopPause(): void {
    this.loopPausing = false;
    this.greetedCats = new WeakSet<object>();
    this.manuGreetWave = 0;
    const start = this.waypointPath[0]!;
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(true);
    if (body) {
      body.reset(start.x, start.y);
    } else {
      this.setPosition(start.x, start.y);
    }
    this.setVisible(true);
    this.currentWaypoint =
      this.waypointPath.length > 1
        ? this.normalizedLingerIndex === 0
          ? 0
          : 1
        : 0;
  }

  private activate(): void {
    this.isActive = true;
    this.loopPausing = false;
    this.loopPauseTimer = 0;
    this.waypointPausing = false;
    this.waypointPauseTimer = 0;
    this.setVisible(true);
    this.setActive(true);
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(true);
    const start = this.waypointPath[0]!;
    if (body) {
      body.reset(start.x, start.y);
    } else {
      this.setPosition(start.x, start.y);
    }
    if (this.waypointPath.length > 1) {
      // Start at spawn waypoint 0 only when linger is explicitly configured there.
      // Otherwise begin moving to the next waypoint after spawn.
      this.currentWaypoint = this.normalizedLingerIndex === 0 ? 0 : 1;
    } else {
      this.currentWaypoint = 0;
    }
    this.lingering = false;
  }

  private deactivate(): void {
    this.isActive = false;
    this.exiting = false;
    this.exitTarget = null;
    this.exitPath = [];
    this.exitWaypoint = 0;
    this.waypointPausing = false;
    this.waypointPauseTimer = 0;
    this.loopPausing = false;
    this.loopPauseTimer = 0;
    this.encounterPaused = false;
    this.stationaryGreet = 0;
    this.feedingStationProp?.destroy();
    this.feedingStationProp = null;
    this.setVisible(false);
    this.setActive(false);
    this.setVelocity(0);
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(false);
  }

  /**
   * Begin walking to the nearest park exit. The human stays visible
   * while exiting and only deactivates once they reach the exit point.
   */
  private startExiting(): void {
    this.exiting = true;
    this.greetingActive = false;
    this.lingering = false;

    let nearest = PARK_EXITS[0]!;
    let bestDist = Phaser.Math.Distance.Between(this.x, this.y, nearest.x, nearest.y);
    for (let i = 1; i < PARK_EXITS.length; i++) {
      const exit = PARK_EXITS[i]!;
      const d = Phaser.Math.Distance.Between(this.x, this.y, exit.x, exit.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = exit;
      }
    }
    this.exitPath = this.config.routeToExit?.({ x: this.x, y: this.y }, PARK_EXITS) ?? [nearest];
    this.exitWaypoint = this.exitPath.length > 1 ? 1 : 0;
    this.exitTarget = this.exitPath[this.exitWaypoint] ?? nearest;
  }

  private updateExiting(): void {
    if (!this.exitTarget) {
      this.deactivate();
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.exitTarget.x, this.exitTarget.y);
    if (dist < 24) {
      this.exitWaypoint += 1;
      const nextTarget = this.exitPath[this.exitWaypoint];
      if (nextTarget) {
        this.exitTarget = nextTarget;
        return;
      }
      this.deactivate();
      this.config.onExitParkComplete?.();
      return;
    }

    const speed = this.config.speed * 1.2;
    this.scratchVec.set(this.exitTarget.x - this.x, this.exitTarget.y - this.y).normalize();
    this.setVelocity(this.scratchVec.x * speed, this.scratchVec.y * speed);
    this.playWalkAnim(this.scratchVec);
  }

  /**
   * Soft steering nudge away from nearby neighbours (cats, other humans).
   *
   * Called AFTER {@link update} each tick by the scene so we can observe the
   * velocity that pathing just produced and bend it sideways. Neighbours that
   * are not broadly ahead of us are ignored (we never swerve for things
   * behind), and neighbours directly in front cause us to sidestep to the
   * less-crowded side. The forward component is slightly reduced when
   * swerving hard, giving a "slow as you dodge" feel without ever stopping.
   *
   * Cheap: O(n) over the provided list; no physics overlap checks. Intended
   * for NPCs opted in via {@link HumanConfig.avoidanceRadius}.
   */
  applySteeringAvoidance(
    neighbours: Iterable<{ x: number; y: number }>,
    radius: number,
  ): void {
    if (
      !this.isActive ||
      this.greetingActive ||
      this.lingering ||
      this.loopPausing ||
      this.waypointPausing
    )
      return;
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    const speed = Math.hypot(vx, vy);
    if (speed < 1) return;

    const fx = vx / speed;
    const fy = vy / speed;
    // Right-hand perpendicular in screen space (y grows downward).
    const rx = -fy;
    const ry = fx;

    let lateral = 0;
    for (const n of neighbours) {
      const dx = n.x - this.x;
      const dy = n.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1 || dist > radius) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      // Dot with forward: >0 means neighbour is ahead of us.
      const forwardDot = nx * fx + ny * fy;
      if (forwardDot < 0.15) continue;
      // Sign with right-vector: >0 means on our right → steer left (negative).
      const sideDot = nx * rx + ny * ry;
      const proximity = 1 - dist / radius;
      // Stronger weight when directly ahead and close.
      lateral += (sideDot >= 0 ? -1 : 1) * proximity * forwardDot;
    }

    if (lateral === 0) return;

    const nudge = Phaser.Math.Clamp(lateral, -1, 1);
    // Slow slightly when swerving hard so we don't blur into targets.
    const forwardScale = 1 - Math.abs(nudge) * 0.35;
    const newFx = fx * forwardScale + rx * nudge;
    const newFy = fy * forwardScale + ry * nudge;
    const mag = Math.hypot(newFx, newFy) || 1;
    this.setVelocity((newFx / mag) * speed, (newFy / mag) * speed);
    this.scratchVec.set(newFx, newFy).normalize();
    if (this.glanceTimer <= 0) {
      this.playWalkAnim(this.scratchVec);
    }
  }

  /**
   * Play a one-shot crouch animation facing toward the given world X position.
   * Stops movement while crouching. No-op if the profile has no crouch sheets.
   */
  playCrouchToward(targetX: number): void {
    const facingRight = targetX >= this.x;
    const animKey = `${this.profile.key}-crouch-${facingRight ? "right" : "left"}`;
    if (this.scene.anims.exists(animKey)) {
      this.setVelocity(0);
      this.anims.play(animKey, true);
    }
  }

  private playWalkAnim(dir: Phaser.Math.Vector2): void {
    const key = this.profile.key;
    const d = this.directionFromVector(dir);
    this.anims.play(`${key}-walk-${d}`, true);
  }
}
