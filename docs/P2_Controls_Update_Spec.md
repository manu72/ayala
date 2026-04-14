# Controls Update — Quick Spec

**Add to the current Phase 2 build. Not a separate phase — just a targeted controls update.**

---

## INPUT BINDINGS

Both WASD and Arrow Keys should work simultaneously for all movement. The player chooses their preference — the game responds to both.

### Movement

| Action | Keys |
|--------|------|
| Walk up | W / Arrow Up |
| Walk down | S / Arrow Down |
| Walk left | A / Arrow Left |
| Walk right | D / Arrow Right |

Movement speed: current walking speed (120 px/s or whatever is set).

### Run

| Action | Keys |
|--------|------|
| Run in direction | Shift + direction key (WASD or Arrows) |

Run speed: ~2x walk speed (240 px/s).

**Design note:** Running is a stress/survival action, not a fun traversal mode. It should drain energy faster (see Phase 2 energy decay rates — running uses -0.50/sec vs -0.30/sec walking). The player *can* run freely, but the energy cost discourages casual use. The game teaches the player through mechanics that running is costly — just like it is for real cats in the Manila heat.

### Crouch / Hide

| Action | Keys |
|--------|------|
| Crouch / hide | Shift + S (or Shift + Arrow Down) |

When crouching:
- Mamma Cat's sprite changes to a low/crouched pose (ears flat, body low)
- Movement speed is reduced to ~40% of walk speed
- Mamma Cat is harder for threats to detect (reduced detection radius from snatchers, guards, dogs)
- Only effective near cover (bushes, boulders, under stairs, tree trunks). If crouching in the open, detection radius is only slightly reduced.
- Release Shift to stand back up

### Interact

| Action | Keys |
|--------|------|
| Interact / Talk / Eat / Drink | Space (tap) |

Context-sensitive based on proximity:
- Near an NPC cat → opens dialogue
- Near a food source → eat (restores hunger)
- Near the fountain → drink (restores thirst)

### Rest / Sleep

| Action | Keys |
|--------|------|
| Lie down and rest | Hold Space for 2 seconds (while stationary) |
| Wake up | Any movement key or tap Space |

Resting is how Mamma Cat restores energy. It's a deliberate decision to stop and be vulnerable.

**Entering rest mode:**
- Player must be stationary (not moving) and hold Space for 2 seconds
- A small progress indicator appears (a subtle "zzz" filling in, or a circular progress ring) so the player knows they need to keep holding
- After 2 seconds: Mamma Cat curls up — sprite changes to sleeping pose
- The hold-to-rest prevents accidental resting when the player meant to interact

**While resting:**
- Energy restores gradually:
  - In shade (under tree canopy, sheltered spot): +1.0/sec
  - In the open: +0.5/sec
  - In a designated safe sleeping spot (e.g., territory, The Shops steps): +2.0/sec and triggers auto-save
- Hunger and thirst continue to decay (sleeping doesn't stop hunger)
- The game world keeps running — day/night cycle continues, NPCs move, threats patrol
- Mamma Cat is VULNERABLE while sleeping. If a threat (snatcher, aggressive dog, hostile human) enters a danger radius:
  - A warning sound plays (low rumble or alert tone)
  - The screen edges pulse faintly red
  - The player has a few seconds to wake up and move before the threat reaches her
- A sleeping cat in the open is more visible to threats than one tucked under a bush or in a sheltered spot

**Waking up:**
- Any movement key (WASD or Arrows) instantly wakes Mamma Cat
- Tapping Space also wakes her
- Sprite returns to idle standing pose
- Brief 0.5 second "getting up" delay before full movement speed is available (cats stretch when they wake up)

**Safe sleeping spots** (specific map locations):
- Under dense tree clusters in the Central Gardens
- The Shops pyramid steps area (once it becomes Mamma Cat's territory)
- Under the Exchange Plaza canopy
- Behind boulders or dense bushes near the park edges
- These locations restore energy faster and are harder for threats to detect Mamma Cat

### Look Around (Map Peek)

| Action | Keys |
|--------|------|
| Look around / survey area | Hold Tab |

Mamma Cat stops and surveys her surroundings — the camera zooms out to show a wider area of the map.

When holding Tab:
- Mamma Cat stops moving (she's perched, scanning — cats do this from elevated or open spots)
- Camera smoothly zooms out from 2.5x to ~0.8x over 500ms
- Day/night overlay and HUD remain visible
- Player can see nearby food sources, water, threats, and NPC positions
- Useful for orientation and planning routes

When Tab is released:
- Camera smoothly zooms back to 2.5x over 500ms
- Mamma Cat can move again

This is both a gameplay tool (finding food, water, avoiding threats) and a navigation aid (orienting within the park).

### Pause / Menu

| Action | Keys |
|--------|------|
| Pause / Menu | Escape |

Opens a simple overlay with: Save Game, Resume, Quit to Title.

---

## IMPLEMENTATION NOTES

```typescript
// Bind both WASD and Arrows:
const cursors = this.input.keyboard.createCursorKeys()
const wasd = this.input.keyboard.addKeys({
  up: Phaser.Input.Keyboard.KeyCodes.W,
  down: Phaser.Input.Keyboard.KeyCodes.S,
  left: Phaser.Input.Keyboard.KeyCodes.A,
  right: Phaser.Input.Keyboard.KeyCodes.D
})
const shift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
const space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
const tab = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB)

// In update():
// --- Rest mode (check first — if resting, skip all other input) ---
if (this.isResting) {
  this.restTimer += delta
  this.stats.energy = Math.min(100, this.stats.energy + this.restRate * (delta / 1000))
  
  // Threat proximity check while sleeping
  if (this.nearestThreatDistance() < DANGER_RADIUS) {
    this.showSleepWarning()  // red pulse, warning sound
  }
  
  // Wake up on any movement key or space tap
  const anyMovement = up || down || left || right
  if (anyMovement || Phaser.Input.Keyboard.JustDown(space)) {
    this.wakeUp()  // restore idle sprite, brief delay
  }
  return  // skip movement processing while resting
}

// --- Rest initiation (hold Space for 2 seconds while stationary) ---
if (space.isDown && this.player.body.velocity.length() === 0) {
  this.restHoldTimer += delta
  this.showRestProgress(this.restHoldTimer / 2000)  // progress indicator
  if (this.restHoldTimer >= 2000) {
    this.enterRestMode()  // curl up sprite, set isResting = true
  }
} else {
  this.restHoldTimer = 0
  this.hideRestProgress()
}

// --- Map peek (must check before movement) ---
if (tab.isDown) {
  this.player.setVelocity(0)  // stop movement while looking around
  this.cameras.main.zoomTo(0.8, 500)
  return  // skip movement processing while peeking
}
if (tab.justUp) {
  this.cameras.main.zoomTo(2.5, 500)
}

const up = cursors.up.isDown || wasd.up.isDown
const down = cursors.down.isDown || wasd.down.isDown
const left = cursors.left.isDown || wasd.left.isDown
const right = cursors.right.isDown || wasd.right.isDown
const isRunning = shift.isDown && (up || left || right)  // shift + direction = run
const isCrouching = shift.isDown && down                  // shift + down = crouch

const speed = isCrouching ? 48 : isRunning ? 240 : 120

// Apply movement with calculated speed...
```

**Do NOT change** any existing Phase 2 functionality — stats, food sources, NPC behavior, threat indicators, save/load, and day/night cycle should all remain as-is. This update only adds WASD support, run, crouch, rest mode, and map peek to the existing movement system.
