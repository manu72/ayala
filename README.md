# Ayala

**A 2D browser-based adventure game about a homeless cat finding love in the heart of Manila.**

*For Camille -- and every cat who needs a forever home.*

---

## About

Ayala is a cozy-but-real top-down adventure game set in the [Ayala Triangle Gardens](https://en.wikipedia.org/wiki/Ayala_Triangle_Gardens), a 2-hectare urban park in the Makati Central Business District, Metro Manila, Philippines. You play as **Mamma Cat**, a black-and-white former pet dumped in the gardens by her owners. Survive the colony of 40-50 homeless cats, find food and water, establish territory, build relationships, and ultimately find your human -- Camille -- who will adopt you and take you home.

The game is inspired by the real cat colony at Ayala Triangle Gardens and the volunteers who care for them. Every cat in the colony is innocent. None are villains. By the time you finish playing, you should feel moved to think about what you can do for stray animals in the real world.

## Project Status

**Version 0.1.1** -- Phase 1 (Foundation) and Phase 1.5 (Visual Polish) are complete. The game is a playable prototype with movement, NPC interaction, a day/night cycle, and a textured tile map.

### Development Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| 1. Foundation | Phaser 3 setup, ATG map, Mamma Cat movement, Blacky NPC, day/night cycle | Complete |
| 1.5 Visual Polish | Camera zoom, textured tiles, animated sprites, map expansion, dense trees | Complete |
| 2. Core Mechanics | Hunger/thirst/energy stats, food/water sources, NPC cats, threat indicators | Not started |
| 3. Social & Story | Named NPC cats, body language animations, trust system, Chapters 1-3 | Not started |
| 4. Camille & Endgame | Camille encounters, Chapters 4-6, snatchers, epilogue, save/load | Not started |
| 5. Polish & Release | Playtesting, audio, PWA/offline, deployment | Not started |

### What exists now

- 100x80 tile map of Ayala Triangle Gardens with 7 distinct zones, roads, and landmarks
- Mamma Cat player character with 4-directional walk and idle animations
- Blacky NPC with dialogue (first-encounter and repeat interactions)
- Day/night cycle (dawn, day, evening, night) with smooth colour transitions
- Textured tileset with grass, stone paths, roads, buildings, water, trees, and environmental objects
- Camera zoom (2.5x) making Mamma Cat feel small in a large world
- Tree canopies on the overhead layer that render above the player
- Production build to static files

## How to Play

### Controls

| Input | Action |
|-------|--------|
| Arrow keys / WASD | Move Mamma Cat |
| Shift + direction | Run (2x speed, drains energy faster) |
| Shift + Down (S / Arrow Down) | Crouch / hide (slow, harder for threats to detect) |
| Space (tap) | Interact -- context-sensitive: talk to nearby cat, eat food, drink water |
| Space | Advance dialogue text |
| Z (hold 2 seconds while stationary) | Rest / sleep -- restores energy over time |
| Any movement key, Space, or Z | Wake up from rest |
| Hold Tab | Look around -- camera zooms out to survey the area |
| Escape | Pause menu (Save Game, Resume, Quit to Title) |

### Tips

- **Survival stats** (hunger, thirst, energy) are shown as bars in the top-left corner alongside the in-game clock. Keep them topped up by finding food sources, water, and safe resting spots around the park.
- **Running** is costly -- it drains energy fast and should be used to escape threats, not for casual travel.
- **Crouching** near bushes or tree canopy makes Mamma Cat much harder for the guard to spot.
- **Resting** requires you to hold Z for 2 seconds while standing still. A progress ring appears so you know it's working. Energy restores faster in shade and even faster at designated safe spots.
- **Look around** (Tab) is useful for spotting food, water, threats, and other cats before committing to a direction.
- The **day/night cycle** advances automatically. Different food sources and NPC behaviours are tied to the time of day.
- The game **auto-saves** at key story moments and safe rest spots. You can also save manually from the pause menu (Escape).

## Tech Stack

| Technology | Version | Role |
|------------|---------|------|
| [Phaser 3](https://phaser.io) | 3.90.0 | WebGL/Canvas 2D game engine, Arcade physics |
| [Vite](https://vitejs.dev) | 8.x | Build tooling, dev server, hot-reload |
| [TypeScript](https://www.typescriptlang.org) | 6.x | Language (strict mode) |
| [pngjs](https://github.com/lukeapage/pngjs) | 7.x | Dev-only procedural tileset and map generation |

Maps are generated programmatically via Node.js scripts (not via the Tiled GUI), exported as Tiled-compatible JSON consumed by Phaser's tilemap loader.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 18
- npm (comes with Node.js)

### Install and Run

```bash
git clone <repo-url> ayala
cd ayala
npm install
npm run dev
```

Vite will start a dev server (default port 5173, or the next available port). Open the URL shown in the terminal.

### Production Build

```bash
npm run build
```

Output goes to `dist/` -- static files deployable to any host (Netlify, Vercel, S3, etc.).

### Preview Production Build

```bash
npm run preview
```

Serves the `dist/` folder locally to verify the production build before deploying.

## Project Structure

```
ayala/
├── docs/                               # Design documents and briefs
│   ├── Ayala_GDD_v0.1.md              #   Game Design Document (vision, story, mechanics, map)
│   ├── Phase1_Brief_Phaser3.md        #   Phase 1 implementation plan
│   └── Phase1_5_Visual_Polish_Brief.md #   Phase 1.5 visual polish plan
│
├── public/assets/                      # Static game assets (served as-is)
│   ├── sprites/                       #   Cat spritesheets (32x32 frames)
│   │   ├── fluffy.png                 #     Template spritesheet (256x320, 8x10 grid)
│   │   ├── mammacat.png              #     Player character
│   │   └── blacky.png                #     NPC character
│   ├── tilemaps/
│   │   └── atg.json                   #   100x80 Tiled JSON map (generated)
│   └── tilesets/
│       └── park-tiles.png             #   40-tile textured tileset (generated)
│
├── scripts/                            # Dev-time asset generators (Node.js)
│   ├── generate-tileset.mjs           #   Generates park-tiles.png + tile-indices.json
│   ├── generate-map.mjs              #   Generates atg.json from tile indices
│   └── tile-indices.json              #   Named tile ID map (generated output)
│
├── src/                                # Game source (TypeScript)
│   ├── main.ts                        #   Entry point — creates Phaser.Game
│   ├── config/
│   │   └── GameConfig.ts              #   Resolution, physics, scenes, scaling
│   ├── scenes/
│   │   ├── BootScene.ts               #   Asset preloading
│   │   └── GameScene.ts               #   Tilemap, spawns, camera, input, game loop
│   ├── sprites/
│   │   ├── MammaCat.ts                #   Player character (movement, animations)
│   │   └── NPCCat.ts                 #   NPC cat (idle animation, name label)
│   └── systems/
│       ├── DayNightCycle.ts           #   Time-of-day overlay with phase transitions
│       └── DialogueSystem.ts          #   Bottom-screen text dialogue box
│
├── index.html                          # Vite entry page
├── package.json                        # npm manifest
├── tsconfig.json                       # TypeScript config (strict)
├── vite.config.ts                      # Vite config (relative base, dist output)
└── VERSION                             # Semver (0.1.1)
```

## Asset Generation

The tileset and map are generated procedurally, not drawn in a GUI. To regenerate after editing the scripts:

```bash
node scripts/generate-tileset.mjs   # Regenerates park-tiles.png and tile-indices.json
node scripts/generate-map.mjs       # Regenerates atg.json (reads tile-indices.json)
```

Both scripts use `pngjs` (dev dependency) and write to `public/assets/`. The generated files are committed to git so the game runs without needing to regenerate them.

Cat spritesheets (`mammacat.png`, `blacky.png`) are currently copies of `fluffy.png`, a hand-drawn template spritesheet. They will be replaced with unique art per cat in a future phase.

## Architecture

The game uses Phaser 3's scene system:

1. **BootScene** preloads all assets (tileset image, tilemap JSON, cat spritesheets)
2. **GameScene** is the main gameplay loop:
   - Creates a 3-layer tilemap (ground, objects with collision, overhead canopy)
   - Spawns player and NPC from named map objects
   - Runs day/night cycle (4 phases, 60s each, smoothstep transitions)
   - Handles keyboard input and NPC proximity-based interaction
   - Camera follows player at 2.5x zoom with dead zone

State is tracked via Phaser's registry (`MET_BLACKY` flag). No persistence or save/load exists yet.

## Game Design

The full game design document covers story (6 chapters from abandonment to adoption), characters (8+ named NPC cats based on real ATG cats), mechanics (day/night cycle, survival stats, trust system, territory), and a map modelled on the real Ayala Triangle Gardens.

Read the full document: [docs/Ayala_GDD_v0.1.md](docs/Ayala_GDD_v0.1.md)

## Target Platform

- **Primary:** Browser-based (Chrome), playable offline via PWA (planned Phase 5)
- **Ideal form factor:** iPad landscape
- **Secondary:** iPhone landscape, desktop with keyboard

## Known Limitations

- No audio (planned Phase 5)
- No save/load or persistence
- No test suite
- Both cat sprites use the same template spritesheet (fluffy.png) -- unique art per cat is a future task
- Day/night phase duration (60s) is a testing placeholder
- No CI/CD pipeline
- No linter or formatter configured

## Developers

- **Manu** -- Developer
- **Claude** -- AI co-developer

## License

TBD

---

*There are millions of cats like Mamma Cat. What can you do?*
