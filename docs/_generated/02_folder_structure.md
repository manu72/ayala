# Folder Structure

> Generated: 2026-04-14 | Version: 0.1.3

```
ayala/
├── docs/                                # Design docs and phase briefs
│   ├── Ayala_GDD_v0.1.md              #   Game design document
│   ├── Phase1_Brief_Phaser3.md        #   Phase 1 plan
│   ├── Phase1_5_Visual_Polish_Brief.md #   Phase 1.5 plan
│   ├── Phase2_Core_Mechanics_Brief.md  #   Phase 2 plan
│   ├── P2_Controls_Update_Spec.md     #   Controls spec
│   ├── Phase3_Social_Story_Brief.md   #   Phase 3 plan
│   └── _generated/                     #   Tool-generated doc snapshots
│
├── public/assets/                       # Static game assets
│   ├── sprites/                        #   Character spritesheets
│   │   ├── mammacat.png               #     Player (32x32, 8x10 grid)
│   │   ├── blacky.png                 #     NPC (32x32, 8x10 grid)
│   │   ├── tiger.png                  #     NPC (32x32, 8x10 grid)
│   │   ├── jayco.png                  #     NPC (32x32, 8x10 grid)
│   │   ├── fluffy.png                 #     NPC (32x32, 8x10 grid)
│   │   ├── guard.png                  #     Guard/Human (64x64, 8x7 grid)
│   │   ├── ginger-IDLE.png            #     Ginger strip (64x64 frames)
│   │   ├── ginger-WALK.png            #     Ginger strip (64x64 frames)
│   │   ├── ginger-RUN.png             #     Ginger strip (64x64 frames)
│   │   └── Black-*.png                #     Additional black cat strips
│   ├── tilemaps/
│   │   └── atg.json                    #   100x80 Tiled JSON map (generated)
│   └── tilesets/
│       └── park-tiles.png              #   40-tile textured tileset (generated)
│
├── scripts/                             # Dev-time asset generators
│   ├── generate-tileset.mjs            #   Generates park-tiles.png + tile-indices.json
│   ├── generate-map.mjs               #   Generates atg.json from tile indices
│   └── tile-indices.json               #   Tile name-to-index map (generated)
│
├── src/                                 # Game source (TypeScript)
│   ├── main.ts                         #   Entry: creates Phaser.Game
│   ├── config/
│   │   ├── GameConfig.ts               #   Resolution, physics, scenes, scaling
│   │   └── constants.ts                #   Shared constants (REST_HOLD_MS)
│   ├── scenes/
│   │   ├── BootScene.ts                #   Asset preloading
│   │   ├── StartScene.ts               #   Title screen, new/continue
│   │   ├── GameScene.ts                #   Main game loop (~1143 lines)
│   │   ├── HUDScene.ts                 #   Overlay: stats, dialogue, pause, narration
│   │   └── JournalScene.ts             #   Colony journal overlay
│   ├── sprites/
│   │   ├── MammaCat.ts                 #   Player character
│   │   ├── NPCCat.ts                   #   Generic NPC cat (AI, config-driven)
│   │   ├── GuardNPC.ts                 #   Guard patrol/chase
│   │   ├── HumanNPC.ts                 #   Humans on waypoint paths
│   │   └── DogNPC.ts                   #   Dog follower with bark/lunge
│   └── systems/
│       ├── DayNightCycle.ts            #   4-phase cycle, clock, newDay event
│       ├── StatsSystem.ts              #   Hunger/thirst/energy
│       ├── DialogueSystem.ts           #   Bottom-screen dialogue box
│       ├── FoodSource.ts               #   Food/water sources with cooldowns
│       ├── SaveSystem.ts               #   localStorage save/load
│       ├── TrustSystem.ts              #   Global + per-cat trust scores
│       ├── EmoteSystem.ts              #   Floating text emotes
│       ├── ChapterSystem.ts            #   Narrative chapter progression
│       └── ThreatIndicator.ts          #   NPC name + disposition indicator
│
├── index.html                           # Vite entry page
├── package.json                         # npm manifest
├── tsconfig.json                        # TypeScript strict config
├── vite.config.ts                       # Vite build config
├── VERSION                              # 0.1.3
├── WORKING_MEMORY.md                    # AI session memory
└── README.md                            # Project documentation
```
