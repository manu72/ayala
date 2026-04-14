# WORKING_MEMORY

> Persistent memory layer for AI-assisted development sessions.
> Last Updated: 2026-04-14
> Version: 0.1.3

---

## Project Overview

**Ayala** is a 2D top-down cat adventure game built with Phaser 3 + Vite + TypeScript. The player controls Mamma Cat, a dumped pet navigating the colony at Ayala Triangle Gardens in Makati, Manila.

- **Branch:** `sit` (active development)
- **Repo:** 65 commits, ~6300 LoC (22 TypeScript source files)
- **Build:** `npx vite build` produces static files in `dist/`

---

## Development Phase Status

| Phase                | Status      | Notes                                                          |
| -------------------- | ----------- | -------------------------------------------------------------- |
| 1. Foundation        | Complete    | Tilemap, player, NPC, day/night                                |
| 1.5 Visual Polish    | Complete    | Camera zoom, textured tiles, animations, overhead layer        |
| 2. Core Mechanics    | Complete    | Stats, food/water, guard, save/load, rest, crouch, HUD         |
| 3. Social & Story    | Complete    | Trust, emotes, chapters 1-3, named cats, humans, dogs, journal |
| 4. Camille & Endgame | Not started | Chapters 4-6, snatchers, epilogue                              |
| 5. Polish & Release  | Not started | Audio, PWA, playtesting, deployment                            |

---

## Architecture

### Scene Graph

```text
BootScene -> StartScene -> GameScene + HUDScene (overlay) + JournalScene (overlay)
```

- **BootScene** (`src/scenes/BootScene.ts`): Loads all assets (tilesets, spritesheets)
- **StartScene** (`src/scenes/StartScene.ts`): Title screen, New/Continue
- **GameScene** (`src/scenes/GameScene.ts`): Main game loop, NPC management, input, chapters (~1143 lines)
- **HUDScene** (`src/scenes/HUDScene.ts`): Stats bars, clock, rest progress, pause menu, narration, dialogue
- **JournalScene** (`src/scenes/JournalScene.ts`): Colony journal overlay (J key or pause menu)

### Sprite Types

| File          | Purpose                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| `MammaCat.ts` | Player (WASD, run, crouch tap/hold, rest)                                                     |
| `NPCCat.ts`   | Generic NPC cat with state machine, config-driven (animPrefix, scale, walkSpeed, hyperactive) |
| `GuardNPC.ts` | Guard that patrols and chases player from food scraps                                         |
| `HumanNPC.ts` | Waypoint-following humans (jogger/feeder/dogwalker), phase-active                             |
| `DogNPC.ts`   | Follows dog-walker owner, barks/lunges at player                                              |

### Systems

| File                 | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `TrustSystem.ts`     | Global + per-cat trust scores (0-100), proximity ticking, conversation rewards      |
| `EmoteSystem.ts`     | Floating text emotes above entities (heart, alert, curious, sleep, hostile, danger) |
| `ChapterSystem.ts`   | Chapter progression with trust/met-cat/day thresholds                               |
| `DayNightCycle.ts`   | 4-phase cycle (dawn/day/evening/night), emits `newDay` event                        |
| `StatsSystem.ts`     | Hunger/thirst/energy with environment modifiers                                     |
| `FoodSource.ts`      | Interactive food/water sources with cooldowns and persistence                       |
| `SaveSystem.ts`      | localStorage save/load with validation                                              |
| `ThreatIndicator.ts` | Floating name + disposition symbol above NPCs                                       |
| `DialogueSystem.ts`  | Bottom-screen dialogue box                                                          |

### Key Config

- `src/config/constants.ts`: Shared constants (REST_HOLD_MS)
- `src/config/GameConfig.ts`: Phaser config, scene list, resolution (816x624)

---

## Sprite Assets

**Grid sheets (256x320, 8 cols x 10 rows, 32x32 frames):**
mammacat, blacky, tiger, jayco, fluffy

**Ginger strips (64x64 frames, scaled 0.5 in-game):**
ginger-WALK (15 frames), ginger-IDLE (10), ginger-RUN (10)

**Guard (512x448, 8 cols x 7 rows, 64x64 frames):**
guard.png (also used tinted for joggers/feeders/dogwalkers)

### Animation Row Mapping (Grid Sheets)

| Row | Index | Animation                           |
| --- | ----- | ----------------------------------- |
| 0-3 | 0-3   | sit-down/left/right/up (stationary) |
| 5   | 4     | walk (all directions)               |
| 6   | 5     | run / flee                          |
| 7   | 6     | rest / sleep                        |

---

## Save System

- Key: `ayala_save` in localStorage
- Tracked registry keys: MET_BLACKY, TIGER_TALKS, JAYCO_TALKS, KNOWN_CATS, CHAPTER, CH1_RESTED, FLUFFY_TALKS, PEDIGREE_TALKS, MET_GINGER_A, MET_GINGER_B, JAYCO_JR_TALKS, JOURNAL_MET_DAYS
- Also persists: player position, stats, timeOfDay, gameTimeMs, sourceStates, trust data
- Validation: `isValidSave()` checks structure, types, and ranges

---

## Named NPC Cats

| Name     | Sprite                  | Zone           | Disposition             | Special                     |
| -------- | ----------------------- | -------------- | ----------------------- | --------------------------- |
| Blacky   | blacky                  | 5 (underpass)  | neutral                 | Orientation dialogue        |
| Tiger    | tiger                   | 3 (central)    | territorial -> friendly | Multi-stage warmup          |
| Jayco    | jayco                   | 6 (shops)      | friendly                | Food/guard tips             |
| Jayco Jr | jayco (0.7 scale)       | 6 (near Jayco) | friendly                | Hyperactive kitten          |
| Fluffy   | fluffy                  | 3 (central)    | neutral                 | Aloof, trust-gated dialogue |
| Pedigree | fluffy                  | 2 (Nielson)    | neutral                 | Former pet, night warnings  |
| Ginger   | ginger-idle (0.5 scale) | 4 (fountain)   | wary                    | Territorial pair            |
| Ginger B | ginger-idle (0.5 scale) | 4 (fountain)   | wary                    | Silent twin                 |

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

### Entity Identity

- Background NPCs sharing the same `npcName` causes collisions in name-keyed maps (narration cooldowns, trust proximity throttling). Always use unique identifiers.

### Feeder Waypoint Behavior

- Feeder linger logic must be constrained to the station waypoint index only. On activation, feeders should target waypoint 1 (the station) not waypoint 0 (spawn), to avoid immediately lingering at spawn.

---

## Technical Debt

- **No test suite:** No unit or integration tests exist.
- **No audio:** Planned for Phase 5.
- **No CI/CD pipeline.**
- **Tilemap POI names are hardcoded:** Spawn points, food sources, shelter POIs use string names matched between Tiled JSON and GameScene. No validation that map contains expected POIs.
- **GameScene is ~1143 lines:** Becoming a god object. Dialogue handlers, NPC spawning, and human/dog management could be extracted.
- **Colony cat random positions:** Not tied to map POIs; positions are hardcoded zone coordinates with random offsets. May clip into objects.
- **Disposition type `"wary"` added in Phase 3:** Not yet used in NPC AI behavior weights (only affects emotes/narration/indicators).
