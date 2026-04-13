# Phase 1 Technical Brief — Claude Code

**Project:** Ayala (2D top-down cat adventure game)
**Framework:** RPG JS v4 (already scaffolded)
**Branch:** `sit`
**Context:** Read `docs/Ayala_Game_Design_Document_v0.1.md` for full game design context before starting.

---

## OBJECTIVE

Replace the RPG JS starter demo with the foundations of our game:

1. A playable cat character (Mamma Cat) on a custom map
2. A simplified but geographically accurate map of Ayala Triangle Gardens
3. Basic day/night visual cycle
4. One NPC cat (Blacky) with simple dialogue
5. Verify standalone RPG build works offline

---

## TASK 1: PROJECT CONFIGURATION

Update `rpg.toml` with our game identity:

- Game name: "Ayala"
- Short name: "Ayala"
- Description: "A 2D adventure game about a homeless cat finding love in Manila"
- Build mode: RPG (single-player standalone, not MMORPG)

Ensure the dev command uses `RPG_TYPE=rpg` by default. Add a script to `package.json`:

```json
"scripts": {
  "dev": "RPG_TYPE=rpg rpgjs dev",
  "build": "NODE_ENV=production RPG_TYPE=rpg rpgjs build"
}
```

---

## TASK 2: SOURCE CAT SPRITES

Find and download free cat pixel art sprites. Priority sources:

1. **Elthen's 2D Pixel Art Cat Sprites** on itch.io — popular free pack with walk, idle, and action animations
2. **Cat 16x16 with 33+ animations** on itch.io — extensive animation set
3. **OpenGameArt.org cat sprites** — various free packs

We need at minimum:

- A sprite for Mamma Cat (black and white spotted cat) — if no black-and-white variant exists, use whatever is available and note it for later customization
- A sprite for Blacky (black cat) — can be a color variant
- Walking animations (4 directions)
- Idle animation
- Sleeping animation (stretch goal for Phase 1)

Set up the spritesheets in the RPG JS structure:

```
main/
  spritesheets/
    characters/
      mc.png
      mc.ts (spritesheet config — dimensions, animations)
      blacky.png
      blacky.ts
```

Each `.ts` file defines the sprite dimensions and animation frames per the RPG JS spritesheet system.

---

## TASK 3: CREATE THE MAP IN TILED

This is the most important task. Create a simplified but geographically accurate tilemap of Ayala Triangle Gardens.

### Geographic Layout

The game world is a triangle bounded by three roads:

- **Ayala Avenue** — runs along the SOUTHWEST edge (bottom-left to middle-left)
- **Paseo de Roxas** — runs along the NORTH/NORTHEAST edge (top of the triangle)
- **Makati Avenue** — runs along the EAST/SOUTHEAST edge (right side)

The triangle points roughly WEST (the sharp apex where Ayala Ave meets Paseo de Roxas is on the left/west side).

The roads are IMPASSABLE BOUNDARIES — cats cannot cross busy Manila roads. They form the edge of the game world.

### Map Zones (from the GDD, with spatial positions)

Think of the triangle with NORTH at the top of the screen:

**NORTHEAST CORNER (top-right): Zone 6 — The Shops / Pyramid Steps**

- This is where Makati Ave meets Paseo de Roxas
- A large stepped/pyramid structure leading down to an underground mall
- Mamma Cat's eventual home territory
- Adjacent to two tall office towers (Ayala Triangle Gardens Tower 1 & 2)
- A circular helipad feature is visible on the tower podium nearby
- Below the steps: Starbucks with glass facade and outdoor seating

**EAST EDGE (right side): Zone 1 — Makati Ave Edge (Starting Zone)**

- Busy sidewalk along Makati Avenue
- The Sto. Tomas corner (southeast) is where Mamma Cat starts the game
- Entry point to the Ayala Triangle Walkways
- The Shops building's terraced exterior wall with plantings runs along here

**SOUTHEAST: Zone 2 — Blackbird / Nielson Tower Area**

- Historic building (former airport control tower) surrounded by dense trees
- Manam restaurant nearby with outdoor dining (white umbrellas)
- Tree-lined walkways leading into the central gardens

**CENTER: Zone 3 — Central Gardens (the largest zone)**

- Dense canopy of massive rain trees and acacias
- Winding stone walkways criss-crossing through the green
- Manicured lawns (open grassy areas — where dogs walk)
- Ornamental shrub beds, decorative boulders
- Tropical foliage: snake plants, golden palms, orange jasmine hedges
- Public art installations scattered around
- Benches and picnic areas
- This is the HEART of the cat colony — most cats live here

**SOUTHWEST (bottom-left): Zone 4 — Fountain & Exchange Plaza**

- Tower One & Exchange Plaza — a dramatic building with a sweeping concrete canopy/arch over a large stone-paved plaza
- A fountain nearby (important: water source for cats)
- Starbucks at the Tower One mezzanine level
- Large exposed plaza area (stone tiles)

**NORTH EDGE (top): Zone 5 — Paseo de Roxas Edge & Underpass**

- Northern boundary along Paseo de Roxas road
- An UNDERPASS with escalator that goes under the road (western portion of north edge)
- Blacky the cat sits at the top of this escalator — this is his territory
- This is where Camille enters the park

**NORTHWEST (top-left): Zone 7 — Playground Area**

- A children's playground with colorful rubberized ground (blue and green swirling patterns)
- Large geometric/origami animal sculptures: a CARABAO (water buffalo) and a HORNBILL bird
- Exercise equipment
- Surrounded by trees
- Noisy, family-heavy zone during daytime
- The Ninoy Aquino Monument is near the western apex

### Map Implementation

For Phase 1, create a SINGLE large map (not yet using the World system for multiple connected maps). We can split into zones later.

**Tile size:** 32x32 pixels (good balance of detail and performance)

**Map dimensions:** Approximately 80-100 tiles wide by 60-80 tiles tall. The triangle shape means large portions of the rectangular tilemap will be "out of bounds" (the road areas and buildings beyond the roads).

**Layers needed:**

1. **Ground** — grass, stone walkways, dirt paths, plaza tiles, playground rubber surface
2. **Objects** — trees, benches, boulders, shrubs, planters, art installations, fountain
3. **Buildings** — simplified building footprints along the edges (Tower One, The Shops stepped structure, Nielson Tower). These are collision objects.
4. **Collision** — hedges, walls, road boundaries (impassable)
5. **Overhead** — tree canopy (renders above the player for depth), building overhangs

**Tileset sources:** Use free tilesets from OpenGameArt.org or itch.io. Look for:

- Modern/urban park tilesets (grass, stone paths, benches)
- Tropical or generic tree tilesets
- Urban building edge tiles
- Water/fountain tiles

The map doesn't need to be beautiful in Phase 1 — it needs to be GEOGRAPHICALLY CORRECT in layout so we can iterate on art later.

**Key collision boundaries:**

- The three roads forming the triangle edges (impassable)
- Building walls
- Dense hedges along park borders

**Key interactive locations (mark with Tiled object layer points):**

- Mamma Cat's start position (Makati Ave / Sto. Tomas corner, southeast)
- Blacky's position (top of underpass escalator, north/northwest along Paseo de Roxas)
- Starbucks at The Shops (northeast, below the pyramid steps)
- The fountain near Exchange Plaza (southwest)
- A few feeding station locations in the central gardens

---

## TASK 4: REPLACE THE PLAYER CHARACTER

Replace the default RPG JS demo character with Mamma Cat (the cat).

- Use the cat spritesheet from Task 2
- Set up 4-directional walking
- Set appropriate movement speed (cats are faster than RPG humans — adjust to feel right)
- The player name should display as "Mamma Cat" (or be configurable)
- Starting position: the Makati Ave edge of the map (southeast area)

Remove or replace all demo content (the demo NPC, demo dialogue, demo items).

---

## TASK 5: ADD BLACKY AS AN NPC

Create Blacky as an Event (NPC) in RPG JS:

- **Position:** Near the top of the map, along the Paseo de Roxas edge, at the underpass location
- **Sprite:** Black cat sprite
- **Behavior:** Mostly stationary (sitting idle). Blacky doesn't wander much — he's a calm, wise presence.
- **Mode:** Scenario mode (per-player state)
- **Dialogue:** When Mamma Cat approaches and presses action:

First encounter:

```
"Mrrp. New here, are you?"
[Choice: "Mrrp?" / "..."]
"This is Ayala Triangle. The gardens are home to all of us. Find shade. Find food. Stay away from the roads."
"And at night... stay hidden. Not all humans are kind."
```

Subsequent encounters:

```
"Still here? Good. You're tougher than you look."
```

Use `player.setVariable('MET_BLACKY', true)` after the first encounter to track this.

---

## TASK 6: BASIC DAY/NIGHT CYCLE

Implement a simple visual day/night cycle:

- Use a color overlay or tint on the game canvas
- **Day (default):** No tint, bright and warm
- **Evening:** Warm orange/golden tint
- **Night:** Dark blue/purple tint with reduced visibility

For Phase 1, this can be a simple timed cycle (e.g., every 2-3 minutes of real time = one full day cycle) or triggered by a key press for testing. The exact timing can be tuned later.

The day/night state should be stored in a player variable so it persists across saves.

---

## TASK 7: VERIFY STANDALONE BUILD

Run the production build and verify it works:

```bash
NODE_ENV=production RPG_TYPE=rpg npm run build
```

Check that `dist/standalone/` contains the built game and it runs when served from a static server:

```bash
npx serve dist/standalone
```

---

## IMPORTANT NOTES

- **Do NOT delete or overwrite** `docs/Ayala_Game_Design_Document_v0.1.md`
- **Commit frequently** with descriptive messages
- **Test in browser** after each major change (`RPG_TYPE=rpg npm run dev`)
- If you cannot find suitable free cat sprites to download (network restrictions may apply), create PLACEHOLDER sprites (simple colored rectangles or basic shapes) and document what needs to be replaced. Getting the map and game structure right is more important than final art.
- If Tiled map creation is not possible programmatically, create the map configuration in JSON format that RPG JS can load, and document that a Tiled `.tmx` file should be created manually later.
- The framework documentation is at https://docs.rpgjs.dev/ — refer to it for API details.

---

## DEFINITION OF DONE

Phase 1 is complete when:

- [ ] A cat sprite moves around a map that resembles the triangular ATG layout
- [ ] Roads form impassable boundaries
- [ ] The map has distinct visual areas (green gardens, stone walkways, building edges)
- [ ] Blacky exists as an NPC near the underpass location and has dialogue
- [ ] A basic day/night visual tint cycles automatically
- [ ] The game builds to `dist/standalone/` and runs offline
- [ ] All demo/starter content has been removed or replaced
