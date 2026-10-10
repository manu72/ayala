import Phaser from "phaser";

/**
 * Volume targets when "danger" mode is inactive vs active. Both tracks stay
 * playing at all times so the transition is a pure volume crossfade with no
 * start/stop artefacts. Values are kept intentionally quiet — the game's
 * dialogue is the focus, music is atmosphere.
 */
const VOLUMES = {
  ambient: {
    ayala: 0.18,
    snatcher: 0,
  },
  danger: {
    ayala: 0,
    snatcher: 0.28,
  },
} as const;

const FADE_MS = 600;
const MEOW_VOLUME = 0.6;
const CAT_GROWL_VOLUME = 0.7;

/**
 * Minimum gap (ms) between cat-growl plays. Prevents a stack of overlapping
 * growls when several cats emit warning emotes on the same frame — e.g.
 * during the first snatcher sighting when every cat within witness range
 * fires an `alert` emote simultaneously.
 */
const CAT_GROWL_COOLDOWN_MS = 1500;

/**
 * Traffic SFX for cars reacting to Mamma Cat on the road. Callers pass a 0..1
 * distance multiplier on top of these base volumes. Each sound is globally
 * rate-limited so several braking cars can't stack into a chorus, and plays
 * attenuated to near-silence are skipped without spending the cooldown.
 */
const TYRE_SCREECH_VOLUME = 0.55;
const CAR_HORN_VOLUME = 0.45;
const TYRE_SCREECH_COOLDOWN_MS = 700;
const CAR_HORN_COOLDOWN_MS = 1200;
const MIN_SFX_VOLUME = 0.02;
/** The Sunday market / Sunday Lights music at full closeness. */
const FESTIVAL_VOLUME = 0.5;

const MUTE_STORAGE_KEY = "ayala.audio.muted";

export const AUDIO_MUTED_CHANGED = "audio:muted-changed" as const;

type MusicSound =
  | Phaser.Sound.WebAudioSound
  | Phaser.Sound.HTML5AudioSound
  | Phaser.Sound.NoAudioSound;

/**
 * Scene-scoped audio controller. Owns the two looping music tracks and
 * provides a one-shot meow SFX. State machine is trivial:
 *
 *   not-started ─start()→ ambient ⇄ danger ─stop()→ disposed
 *
 * Mute is an orthogonal flag that multiplies both music volumes by 0 without
 * affecting the underlying ambient/danger state, so unmuting restores the
 * correct track automatically.
 */
export class AudioSystem {
  private scene: Phaser.Scene | null = null;
  private ayala: MusicSound | null = null;
  private snatcher: MusicSound | null = null;
  private festival: MusicSound | null = null;
  /** Waiting for the music loops to finish loading (see start()). */
  private onAudioCached: (() => void) | null = null;
  private fadeTweens: Phaser.Tweens.Tween[] = [];
  private dangerActive = false;
  private muted: boolean;
  private started = false;
  /**
   * Sentinel so the first growl after scene start (or scene.restart, which
   * resets `scene.time.now` to 0) is not suppressed by the cooldown check.
   * `NEGATIVE_INFINITY` makes `now - lastCatGrowlAt` unconditionally greater
   * than `CAT_GROWL_COOLDOWN_MS` on the first call.
   */
  private lastCatGrowlAt = Number.NEGATIVE_INFINITY;
  /** Last play time per traffic SFX key, for the global per-sound cooldowns. */
  private readonly lastTrafficSfxAt = new Map<string, number>();

  constructor() {
    this.muted = AudioSystem.readMutedFromStorage();
  }

  start(scene: Phaser.Scene): void {
    if (this.started) return;
    this.scene = scene;
    this.started = true;

    // The music streams in after the title screen (BootScene), so on a first visit it
    // may not be cached yet: start each loop the moment it is.
    if (!this.startMusic()) {
      this.onAudioCached = () => {
        if (this.startMusic()) this.stopWaitingForMusic();
      };
      scene.cache.audio.events.on("add", this.onAudioCached); // Phaser.Cache.Events.ADD
    }
  }

  /** Starts whichever loops are cached and not yet playing; true once both are. */
  private startMusic(): boolean {
    this.ayala ??= this.startLoop("bgm_ayala");
    this.snatcher ??= this.startLoop("bgm_snatcher");
    this.applyVolumesImmediate();
    return this.ayala !== null && this.snatcher !== null;
  }

  // Both tracks play at all times from volume 0 so crossfades are seamless. The browser
  // autoplay policy is already satisfied by the StartScene click that led us here.
  private startLoop(key: string): MusicSound | null {
    if (!this.scene?.cache.audio.exists(key)) return null;
    const loop = this.scene.sound.add(key, { loop: true, volume: 0 }) as MusicSound;
    loop.play();
    return loop;
  }

  private stopWaitingForMusic(): void {
    if (this.onAudioCached) this.scene?.cache.audio.events.off("add", this.onAudioCached);
    this.onAudioCached = null;
  }

  /**
   * Called every frame from GameScene.update(). Idempotent: a no-op when the
   * requested state matches the current state, so there's no cost to calling
   * it on every tick.
   */
  setDanger(active: boolean): void {
    if (!this.started) return;
    if (this.dangerActive === active) return;
    this.dangerActive = active;
    this.fadeToCurrentTargets();
  }

  /**
   * One-shot happy meow. Each call creates a fresh sound instance so rapid
   * Space presses overlap naturally rather than cutting each other off.
   * Silently no-op when muted or when the scene isn't running.
   */
  playMeow(): void {
    if (this.muted || !this.scene || !this.scene.cache.audio.exists("sfx_meow_happy")) return;
    this.scene.sound.play("sfx_meow_happy", { volume: MEOW_VOLUME });
  }

  /**
   * One-shot cat growl/hiss cue for warning reactions. Rate-limited globally
   * so simultaneous warning emotes (e.g. multiple cats spotting a snatcher)
   * don't stack into a garbled chorus.
   */
  playCatGrowl(): void {
    if (this.muted || !this.scene || !this.scene.cache.audio.exists("sfx_cat_growl_warning")) return;
    const now = this.scene.time.now;
    if (now - this.lastCatGrowlAt < CAT_GROWL_COOLDOWN_MS) return;
    this.lastCatGrowlAt = now;
    this.scene.sound.play("sfx_cat_growl_warning", { volume: CAT_GROWL_VOLUME });
  }

  /** One-shot tyre screech for a car braking hard. `volume` is a 0..1 distance multiplier. */
  playTyreScreech(volume = 1): void {
    this.playTrafficSfx("sfx_tyre_screech", TYRE_SCREECH_VOLUME, TYRE_SCREECH_COOLDOWN_MS, volume);
  }

  /** One-shot "beep-beeep" car horn. `volume` is a 0..1 distance multiplier. */
  playCarHorn(volume = 1): void {
    this.playTrafficSfx("sfx_car_horn", CAR_HORN_VOLUME, CAR_HORN_COOLDOWN_MS, volume);
  }

  /**
   * The Sunday music, 0..1 by how close she is to it (0 = silent). Ducks the ambient theme under it;
   * the danger theme is left alone. Call every frame while a Sunday event is on.
   */
  setFestival(level: number): void {
    if (!this.scene || !this.started) return;
    const lvl = this.muted ? 0 : Math.max(0, Math.min(1, level));
    if (!this.festival && lvl > 0 && this.scene.cache.audio.exists("sfx_sunday_lights")) {
      this.festival = this.scene.sound.add("sfx_sunday_lights", { loop: true, volume: 0 }) as MusicSound;
      this.festival.play();
    }
    this.festival?.setVolume(FESTIVAL_VOLUME * lvl);
    if (this.ayala && !this.dangerActive && !this.fadeTweens.some((t) => t.isPlaying())) {
      this.ayala.setVolume(this.currentTargets().ayala * (1 - 0.75 * lvl));
    }
  }

  /** Tiny kitten mews (the kittens in the empty shop). */
  playKitten(): void {
    if (this.muted || !this.scene || !this.scene.cache.audio.exists("sfx_meow_kitten")) return;
    this.scene.sound.play("sfx_meow_kitten", { volume: MEOW_VOLUME * 0.8 });
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    AudioSystem.writeMutedToStorage(muted);
    this.applyVolumesImmediate();
    this.scene?.events.emit(AUDIO_MUTED_CHANGED, muted);
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  /** Stop playback and release tweens. Safe to call multiple times. */
  stop(): void {
    this.stopWaitingForMusic();
    this.killFadeTweens();
    this.ayala?.stop();
    this.snatcher?.stop();
    this.festival?.stop();
    if (this.scene && this.festival) this.scene.sound.remove(this.festival as Phaser.Sound.BaseSound);
    this.festival = null;
    if (this.scene) {
      if (this.ayala) this.scene.sound.remove(this.ayala as Phaser.Sound.BaseSound);
      if (this.snatcher) this.scene.sound.remove(this.snatcher as Phaser.Sound.BaseSound);
    }
    this.ayala = null;
    this.snatcher = null;
    this.scene = null;
    this.started = false;
  }

  private playTrafficSfx(key: string, baseVolume: number, cooldownMs: number, volume: number): void {
    if (this.muted || !this.scene) return;
    // Negated so NaN is skipped too.
    if (!(volume > MIN_SFX_VOLUME)) return;
    // Called from the traffic update loop: an asset that failed to load or
    // decode would otherwise throw (Phaser throws on unknown audio keys).
    if (!this.scene.cache.audio.exists(key)) return;
    const now = this.scene.time.now;
    const last = this.lastTrafficSfxAt.get(key) ?? Number.NEGATIVE_INFINITY;
    if (now - last < cooldownMs) return;
    this.lastTrafficSfxAt.set(key, now);
    this.scene.sound.play(key, { volume: baseVolume * Math.min(1, volume) });
  }

  private currentTargets(): { ayala: number; snatcher: number } {
    if (this.muted) return { ayala: 0, snatcher: 0 };
    return this.dangerActive ? VOLUMES.danger : VOLUMES.ambient;
  }

  /**
   * Snap volumes to the current targets without any fade. Used for mute
   * toggles (user expects an instant response) and for the initial
   * start-up state.
   */
  private applyVolumesImmediate(): void {
    if (!this.ayala && !this.snatcher) return;
    this.killFadeTweens();
    const target = this.currentTargets();
    this.ayala?.setVolume(target.ayala);
    this.snatcher?.setVolume(target.snatcher);
  }

  private fadeToCurrentTargets(): void {
    if (!this.scene) return;
    this.killFadeTweens();

    // When muted, snap straight to zero — the dangerActive state was already
    // updated by setDanger(), so unmuting later will fade in the right track.
    if (this.muted) {
      this.ayala?.setVolume(0);
      this.snatcher?.setVolume(0);
      return;
    }

    const target = this.currentTargets();
    for (const [loop, volume] of [[this.ayala, target.ayala], [this.snatcher, target.snatcher]] as const) {
      if (!loop) continue; // still loading
      this.fadeTweens.push(this.scene.tweens.add({ targets: loop, volume, duration: FADE_MS, ease: "Linear" }));
    }
  }

  private killFadeTweens(): void {
    for (const tw of this.fadeTweens) tw.remove();
    this.fadeTweens = [];
  }

  private static readMutedFromStorage(): boolean {
    try {
      return typeof localStorage !== "undefined" && localStorage.getItem(MUTE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  private static writeMutedToStorage(muted: boolean): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
    } catch {
      // Private-browsing / quota errors are non-fatal; in-memory state still works.
    }
  }
}
