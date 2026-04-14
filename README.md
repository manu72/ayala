# Ayala Triangle

**A 2D browser-based adventure game about a homeless cat in Manila.**

_For Cam and Mamma Cat and every abandoned pet looking for their forever home._

---

## About

Ayala is a cozy-but-real top-down adventure game set in the [Ayala Triangle Gardens](https://en.wikipedia.org/wiki/Ayala_Triangle_Gardens), a 2-hectare urban park in the Makati Central Business District, Metro Manila, Philippines. You play as **Mamma Cat**, a black-and-white former pet dumped in the gardens by her owners. Survive the colony of 40-50 homeless cats, find food and water, establish territory, build relationships, and ultimately find your human who will adopt you and take you home.

The game is inspired by the real cat colony at Ayala Triangle Gardens and the volunteers who care for them. Every cat in the colony is innocent. None are villains. But there are shadowy creatures who come out at night...

## Project Status

**Version 0.1.3** -- Phases 1 through 3 are complete. The game is a playable prototype with survival mechanics, social systems, and the opening story chapters.

### Development Roadmap

| Phase               | Focus                                                                     | Status      |
| ------------------- | ------------------------------------------------------------------------- | ----------- |
| 1. Foundation       | Phaser 3 setup, ATG map, Mamma Cat movement, Blacky NPC, day/night cycle  | Complete    |
| 1.5 Visual Polish   | Camera zoom, textured tiles, animated sprites, map expansion, dense trees | Complete    |
| 2. Core Mechanics   | Hunger/thirst/energy stats, food/water sources, guard NPC, save/load, HUD | Complete    |
| 3. Social & Story   | Named NPC cats, trust system, emotes, chapters 1-3, humans, dogs, journal | Complete    |
| 4. Cam & Endgame    | Cam encounters, Chapters 4-6, snatchers, epilogue                         | Not started |
| 5. Polish & Release | Playtesting, audio, PWA/offline, deployment                               | Not started |

### What exists now

- 100x80 tile map of Ayala Triangle Gardens with 7 distinct zones, roads, and landmarks
- Mamma Cat player character with walk, run, crouch, and rest animations
- **Survival system:** hunger, thirst, and energy stats with environmental modifiers and collapse mechanics
- **Food and water sources** scattered across the map with cooldowns and time-of-day availability
- **Day/night cycle** (dawn, day, evening, night) with smooth colour transitions and a game clock
- **8 named NPC cats** (Blacky, Tiger, Jayco, Jayco Jr, Fluffy, Pedigree, Ginger, Ginger B) with unique dispositions and multi-stage dialogue
- **12 background colony cats** with randomised appearances and behaviours
- **Guard NPC** that patrols and chases the player away from food scraps
- **Human NPCs** (joggers, feeders, dog walkers) following waypoint paths on time-of-day schedules
- **Dogs** that follow dog walkers, bark and lunge when the player gets close
- **Trust and reputation system** tracking global colony trust and per-cat relationships
- **Emote system** showing floating mood indicators above cats
- **Story chapters 1-3** with narration overlays triggered by trust, met-cat counts, and days survived
- **Colony journal** (J key) displaying known cats, trust levels, and colony statistics
- **Save/load system** using localStorage with auto-save and manual save from the pause menu
- **HUD** with stat bars, game clock, rest progress ring, pause menu, and contextual narration
- Camera zoom (2.5x) making Mamma Cat feel small in a large world
- Tree canopies on the overhead layer that render above the player

## How to Play

### Controls

| Input                               | Action                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Arrow keys / WASD                   | Move Mamma Cat                                                           |
| Shift + direction                   | Run (2x speed, drains energy faster)                                     |
| C (tap to toggle, or hold)          | Crouch / hide (slow, harder for threats to detect)                       |
| Space (tap)                         | Interact -- context-sensitive: talk to nearby cat, eat food, drink water |
| Space                               | Advance dialogue text                                                    |
| Z (hold 2 seconds while stationary) | Rest / sleep -- restores energy over time                                |
| Any movement key, Space, or Z       | Wake up from rest                                                        |
| J                                   | Open colony journal                                                      |
| Hold Tab                            | Look around -- camera zooms out to survey the area                       |
| Escape                              | Pause menu (Save Game, Colony Journal, Resume, Quit to Title)            |

### Tips

- **Survival stats** (hunger, thirst, energy) are shown as bars in the top-left corner alongside the in-game clock. Keep them topped up by finding food sources, water, and safe resting spots around the park.
- **Running** is costly -- it drains energy fast and should be used to escape threats, not for casual travel.
- **Crouching** near bushes or tree canopy makes Mamma Cat much harder for the guard to spot.
- **Resting** requires you to hold Z for 2 seconds while standing still. A progress ring appears so you know it's working. Energy restores faster in shade and even faster at designated safe spots.
- **Look around** (Tab) is useful for spotting food, water, threats, and other cats before committing to a direction.
- The **day/night cycle** advances automatically. Different food sources and NPC behaviours are tied to the time of day.
- **Trust** builds over time by spending time near cats, having conversations, and surviving days. Higher trust unlocks new dialogue and changes cat dispositions.
- The **colony journal** (J key) tracks cats you have met, their trust level (shown as hearts), and when you first encountered them.
- The game **auto-saves** at key story moments and safe rest spots. You can also save manually from the pause menu (Escape).

## Tech Stack

| Technology                                   | Version | Role                                           |
| -------------------------------------------- | ------- | ---------------------------------------------- |
| [Phaser 3](https://phaser.io)                | 3.90.0  | WebGL/Canvas 2D game engine, Arcade physics    |
| [Vite](https://vitejs.dev)                   | 8.x     | Build tooling, dev server, hot-reload          |
| [TypeScript](https://www.typescriptlang.org) | 6.x     | Language (strict mode)                         |
| [pngjs](https://github.com/lukeapage/pngjs)  | 7.x     | Dev-only procedural tileset and map generation |

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
├── docs/                                # Design documents and phase briefs
│   ├── Ayala_GDD_v0.1.md              #   Game design document
│   ├── Phase1_Brief_Phaser3.md        #   Phase 1 plan
│   ├── Phase1_5_Visual_Polish_Brief.md #   Phase 1.5 plan
│   ├── Phase2_Core_Mechanics_Brief.md  #   Phase 2 plan
│   ├── P2_Controls_Update_Spec.md     #   Controls spec
│   ├── Phase3_Social_Story_Brief.md   #   Phase 3 plan
│   └── _generated/                     #   Tool-generated doc snapshots
│
├── public/assets/                       # Static game assets (served as-is)
│   ├── sprites/                        #   Character spritesheets
│   │   ├── mammacat.png               #     Player (32x32 frames, 8x10 grid)
│   │   ├── blacky.png                 #     NPC cat
│   │   ├── tiger.png                  #     NPC cat
│   │   ├── jayco.png                  #     NPC cat
│   │   ├── fluffy.png                 #     NPC cat (also used as placeholder)
│   │   ├── guard.png                  #     Guard / human NPCs (64x64 frames)
│   │   ├── ginger-IDLE.png            #     Ginger cat strip (64x64 frames)
│   │   ├── ginger-WALK.png            #     Ginger cat strip
│   │   ├── ginger-RUN.png             #     Ginger cat strip
│   │   └── Black-*.png                #     Additional black cat animation strips
│   ├── tilemaps/
│   │   └── atg.json                    #   100x80 Tiled JSON map (generated)
│   └── tilesets/
│       └── park-tiles.png              #   40-tile textured tileset (generated)
│
├── scripts/                             # Dev-time asset generators (Node.js)
│   ├── generate-tileset.mjs            #   Generates park-tiles.png + tile-indices.json
│   ├── generate-map.mjs               #   Generates atg.json from tile indices
│   └── tile-indices.json               #   Named tile ID map (generated output)
│
├── src/                                 # Game source (TypeScript)
│   ├── main.ts                         #   Entry point -- creates Phaser.Game
│   ├── config/
│   │   ├── GameConfig.ts               #   Resolution, physics, scenes, scaling
│   │   └── constants.ts                #   Shared constants
│   ├── scenes/
│   │   ├── BootScene.ts                #   Asset preloading
│   │   ├── StartScene.ts               #   Title screen, new/continue
│   │   ├── GameScene.ts                #   Main game loop
│   │   ├── HUDScene.ts                 #   Overlay: stats, dialogue, pause, narration
│   │   └── JournalScene.ts             #   Colony journal overlay
│   ├── sprites/
│   │   ├── MammaCat.ts                 #   Player character
│   │   ├── NPCCat.ts                  #   NPC cat (AI, config-driven)
│   │   ├── GuardNPC.ts                #   Guard patrol and chase
│   │   ├── HumanNPC.ts                #   Waypoint-following humans
│   │   └── DogNPC.ts                  #   Dog follower with bark/lunge
│   └── systems/
│       ├── DayNightCycle.ts            #   4-phase time cycle
│       ├── StatsSystem.ts              #   Hunger/thirst/energy
│       ├── DialogueSystem.ts           #   Bottom-screen dialogue box
│       ├── FoodSource.ts               #   Food/water sources
│       ├── SaveSystem.ts               #   localStorage save/load
│       ├── TrustSystem.ts              #   Trust and reputation
│       ├── EmoteSystem.ts              #   Floating text emotes
│       ├── ChapterSystem.ts            #   Story chapter progression
│       └── ThreatIndicator.ts          #   NPC disposition indicators
│
├── index.html                           # Vite entry page
├── package.json                         # npm manifest
├── tsconfig.json                        # TypeScript config (strict)
├── vite.config.ts                       # Vite config (relative base, dist output)
└── VERSION                              # 0.1.3
```

## Asset Generation

The tileset and map are generated procedurally, not drawn in a GUI. To regenerate after editing the scripts:

```bash
node scripts/generate-tileset.mjs   # Regenerates park-tiles.png and tile-indices.json
node scripts/generate-map.mjs       # Regenerates atg.json (reads tile-indices.json)
```

Both scripts use `pngjs` (dev dependency) and write to `public/assets/`. The generated files are committed to git so the game runs without needing to regenerate them.

Cat spritesheets use a mix of 32x32 grid sheets (mammacat, blacky, tiger, jayco, fluffy) and 64x64 strip sheets (ginger cats). The guard spritesheet is reused with colour tints for human NPCs (joggers, feeders, dog walkers).

## Architecture

The game uses Phaser 3's scene system with five scenes:

1. **BootScene** preloads all assets (tileset image, tilemap JSON, spritesheets)
2. **StartScene** shows the title screen with Continue (if save exists) and New Game options
3. **GameScene** is the main gameplay loop:
   - Creates a 3-layer tilemap (ground, objects with collision, overhead canopy)
   - Spawns player, NPC cats, guard, human NPCs, and dogs
   - Runs day/night cycle, stat decay, trust ticking, and chapter progression
   - Handles keyboard input and proximity-based interaction
   - Camera follows player at 2.5x zoom with dead zone
4. **HUDScene** runs as a parallel overlay, rendering stat bars, game clock, dialogue box, pause menu, rest progress, and contextual narration
5. **JournalScene** is launched on demand (J key or pause menu) to display known cats and trust levels

Scenes communicate via direct typed references (`scene.get("GameScene")`), Phaser's registry for story flags, and `DayNightCycle`'s event emitter for `newDay` events.

State is persisted to `localStorage` via `SaveSystem`, which tracks player position, stats, time of day, food source states, trust data, and story flags. The save is validated on load with structure and range checks.

## Game Design

The full game design document covers story (6 chapters from abandonment to adoption), characters (8+ named NPC cats based on real ATG cats), mechanics (day/night cycle, survival stats, trust system, territory), and a map modelled on the real Ayala Triangle Gardens.

Read the full document: [docs/Ayala_GDD_v0.1.md](docs/Ayala_GDD_v0.1.md)

## Target Platform

- **Primary:** Browser-based (Chrome), playable offline via PWA (planned Phase 5)
- **Ideal form factor:** iPad landscape
- **Secondary:** iPhone landscape, desktop with keyboard

## Known Limitations

- No audio (planned Phase 5)
- No test suite
- No CI/CD pipeline
- Crouch has no dedicated animation yet (uses walk animation)
- GameScene is growing large (~1143 lines) and could benefit from extraction of subsystems
- Colony cat spawn positions are hardcoded, not tied to map POIs
- The `"wary"` disposition affects indicators and narration but not yet NPC AI behaviour weights

## Developers

- **Manu** -- Developer
- **Claude** -- AI co-developer

## License

TBD

---

_There are millions of cats like Mamma Cat. What can you do?_
