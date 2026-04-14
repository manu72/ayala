# Architecture Map

> Generated: 2026-04-14 | Version: 0.1.3

## Runtime Flow

```
index.html
  └── src/main.ts → new Phaser.Game(gameConfig)
        └── BootScene (preload assets)
              └── StartScene (title menu: New / Continue)
                    └── GameScene (main world)
                          ├── launch HUDScene (overlay: stats, dialogue, narration, pause)
                          └── launch JournalScene (overlay: colony journal, on demand)
```

## Scene Responsibilities

| Scene | Key Systems | Lifecycle |
| --- | --- | --- |
| BootScene | Asset loading | Runs once at startup |
| StartScene | Save detection, menu | Shown before gameplay |
| GameScene | Tilemap, player, NPCs, guard, humans, dogs, food, trust, emotes, chapters, camera, input, save/load | Persistent during gameplay |
| HUDScene | Stats bars, clock, rest progress, pause menu, dialogue, narration | Overlay, launched by GameScene |
| JournalScene | Cat entries, trust hearts, scroll | Overlay, launched on demand (J key or pause menu) |

## Inter-Scene Communication

- **Direct references:** `scene.get("GameScene")` / `scene.get("HUDScene")` with typed casts
- **Registry:** `Phaser.Data.DataManager` for story flags and shared state
- **Events:** `DayNightCycle` extends `EventEmitter`, emits `newDay`

## Physics

- Arcade only, top-down (gravity 0,0)
- World bounds from tilemap dimensions
- Colliders: player vs objects layer, player vs guard, player vs food sources

## Scaling

- Fixed logical size: 816 x 624
- `Scale.FIT` + `Scale.CENTER_BOTH`
- `pixelArt: true`

## Persistence

- `localStorage` key: `ayala_save`
- Validated on load (structure, types, ranges)
- Auto-save at rest spots and story beats; manual via pause menu
