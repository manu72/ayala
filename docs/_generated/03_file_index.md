# File Index

> Generated: 2026-04-14 | Version: 0.1.3

## Source Files (`src/`)

| File | Purpose | Status | Key Exports |
| --- | --- | --- | --- |
| `main.ts` | Creates Phaser.Game with gameConfig | Active | Side-effect only |
| `config/GameConfig.ts` | Phaser config: 816x624, Arcade physics, FIT scaling, scene list | Active | `gameConfig` |
| `config/constants.ts` | Shared timing constant | Active | `REST_HOLD_MS` |
| `scenes/BootScene.ts` | Preloads tileset, tilemap, all sprite sheets | Active | `BootScene` |
| `scenes/StartScene.ts` | Title screen with Continue/New Game, save detection | Active | `StartScene` |
| `scenes/GameScene.ts` | Main game: tilemap, player, NPCs, guard, humans, dogs, food, trust, emotes, chapters, camera, input, save/load | Active | `GameScene` |
| `scenes/HUDScene.ts` | Overlay: stat bars, clock, rest progress ring, pause menu, dialogue, narration | Active | `HUDScene` |
| `scenes/JournalScene.ts` | Colony journal overlay with cat entries, trust hearts, scroll | Active | `JournalScene` |
| `sprites/MammaCat.ts` | Player character: WASD/arrow movement, run, crouch, rest, physics body | Active | `MammaCat`, `PlayerState` |
| `sprites/NPCCat.ts` | Config-driven NPC cat: state machine, disposition, time-of-day behavior, configurable animPrefix/scale/walkSpeed/hyperactive | Active | `NPCCat`, `NPCCatConfig`, `CatState`, `Disposition` |
| `sprites/GuardNPC.ts` | Guard: patrol waypoints, chase player near food scraps | Active | `GuardNPC` |
| `sprites/HumanNPC.ts` | Human NPCs: waypoint path following, phase-active (jogger/feeder/dogwalker) | Active | `HumanNPC`, `HumanConfig`, `HumanType` |
| `sprites/DogNPC.ts` | Dog: follows dog-walker owner, barks/lunges at nearby player, startles NPC cats | Active | `DogNPC` |
| `systems/DayNightCycle.ts` | 4-phase time cycle (dawn/day/evening/night), overlay tint, game clock, emits newDay | Active | `DayNightCycle`, `TimeOfDay` |
| `systems/StatsSystem.ts` | Hunger/thirst/energy simulation with decay, environment modifiers, collapse | Active | `StatsSystem`, `CatStats` |
| `systems/DialogueSystem.ts` | Bottom-screen text dialogue with Space to advance | Active | `DialogueSystem` |
| `systems/FoodSource.ts` | Interactive food/water sources, ground markers, cooldowns | Active | `FoodSourceManager`, `SourceType` |
| `systems/SaveSystem.ts` | localStorage save/load with validation, tracked registry keys | Active | `SaveSystem`, `SaveData` |
| `systems/TrustSystem.ts` | Global + per-cat trust (0-100), proximity ticking, conversation rewards | Active | `TrustSystem`, `TrustData` |
| `systems/EmoteSystem.ts` | Floating text emotes above sprites with cooldowns | Active | `EmoteSystem`, `EmoteType` |
| `systems/ChapterSystem.ts` | Chapter defs with trust/met-cat/day conditions, narration queue | Active | `ChapterSystem`, `ChapterDef` |
| `systems/ThreatIndicator.ts` | Floating name + disposition symbol above entities | Active | `ThreatIndicator` |

## Design Documents (`docs/`)

| File | Purpose | Status |
| --- | --- | --- |
| `Ayala_GDD_v0.1.md` | Full game design document | Active reference |
| `Phase1_Brief_Phaser3.md` | Phase 1 implementation plan | Complete |
| `Phase1_5_Visual_Polish_Brief.md` | Phase 1.5 implementation plan | Complete |
| `Phase2_Core_Mechanics_Brief.md` | Phase 2 implementation plan | Complete |
| `P2_Controls_Update_Spec.md` | Controls specification | Active reference |
| `Phase3_Social_Story_Brief.md` | Phase 3 implementation plan | Complete |

## Scripts (`scripts/`)

| File | Purpose | Status |
| --- | --- | --- |
| `generate-tileset.mjs` | Generates park-tiles.png (256x160) and tile-indices.json | Active |
| `generate-map.mjs` | Generates atg.json (100x80 Tiled map) from tile-indices.json | Active |
| `tile-indices.json` | Tile name-to-index mapping (generated output) | Generated |

## Config Files

| File | Purpose | Status |
| --- | --- | --- |
| `package.json` | npm manifest, scripts, dependencies | Active (version 0.1.1 -- drift) |
| `tsconfig.json` | TypeScript strict config, ES2020, bundler resolution | Active |
| `vite.config.ts` | Vite: relative base, dist output, assets dir | Active |
| `index.html` | Vite entry: #game-container, loads src/main.ts | Active |
