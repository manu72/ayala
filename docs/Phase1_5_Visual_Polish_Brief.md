# Phase 1.5 Technical Brief — Visual Polish & Real Assets

**Project:** Ayala (2D top-down cat adventure game)
**Framework:** Phaser 3 + Vite + TypeScript
**Branch:** `sit`
**Context:** Phase 1 is complete — the game runs with a tilemap, player character, NPC, day/night cycle, and production build. This phase focuses on making it look and feel like a real game.

---

## OBJECTIVE

Transform the Phase 1 prototype from programmer art into something visually recognizable as Ayala Triangle Gardens. Specifically:

1. Set camera zoom so the world feels large and Mamma Cat feels small
2. Replace the generated tileset with a proper pixel art tileset
3. Replace placeholder cat sprites with animated spritesheets
4. Add environmental objects (trees, benches, shrubs, boulders)
5. Refine the map boundaries and zone transitions
6. Expand the map if needed for proper sense of scale

---

## TASK 1: CAMERA ZOOM (do this first — biggest impact)

The current view shows too much of the map at once. The world feels tiny instead of vast and intimidating. Fix this by zooming the camera in.

```typescript
// In GameScene.create(), after setting up the camera:
this.cameras.main.setZoom(2.5)

// Keep the camera following Mamma Cat
this.cameras.main.startFollow(this.player, true, 0.08, 0.08)

// Set dead zone so camera doesn't jerk on small movements
this.cameras.main.setDeadzone(50, 50)
```

**Target feel:** The player should see roughly 12-15 tiles in each direction around Mamma Cat. The world extends well beyond the viewport in every direction. When Mamma Cat stands on a path, she should feel small relative to the trees and buildings around her. The player should NOT be able to see the entire map — they should need to explore to discover it.

Test different zoom levels (2.0, 2.5, 3.0) and pick whichever makes the cat feel appropriately small in a big world. 2.5x is a good starting point.

**Important:** After changing zoom, verify that:
- The day/night overlay still covers the full visible area (it's using `setScrollFactor(0)` so it should, but verify)
- The dialogue box renders correctly at the new zoom
- The player name label is still readable
- Collision boundaries still work correctly

---

## TASK 2: PROPER TILESET

Replace the programmatically generated colored-square tileset with a real pixel art tileset.

### Option A: Download a free tileset (preferred)

Search for and download a free top-down outdoor/park tileset. Good candidates:

- **"Tiny 16: Basic"** on OpenGameArt.org — simple, clean, widely used
- **"Lots of free 2D tiles and sprites by Hyptosis"** on OpenGameArt.org — 32x32 RPG tiles with grass, paths, trees, buildings
- **LPC (Liberated Pixel Cup) tilesets** — extensive free collection with grass, dirt, water, buildings
- **"Modern Exteriors"** or **"Modern City"** tilesets on itch.io — if any free versions exist
- Any free tileset with: grass variants, stone/concrete paths, trees, water, building walls

The tileset should be 32x32 pixel tiles (matching our current tile size).

### Option B: Create an improved tileset programmatically

If downloading is not possible, create a MUCH BETTER generated tileset than the current one. Each 32x32 tile should have:

**Grass tiles (at least 4 variants):**
- Light grass with subtle texture (random darker pixels scattered)
- Medium grass
- Dark grass (under tree canopy)
- Grass with small flowers (yellow/white dots)

**Path/walkway tiles:**
- Stone path — light grey with subtle grid lines suggesting paving stones
- Dirt path — brown with subtle texture
- Path edges — transition tiles where path meets grass

**Road tiles:**
- Dark asphalt grey
- Road with white dashed center line
- Road with solid white edge line
- Sidewalk — lighter grey, slightly textured

**Water tiles:**
- Blue with subtle wave pattern (2-3 shade variations)
- Water edge tiles (where water meets ground)

**Building tiles:**
- Concrete wall — medium grey with subtle horizontal lines
- Glass facade — blue-tinted grey with reflection highlights
- Building roof — darker grey
- Steps/stairs — grey with horizontal lines suggesting step edges

**Vegetation tiles:**
- Tree trunk — brown circle on transparent/grass background
- Tree canopy — dark green, semi-circular, for the overhead layer
- Bush/hedge — dark green blob, smaller than tree
- Shrub/planter — decorative green with hints of color

**Plaza tiles:**
- Light stone — cream/beige with subtle grid pattern
- Darker stone border

**Playground tiles:**
- Blue rubberized surface
- Green rubberized surface
- Blue-green swirl transition

**Fountain tiles:**
- Stone rim (grey circle segments)
- Water center (blue)

The KEY improvement over the current tileset: **every tile should have subtle texture/variation, not flat solid colors.** Even adding 2-3 pixels of noise/variation to each tile makes a massive difference.

### Applying the tileset

After creating or downloading the tileset:

1. Replace `public/assets/tilesets/park-tiles.png` with the new tileset image
2. Update the map JSON (`public/assets/tilemaps/atg.json`) to use the new tile indices
3. Ensure tile properties (collision, etc.) are correctly mapped to the new indices

---

## TASK 3: CAT SPRITES

Replace the placeholder cat sprite with a proper animated spritesheet.

### Create spritesheets programmatically if needed

For Mamma Cat, generate a 32x32 spritesheet PNG with these frames:

**Mamma Cat (white with black patches):**
- Base body: white (#FFFFFF) cat silhouette
- Black patches: on ears, back, tail (#222222)
- Pink nose: small pink dot (#FFB6C1)
- Eyes: green dots (#66CC66)

**Frame layout (4 columns × 5 rows = 20 frames, 128×160 PNG):**
- Row 0 (frames 0-3): Walk down — 4 frames of walk cycle facing down/toward camera
- Row 1 (frames 4-7): Walk left — 4 frames
- Row 2 (frames 8-11): Walk right — 4 frames (can mirror walk left)
- Row 3 (frames 12-15): Walk up — 4 frames facing away from camera
- Row 4 (frames 16-19): Idle — cat sitting, subtle animation (tail twitch)

Each frame should show a recognizable cat shape at 32x32:
- Body is roughly 16-20px wide, 12-16px tall
- Legs visible during walk cycle (alternating)
- Tail visible — upright or curved
- Ears as two small triangles on top of head

**Blacky (solid black/very dark grey):**
- Same frame layout as Mamma Cat
- Body: very dark grey (#333333) — not pure black, so silhouette detail is visible
- Eyes: yellow dots (#FFCC00)
- Subtle grey highlights on edges so the cat shape reads against dark backgrounds

**Key quality bar:** The cats should be recognizable AS CATS from 2.5x zoom. A player should look at the screen and immediately think "that's a cat." The walk animation should feel like a cat walking — low, smooth, with a tail visible.

### Register animations

```typescript
// In BootScene or GameScene:
const directions = ['down', 'left', 'right', 'up']
directions.forEach((dir, i) => {
  this.anims.create({
    key: `mammacat-walk-${dir}`,
    frames: this.anims.generateFrameNumbers('mammacat', { 
      start: i * 4, 
      end: i * 4 + 3 
    }),
    frameRate: 8,
    repeat: -1
  })
})

this.anims.create({
  key: 'mammacat-idle',
  frames: this.anims.generateFrameNumbers('mammacat', { 
    start: 16, 
    end: 19 
  }),
  frameRate: 4,
  repeat: -1
})

// Same pattern for Blacky
```

---

## TASK 4: ENVIRONMENTAL OBJECTS

Add objects to the map that bring ATG to life. These can be placed via the Tiled JSON object layer, or added programmatically in the GameScene.

### Trees (most important)

ATG has massive rain trees and acacias. In pixel art, these are:
- A brown trunk (4-6px wide) on the ground layer
- A large dark green canopy (48-64px wide circle/blob) on the overhead layer that renders ABOVE the player

The overhead canopy is critical — when Mamma Cat walks under a tree, the canopy should partially obscure her. This creates depth and the feeling of being under a forest canopy.

Place trees densely in the Central Gardens zone (Zone 3) and moderately along walkways. The area should feel like walking through a park with significant tree cover.

```typescript
// Example: adding trees with trunk collision and overhead canopy
const treePositions = [
  // Central Gardens — dense cluster
  { x: 480, y: 400 }, { x: 560, y: 380 }, { x: 520, y: 460 },
  // ... many more positions throughout the green zones
]

treePositions.forEach(pos => {
  // Trunk — collision object
  const trunk = this.physics.add.staticSprite(pos.x, pos.y, 'tree-trunk')
  this.physics.add.collider(this.player, trunk)
  
  // Canopy — overhead, no collision, renders above player
  const canopy = this.add.sprite(pos.x, pos.y - 16, 'tree-canopy')
  canopy.setDepth(this.player.depth + 10)  // always above player
  canopy.setAlpha(0.85)  // slightly transparent so player is visible underneath
})
```

### Benches
Small rectangular objects along walkways. Collision objects. 2-3 throughout the central gardens and near the Starbucks area.

### Boulders / Decorative rocks
Grey circular objects in garden beds. One notable large boulder in the central gardens (reference photo: the white/calico cat sitting on a boulder among snake plants).

### Shrubs and hedges
Along the park boundaries (between garden and road) and as garden bed borders. These serve as soft collision boundaries marking the edge of garden areas.

### Fountain (Zone 4)
Near Exchange Plaza. A small circular arrangement of blue tiles with grey stone rim. Important gameplay landmark (water source).

---

## TASK 5: MAP REFINEMENT

### Improve the triangle boundary

The current road boundary line should feel like an actual road, not a dotted line. The road should be:
- 3-4 tiles wide (representing a real multi-lane Manila road)
- Dark asphalt tiles with white lane markings
- A sidewalk strip (1 tile wide, lighter grey) between the garden edge and the road
- This sidewalk is where Mamma Cat starts — she's on the sidewalk of Makati Ave, not on the road itself

### Zone transitions

Currently the zones change abruptly from one color to another. Add transition tiles:
- Grass → path: a few tiles of grass-with-dirt-patches leading to the stone path
- Path → plaza: stone path tiles gradually becoming plaza tiles
- Garden edge → building: hedge tiles or planter tiles forming a natural border

### Scale check

After applying 2.5x zoom, assess whether the map feels large enough. The Central Gardens should take at least 10-15 seconds of walking to cross. If the map feels too small at the new zoom level, expand it:

**Target minimum size:** 100 tiles wide × 80 tiles tall (3200×2560 pixels)

The central gardens zone should be the largest area — at least 40×30 tiles of green space with paths winding through it.

---

## TASK 6: VERIFY AND POLISH

After all changes:

1. **Walk the map as Mamma Cat.** Does the world feel large? Does crossing the central gardens feel like a journey? Can you get lost? Good.

2. **Check the day/night cycle.** Does the evening tint look warm over the green gardens? Does night feel dark and a bit scary? The night should make you want to find shelter.

3. **Talk to Blacky.** Does the dialogue still work at the new zoom level? Is the text readable?

4. **Check the boundaries.** Can Mamma Cat walk onto the roads? She shouldn't be able to. Can she walk through buildings? She shouldn't.

5. **Production build.** Run `npm run build` and test `dist/` to confirm everything still works.

---

## DEFINITION OF DONE

Phase 1.5 is complete when:

- [ ] Camera is zoomed in — Mamma Cat feels small in a large world
- [ ] The tileset has texture and variation (not flat colored squares)
- [ ] Mamma Cat is a recognizable white-and-black cat sprite with walk animation
- [ ] Blacky is a recognizable dark cat sprite
- [ ] Trees with overhead canopies exist in the central gardens
- [ ] The road boundaries look like actual roads (multi-tile wide, lane markings)
- [ ] Zone transitions are gradual, not abrupt color changes
- [ ] The world takes 10+ seconds to walk across at normal speed
- [ ] Walking through the central gardens feels like being in a park
- [ ] Production build still works
