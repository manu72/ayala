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
  private fadeTweens: Phaser.Tweens.Tween[] = [];
  private dangerActive = false;
  private muted: boolean;
  private started = false;

  constructor() {
    this.muted = AudioSystem.readMutedFromStorage();
  }

  start(scene: Phaser.Scene): void {
    if (this.started) return;
    this.scene = scene;

    this.ayala = scene.sound.add("bgm_ayala", { loop: true, volume: 0 }) as MusicSound;
    this.snatcher = scene.sound.add("bgm_snatcher", { loop: true, volume: 0 }) as MusicSound;

    // Start both tracks at volume 0 so crossfades are seamless. The browser
    // autoplay policy is already satisfied by the StartScene click that led
    // us here.
    this.ayala.play();
    this.snatcher.play();

    this.applyVolumesImmediate();
    this.started = true;
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
    if (this.muted || !this.scene) return;
    this.scene.sound.play("sfx_meow_happy", { volume: MEOW_VOLUME });
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
    this.killFadeTweens();
    this.ayala?.stop();
    this.snatcher?.stop();
    if (this.scene) {
      this.scene.sound.remove(this.ayala as Phaser.Sound.BaseSound);
      this.scene.sound.remove(this.snatcher as Phaser.Sound.BaseSound);
    }
    this.ayala = null;
    this.snatcher = null;
    this.scene = null;
    this.started = false;
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
    if (!this.ayala || !this.snatcher) return;
    this.killFadeTweens();
    const target = this.currentTargets();
    this.ayala.setVolume(target.ayala);
    this.snatcher.setVolume(target.snatcher);
  }

  private fadeToCurrentTargets(): void {
    if (!this.scene || !this.ayala || !this.snatcher) return;
    this.killFadeTweens();

    // When muted, snap straight to zero — the dangerActive state was already
    // updated by setDanger(), so unmuting later will fade in the right track.
    if (this.muted) {
      this.ayala.setVolume(0);
      this.snatcher.setVolume(0);
      return;
    }

    const target = this.currentTargets();
    this.fadeTweens.push(
      this.scene.tweens.add({
        targets: this.ayala,
        volume: target.ayala,
        duration: FADE_MS,
        ease: "Linear",
      }),
    );
    this.fadeTweens.push(
      this.scene.tweens.add({
        targets: this.snatcher,
        volume: target.snatcher,
        duration: FADE_MS,
        ease: "Linear",
      }),
    );
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
