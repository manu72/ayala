# Phase 1 Technical Brief — Claude Code

**Project:** Ayala (2D top-down cat adventure game)
**Framework:** Phaser 3 + Vite + TypeScript
**Branch:** `sit`
**Context:** Read `docs/Ayala_GDD_v0.1.md` for full game design context before starting.

---

## OBJECTIVE

Build the playable foundation of the game from scratch using Phaser 3:

1. A Vite + TypeScript + Phaser 3 project that builds to static files
2. A playable cat character (Mamma Cat) on a custom tilemap
3. A simplified but geographically accurate map of Ayala Triangle Gardens
4. Basic day/night visual cycle
5. One NPC cat (Blacky) with simple dialogue
6. Verify the production build works offline from static files

---

## TASK 1: PROJECT SETUP

### Initialize a Vite + TypeScript project with Phaser 3

```bash
npm create vite@latest . -- --template vanilla-ts
npm install phaser
npm install
```

The project structure should be:

```
ayala/
  docs/
    Ayala_GDD_v0.1.md          (DO NOT modify or delete)
    Phase1_Brief_Phaser3.md (this file)
  src/
    main.ts                     (entry point — creates Phaser game)
    scenes/
      BootScene.ts              (loads assets)
      GameScene.ts              (main gameplay scene)
    sprites/
      MammaCat.ts               (player character class)
      NPCCat.ts                 (NPC cat class — used for Blacky)
    systems/
      DayNightCycle.ts          (day/night tint system)
      DialogueSystem.ts         (simple text dialogue overlay)
    config/
      GameConfig.ts             (Phaser game configuration)
  public/
    assets/
      sprites/
        mammacat.png            (cat spritesheet)
        blacky.png              (black cat spritesheet)
      tilemaps/
        atg.json                (Tiled map exported as JSON)
      tilesets/
        park-tiles.png          (tileset image)
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

### Configure Vite for Phaser

In `vite.config.ts`:

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // relative paths for static deployment
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
```

The `base: './'` is critical — it ensures all asset paths are relative so the built game works when opened from any directory or static host.

### Configure Phaser

In `src/config/GameConfig.ts`:

```typescript
import Phaser from "phaser";
import { BootScene } from "../scenes/BootScene";
import { GameScene } from "../scenes/GameScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 816, // 51 tiles * 16px, or adjust for 32px tiles
  height: 624, // 39 tiles * 16px, or adjust
  pixelArt: true, // critical for crisp pixel art rendering
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 }, // top-down, no gravity
      debug: false,
    },
  },
  scene: [BootScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};
```

### Package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

### Verify: `npm run dev` should show a blank Phaser canvas at `http://localhost:5173`

---

## TASK 2: CAT SPRITES

### Finding sprites

Search for and download free cat sprite assets. Priority sources:

1. **Elthen's 2D Pixel Art Cat Sprites** — https://elthen.itch.io/2d-pixel-art-cat-sprites
2. **Cat sprites on OpenGameArt.org** — https://opengameart.org/content/cat-sprites
3. Any free cat sprite pack with walk cycle animations (4 directions)

If network restrictions prevent downloading, CREATE PLACEHOLDER SPRITES:

- A 32x128 PNG strip (4 frames of 32x32) for walk animation
- Use distinct colors: white with black patches for Mamma Cat, solid dark for Blacky
- Simple colored rectangles with a triangle ear are sufficient as placeholders

### Spritesheet setup

Each cat sprite needs at minimum:

- **Walk down** (toward camera): 4 frames
- **Walk up** (away from camera): 4 frames
- **Walk left**: 4 frames
- **Walk right**: 4 frames (can be a horizontal flip of walk left)
- **Idle**: 1-2 frames

The spritesheet should be a grid. For example, a 128x160 PNG with 32x32 frames:

- Row 0: walk down (4 frames)
- Row 1: walk left (4 frames)
- Row 2: walk right (4 frames)
- Row 3: walk up (4 frames)
- Row 4: idle (1-4 frames)

In the BootScene, load the spritesheet:

```typescript
this.load.spritesheet("mammacat", "assets/sprites/mammacat.png", {
  frameWidth: 32,
  frameHeight: 32,
});
```

---

## TASK 3: CREATE THE MAP

This is the most important task. Create a tilemap that represents Ayala Triangle Gardens.

### Approach: Programmatic Tiled JSON

Since we may not have the Tiled Map Editor GUI available, create the map as a JSON file that follows the Tiled JSON format. Phaser 3 loads Tiled JSON maps natively via `this.load.tilemapTiledJSON()`.

### Geographic Layout

The game world is a triangle bounded by three roads:

- **Ayala Avenue** — runs along the SOUTHWEST edge (bottom-left to middle-left)
- **Paseo de Roxas** — runs along the NORTH/NORTHEAST edge (top of the triangle)
- **Makati Avenue** — runs along the EAST/SOUTHEAST edge (right side)

The triangle points roughly WEST (the sharp apex where Ayala Ave meets Paseo de Roxas is on the left/west side).

The roads are IMPASSABLE BOUNDARIES — cats cannot cross busy Manila roads.

### Map Zones (spatial positions)

Think of the triangle with NORTH at the top of the screen:

**NORTHEAST CORNER (top-right): Zone 6 — The Shops / Pyramid Steps**

- Where Makati Ave meets Paseo de Roxas
- Large stepped/pyramid structure leading down to underground mall
- Mamma Cat's eventual home territory
- Two tall office towers nearby, helipad on podium
- Below the steps: Starbucks with glass facade

**EAST EDGE (right side): Zone 1 — Makati Ave Edge (Starting Zone)**

- Busy sidewalk along Makati Avenue
- Sto. Tomas corner (southeast) = Mamma Cat's starting position
- Entry to the Ayala Triangle Walkways
- The Shops building's terraced exterior wall

**SOUTHEAST: Zone 2 — Blackbird / Nielson Tower Area**

- Historic building surrounded by dense trees
- Manam restaurant nearby (outdoor dining, white umbrellas)
- Tree-lined walkways into central gardens

**CENTER: Zone 3 — Central Gardens (largest zone)**

- Dense rain tree canopy, winding stone walkways
- Manicured lawns (open grassy areas — dog zone)
- Ornamental shrub beds, decorative boulders
- Public art, benches, picnic areas
- HEART of the cat colony

**SOUTHWEST (bottom-left): Zone 4 — Fountain & Exchange Plaza**

- Tower One with sweeping concrete canopy over stone plaza
- Fountain (water source for cats)
- Starbucks at Tower One mezzanine
- Large exposed plaza

**NORTH EDGE (top): Zone 5 — Paseo de Roxas Edge & Underpass**

- Northern boundary along Paseo de Roxas
- Underpass with escalator (western portion of north edge)
- Blacky sits at top of escalator — his territory
- Camille's entry point

**NORTHWEST (top-left): Zone 7 — Playground Area**

- Children's playground with colorful rubberized ground
- Giant geometric carabao and hornbill sculptures
- Exercise equipment, surrounded by trees
- Ninoy Aquino Monument near western apex

### Map Implementation

**Tile size:** 32x32 pixels
**Map dimensions:** ~80 tiles wide x 60 tiles tall (2560x1920 pixels)

**Create a tileset image** (`park-tiles.png`) — a grid of 32x32 tiles containing:

- Grass (light green, dark green variants)
- Stone walkway / path tiles
- Dirt/earth
- Road/asphalt (dark grey — for the boundary roads)
- Water (blue — for fountain)
- Building wall tiles (grey concrete)
- Hedge/bush (dark green, collision)
- Tree trunk (brown, collision)
- Plaza/stone floor tiles (light grey)
- Playground colored surface tiles (blue, green swirled)
- Sand/mulch

If creating a custom tileset image is too complex, use a SIMPLE 4-color tileset:

- Green = grass/garden
- Grey = stone paths and buildings
- Dark grey = roads (boundary)
- Blue = water

**Layers:**

1. **ground** — base terrain (grass, stone, road, water)
2. **objects** — trees, benches, boulders, buildings (some with collision)
3. **overhead** — tree canopy that renders above the player

**Collision:** Set collision on road tiles, building tiles, hedge tiles, and water tiles. In Phaser:

```typescript
const map = this.make.tilemap({ key: "atg" });
const tileset = map.addTilesetImage("park-tiles", "park-tiles");
const ground = map.createLayer("ground", tileset);
const objects = map.createLayer("objects", tileset);
objects.setCollisionByProperty({ collides: true });
// OR set collision by specific tile indices:
objects.setCollisionBetween(firstTileId, lastTileId);
```

**Object layer:** Add a Tiled object layer (in the JSON) with named points:

- `spawn_mammacat` — southeast, near Makati Ave edge
- `spawn_blacky` — north, at underpass location
- `poi_starbucks` — northeast, below pyramid steps
- `poi_fountain` — southwest, near Exchange Plaza
- `poi_feeding_station_1`, `poi_feeding_station_2` — in central gardens

### Loading the map in Phaser

In BootScene:

```typescript
this.load.tilemapTiledJSON("atg", "assets/tilemaps/atg.json");
this.load.image("park-tiles", "assets/tilesets/park-tiles.png");
```

In GameScene:

```typescript
const map = this.make.tilemap({ key: "atg" });
const tileset = map.addTilesetImage("park-tiles", "park-tiles");

const groundLayer = map.createLayer("ground", tileset, 0, 0);
const objectsLayer = map.createLayer("objects", tileset, 0, 0);
objectsLayer.setCollisionByProperty({ collides: true });

// Camera follows player, map is world bounds
this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
```

---

## TASK 4: PLAYER CHARACTER (Mamma Cat)

Create a player-controlled cat character.

```typescript
// In GameScene.create():
const spawnPoint = map.findObject("objects", (obj) => obj.name === "spawn_mammacat");

this.player = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, "mammacat");
this.player.setCollideWorldBounds(true);
this.physics.add.collider(this.player, objectsLayer);

// Camera follows
this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

// Create animations
this.anims.create({
  key: "mammacat-walk-down",
  frames: this.anims.generateFrameNumbers("mammacat", { start: 0, end: 3 }),
  frameRate: 8,
  repeat: -1,
});
// ... similar for walk-up, walk-left, walk-right, idle

// In update():
const cursors = this.input.keyboard.createCursorKeys();
const speed = 120; // cats are quick

this.player.setVelocity(0);

if (cursors.left.isDown) {
  this.player.setVelocityX(-speed);
  this.player.anims.play("mammacat-walk-left", true);
} else if (cursors.right.isDown) {
  this.player.setVelocityX(speed);
  this.player.anims.play("mammacat-walk-right", true);
}

if (cursors.up.isDown) {
  this.player.setVelocityY(-speed);
  this.player.anims.play("mammacat-walk-up", true);
} else if (cursors.down.isDown) {
  this.player.setVelocityY(speed);
  this.player.anims.play("mammacat-walk-down", true);
}

if (this.player.body.velocity.length() === 0) {
  this.player.anims.play("mammacat-idle", true);
}
```

Display "Mamma Cat" as a text label above the sprite:

```typescript
this.playerLabel = this.add
  .text(0, 0, "Mamma Cat", {
    fontSize: "10px",
    color: "#ffffff",
    stroke: "#000000",
    strokeThickness: 2,
  })
  .setOrigin(0.5, 1);

// In update(), position label above sprite:
this.playerLabel.setPosition(this.player.x, this.player.y - 20);
```

---

## TASK 5: ADD BLACKY AS AN NPC

Create a stationary NPC cat at the underpass location.

```typescript
// In GameScene.create():
const blackySpawn = map.findObject("objects", (obj) => obj.name === "spawn_blacky");
this.blacky = this.physics.add.staticSprite(blackySpawn.x, blackySpawn.y, "blacky");

// Add name label
this.blackyLabel = this.add
  .text(blackySpawn.x, blackySpawn.y - 20, "Blacky", {
    fontSize: "10px",
    color: "#ffffff",
    stroke: "#000000",
    strokeThickness: 2,
  })
  .setOrigin(0.5, 1);
```

### Dialogue System

Create a simple dialogue overlay. When the player is near Blacky and presses Space/Enter:

1. Check distance between Mamma Cat and Blacky
2. If close enough, show a dialogue box (a dark semi-transparent rectangle at the bottom of the screen with white text)
3. Player presses Space/Enter to advance through dialogue lines
4. Track whether this is the first encounter using a game variable

```typescript
// Simple dialogue manager
class DialogueSystem {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private background: Phaser.GameObjects.Rectangle;
  private lines: string[] = [];
  private currentLine: number = 0;
  private active: boolean = false;
  private onComplete: (() => void) | null = null;

  show(lines: string[], onComplete?: () => void) {
    this.lines = lines;
    this.currentLine = 0;
    this.active = true;
    this.onComplete = onComplete || null;
    this.text.setText(this.lines[0]);
    this.container.setVisible(true);
  }

  advance() {
    if (!this.active) return;
    this.currentLine++;
    if (this.currentLine >= this.lines.length) {
      this.container.setVisible(false);
      this.active = false;
      if (this.onComplete) this.onComplete();
    } else {
      this.text.setText(this.lines[this.currentLine]);
    }
  }
}
```

### Blacky's dialogue

```typescript
// In GameScene, when player presses action key near Blacky:
const metBlacky = this.registry.get("MET_BLACKY") || false;

if (!metBlacky) {
  this.dialogue.show(
    [
      "Mrrp. New here, are you?",
      "This is Ayala Triangle. The gardens are home to all of us.",
      "Find shade. Find food. Stay away from the roads.",
      "And at night... stay hidden. Not all humans are kind.",
    ],
    () => {
      this.registry.set("MET_BLACKY", true);
    },
  );
} else {
  this.dialogue.show(["Still here? Good. You're tougher than you look."]);
}
```

---

## TASK 6: BASIC DAY/NIGHT CYCLE

Add a tinted overlay that cycles through day phases.

```typescript
class DayNightCycle {
  private overlay: Phaser.GameObjects.Rectangle;
  private phase: "day" | "evening" | "night" = "day";
  private timer: number = 0;
  private phaseDuration: number = 60000; // 60 seconds per phase for testing

  constructor(scene: Phaser.Scene) {
    // Full-screen overlay, fixed to camera
    this.overlay = scene.add
      .rectangle(
        scene.cameras.main.width / 2,
        scene.cameras.main.height / 2,
        scene.cameras.main.width,
        scene.cameras.main.height,
        0x000000,
        0, // starts transparent
      )
      .setScrollFactor(0)
      .setDepth(1000);
  }

  update(delta: number) {
    this.timer += delta;
    if (this.timer >= this.phaseDuration) {
      this.timer = 0;
      this.cyclePhase();
    }
  }

  private cyclePhase() {
    switch (this.phase) {
      case "day":
        this.phase = "evening";
        this.overlay.setFillStyle(0xff8c00, 0.15); // warm orange tint
        break;
      case "evening":
        this.phase = "night";
        this.overlay.setFillStyle(0x000033, 0.4); // dark blue tint
        break;
      case "night":
        this.phase = "day";
        this.overlay.setFillStyle(0x000000, 0); // clear
        break;
    }
  }
}
```

Call `this.dayNight.update(delta)` in GameScene's `update()` method.

---

## TASK 7: BUILD AND VERIFY

### Development

```bash
npm run dev
# Opens at http://localhost:5173
```

### Production build

```bash
npm run build
```

This produces a `dist/` folder with static files.

### Test the production build

```bash
npm run preview
# OR
npx serve dist
```

Verify the game loads and plays from the static build.

---

## IMPORTANT NOTES

- **Do NOT delete or overwrite** anything in `docs/`
- **Commit frequently** with descriptive messages
- **Test in browser** after each major change
- The character name is always **Mamma Cat** (two words, both capitalized). Never "MC" in player-visible text. (Code variables can use `mammaCat`.)
- If you cannot download sprite assets due to network restrictions, create PLACEHOLDER SPRITES (simple colored rectangles or shapes) and document what needs replacement. Prioritize getting the map structure and game logic right.
- If generating the Tiled JSON map programmatically is complex, start with a SIMPLER map — even a plain rectangle with different colored zones is acceptable for Phase 1. Geographic accuracy can be refined in Phase 2.
- Phaser 3 documentation: https://phaser.io/docs/3.90.0
- Phaser 3 examples: https://phaser.io/examples/v3
- Phaser 3 tilemap tutorial: https://medium.com/@michaelwesthadley/modular-game-worlds-in-phaser-3-tilemaps-1-958fc7e6bbd6

---

## DEFINITION OF DONE

Phase 1 is complete when:

- [ ] `npm run dev` launches a Phaser 3 game in the browser
- [ ] A cat sprite (Mamma Cat) moves with arrow keys on a tilemap
- [ ] The map has a triangular playable area with road boundaries
- [ ] The map has distinct visual zones (green gardens, stone paths, building edges)
- [ ] Blacky exists as a stationary NPC near the north edge with dialogue
- [ ] A day/night tint cycles automatically (day -> evening -> night -> day)
- [ ] `npm run build` produces a `dist/` folder that runs as static files
- [ ] All code is TypeScript, no JavaScript files
- [ ] No RPG JS remnants — this is a clean Phaser 3 project
