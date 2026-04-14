# Folder Structure

```
ayala/
├── docs/                           # Design documents and briefs
│   ├── Ayala_GDD_v0.1.md          #   Game Design Document (620 lines)
│   ├── Phase1_Brief_Phaser3.md    #   Phase 1 implementation plan (598 lines)
│   ├── Phase1_5_Visual_Polish_Brief.md  # Phase 1.5 visual polish plan (299 lines)
│   └── _generated/                #   Auto-generated docsync working artifacts
│
├── public/                         # Static assets (served as-is by Vite)
│   └── assets/
│       ├── sprites/               #   Cat spritesheets (PNG)
│       │   ├── mammacat.png       #     Player character (copy of fluffy.png)
│       │   ├── blacky.png         #     NPC character (copy of fluffy.png)
│       │   └── fluffy.png         #     Template spritesheet (256x320, 8x10 frames)
│       ├── tilemaps/              #   Tiled JSON map data
│       │   └── atg.json           #     100x80 tile map of Ayala Triangle Gardens
│       └── tilesets/              #   Tileset images
│           └── park-tiles.png     #     40-tile textured tileset (256x160)
│
├── scripts/                        # Dev-time asset generators (Node.js + pngjs)
│   ├── generate-tileset.mjs       #   Generates park-tiles.png
│   ├── generate-map.mjs           #   Generates atg.json
│   ├── generate-sprites.mjs       #   STALE — generates old 4-col sprites (replaced by fluffy.png)
│   └── tile-indices.json          #   Named tile ID map (output of generate-tileset.mjs)
│
├── src/                            # Game source code (TypeScript)
│   ├── main.ts                    #   Entry point — creates Phaser.Game
│   ├── config/
│   │   └── GameConfig.ts          #   Phaser configuration (resolution, physics, scenes)
│   ├── scenes/
│   │   ├── BootScene.ts           #   Asset preloading
│   │   └── GameScene.ts           #   Main gameplay scene (tilemap, spawns, input, camera)
│   ├── sprites/
│   │   ├── MammaCat.ts            #   Player character (movement, animations, name label)
│   │   └── NPCCat.ts             #   NPC cat (static body, idle animation, name label)
│   └── systems/
│       ├── DayNightCycle.ts       #   Time-of-day overlay with smooth transitions
│       └── DialogueSystem.ts      #   Bottom-screen text dialogue box
│
├── index.html                      # Vite entry HTML (full-viewport game container)
├── package.json                    # npm manifest (Phaser 3, Vite, TypeScript)
├── package-lock.json               # Lockfile
├── tsconfig.json                   # TypeScript configuration (strict)
├── vite.config.ts                  # Vite build configuration
├── VERSION                         # Semver string (0.1.1)
├── README.md                       # Project documentation
└── .gitignore                      # dist, node_modules, CLAUDE.md, .claude/, .DS_Store
```

## Flagged Items

| Item | Issue |
|------|-------|
| `scripts/generate-sprites.mjs` | Stale — generates 4x5 col layout, but sprites now use fluffy.png (8x10). Output is overwritten. |
| `VERSION` vs `package.json` | Version mismatch: VERSION says 0.1.1, package.json says 0.1.0 |
| `docs/_generated/` | Working artifacts from docsync, should be .gitignored or treated as ephemeral |
