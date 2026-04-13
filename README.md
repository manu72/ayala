# Ayala

**A 2D browser-based adventure game about a homeless cat finding love in the heart of Manila.**

_For Camille -- and every cat who needs a forever home._

---

## About

Ayala is a cozy-but-real top-down adventure game set in the [Ayala Triangle Gardens](https://en.wikipedia.org/wiki/Ayala_Triangle_Gardens), a 2-hectare urban park in the Makati Central Business District, Metro Manila, Philippines. You play as **Mamma Cat**, a black-and-white former pet dumped in the gardens by her owners. Survive the colony of 40-50 homeless cats, find food and water, establish territory, build relationships, and ultimately find your human -- Camille -- who will adopt you and take you home.

The game is inspired by the real cat colony at Ayala Triangle Gardens and the volunteers who care for them. Every cat in the colony is innocent. None are villains. By the time you finish playing, you should feel moved to think about what you can do for stray animals in the real world.

## Project Status

> **Pre-build.** The repository currently contains the RPG JS v4 starter template and project documentation. Game implementation has not yet begun.

### What exists

- RPG JS v4 starter project (scaffolded, dependencies installed)
- [Game Design Document v0.1](docs/Ayala_GDD_v0.1.md) -- comprehensive design covering story, mechanics, map zones, characters, art direction, and technical architecture
- [Phase 1 Build Brief](docs/Phase1_Claude_Code_Brief.md) -- detailed implementation plan for the foundation phase

### What's next

Development follows the five-phase roadmap outlined in the GDD:

| Phase                | Focus                                                                                          | Status      |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| 1. Foundation        | Dev environment, basic ATG map in Tiled, Mamma Cat movement, day/night cycle, standalone build | Not started |
| 2. Core Mechanics    | Hunger/thirst/energy stats, food/water sources, NPC cats, threat indicators, Blacky NPC        | Not started |
| 3. Social & Story    | Named NPC cats, body language animations, trust system, Chapters 1-3, human/dog NPCs           | Not started |
| 4. Camille & Endgame | Camille encounters, Chapters 4-6, snatchers, epilogue, save/load, mobile testing               | Not started |
| 5. Polish & Release  | Playtesting, bug fixes, audio, PWA/offline, deployment                                         | Not started |

## Tech Stack

| Technology                                    | Role                                            |
| --------------------------------------------- | ----------------------------------------------- |
| [RPG JS v4](https://rpgjs.dev)                | Game framework (TypeScript, 2D RPG engine)      |
| [PixiJS v7](https://pixijs.com)               | WebGL rendering                                 |
| [Vue 3](https://vuejs.org)                    | GUI layer (dialogue boxes, menus, HUD)          |
| [Tiled Map Editor](https://www.mapeditor.org) | Map creation (`.tmx` / `.tsx` / `.world` files) |
| [ViteJS v4](https://vitejs.dev)               | Build tooling and hot-reload                    |
| TypeScript 5                                  | Language                                        |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 14
- npm (comes with Node.js)
- [Tiled Map Editor](https://www.mapeditor.org) (for map editing, when development begins)

### Install and Run

```bash
git clone <repo-url> ayala
cd ayala
npm install
npm run dev
```

Navigate to [localhost:3000](http://localhost:3000). You should see the RPG JS starter game running.

To launch in single-player RPG mode (the intended build mode for Ayala):

```bash
RPG_TYPE=rpg npm run dev
```

### Production Build

```bash
NODE_ENV=production npm run build
```

Output goes to `dist/standalone/` -- static files deployable to any host. PWA/offline support is built in.

### Docker

```bash
docker build -t ayala .
docker run -p 3000:3000 -d ayala
```

## Architecture

Configuration lives in `rpg.toml`. The game is organized as modules under `main/`:

```
main/
  player.ts                  # Server-side player hooks (onConnected, onInput, onJoinMap)
  events/                    # NPC event classes (@EventData decorator)
  spritesheets/              # Client-side spritesheet definitions (@Spritesheet decorator)
    characters/              # Character PNGs and config
  worlds/                    # Tiled world/map files
    maps/                    # .tmx maps, .tsx tilesets, tile PNGs
```

Key patterns:

- **Decorators** for configuration (`@EventData`, `@Spritesheet`)
- **Player variables** for game state (`player.setVariable()` / `player.getVariable()`)
- **Tiled maps** authored as `.tmx` files with `.tsx` tileset references, stitched via `.world` files

See the [GDD Section 8](docs/Ayala_GDD_v0.1.md#8-technical-architecture) for full technical architecture details.

## Game Design

The full game design document covers:

- **Story** -- Six chapters from abandonment to adoption, plus an epilogue with real-world cat welfare information
- **Characters** -- 8+ named NPC cats (based on real ATG cats), human NPCs (friendly, neutral, threatening), and dogs
- **Mechanics** -- Day/night cycle, hunger/thirst/energy stats, trust/reputation system, territory claiming, cat body language communication, threat indicators
- **Map** -- Seven zones modelled on real ATG landmarks (Makati Ave edge, Central Gardens, The Shops / Pyramid Steps, Paseo de Roxas underpass, and more)
- **Art** -- Pixel art, top-down perspective, warm tropical palette. Free sprite assets from itch.io and OpenGameArt for v1
- **Audio** -- Ambient city/park sounds and gentle background music sourced from free libraries

Read the full document: [docs/Ayala_GDD_v0.1.md](docs/Ayala_GDD_v0.1.md)

## Target Platform

- **Primary:** Browser-based (Chrome), playable offline via PWA
- **Ideal form factor:** iPad landscape
- **Secondary:** iPhone landscape, desktop with keyboard
- **Mobile controls:** Virtual d-pad via `@rpgjs/mobile-gui` plugin

## Developers

- **Manu** -- Developer
- **Claude** -- AI co-developer

## License

TBD

## Credits

### Starter Template

This project was scaffolded from the [RPG JS Starter](https://github.com/rpgjs/starter).

### Sample Assets (Starter Template)

- **Sounds:** [Davidvitas](https://www.davidvitas.com/portfolio/2016/5/12/rpg-music-pack) -- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Graphics:** [Pipoya](https://pipoya.itch.io)
- **Icons:** [game-icons.net](https://game-icons.net)

---

_There are millions of cats like Mamma Cat. What can you do?_
