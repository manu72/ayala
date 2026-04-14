# Ayala

**A 2D browser-based adventure game about a homeless cat finding love in the heart of Manila.**

*For Camille -- and every cat who needs a forever home.*

---

## About

Ayala is a cozy-but-real top-down adventure game set in the [Ayala Triangle Gardens](https://en.wikipedia.org/wiki/Ayala_Triangle_Gardens), a 2-hectare urban park in the Makati Central Business District, Metro Manila, Philippines. You play as **Mamma Cat**, a black-and-white former pet dumped in the gardens by her owners. Survive the colony of 40-50 homeless cats, find food and water, establish territory, build relationships, and ultimately find your human -- Camille -- who will adopt you and take you home.

The game is inspired by the real cat colony at Ayala Triangle Gardens and the volunteers who care for them. Every cat in the colony is innocent. None are villains. By the time you finish playing, you should feel moved to think about what you can do for stray animals in the real world.

## Project Status

> **Phase 1.5 -- Visual Polish.** Refining the prototype into something that looks and feels like a real game.

### What exists

- Playable Phaser 3 game with 100x80 tile map of Ayala Triangle Gardens
- Mamma Cat player character with animated walk/idle cycles
- Blacky NPC with dialogue system at the Paseo de Roxas underpass
- Day/night cycle with smooth phase transitions
- Textured tileset with grass, stone paths, roads, buildings, water, and environmental objects
- Camera zoom (2.5x) making Mamma Cat feel small in a large world
- [Game Design Document v0.1](docs/Ayala_GDD_v0.1.md) -- comprehensive design covering story, mechanics, map zones, characters, art direction, and technical architecture
- [Phase 1 Build Brief](docs/Phase1_Brief_Phaser3.md) -- foundation implementation plan
- [Phase 1.5 Visual Polish Brief](docs/Phase1_5_Visual_Polish_Brief.md) -- visual refinement plan

### Development Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| 1. Foundation | Phaser 3 setup, ATG map, Mamma Cat movement, Blacky NPC, day/night cycle | Complete |
| 1.5 Visual Polish | Camera zoom, textured tiles, animated sprites, map expansion, dense trees | Complete |
| 2. Core Mechanics | Hunger/thirst/energy stats, food/water sources, NPC cats, threat indicators | Not started |
| 3. Social & Story | Named NPC cats, body language animations, trust system, Chapters 1-3 | Not started |
| 4. Camille & Endgame | Camille encounters, Chapters 4-6, snatchers, epilogue, save/load | Not started |
| 5. Polish & Release | Playtesting, audio, PWA/offline, deployment | Not started |

## Tech Stack

| Technology | Role |
|------------|------|
| [Phaser 3](https://phaser.io) | Game framework (WebGL/Canvas 2D game engine) |
| [Vite](https://vitejs.dev) | Build tooling and hot-reload |
| [TypeScript](https://www.typescriptlang.org) | Language |
| [Tiled Map Editor](https://www.mapeditor.org) | Map creation (JSON export consumed by Phaser) |

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

Navigate to [localhost:5173](http://localhost:5173). You should see the game running.

### Production Build

```bash
npm run build
```

Output goes to `dist/` -- static files deployable to any host.

### Preview Production Build

```bash
npm run preview
```

## Architecture

```
src/
  main.ts                     # Entry point -- creates Phaser.Game
  config/
    GameConfig.ts             # Phaser game configuration
  scenes/
    BootScene.ts              # Asset loading
    GameScene.ts              # Main gameplay scene
  sprites/
    MammaCat.ts               # Player character class
    NPCCat.ts                 # NPC cat class (Blacky, etc.)
  systems/
    DayNightCycle.ts          # Day/night tint overlay
    DialogueSystem.ts         # Text dialogue overlay
public/
  assets/
    sprites/                  # Cat spritesheets
    tilemaps/                 # Tiled JSON maps
    tilesets/                 # Tileset images
```

## Game Design

The full game design document covers story (6 chapters from abandonment to adoption), characters (8+ named NPC cats based on real ATG cats), mechanics (day/night cycle, survival stats, trust system, territory), and a map modelled on the real Ayala Triangle Gardens.

Read the full document: [docs/Ayala_GDD_v0.1.md](docs/Ayala_GDD_v0.1.md)

## Target Platform

- **Primary:** Browser-based (Chrome), playable offline via PWA
- **Ideal form factor:** iPad landscape
- **Secondary:** iPhone landscape, desktop with keyboard

## Developers

- **Manu** -- Developer
- **Claude** -- AI co-developer

## License

TBD

---

*There are millions of cats like Mamma Cat. What can you do?*
