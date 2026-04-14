# File Index

## Root Files

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `index.html` | 31 | Active | Vite entry page. Full-viewport `#game-container` div, dark background, loads `src/main.ts` as ES module. |
| `package.json` | 19 | Active | npm manifest. Private package `ayala@0.1.0`. Scripts: dev, build (tsc + vite), preview. Deps: phaser ^3.90.0. DevDeps: pngjs, typescript, vite. |
| `package-lock.json` | 916 | Active | Locked dependency tree. |
| `tsconfig.json` | 22 | Active | Strict TypeScript config. ES2020, bundler resolution, noEmit. Includes only `src/`. |
| `vite.config.ts` | 9 | Active | Relative base path (`./`), output to `dist/` with `assets/` subdirectory. |
| `VERSION` | 1 | Active | `0.1.1` — disagrees with package.json `0.1.0`. |
| `README.md` | 130 | Active | Project overview, status, stack, setup, architecture tree. See gap analysis for issues. |
| `.gitignore` | 5 | Active | Excludes dist, node_modules, CLAUDE.md, .claude/, .DS_Store. |

## docs/

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `Ayala_GDD_v0.1.md` | 620 | Active | Full game design document: story (6 chapters), characters (8+ cats), mechanics (survival, trust, territory), map zones, art direction, technical architecture. |
| `Phase1_Brief_Phaser3.md` | 598 | Active (reference) | Phase 1 technical brief: 7 tasks from scaffold to verified build. All tasks complete. |
| `Phase1_5_Visual_Polish_Brief.md` | 299 | Active (reference) | Phase 1.5 brief: 6 tasks (camera, tileset, sprites, objects, map, verify). All tasks complete. |

## src/

### src/main.ts (4 lines) — Active

Entry point. Creates `new Phaser.Game(gameConfig)`. No other logic.

### src/config/GameConfig.ts (23 lines) — Active

Exports `gameConfig`. Key settings: 816x624 base resolution, pixelArt mode, Arcade physics (zero gravity), Scale.FIT with CENTER_BOTH, scenes: [BootScene, GameScene].

### src/scenes/BootScene.ts (26 lines) — Active

Preloads all assets: tileset image, tilemap JSON, two cat spritesheets (32x32 frames). Transitions to GameScene on completion.

### src/scenes/GameScene.ts (116 lines) — Active

Core gameplay scene. Responsibilities:
- Creates tilemap from JSON with 3 layers (ground, objects with collision, overhead at depth 10)
- Spawns MammaCat at named object point `spawn_mammacat`
- Spawns Blacky NPC at named object point `spawn_blacky`
- Sets up player-to-objects collision
- Initialises DialogueSystem and DayNightCycle
- Configures camera: bounds, 2.5x zoom, follow player, 50px dead zone
- Update loop: day/night tick, player movement (frozen during dialogue), NPC interaction on Enter key
- `tryInteract()`: distance check to Blacky, first-encounter dialogue with registry-based state tracking

### src/sprites/MammaCat.ts (138 lines) — Active

Player character extending `Phaser.Physics.Arcade.Sprite`. Features:
- Cursor key input for 4-directional movement at 120px/s
- 8-column spritesheet layout: rows 0-3 = walk (4 frames each), row 4 = idle (3 frames)
- Normalised diagonal movement
- Physics body: 18x18 hitbox with 7,12 offset
- Floating name label ("Mamma Cat") at depth 5
- Depth 3 for sprite rendering

### src/sprites/NPCCat.ts (52 lines) — Active

Stationary NPC cat extending `Phaser.Physics.Arcade.Sprite` with static body. Features:
- Configurable via NPCCatConfig interface (name, spriteKey, x, y)
- Idle animation from row 4 of 8-column spritesheet (frames 32-34)
- Floating name label at depth 5
- Animation deduplication (checks `anims.exists` before creating)

### src/systems/DayNightCycle.ts (129 lines) — Active

Camera-fixed full-screen rectangle overlay with tint cycling. Features:
- 4 phases: dawn (warm yellow, 8% alpha), day (clear), evening (orange, 15% alpha), night (dark blue, 40% alpha)
- 60-second phase duration (testing value; comment notes "tune later")
- 2-second smoothstep transitions between phases
- Manual RGB/alpha interpolation (not using Phaser tweens)
- Phase label in top-left corner at depth 51

### src/systems/DialogueSystem.ts (81 lines) — Active

Camera-fixed dialogue box anchored to bottom of viewport. Features:
- Semi-transparent black background with white border
- Advances lines on Space key press
- `[Space]` prompt indicator
- Completion callback support
- `isActive` getter used by GameScene to freeze player input during dialogue

## scripts/

| File | Lines | Status | Purpose |
|------|-------|--------|---------|
| `generate-tileset.mjs` | ~300 | Active | Generates `park-tiles.png` (256x160, 8x5 grid of 40 tiles). Per-pixel noise, paving grids, grass blades, water waves, transparent canopies. Outputs `tile-indices.json`. |
| `generate-map.mjs` | ~265 | Active | Generates `atg.json` (100x80 Tiled JSON). Triangle geometry for ATG boundary, 7 zones, 3-4 tile roads with lane markings, winding paths, dense tree placement with overhead canopies, landmarks, spawn points. |
| `generate-sprites.mjs` | 157 | **Stale** | Generates 4-col x 5-row placeholder sprites. Output files (`mammacat.png`, `blacky.png`) are now copies of `fluffy.png` (8-col x 10-row). Running this script would overwrite the correct sprites with broken ones. |
| `tile-indices.json` | 41 | Active (generated) | Named tile ID map with 40 entries. Output of `generate-tileset.mjs`, consumed by `generate-map.mjs`. |

## public/assets/

| File | Size | Status | Notes |
|------|------|--------|-------|
| `sprites/fluffy.png` | 39KB | Active | Template spritesheet (256x320, 8 cols x 10 rows of 32x32 frames). Source of truth for cat animations. |
| `sprites/mammacat.png` | 39KB | Active | Identical copy of fluffy.png. Used by MammaCat. |
| `sprites/blacky.png` | 39KB | Active | Identical copy of fluffy.png. Used by NPCCat (Blacky). |
| `tilemaps/atg.json` | ~80KB | Active (generated) | Minified Tiled JSON. 100x80 map, 3 tile layers + 1 object layer. |
| `tilesets/park-tiles.png` | 83KB | Active (generated) | 256x160 tileset image (8x5 grid of 32x32 tiles). |
