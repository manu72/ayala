# Architecture Map

## Runtime Architecture

```
Browser (Chrome / Safari)
  └── Phaser 3.90.0 (WebGL with Canvas fallback)
        ├── BootScene — preloads all assets
        └── GameScene — main gameplay loop
              ├── Tilemap (3 layers: ground, objects, overhead)
              ├── MammaCat (player sprite, keyboard input, Arcade physics)
              ├── NPCCat (Blacky — static body, idle animation)
              ├── DialogueSystem (camera-fixed text overlay)
              └── DayNightCycle (camera-fixed tinted overlay)
```

## Build Pipeline

```
TypeScript source (src/) ──tsc──> type-check ──vite build──> dist/
                                                               ├── index.html
                                                               └── assets/
                                                                     └── index-*.js (bundled)
```

Static assets in `public/` are copied verbatim to `dist/` by Vite.

## Asset Pipeline

```
scripts/generate-tileset.mjs ──pngjs──> public/assets/tilesets/park-tiles.png
scripts/generate-map.mjs     ──JSON──>  public/assets/tilemaps/atg.json
scripts/generate-sprites.mjs ──pngjs──> (STALE — output replaced by fluffy.png copies)
```

Tileset and map are procedurally generated at dev time, not at build time.
Asset generators are run manually; their output is committed to git.

## Tech Stack

| Layer        | Technology          | Version  | Notes                          |
|-------------|---------------------|----------|--------------------------------|
| Framework    | Phaser 3            | ^3.90.0  | WebGL/Canvas 2D game engine    |
| Language     | TypeScript          | ^6.0.2   | Strict mode, ES2020 target     |
| Build        | Vite                | ^8.0.8   | Dev server + production bundler |
| Asset gen    | pngjs               | ^7.0.0   | Dev-only, procedural tile/sprite gen |
| Physics      | Phaser Arcade       | built-in | Zero-gravity top-down collisions |
| Maps         | Tiled JSON format   | —        | Generated programmatically, not via Tiled GUI |

## State Management

- **Player variables:** `Phaser.Game.registry` (`MET_BLACKY` boolean)
- **No external state store, no save/load, no persistence**

## Deployment Target

- Static files in `dist/` deployable to any CDN/static host
- No server-side runtime
- No PWA/service worker yet (planned Phase 5)
- `base: './'` in Vite config enables relative paths for subdirectory deployment
