# Phase 3 Technical Brief — Social Systems & Story

**Project:** Ayala (2D top-down cat adventure game)
**Framework:** Phaser 3 + Vite + TypeScript
**Branch:** `sit`
**Context:** Read `docs/Ayala_GDD_v0.1.md` for full game design. Phases 1, 1.5, and 2 are complete — we have a tilemap, player movement, NPC cats with AI behaviors, stats/HUD, food/water sources, threat indicators, day/night cycle, save/load, and dialogue.

---

## OBJECTIVE

Build the social and narrative layer of the game:

1. Add the remaining named NPC cats with unique personalities, positions, and dialogue
2. Implement cat body language animations
3. Implement the trust/reputation points system
4. Build story progression for Chapters 1-3
5. Add human NPC types (joggers, feeders, dog walkers, guards)
6. Add dogs as environmental NPCs
7. Add background colony cats (unnamed, basic behaviors)
8. Implement the colony journal

---

## TASK 1: REMAINING NAMED NPC CATS

Add the remaining named cats from the GDD. Each cat needs: a sprite, a home zone, a disposition, time-of-day behavior (per Phase 2 AI patterns), and multi-stage dialogue.

### Available sprite assets

The `public/assets/sprites/` folder contains:

**Multi-directional grid sheets (256×320, 8 cols × 10 rows, 32×32 frames):**
- `mammacat.png` — Mamma Cat (player)
- `blacky.png` — Blacky (already implemented)
- `tiger.png` — Tiger
- `jayco.png` — Jayco
- `fluffy.png` — Fluffy Cat

**Single-action strip sheets (48px tall, variable width):**
- `Black-Attack.png`, `Black-Crouch.png`, `Black-Eat.png`, `Black-Idle.png`, `Black-Jump.png`, `Black-Meow.png`, `Black-Pounce.png`, `Black-Run.png`, `Black-Sit.png`, `Black-Sleep.png`
- These are Blacky's detailed action sprites — each is a horizontal strip of 48×48 frames

**Ginger cat strips (64px tall, variable width):**
- `ginger-HURT.png`, `ginger-IDLE.png`, `ginger-JUMP.png`, `ginger-RUN.png`, `ginger-WALK.png`
- These are for the Ginger Twins — each is a horizontal strip of 64×64 frames
- NOTE: These are a different scale (64px) from the other cats (32px). Either scale them down to 32px at load time, or use `setScale(0.5)` on the sprites.

**Human sprite:**
- `guard.png` — 512×448, use for guard NPCs and as a base for other human types

Use the 256×320 grid sheets as the primary sprites for named cats. Use the action strips for enhanced animations where available (Blacky's eat, sleep, sit, crouch; Ginger walk, idle, run).

### Cat roster and placement

**Already implemented:** Blacky (Zone 5 — underpass), Tiger (Zone 3 — central gardens), Jayco (Zone 6 — The Shops)

**Add these cats:**

**Jayco Junior**
- **Position:** Near Jayco, Zone 6 (The Shops / Pyramid Steps)
- **Sprite:** Use `jayco.png` (same as Jayco — he's Jayco's kitten)
- **Scale:** `setScale(0.7)` — visibly smaller than adult cats
- **Home zone:** Radius ~100px around Jayco's position (stays close to parent)
- **Disposition:** Friendly (curious, approaches Mamma Cat readily)
- **Behavior:** More active than adults — slightly faster walk speed (40px/s instead of 30). Still pauses, but shorter pauses. Follows Jayco loosely.
- **Dialogue:**
  - First: `*A tiny cat bounces toward you, tail straight up.*\n"Mrrp! Mrrp! You're new! Dad says I shouldn't talk to strangers but you smell okay!"`
  - Later: `"Did you find the water bowls? They're near the big trees! I can show you!"`

**Fluffy Cat**
- **Position:** Zone 3 (Central Gardens, near the boulder/shrub area)
- **Sprite:** `fluffy.png`
- **Home zone:** Central Gardens, radius ~180px
- **Disposition:** Neutral (aloof, not hostile but not welcoming)
- **Behavior:** Slow, dignified. Longer idle pauses than other cats. Prefers shade.
- **Dialogue:**
  - First: `*This cat regards you with half-closed eyes. Its long fur is immaculate.*\n"..."\n*It returns to grooming. You've been dismissed.*`
  - After trust > 20: `"You're still alive. That's something, I suppose."\n"The humans with the bags come at dawn and dusk. Follow the sound of rustling."`

**Pedigree Cat**
- **Position:** Zone 2 (near Blackbird / Nielson Tower)
- **Sprite:** Use `fluffy.png` with a slight tint/color shift if possible, or use `mammacat.png` as a stand-in
- **Home zone:** Blackbird area, radius ~150px
- **Disposition:** Neutral → Friendly (a former pet who understands Mamma Cat's situation)
- **Behavior:** Cautious. Stays close to the Nielson Tower area — doesn't range far.
- **Dialogue:**
  - First: `*This cat has a look you recognise — well-groomed but confused. A former pet, like you.*\n"I had a home once. A bed. A name they called me."\n"They moved away. I didn't."`
  - Later: `"The ones in dark clothes at night... they took my friend. Stay hidden after dark."`

**Ginger Twin 1**
- **Position:** Zone 4 (near the fountain / Exchange Plaza)
- **Sprite:** Use ginger sprite strips. Load `ginger-WALK.png` as the primary spritesheet, `ginger-IDLE.png` for idle. Frame size: 64×64, use `setScale(0.5)` to match 32px world.
- **Home zone:** Fountain area, radius ~200px
- **Disposition:** Wary (territorial about the fountain area)
- **Dialogue:**
  - First: `*Two orange cats glare at you from beside the fountain. One hisses.*\n"SSSS! This water is OURS."`
  - After trust > 30: `*The ginger cat flicks an ear at you.*\n"...Fine. Drink. But don't bring anyone else."`

**Ginger Twin 2**
- **Position:** Near Ginger Twin 1, slightly offset
- **Sprite:** Same ginger sprites
- **Home zone:** Same as Twin 1 but offset by ~60px
- **Disposition:** Same as Twin 1 (they act as a pair)
- **Behavior:** Mirrors Twin 1's state. If Twin 1 is walking, Twin 2 walks nearby. If Twin 1 is sleeping, Twin 2 sleeps nearby.
- **Dialogue:** `*This one just watches. It doesn't speak. Its twin does the talking.*`

### Background colony cats

Add 10-15 unnamed cats scattered across Zones 2, 3, and 4. These use the available cat sprites (random selection from mammacat, blacky, tiger, jayco, fluffy variants).

- No dialogue — interacting shows: `*This cat ignores you.*` or `*This cat hisses softly and turns away.*` or `*This cat sniffs in your direction, then goes back to sleep.*`
- Random disposition: 40% neutral, 30% wary, 20% friendly, 10% territorial
- Follow the same time-of-day AI behavior as named cats (Phase 2 patterns)
- Each has a random home zone within their spawn zone

---

## TASK 2: CAT BODY LANGUAGE ANIMATIONS

Implement visual body language that conveys cat emotion. These are the primary communication tool between cats in the game.

### Priority 1: Tail Up (MUST HAVE)

When Mamma Cat approaches a friendly cat (disposition = friendly, or trust threshold met), both cats display a "tail up" greeting:

```typescript
// When Mamma Cat enters proximity of a friendly cat:
if (distance < 64 && cat.disposition === 'friendly') {
  cat.playAnimation('tail-up')  // sprite frame showing upright tail
  this.player.playAnimation('tail-up')
  // Show a small heart icon briefly above both cats
  this.showEmote(cat, '♥')
  this.showEmote(this.player, '♥')
}
```

If the sprite doesn't have a specific tail-up frame, simulate it by showing a heart emote above the cat and a brief text: `*Tail up — a friendly greeting*`

### Priority 2: Crouching / Ears Flat

When Mamma Cat is near a threat (red/orange indicator entity), or when a wary NPC cat sees Mamma Cat:

```typescript
// NPC cat reacts to Mamma Cat's approach when wary/territorial:
if (distance < 96 && cat.disposition === 'wary') {
  cat.playAnimation('crouch')  // or use Black-Crouch.png frames for Blacky
  this.showEmote(cat, '!')
}
```

Text alternative: `*This cat crouches low, ears flattened. It doesn't want you here.*`

### Priority 3: Tail Flick (Alert)

When a cat transitions to the 'alert' state (Phase 2 AI):

```typescript
// In alert state entry:
this.showEmote(cat, '❓')  // or '!'
// Text: *The cat's tail flicks sharply. It's watching something.*
```

### Emote system

Create a reusable emote system — small icons that appear briefly above any entity:

```typescript
class EmoteSystem {
  show(scene: Phaser.Scene, target: Phaser.GameObjects.Sprite, emote: string) {
    const text = scene.add.text(target.x, target.y - 32, emote, {
      fontSize: '16px'
    }).setOrigin(0.5)
    
    scene.tweens.add({
      targets: text,
      y: target.y - 48,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => text.destroy()
    })
  }
}
```

Emotes: ♥ (friendly), ❓ (curious), ❗ (alert), 💤 (sleeping), 🐟 (hungry), 💀 (danger), 😾 (hostile)

### Contextual narration

When Mamma Cat gets close to any NPC cat, show a brief narration line at the top of the screen describing what she perceives:

- Friendly cat: *"This cat's tail is up. A good sign."*
- Neutral cat: *"This cat watches you carefully. It hasn't decided about you yet."*
- Wary cat: *"This cat's tail is low and flicking. It doesn't want you here."*
- Territorial cat: *"This cat's back arches. Its fur bristles. Back away."*
- Sleeping cat: *"This cat is curled up tight, breathing softly."*

These narration lines are Mamma Cat's instincts — her ability to read other cats.

---

## TASK 3: TRUST / REPUTATION SYSTEM

### Points-based trust

Mamma Cat has a global trust score that represents how the colony perceives her. Individual named cats also have their own relationship score.

```typescript
interface TrustSystem {
  global: number          // 0-100, starts at 0
  cats: Record<string, number>  // per-cat trust, e.g. { 'Blacky': 30, 'Tiger': 5 }
}
```

### Earning trust

| Action | Global | Per-cat |
|--------|--------|---------|
| First conversation with a named cat | +5 | +10 |
| Return conversation (2nd, 3rd time) | +2 | +5 |
| Spending time near a cat (30 sec proximity) | +1 | +2 |
| Being seen eating at a feeding station (normalcy) | +1 | — |
| Surviving a full day cycle | +3 | — |
| Helping a cat (future mechanic) | +5 | +10 |

### Trust thresholds (global)

| Threshold | Unlock |
|-----------|--------|
| 0 | Game start — colony is wary/hostile |
| 10 | Some neutral cats stop hissing |
| 25 | Chapter 2 triggers — "Newcomer" |
| 40 | Access to feeding stations without being chased |
| 50 | Chapter 3 triggers — "Finding Her Place" |
| 65 | Cats begin sharing territory intel |
| 80 | Chapter 4 triggers — access to The Shops territory |
| 90 | Chapter 5 triggers — Camille encounters begin |

### Per-cat trust thresholds

| Threshold | Effect |
|-----------|--------|
| 0 | Default disposition (varies per cat) |
| 15 | Cat's dialogue changes to warmer tone |
| 30 | Cat shares useful information (food locations, threat warnings) |
| 50 | Cat considers Mamma Cat a friend — green indicator, friendly emotes |
| 75 | Cat may offer to share territory or protect Mamma Cat |

### Display

Show trust subtly — NOT as a number. Instead:
- The threat/friend indicator above NPC cats gradually shifts color as trust increases
- Dialogue tone changes
- Body language changes (a cat that used to crouch now stands with tail up)
- The colony journal notes: "Blacky seems to trust you now" or "Tiger is warming up to you"

---

## TASK 4: STORY PROGRESSION — CHAPTERS 1-3

### Chapter system

The game uses chapters as narrative structure. Chapter transitions are triggered by trust thresholds and specific events.

```typescript
interface ChapterState {
  current: number  // 1-6
  triggers: Record<string, boolean>  // specific events completed
}
```

### Chapter 1: Dumped (Tutorial)

**Trigger:** Game start.

**Sequence:**
1. Fade in from black. Night time. Makati Ave sidewalk.
2. Narration: *"A car door opens. Hands push you out. The door slams. The engine fades."*
3. Narration: *"The concrete is hot. The noise is deafening. Everything smells wrong."*
4. Player gains control of Mamma Cat. She's on the sidewalk near the road edge.
5. Threat indicators appear on the road (red — danger, cars) and on the sidewalk (yellow — unknown humans).
6. A subtle directional hint points toward the garden edge: *"The green. Shelter."*
7. When Mamma Cat reaches the garden edge, she encounters her first colony cat — a wary background cat that hisses and runs.
8. Narration: *"You're not welcome here. Not yet."*
9. The player must find a hiding spot (any bush or tree) to rest through the night.
10. When Mamma Cat rests, auto-save. Narration: *"Morning will come. You'll figure this out."*
11. Chapter 1 complete. Dawn breaks.

### Chapter 2: Newcomer

**Trigger:** Global trust ≥ 25, AND met at least 2 named cats.

**Between chapters:** The player explores freely. Dawn/evening active periods, midday hiding, night danger. Finding food, water, meeting cats. Trust builds gradually.

**Chapter 2 opening narration:** *"Days pass. The gardens have a rhythm. You're learning it."*

**Key events in Chapter 2:**
- Meet Blacky (if not already met). His dialogue provides orientation.
- Meet Tiger. Initial hostility, but repeated visits warm him up.
- Discover the feeding stations and their dawn/evening schedule.
- First sighting of a volunteer feeder — cats gathering, food appearing. Mamma Cat hangs back, watching.
- Optional: witness the first "dumping event" — a car on Makati Ave, a cat pushed out. Mamma Cat watches from the garden edge. Narration: *"You remember."*

### Chapter 3: Finding Her Place

**Trigger:** Global trust ≥ 50, AND met at least 4 named cats, AND survived 3 full day cycles.

**Chapter 3 opening narration:** *"You know where the food is. You know who to avoid. But you don't have a place that's yours."*

**Key events in Chapter 3:**
- A territorial confrontation: Mamma Cat wanders into a claimed zone. The resident cat (could be one of the Ginger Twins) confronts her. The player must back away or face a standoff (screen darkens, hostile emotes, Mamma Cat auto-crouches).
- A close call with a threat at night — either a snatcher sighting (Mamma Cat sees them from hiding, heart pounding) or a dog that gets loose from its owner.
- Blacky or Tiger tells Mamma Cat about the pyramid steps area: *"The steps near the big glass building... good shelter. Warm air from below. Close to food. No one's claimed it in a while."*
- Chapter 3 ends when Mamma Cat first visits Zone 6 (The Shops / Pyramid Steps) and the narration fires: *"This could be home."*

### Implementation

```typescript
// Check chapter progression in update() or on a timer:
function checkChapterProgress() {
  const trust = this.registry.get('GLOBAL_TRUST') || 0
  const metCats = (this.registry.get('KNOWN_CATS') || []).length
  const daysSurvived = this.registry.get('DAYS_SURVIVED') || 0
  const currentChapter = this.registry.get('CURRENT_CHAPTER') || 1
  
  if (currentChapter === 1 && this.registry.get('CH1_RESTED')) {
    this.triggerChapter(2)
  }
  if (currentChapter === 2 && trust >= 25 && metCats >= 2) {
    this.triggerChapter(3) // actually just enables Ch3 trigger
  }
  if (currentChapter === 3 && trust >= 50 && metCats >= 4 && daysSurvived >= 3) {
    // Chapter 3 content becomes available
  }
}
```

---

## TASK 5: HUMAN NPCs

Humans are environmental entities. They walk through the park on set paths and have threat indicators. Mamma Cat cannot talk to them — she can only observe and react.

### Human types to implement

**Joggers (2-3 on paths)**
- Sprite: Use `guard.png` recolored, or simple rectangle placeholder
- Move quickly along walkway paths (speed: 100px/s)
- Follow set path routes through the gardens
- Threat indicator: Yellow (neutral)
- If they pass close to a cat, the cat enters alert state briefly
- Active during dawn and evening

**Volunteer Feeders (1-2, timed)**
- Appear at dawn (6-9am) and evening (6-10pm) near feeding stations
- Walk slowly to a feeding station, stand there for 30-60 seconds, then leave
- Threat indicator: Green (friendly)
- When a feeder is at a station, the station becomes active (food available)
- Cats gather near active feeders (NPC cats should pathfind toward active feeding stations during these times)

**Dog Walkers (1-2, with dogs)**
- Walk along grassy areas and main paths
- Speed: 60px/s (leisurely walk)
- Threat indicator: Yellow (the human) — the dog has its own indicator
- Active during dawn, evening, and occasionally midday

**Guards (1-2, patrol routes)**
- Walk set patrol routes near buildings (The Shops, Exchange Plaza, Blackbird)
- Sprite: `guard.png`
- Speed: 50px/s
- Threat indicator: Orange (wary — some guards chase cats away from restaurant areas)
- If Mamma Cat is within 64px of a guard near a food scrap source, the guard chases her: guard moves toward Mamma Cat at 80px/s for 3 seconds, Mamma Cat gets a forced velocity boost away
- Active during all daylight hours

### Human pathfinding

Humans follow simple predefined paths — arrays of waypoints:

```typescript
interface HumanNPC {
  type: 'jogger' | 'feeder' | 'dogwalker' | 'guard'
  sprite: Phaser.GameObjects.Sprite
  path: { x: number, y: number }[]
  currentWaypoint: number
  speed: number
  activePhases: string[]  // ['dawn', 'evening']
  indicator: ThreatIndicator
}
```

When not in their active phase, humans are removed from the map (or made invisible). They reappear at their starting waypoint when their phase begins.

---

## TASK 6: DOGS

Dogs accompany dog walkers. They are not controllable NPCs — they follow their owner on a leash (offset position from the dog walker sprite).

### Implementation

- Sprite: Simple 32×32 dog placeholder (can be a recolored cat sprite with different proportions, or a colored rectangle)
- Position: Always within 32-48px of their dog walker owner
- Movement: Follow the dog walker with slight lag and occasional random offset (dogs weave on leashes)
- Threat indicator: Yellow (most dogs) or Orange (excitable dogs — 20% chance)
- When Mamma Cat is within 96px of a dog, the dog "notices" — barks (text: *"WOOF!"*), lunges slightly toward Mamma Cat (sprite moves 16px toward her then snaps back)
- This triggers Mamma Cat's alert state and any nearby NPC cats to enter alert/flee
- Dogs do NOT chase cats. They bark and lunge but stay with their owner. The threat is the startle, not a pursuit.

```typescript
// Dog follows owner:
const offsetX = Math.sin(time * 0.002) * 16  // gentle weaving
dog.setPosition(owner.x + offsetX, owner.y + 32)  // behind and beside owner

// Dog notices cat:
if (Phaser.Math.Distance.Between(dog.x, dog.y, mammaCat.x, mammaCat.y) < 96) {
  this.showEmote(dog, '❗')
  this.showFloatingText('WOOF!', dog.x, dog.y, '#FF4444')
  // Brief lunge toward cat
  scene.tweens.add({
    targets: dog,
    x: dog.x + (mammaCat.x - dog.x) * 0.2,
    y: dog.y + (mammaCat.y - dog.y) * 0.2,
    duration: 200,
    yoyo: true
  })
}
```

---

## TASK 7: COLONY JOURNAL

A simple in-game record of cats Mamma Cat has met and what she knows about them.

### Access

Press **J** to open the colony journal. Or access via the Escape pause menu.

### Layout

A scrollable list showing each known cat:

```
┌─────────────────────────────────────────┐
│ COLONY JOURNAL                     [X]  │
│                                         │
│ ♥ Blacky                                │
│   "Sits by the underpass. Wise."        │
│   Met: Day 1                            │
│   Trust: ♥♥♥♥♡                          │
│                                         │
│ — Tiger                                 │
│   "Central gardens. Territorial."       │
│   Met: Day 2                            │
│   Trust: ♥♥♡♡♡                          │
│                                         │
│ ? ???                                   │
│   "A ginger cat near the fountain.      │
│    You haven't gotten close enough."    │
│                                         │
│ Colony count: ~42 cats                  │
│ Days survived: 5                        │
└─────────────────────────────────────────┘
```

### Data

```typescript
interface JournalEntry {
  name: string           // or '???' if not yet known
  description: string    // short flavor text, updates as trust grows
  metOnDay: number
  trust: number          // 0-100, displayed as hearts (each heart = 20 points)
  disposition: string    // shown as indicator color
  lastSeen: string       // 'Today' / 'Yesterday' / 'Not seen in 3 days'
}
```

The journal updates automatically when:
- Mamma Cat meets a new cat (new entry added)
- Trust changes (description updates)
- A cat hasn't been seen for several game days (lastSeen updates — foreshadows colony dynamics in Phase 4)

---

## TASK 8: CONTROLS UPDATE

Implement the controls from `docs/Controls_Update_Spec.md`:

- WASD + Arrow Keys for movement
- Shift + direction to run
- C to crouch/hide
- Space (tap) to interact
- Space (hold 2 sec) to rest/sleep
- Tab (hold) to look around (camera zoom out)
- J to open colony journal
- Escape for pause menu

See the controls spec document for full implementation details.

---

## IMPORTANT NOTES

- **Cat behavior must be realistic.** Slow, careful, deliberate. See Phase 2 design note — it still applies to all new NPC cats.
- **Humans are environmental, not interactive.** Mamma Cat observes them; she doesn't talk to them. They walk their paths, and their presence affects the cats.
- **Dogs are startling, not dangerous.** They bark and lunge but stay on their leash. The threat is psychological — cats don't know the dog can't reach them.
- **Trust builds slowly.** The player should feel like they're earning the colony's respect over time, not gaming a points system.
- **Narration is Mamma Cat's inner voice.** Keep it short, evocative, and cat-perspective. She doesn't think in human concepts — she thinks in smells, sounds, warmth, safety, fear.
- **Commit after each task.** Test in browser after each change.
- **Do NOT modify** anything in `docs/`.

---

## DEFINITION OF DONE

Phase 3 is complete when:

- [ ] All 8 named NPC cats exist on the map with unique positions, dialogue, and dispositions
- [ ] 10-15 background colony cats wander the gardens with basic behaviors
- [ ] Cat body language emotes appear (♥ for friendly greeting, ❗ for alert, etc.)
- [ ] Contextual narration describes what Mamma Cat perceives when near other cats
- [ ] Trust points accumulate through interactions and time
- [ ] Trust thresholds trigger dialogue changes and disposition shifts
- [ ] Chapter 1 tutorial sequence plays on new game (narration, first night, first rest)
- [ ] Chapter 2 triggers when trust and met-cat thresholds are reached
- [ ] Chapter 3 triggers and includes territorial confrontation and snatcher sighting
- [ ] Joggers, feeders, guards, and dog walkers move through the park on schedules
- [ ] Dogs bark and lunge when Mamma Cat gets close, startling nearby cats
- [ ] Feeders activate feeding stations during dawn and evening
- [ ] Guards chase Mamma Cat away from restaurant scrap areas
- [ ] Colony journal (J key) shows all known cats with trust levels and descriptions
- [ ] WASD + Arrow keys, run, crouch, rest, map peek, and journal controls all work
- [ ] The game still builds to static files and runs offline
