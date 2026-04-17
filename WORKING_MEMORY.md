# WORKING_MEMORY

> Persistent memory layer for AI-assisted development sessions.
> Last Updated: 2026-04-17
> Version: 0.1.7

---

## Project Overview

**Ayala** is a 2D top-down cat adventure game built with Phaser 3 + Vite + TypeScript. The player controls Mamma Cat, a dumped pet navigating the colony at Ayala Triangle Gardens in Makati, Manila.

- **Branch:** `sit` (active development)
- **Repo:** ~8000 LoC (35 TypeScript source files)
- **Build:** `npx vite build` produces static files in `dist/`

---

## Development Phase Status

| Phase                | Status      | Notes                                                          |
| -------------------- | ----------- | -------------------------------------------------------------- |
| 1. Foundation        | Complete    | Tilemap, player, NPC, day/night                                |
| 1.5 Visual Polish    | Complete    | Camera zoom, textured tiles, animations, overhead layer        |
| 2. Core Mechanics    | Complete    | Stats, food/water, guard, save/load, rest, crouch, HUD         |
| 3. Social & Story    | Complete    | Trust, emotes, chapters 1-3, named cats, humans, dogs, journal |
| 4. Camille & Endgame | Complete    | DialogueService, Chs 4-6, snatchers, territory, epilogue, NG+  |
| 4.5 Visual & Narrative | Complete  | Intro cinematic, dialogue poses, human circuits, witness gates, chapter cards, reduced-motion |
| 5. Polish & Release  | Not started | Audio, PWA, playtesting, deployment                            |

---

## Architecture

### Scene Graph

```text
BootScene -> StartScene -> GameScene + HUDScene (overlay) + JournalScene (overlay)
                                    -> EpilogueScene (after Ch6)
```

- **BootScene** (`src/scenes/BootScene.ts`): Loads all assets (tilesets, spritesheets)
- **StartScene** (`src/scenes/StartScene.ts`): Title screen, New/Continue
- **GameScene** (`src/scenes/GameScene.ts`): Main game loop, NPC management, input, chapters (~2600 lines)
- **HUDScene** (`src/scenes/HUDScene.ts`): Stats bars, clock, rest progress, pause menu, narration, dialogue
- **JournalScene** (`src/scenes/JournalScene.ts`): Colony journal overlay (J key or pause menu)

### Sprite Types

| File               | Purpose                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `MammaCat.ts`      | Player (WASD, run, crouch tap/hold, rest)                                                     |
| `BaseNPC.ts`       | Abstract base for physics NPCs: scene registration, depth, bounds, direction/row helpers      |
| `NPCCat.ts`        | Generic NPC cat with state machine, config-driven (animPrefix, scale, walkSpeed, hyperactive) |
| `GuardNPC.ts`      | Guard that patrols and chases player from food scraps                                         |
| `HumanNPC.ts`      | Waypoint humans; phase-active; uses profiles from `SpriteProfiles.ts`                         |
| `SpriteProfiles.ts`| `SpriteProfile` definitions, `profileForType`, `createSpriteProfileAnimations` (humans + guard) |
| `types.ts`         | Shared `Disposition`, `CatState` for NPC cats and indicators                                  |
| `DogNPC.ts`        | Follows dog-walker owner, barks/lunges at player                                              |

### Systems

| File                 | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `TrustSystem.ts`     | Global + per-cat trust scores (0-100), proximity ticking, conversation rewards      |
| `EmoteSystem.ts`     | Floating text emotes above entities (heart, alert, curious, sleep, hostile, danger) |
| `ChapterSystem.ts`   | Chapter 1-6 progression with trust/territory/encounter thresholds                   |
| `DayNightCycle.ts`   | 4-phase cycle (dawn/day/evening/night), emits `newDay` event                        |
| `StatsSystem.ts`     | Hunger/thirst/energy with environment modifiers                                     |
| `FoodSource.ts`      | Interactive food/water sources with cooldowns and persistence                       |
| `SaveSystem.ts`      | localStorage save/load with validation + territory data                             |
| `ThreatIndicator.ts` | Floating name + disposition symbol above NPCs                                       |
| `DialogueSystem.ts`  | Bottom-screen dialogue UI (view layer)                                              |
| `TerritorySystem.ts` | Territory claiming and benefits at The Shops                                        |
| `SnatcherSystem.ts`  | Re-exports `resolveSnatcherSpawnAction` (facade until spawn/patrol code is extracted from GameScene) |

### Services

| File                   | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `DialogueService.ts`   | Centralized dialogue interface: ScriptedDialogueService (Phase 5: AI swap) |
| `ConversationStore.ts` | IndexedDB persistence for conversation history (Phase 5: AI context feed)  |

### Data

| File              | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `cat-dialogue.ts` | All named cat dialogue as condition/response data structures |

### Key Config

- `src/config/gameplayConstants.ts`: Single source of truth for **cross-scene** gameplay constants — interaction and narrative witness radii (`GP`, Phase 4.5) plus input-timing values (`REST_HOLD_MS`). Per-system implementation details (e.g. `FoodSource` source cooldowns / amounts, `INTERACT_RANGE`) stay owned by their module and are exported from there for test consumption (see `SOURCE_DEFS`, `INTERACT_RANGE` in `src/systems/FoodSource.ts`). Tests should import the canonical constant rather than copy its numeric value, but promote to `gameplayConstants.ts` only when two or more *production* modules share the value.
- `src/config/GameConfig.ts`: Phaser config, scene list, resolution (816x624)
- `src/registry/storyKeys.ts`: `StoryKeys` constants for registry (`INTRO_SEEN`, etc.)

---

## Sprite Assets

**Cat grid sheets (256x320, 8 cols x 10 rows, 32x32 frames):**
mammacat, blacky, tiger, jayco, fluffy

**Guard (512x448, 8 cols x 7 rows, 64x64 frames):**
guard.png — `GuardNPC` + shared `GUARD_PROFILE` in `SpriteProfiles.ts` (feeders use separate `feeder_*` textures via profiles)

**Dog sheets (4 cols x 9 rows, 32x32 frames):**
SmallDog.png, WhiteDog.png, BrownDog.png — randomly assigned to dog walkers

**Human NPC sheets (via SpriteProfile system):**

- `girl.png` (jogger): 8 cols x 6 rows, 150x85 frames, scaled 0.5
- `dogwalker.png`: 7 cols x 3 rows, 50x45 frames (side-facing rows only, reused for up/down)

### Animation Row Mapping (Cat Grid Sheets)

| Row | Index | Animation                           |
| --- | ----- | ----------------------------------- |
| 0-3 | 0-3   | sit-down/left/right/up (stationary) |
| 5   | 4     | walk (all directions)               |
| 6   | 5     | run / flee                          |
| 7   | 6     | rest / sleep                        |

---

## Save System

- Key: `ayala_save` in localStorage
- Phase 1-3 keys: MET_BLACKY, TIGER_TALKS, JAYCO_TALKS, KNOWN_CATS, CHAPTER, CH1_RESTED, FLUFFY_TALKS, PEDIGREE_TALKS, MET_GINGER_A, MET_GINGER_B, JAYCO_JR_TALKS, JOURNAL_MET_DAYS
- Phase 4 keys: VISITED_ZONE_6, TERRITORY_CLAIMED, TERRITORY_DAY, CAMILLE_ENCOUNTER, CAMILLE_ENCOUNTER_DAY, COLONY_COUNT, DUMPING_EVENTS_SEEN, CATS_SNATCHED, GAME_COMPLETED, NEW_GAME_PLUS, INTRO_SEEN, FIRST_SNATCHER_SEEN, ENCOUNTER_5_COMPLETE
- Legacy: `localStorage["ayala_intro_seen"]` is migrated to registry `INTRO_SEEN` on load; both may be set on intro completion for older clients
- Also persists: player position, stats, timeOfDay, gameTimeMs, sourceStates, trust data, territory data
- Conversation history stored separately in IndexedDB (`ayala_conversations`)
- Validation: `isValidSave()` checks structure, types, and ranges

---

## Named NPC Cats

| Name     | Sprite               | Zone           | Disposition             | Special                     |
| -------- | -------------------- | -------------- | ----------------------- | --------------------------- |
| Blacky   | blacky               | 5 (underpass)  | neutral                 | Orientation dialogue        |
| Tiger    | tiger                | 3 (central)    | territorial -> friendly | Multi-stage warmup          |
| Jayco    | jayco                | 6 (shops)      | friendly                | Food/guard tips             |
| Jayco Jr | jayco (0.7 scale)    | 6 (near Jayco) | friendly                | Hyperactive kitten          |
| Fluffy   | fluffy               | 3 (central)    | neutral                 | Aloof, trust-gated dialogue |
| Pedigree | fluffy               | 2 (Nielson)    | neutral                 | Former pet, night warnings  |
| Ginger   | fluffy (orange tint) | 4 (fountain)   | wary                    | Territorial pair            |
| Ginger B | fluffy (orange tint) | 4 (fountain)   | wary                    | Silent twin                 |

12 background colony cats with unique IDs (`Colony Cat 1`..`12`), random sprites/dispositions.

---

## Lessons Learned

### Input Handling

- **Rest key (Z) stale JustDown bug:** When entering rest mode via hold timer, consume the `JustDown` flag immediately before `enterRest()`, otherwise the first frame of resting reads the stale flag and wakes the player instantly.
- **Crouch tap-vs-hold pattern:** Track `keyDownTime` on keydown event. On keyup, if held < threshold, toggle latch; if held >= threshold, release temporary crouch. Reset latch on `enterRest()`.
- **Pause early-return ordering:** Escape key check must come BEFORE the `if (isPaused) return` gate, otherwise the player cannot unpause.

### Animation

- **Never mutate shared animation data:** Do NOT set `this.anims.currentAnim.frameRate` -- it mutates the shared AnimationData for all sprites using that animation. Use `this.anims.msPerFrame = 1000 / rate` for per-instance timing.
- **Animation existence check:** Always check `scene.anims.exists(key)` before playing, with a fallback animation (e.g. sit pose).

### Performance

- **Avoid per-frame allocations:** Cache `Phaser.Math.Vector2` instances as private fields (`_toHomeVec`, `scratchVec`) and reuse them. NPCCat and GuardNPC both had per-frame `new Vector2()` calls.
- **Cache map lookups:** `map.findObject()` per frame is expensive. Cache results (e.g. shelter POI coordinates) in `create()`.

### Tween vs Position Tracking Conflicts

- When a game object is both position-tracked (e.g. dog following owner) and tweened (e.g. lunge), the per-frame `setPosition()` overwrites the tween. Use a boolean flag (`isLunging`) to pause position tracking while the tween is active.

### Persistence

- **Met-day randomization bug:** Never use `Math.random()` for data that should be stable across views. Store deterministic values (like first-met day) at the moment they're created, not when they're displayed.
- **Food source startup cooldown:** Initialize `lastUsedAt` to `-cooldownMs` (not 0) so sources are available at game start.
- **StatsSystem.fromJSON validation:** Always clamp and validate loaded numeric values (finite check, 0-100 range).
- **`localStorage` access itself can throw:** In Firefox with `dom.storage.enabled=false`, sandboxed iframes, and Safari with storage blocked for third-party contexts, *reading* `window.localStorage` triggers a SecurityError from the getter. `typeof localStorage` does NOT suppress this — `typeof` only guards undeclared identifiers, and the global is declared. Any boot-path code that touches storage must wrap the reference acquisition (not just `getItem`/`setItem`) in try/catch and fall back to `undefined`. See `GameScene.create()` around `migrateLegacyIntroFlag`.

### Entity Identity

- Background NPCs sharing the same `npcName` causes collisions in name-keyed maps (narration cooldowns, trust proximity throttling). Always use unique identifiers.

### Feeder Waypoint Behavior

- Feeders use dynamic paths built from tilemap POIs (`poi_feeding_station_1`, `poi_feeding_station_2`) via `buildFeederConfigs()`. Paths are: entry -> station -> exit.
- `normalizedLingerIndex` (clamped in constructor) determines the station waypoint. `activate()` sets `currentWaypoint` based on this index to avoid lingering at spawn.
- `exitAfterLinger: true` causes `advanceWaypoint()` to call `deactivate()` after one trip instead of looping.
- Arrival threshold is 20px (not 8px) to tolerate collision deflection near dense map objects.

### Physics Body Lifecycle (HumanNPC)

- Physics body must be **disabled** when the NPC is inactive/hidden. `activate()` calls `body?.setEnable(true)`, `deactivate()` calls `body?.setEnable(false)`, and the constructor starts with `body?.setEnable(false)`.
- Use `body.reset(x, y)` (not `setPosition()`) on activation to fully sync the Arcade body's position, velocity, and acceleration.

### Input Guards — Dialogue State

- The J-key handler in `GameScene.update()` must check `!this.dialogue.isActive` before opening the journal, otherwise Space key presses silently advance dialogue in the background while the journal is open.
- ESC key handling is centralized in `GameScene.update()` — it checks `JournalScene` first, then toggles pause. The journal and HUDScene do NOT register their own ESC listeners.
- **Phaser dispatches key `"down"` events BEFORE `scene.update()`, so one Space keystroke can chain through two layers in the same frame.** `DialogueSystem.advance()` (wired via `advanceKey.on("down", ...)`) closes the overlay and fires `onComplete`; later in the same frame `JustDown(spaceKey)` is still true and `dialogue.isActive` is now false, so `tryInteract()` re-engages the same NPC and plays the next scripted response (e.g. Blacky's first-meeting dialogue chaining into the `blacky_return` line with no elapsed time). Fix pattern: track the most recent dialogue partner in `GameScene.lastDialoguePartner` when `dialogue.show(...)`'s `onComplete` fires, skip that cat in `tryInteract()`, and clear the guard in `updateNPCs()` once `dist > INTERACTION_DISTANCE`. Clear it in `shutdown()` to avoid stale state across scene restarts. This also enforces the "walk away, come back" narrative gate for return-dialogue scripts.

### SpriteProfile System (`SpriteProfiles.ts`)

- `SpriteProfile` interface defines per-type sprite configuration: `key`, `cols`, `frameW`, `frameH`, `bodyW`, `bodyH`, `scale`, and `anims` row mappings.
- Profiles: `GUARD_PROFILE` (also used by `GuardNPC` animations), `JOGGER_PROFILE`, `DOGWALKER_PROFILE`, etc. `HumanNPC` selects via `profileForType(humanType)`.
- `createSpriteProfileAnimations(scene, profile)` registers Phaser anims for one profile; idempotent if `${key}-idle` exists.
- `frameW` and `frameH` are separate to correctly calculate physics body offset for non-square frames (e.g. dogwalker 50x45).

### NPC sprite structure (`BaseNPC`)

- `NPCCat`, `HumanNPC`, and `GuardNPC` extend `BaseNPC` (shared scene registration, depth, bounds, `setupPhysicsBody`, `directionFromVector` / `directionFromComponents`, static `rowFrames`).
- `Disposition` and `CatState` live in `src/sprites/types.ts` (indicators import `Disposition` from there).

---

### DialogueService Architecture

- **View vs Service separation:** `DialogueSystem` (UI layer) shows text on screen. `DialogueService` (logic layer) decides WHAT to say based on game state. The service returns a `DialogueResponse` with lines, emote, narration, trustChange, and event fields. The scene processes side effects on completion.
- **Backward compatibility:** Scripted dialogue conditions use a hybrid of `conversationHistory.length` (from IndexedDB) and `gameState.trustWithSpeaker` (from TrustSystem) to handle saves that predate the conversation store.
- **Event-driven side effects:** Each `DialogueResponse.event` string (e.g. `"blacky_first"`, `"tiger_warmup"`) maps to specific side effects in `GameScene.processDialogueResponse()`: registry updates, trust awards, indicator reveals, disposition changes, auto-saves.

### Scene Restart Data Passing

- When restarting a scene (e.g. after snatcher capture), pass flags through the `data` parameter rather than using `delayedCall`, which won't survive the restart. The pattern is: `this.scene.restart({ loadSave: true, snatcherCapture: true })` and check in `create()`.

### Scene Lifecycle — shutdown is NOT auto-wired

- Phaser 3 auto-invokes `init/preload/create/update` on your Scene subclass, but **not** `shutdown`. `Systems.shutdown()` only emits the `'shutdown'` event. If your Scene's `shutdown()` does cleanup (cancelling intro timers/tweens, disengaging NPCs, dismissing dialogue, removing listeners), register it explicitly in `create()` with `this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this)`. Use `once` (not `on`) so a subsequent `create()` on scene restart re-subscribes cleanly.

### Phase 4.5 (visual / narrative alignment)

- **Scripted reveal sequences need a second witness gate:** A trigger-time proximity check goes stale when a sequence runs for several seconds of tweens/`delayedCall`s. Any progression flag, narration, or heavy effect that fires at the *reveal* must re-check perceivability there — not rely on the upstream gate. In `playFirstSnatcherSighting`, the edge pulse, narration, and `FIRST_SNATCHER_SEEN` persistence all live inside the inner `near && los` branch (firing up-front either burns the scripted beat — flag set too early permanently downgrades future nights to `random_spawn` — or produces a mysterious red screen pulse with no visible cause). In `playDumpingSequence`, the trigger-side `isNearMakatiAve` gate is kept for arming, but `DUMPING_EVENTS_SEEN` + `COLONY_COUNT` + the modal dialogue are all gated again inside `showDumpingNarration` against proximity + LOS to the dumped cat (the 5s sequence easily outlasts the 300px strip). Missed reveals re-arm on the next approach via `checkColonyDynamics` / `resolveSnatcherSpawnAction`. Separately, `snatcherSpawnChecked` must not be set before the "resting at shelter" guard — use `resolveSnatcherSpawnAction()` (`src/utils/snatcherSpawnLogic.ts`) so a skipped poll can retry. `playCamilleEncounterNarrative` is the exception that proves the rule: its entire sequence is short enough and its caller `checkCamilleProximity` already enforces `dist + LOS`, so no reveal-time re-check is needed.
- **Non-blocking dialogue:** If the player walks away, disengage the NPC (`DIALOGUE_BREAK_DIST`) and `dialogue.dismiss()` so `dialogueEngaged` cannot stick.
- **Intro cinematic:** Cancel `delayedCall`/`tween` handles in `shutdown()`; `DayNightCycle.snapVisualToPhase` for night/dawn overlay only during the intro.
- **Speaker pose:** `speakerPoseToAnimMode` maps tones to sit / walk_paused / rest — NPC sheets lack dedicated crouch/arch rows.
- **`prefers-reduced-motion`:** `BootScene.init` sets registry `MOTION_REDUCED`; `HUDScene` / `EmoteSystem` / intro opening text respect it for decorative motion.
- **Reduced-motion timer gotcha:** `tweens.killTweensOf()` does NOT cancel `time.delayedCall()`. When a reduced-motion path replaces a tween with a `delayedCall`-based fade-out, store the returned `TimerEvent` in a field and `remove(false)` it before scheduling a new one — otherwise a stale timer from a previous call can fire during the current display and hide the card/pulse prematurely. See `HUDScene.showChapterTitle` / `pulseEdge`.
- **Perceivability gates need LOS, not just distance:** `narrateIfPerceivable` and any future witness helpers describing visual cues (cat body language, "X watches you from…") must combine the radius check with `hasLineOfSight`. Distance-only gates will fire through walls/buildings. If audio-only narration is ever needed, introduce a separate helper rather than weakening the visual gate.

---

## Technical Debt

- **Test coverage is partial:** Vitest unit tests cover pure systems and most leaf modules — StatsSystem, TrustSystem, TerritorySystem, SaveSystem, ChapterSystem, DialogueService, DialogueSystem, DayNightCycle, FoodSource, BaseNPC helpers, HumanNPC, SpriteProfiles, ConversationStore, cat-dialogue, storyKeys, plus pure utils (`lineOfSight`, `snatcherSpawnLogic`, `dialoguePoseAnim`). 18 test files, 307 tests at the time of writing. Remaining gaps are the Phaser-coupled scene glue (GameScene, HUDScene, JournalScene, EpilogueScene, BootScene, StartScene) and the NPCCat/GuardNPC/DogNPC state-machine update loops. CI runs tests before build.
- **No audio:** Planned for Phase 5.
- **Tilemap POI names are hardcoded:** Spawn points, food sources, shelter POIs use string names matched between Tiled JSON and GameScene. No validation that map contains expected POIs.
- **GameScene is ~2400+ lines:** Camille encounters, snatchers, colony dynamics, and territory should be extracted into dedicated systems; `SnatcherSystem.ts` is a thin re-export for spawn policy only.
- **Colony cat random positions:** Not tied to map POIs; positions are hardcoded zone coordinates with random offsets. May clip into objects.
- **Disposition type `"wary"` added in Phase 3:** Not yet used in NPC AI behavior weights (only affects emotes/narration/indicators).
- **Camille/Manu/Kish use generic HumanNPC:** No dedicated sprites yet. They use the feeder profile/sprite. Custom sprites needed for visual distinction.
- **Snatchers use jogger type with dark tint:** A dedicated snatcher sprite (silhouette) would improve visual impact.
- **Dumping events fire probabilistically:** Could be more deterministic with a day-counter to avoid very long waits or double-fires.
- **Partial registry-key typing:** `StoryKeys` (`src/registry/storyKeys.ts`) only covers story/endgame keys (`INTRO_SEEN`, `FIRST_SNATCHER_SEEN`, `CAMILLE_ENCOUNTER`(`_DAY`), `DUMPING_EVENTS_SEEN`, `ENCOUNTER_5_COMPLETE`, `NEW_GAME_PLUS`, `GAME_COMPLETED`). Cat/chapter progression keys (`MET_BLACKY`, `TIGER_TALKS`, `JAYCO_TALKS`, `KNOWN_CATS`, `CHAPTER`, `CH1_RESTED`, `FLUFFY_TALKS`, `PEDIGREE_TALKS`, `MET_GINGER_A`/`_B`, `JAYCO_JR_TALKS`, `JOURNAL_MET_DAYS`, `VISITED_ZONE_6`, `TERRITORY_CLAIMED`, `TERRITORY_DAY`, `COLONY_COUNT`, `CATS_SNATCHED`) are still raw string literals in `GameScene` and `SaveSystem.TRACKED_KEYS`. Follow-up: introduce a sibling `ProgressionKeys` module and retrofit the clear-list in `GameScene.create` plus `SaveSystem.TRACKED_KEYS` so typos become compile errors everywhere.
