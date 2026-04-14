# Phase 2 Technical Brief — Core Gameplay Mechanics

**Project:** Ayala (2D top-down cat adventure game)
**Framework:** Phaser 3 + Vite + TypeScript
**Branch:** `sit`
**Context:** Read `docs/Ayala_GDD_v0.1.md` for full game design. Phases 1 and 1.5 are complete — we have a working tilemap, camera, player character, NPC dialogue, and day/night cycle.

---

## OBJECTIVE

Add the systems that make this a *game* rather than a walking demo:

1. Hunger/thirst/energy stats with a HUD
2. Food and water sources on the map
3. NPC cat behaviors (realistic — careful, alert, heat-aware)
4. Threat/friend indicator system above NPCs
5. Additional named NPC cats (Tiger, Jayco)
6. Basic save/load to localStorage

---

## CRITICAL DESIGN NOTE: CAT BEHAVIOR

Real cats in ATG do NOT bounce around playfully. Manila is hot and humid, and ATG can be dangerous. Colony cats behave as follows:

- **Default movement is slow, careful walking.** Not slinking, but deliberate. Ears up, eyes scanning. Conserving energy.
- **Cats pause frequently** — to look around, to sniff, to assess a sound. A cat that walks 5 tiles then pauses for 2-3 seconds, looks around, then continues is much more realistic than one that walks continuously.
- **Running is a stress response, not a joy response.** Cats run ONLY when threatened — a dog gets too close, a snatcher appears, a loud noise startles them. Running should feel urgent and alarming, not fun.
- **Heat matters.** During midday (10am-5pm), cats seek shade and barely move. They sleep, groom, or sit in the shadow of trees and buildings. Only severe hunger drives them into the open during peak heat.
- **Cats are most active at dawn and evening.** This is when they patrol territory, socialise, eat, and explore. NPC cat movement should increase during these periods and decrease during midday and night.
- **At night, cats find sheltered spots and stay still.** Exposed cats at night are vulnerable to snatchers.

All NPC cat AI should reflect these behaviors. A cat that runs in circles or bounces between waypoints will break immersion immediately.

---

## TASK 1: STATS SYSTEM & HUD

### Three core stats

Implement three stats that decrease over time and affect gameplay:

```typescript
interface CatStats {
  hunger: number    // 0-100. 100 = full, 0 = starving
  thirst: number    // 0-100. 100 = hydrated, 0 = dehydrated
  energy: number    // 0-100. 100 = rested, 0 = exhausted
}
```

**Decay rates (per real-time second):**
- Hunger: -0.15 (roughly 11 minutes from full to empty)
- Thirst: -0.25 (roughly 7 minutes from full to empty — cats dehydrate faster in Manila heat)
- Energy: -0.10 at rest, -0.30 while moving, -0.50 while running

**Heat modifier:** During the midday phase (10am-5pm game time), all decay rates increase by 50%. Being in shade (under tree canopies) negates this penalty.

**Effects of low stats:**
- Hunger < 30: Mamma Cat's movement speed decreases by 20%
- Hunger < 10: Movement speed decreases by 50%, screen edges subtly darken
- Thirst < 20: Same effects as hunger (cumulative)
- Energy < 20: Movement speed decreases, can't run
- Energy = 0: Mamma Cat stops moving. Player must find a rest spot. Screen prompt: "Mamma Cat is exhausted. Find somewhere safe to rest."
- Any stat at 0 for extended time: Gradual screen fade — not death, but a "collapse" that resets Mamma Cat to her last safe resting spot

### HUD Display

Minimal, non-intrusive. Three small bars in the top-left corner of the screen, fixed to camera (not world):

```typescript
// HUD container — fixed to camera
const hud = this.add.container(10, 10).setScrollFactor(0).setDepth(2000)

// Each stat bar: small background rectangle + colored fill rectangle
// Hunger: orange bar
// Thirst: blue bar  
// Energy: yellow/green bar

// Bar dimensions: 60px wide × 6px tall, 2px gap between bars
// Background: dark grey (#333333)
// Fill: colored, width proportional to stat value
```

Also display the current time-of-day phase as a small text label:
```
Dawn | Midday | Evening | Night
```

The HUD should be subtle. This is not an action game — the stats are a gentle pressure, not a panic mechanic. The player should feel mildly worried about food, not frantic.

---

## TASK 2: FOOD & WATER SOURCES

### Food sources (place on map using object layer or programmatic positions)

**1. Feeding stations (2 locations in central gardens)**
- Marked with a small visual indicator (a paper plate or bowl sprite on the ground)
- Active only during dawn (6-9am) and evening (6-10pm) — during these times, a feeder NPC appears nearby
- When Mamma Cat walks over an active feeding station, hunger restores by +40
- Inactive feeding stations show an empty plate — walking over does nothing
- Cooldown: each station can only be used once per feeding period

**2. Fountain (Zone 4 — Exchange Plaza)**
- Permanent water source
- Walking to the fountain and pressing action: thirst restores by +50
- Cooldown: usable every 60 seconds (cats don't chug water, they lap)

**3. Restaurant scraps (Zone 2 — near Manam/Blackbird area)**
- A small food icon appears on the ground near the restaurant areas during evening
- Restores hunger by +20
- Risk: a guard NPC may patrol this area. If the guard spots Mamma Cat, she's chased away (brief speed boost in the opposite direction)

**4. Water bowls (near feeding stations)**
- Small bowl sprites near the feeding station locations
- Always available (feeders leave water out)
- Thirst restores +30

**5. Bugs/lizards (scattered throughout gardens)**
- Tiny sprites (2-3 pixels) that appear occasionally on grass tiles
- Walking over them: hunger restores +5
- They're always available but low reward — foraging, not a meal

### Rest spots (for energy)

- **Under tree canopies** — any tile shaded by a tree canopy counts as shade. Resting here (standing still for 5+ seconds) restores energy at +0.5/second
- **Sheltered spots** — specific locations near buildings (The Shops steps, under the Exchange Plaza canopy) restore energy faster: +1.0/second
- **Safe sleeping spots** — once Mamma Cat has territory, sleeping in her spot fully restores energy and triggers auto-save. For Phase 2, place one temporary safe spot near the starting zone.

### Interaction model

Food and water interactions should use proximity + action key:

```typescript
// When player is within 32px of a food source and presses Space/Enter:
if (source.type === 'feeding_station' && isDawnOrEvening()) {
  this.stats.hunger = Math.min(100, this.stats.hunger + 40)
  this.showFloatingText('+40', source.x, source.y, '#FF8C00')
  source.setUsed()  // can't reuse this period
} 
```

Show a brief floating "+40" number that fades up and disappears — satisfying feedback without being intrusive.

---

## TASK 3: NPC CAT AI

### Behavior system

Each NPC cat has a simple state machine:

```typescript
type CatState = 'idle' | 'walking' | 'sleeping' | 'eating' | 'alert' | 'fleeing'
```

### Movement patterns (CRITICAL — read the design note above)

**Idle state (default during midday and night):**
- Cat sits still, facing a random direction
- Occasional subtle animation: head turn, ear twitch (if we have the frames), or just a brief pause in a different direction
- Duration: 5-15 seconds before transitioning to another state

**Walking state (primary during dawn and evening):**
- Cat walks slowly in a direction for 2-5 tiles (64-160 pixels)
- Speed: 30-40 pixels/second (much slower than Mamma Cat's 120)
- After walking, ALWAYS transitions to idle for 2-5 seconds (the pause-and-look behavior)
- Direction changes should be gradual — cats don't zigzag randomly. They walk with purpose toward a general area, then pause, then continue or change direction slightly.
- Cats should tend to stay within their zone. A central gardens cat doesn't wander to the Exchange Plaza.

**Sleeping state (midday and night):**
- Cat lies down (use idle sprite or a sleeping frame if available)
- Cat does not move or respond to approach for the duration
- Can be "woken" if Mamma Cat interacts (action key): cat transitions to alert, then idle
- Sleeping cats are more common under trees during midday, in sheltered spots at night

**Alert state (triggered by proximity to dogs, loud humans, or unknown cats):**
- Cat stops moving, faces the threat
- Brief pause (1-2 seconds) — the assessment moment
- Then either returns to idle (threat passed) or transitions to fleeing

**Fleeing state (threat is too close):**
- Cat runs at 2-3x normal walking speed toward the nearest tree/bush/shelter
- Once reaching shelter, transitions to alert, then idle
- Running should look urgent — this is the ONLY time NPC cats move fast

### Time-of-day behavior weights

```typescript
// Probability of each state by time of day:
const behaviorWeights = {
  dawn:    { idle: 0.3, walking: 0.5, sleeping: 0.1, eating: 0.1 },
  midday:  { idle: 0.3, walking: 0.1, sleeping: 0.5, eating: 0.1 },
  evening: { idle: 0.2, walking: 0.4, sleeping: 0.1, eating: 0.3 },
  night:   { idle: 0.2, walking: 0.1, sleeping: 0.6, eating: 0.1 }
}
```

### Zone boundaries for NPC cats

Each NPC cat should have a "home zone" — a rectangular or circular area they tend to stay within. Their walking pattern should keep them roughly within this zone:

```typescript
interface NPCCatConfig {
  name: string
  sprite: string
  homeZone: { x: number, y: number, radius: number }  // center + wander radius in pixels
  disposition: 'friendly' | 'neutral' | 'territorial'
  dialogue: string[]
}
```

---

## TASK 4: THREAT/FRIEND INDICATOR SYSTEM

### Floating indicators above entities

Every NPC (cat, human, dog) displays a small colored icon above their sprite that tells the player how that entity feels about Mamma Cat.

**Indicator types:**
- **Green heart (♥)** — Friendly. Feeders, friendly cats, Camille (eventually)
- **Yellow dash (—)** — Neutral/unknown. Most NPCs on first encounter. Unpredictable.
- **Orange exclamation (!)** — Wary/territorial. Cats whose territory you've entered, alert guards, nervous dogs.
- **Red skull (☠)** — Dangerous. Snatchers, hostile humans. Flee immediately.

### Implementation

```typescript
class ThreatIndicator {
  private icon: Phaser.GameObjects.Text
  
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Sprite, disposition: string) {
    const symbols = {
      friendly: { text: '♥', color: '#44DD44' },
      neutral: { text: '—', color: '#DDDD44' },
      wary: { text: '!', color: '#DD8800' },
      dangerous: { text: '☠', color: '#DD2222' }
    }
    
    const config = symbols[disposition]
    this.icon = scene.add.text(0, 0, config.text, {
      fontSize: '12px',
      color: config.color,
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 1)
  }
  
  update(x: number, y: number) {
    this.icon.setPosition(x, y - 28)  // float above the sprite
  }
}
```

### Name labels

- Unknown entities: display "???" above the indicator
- Once Mamma Cat has interacted with or observed an entity: display their name
- Names are learned through proximity (spending time near a cat) or through dialogue with other cats (Blacky might tell Mamma Cat about Tiger)

```typescript
// Track known entities
this.registry.set('KNOWN_CATS', ['Blacky'])  // grows as player meets cats

// When rendering name label:
const knownCats = this.registry.get('KNOWN_CATS') || []
const displayName = knownCats.includes(cat.name) ? cat.name : '???'
```

---

## TASK 5: ADDITIONAL NPC CATS

Add two more named cats to the map. Use the same sprite as Blacky (recolored if possible) with different positions and dialogue.

### Tiger

- **Position:** Central Gardens, near a large tree cluster
- **Sprite:** Same cat sprite, ideally with orange/tabby tint (or just use default)
- **Home zone:** Central Gardens, radius ~200px
- **Disposition:** Neutral (becomes friendly after multiple interactions)
- **Behavior:** Walks during dawn/evening, sleeps under trees during midday

**First encounter dialogue:**
```
*The cat's ears flatten slightly. Its tail flicks once.*
"Ssss. This is my spot."
```

**Second encounter (if Mamma Cat returns):**
```
*The cat watches you approach but doesn't hiss this time.*
"...You again. There's food by the stone building at evening. Don't tell anyone."
```

**After befriending (trust > threshold):**
```
"Mrrp. You can rest here. Under this tree. I'll keep watch."
```

### Jayco

- **Position:** Near The Shops / Pyramid Steps area (northeast)
- **Sprite:** Same cat sprite
- **Home zone:** The Shops zone, radius ~150px
- **Disposition:** Friendly (curious about newcomers)
- **Behavior:** More active than most — walks during dawn and evening, often near the Starbucks area

**First encounter dialogue:**
```
*This cat approaches with tail up. Curious.*
"Prrrp! New face! I'm Jayco. I know every corner of these steps."
"The humans below — the coffee place — they leave good scraps. But watch for the guard."
```

**Subsequent encounters:**
```
"The ginger ones fight over the bench near the fountain. Stay clear at dusk."
```

### Implementation

Each named cat should be created as an NPCCat instance with:
- A unique name and position
- A home zone they wander within
- Dialogue lines tracked by `player.registry` variables (e.g., `JAYCO_TALKS: 0, 1, 2...`)
- A disposition that can change based on interaction count
- A threat/friend indicator reflecting their current disposition

---

## TASK 6: SAVE/LOAD SYSTEM

### Save to localStorage

Serialize all game state to a JSON object and save to localStorage:

```typescript
interface SaveData {
  playerPosition: { x: number, y: number }
  stats: { hunger: number, thirst: number, energy: number }
  timeOfDay: string
  gameTime: number
  variables: Record<string, any>  // MET_BLACKY, JAYCO_TALKS, KNOWN_CATS, etc.
}

function saveGame(scene: Phaser.Scene) {
  const data: SaveData = {
    playerPosition: { x: scene.player.x, y: scene.player.y },
    stats: { ...scene.stats },
    timeOfDay: scene.dayNight.phase,
    gameTime: scene.dayNight.gameTime,
    variables: scene.registry.getAll()
  }
  localStorage.setItem('ayala_save', JSON.stringify(data))
}

function loadGame(scene: Phaser.Scene): SaveData | null {
  const raw = localStorage.getItem('ayala_save')
  if (!raw) return null
  return JSON.parse(raw)
}
```

### When to save

- **Auto-save:** When Mamma Cat rests at a safe sleeping spot
- **Auto-save:** At key story moments (after meeting a named NPC for the first time)
- **Manual save:** Player presses a designated key (e.g., Escape opens a menu with Save option)

### When to load

- On game start: check localStorage for existing save
- If save exists: show a simple prompt — "Continue?" / "New Game"
- If "Continue": restore all state from save
- If "New Game": clear save, start fresh

### Simple start screen

Before the game scene loads, show a minimal start screen:

```typescript
class StartScene extends Phaser.Scene {
  create() {
    const hasSave = localStorage.getItem('ayala_save') !== null
    
    this.add.text(400, 200, 'AYALA', { fontSize: '48px', color: '#ffffff' }).setOrigin(0.5)
    this.add.text(400, 260, 'A story about finding home', { fontSize: '16px', color: '#aaaaaa' }).setOrigin(0.5)
    
    if (hasSave) {
      const continueBtn = this.add.text(400, 350, 'Continue', { fontSize: '24px', color: '#44DD44' }).setOrigin(0.5).setInteractive()
      continueBtn.on('pointerdown', () => this.scene.start('GameScene', { loadSave: true }))
    }
    
    const newBtn = this.add.text(400, 400, 'New Game', { fontSize: '24px', color: '#ffffff' }).setOrigin(0.5).setInteractive()
    newBtn.on('pointerdown', () => {
      localStorage.removeItem('ayala_save')
      this.scene.start('GameScene', { loadSave: false })
    })
  }
}
```

---

## TASK 7: DAY/NIGHT CYCLE REFINEMENT

The Phase 1 day/night cycle was a simple 3-phase timer. Refine it:

### Four phases with proper timing

```typescript
const phases = {
  dawn:    { duration: 90,  overlay: { color: 0xFFCC66, alpha: 0.05 } },  // warm, very subtle
  midday:  { duration: 120, overlay: { color: 0xFFFFFF, alpha: 0.08 } },  // bright, slightly washed
  evening: { duration: 90,  overlay: { color: 0xFF8C00, alpha: 0.15 } },  // warm orange
  night:   { duration: 90,  overlay: { color: 0x000033, alpha: 0.45 } }   // dark blue, significant
}
// Total cycle: ~6.5 minutes per full day (tunable)
```

### Transition effects

Don't snap between phases — fade smoothly over 5-10 seconds:

```typescript
// When transitioning from one phase to the next:
this.tweens.add({
  targets: this.overlay,
  alpha: nextPhase.overlay.alpha,
  duration: 8000,  // 8 second transition
  ease: 'Sine.easeInOut'
})
// Also tween the fill color if possible, or crossfade between two overlays
```

### Game time display

Show the current game time as a clock in the HUD (optional but useful for the player to plan their actions):

```
Dawn 7:30 AM
```

This helps the player learn the rhythms — "feeders come at dawn and evening, I need to be near a feeding station then."

---

## IMPORTANT NOTES

- **Cat behavior is paramount.** If the NPC cats don't feel like real cats — careful, deliberate, alert — the game fails. Re-read the design note at the top of this document before implementing AI.
- **Stats should create gentle pressure, not panic.** The player should think "I should find food soon" not "OH NO I'M DYING." Decay rates should be tuned so the player has time to explore but can't ignore survival indefinitely.
- **The threat indicator is the player's primary information tool.** It tells them who to approach and who to avoid. Get this right.
- **Save frequently in code.** Auto-save after every significant event. Players on iPad may switch apps without warning.
- **Commit after each task.** Test in browser after each change.
- **Do NOT modify** anything in `docs/`.
- The character name is always **Mamma Cat** in player-visible text.

---

## DEFINITION OF DONE

Phase 2 is complete when:

- [ ] Three stat bars (hunger, thirst, energy) display in the HUD and decrease over time
- [ ] Stats decrease faster during midday heat, slower in shade
- [ ] Food sources exist on the map and restore hunger when interacted with
- [ ] The fountain restores thirst when interacted with
- [ ] Resting in shade restores energy
- [ ] Low stats visibly affect Mamma Cat (slower movement, screen darkening)
- [ ] NPC cats (Blacky, Tiger, Jayco) have realistic behavior — slow walking, frequent pauses, time-of-day awareness
- [ ] NPC cats sleep during midday and night, walk during dawn and evening
- [ ] Threat/friend indicators float above all NPCs
- [ ] Unknown NPCs show "???" until met, then show their name
- [ ] Game saves to localStorage at rest spots and story moments
- [ ] Start screen offers Continue / New Game
- [ ] Day/night cycle has four phases with smooth transitions
- [ ] The game still builds to static files and runs offline
