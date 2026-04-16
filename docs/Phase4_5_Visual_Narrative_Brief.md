# Phase 4.5 Technical Brief — Visual & Narrative Alignment

**Project:** Ayala (2D top-down cat adventure game)
**Framework:** Phaser 3 + Vite + TypeScript
**Branch:** `sit`
**Context:** Phase 4 is complete — the full story is implemented, but the gameplay is letting the story down. The narrative and visuals are disconnected. This phase fixes that.

---

## THE CORE PRINCIPLE

**The narrative must match what the player sees. Dialogue must match what NPCs are actually doing. Story events must happen where Mamma Cat can plausibly witness them.**

Right now the game tells the player things are happening rather than showing them. A cat is "hissing" in text while its sprite walks casually past. A cat is "being dumped" on Makati Ave while Mamma Cat is asleep at the pyramid steps. Camille "extends her hand" in dialogue while she's three tiles away walking the other direction.

This phase fixes the five core issues that make the game feel amateurish despite the strong story underneath.

---

## TASK 1: START SEQUENCE

The first 30 seconds of the game sets the tone for everything. Right now Mamma Cat just appears on the sidewalk with some text. This is wrong.

### The abandonment cinematic (simple but essential)

This is a scripted sequence. Player has no control during it.

**Sequence:**
1. Game starts. Black screen. Narration text fades in: *"A car. A door. Hands."*
2. Fade from black to the Makati Ave sidewalk at night. Camera is positioned slightly above Mamma Cat's eventual spawn point.
3. A car sprite drives into frame from the right (along Makati Ave). Use any simple car sprite — a basic rectangle with wheels works fine for v1.
4. The car stops.
5. The car door animates open (can be a simple sprite swap — door-closed becomes door-open).
6. Mamma Cat's sprite appears beside the car (as if placed/pushed out). She's in the crouched/frightened pose (ears flat).
7. The car door closes (sprite swap back).
8. The car drives away in the direction it came from, exits the frame.
9. 2-second pause. Mamma Cat stays in her crouched pose. Camera stays on her.
10. Narration fades in: *"The engine fades. The concrete is hot. Everything smells wrong."*
11. Narration: *"You are alone."*
12. Player gains control. Mamma Cat's sprite shifts from crouched to idle.

### Implementation notes

- Disable all player input during the cinematic (set a `cinematicActive` flag)
- Use Phaser tweens to animate the car movement and door
- Use `scene.time.delayedCall()` for pauses between beats
- Simple car sprite: Create a basic 48×32 PNG — a dark rectangle with two small circles for wheels is fine. This is placeholder art that can be improved later.
- The sequence should take 15-20 seconds total. Not longer.

### DO NOT

- Over-engineer this with multiple camera angles or complex animations
- Add more narration than the lines above — less is more
- Let the player skip the sequence on first playthrough (allow skip on subsequent playthroughs via a "skip intro" flag saved to localStorage)

---

## TASK 2: NPC CATS ENGAGE DURING DIALOGUE

When an NPC cat is talking to Mamma Cat, it must STOP its usual behavior and ENGAGE with her. Right now cats continue wandering randomly while dialogue boxes appear, which completely breaks immersion.

### Behavior during dialogue

When dialogue is triggered with an NPC cat:

1. **The NPC cat stops moving.** Set velocity to zero. Freeze its AI state.
2. **The NPC cat faces Mamma Cat.** Calculate the direction from the NPC to Mamma Cat, update the sprite's facing direction.
3. **The NPC cat shows the appropriate body language animation based on dialogue tone:**
   - Friendly dialogue → tail-up pose, occasionally shift to idle and back
   - Wary/hissing dialogue → crouched pose with ears flat, maybe a hiss emote (❗)
   - Hostile dialogue → arched back pose, puffed fur emote
   - Sleeping cat being woken → transition from sleep pose to alert idle
4. **Mamma Cat also faces the NPC cat.** Lock her facing direction toward the NPC for the duration of dialogue.
5. **Both cats stay locked in this engaged state until dialogue ends.** Only then do they return to their normal AI behavior.

### Tying dialogue tone to animation

The dialogue service returns a response with text. Add a required field to the response:

```typescript
interface DialogueResponse {
  lines: string[]
  speakerPose: 'friendly' | 'wary' | 'hostile' | 'sleeping' | 'curious' | 'submissive'
  // ... existing fields
}
```

Before each dialogue line displays, the NPC cat's sprite switches to the `speakerPose` animation. This means Blacky's calm dialogue uses the friendly/sitting pose, Tiger's hiss uses the wary pose, etc.

### Proximity trigger for dialogue

Dialogue can only be triggered when Mamma Cat is within ~48px of an NPC cat AND the NPC is not currently sleeping or fleeing. No dialogue at a distance. No dialogue mid-action.

### DO NOT

- Allow the NPC cat to keep walking, grooming, or idling during dialogue
- Show dialogue text if the NPC cat is off-screen or more than 48px away from Mamma Cat
- Trigger dialogue through a proximity check alone — the player must press Space (tap) to initiate

---

## TASK 3: HUMAN NPCs — TWO CATEGORIES

There are two very different types of humans in the gardens. Their behavior should reflect this.

### Category A: Passers-through (joggers, dog walkers, office workers)

These humans are NOT here for the cats. They're just using the park.

**Behavior:**
- Walk their predefined paths at their normal speeds
- **Notice cats** when within ~48px: briefly turn their head toward the cat (sprite direction change), maybe slow down for 1-2 seconds, then continue
- Do NOT stop or engage
- The joggers and dog walker owners should react proportionally — a jogger might glance and keep running, an office worker might glance and keep walking
- Dog walkers' dogs already react (from Phase 3) — keep that behavior

This is already roughly what's in the game. The only fix needed is the "notice and glance" behavior — a simple head-turn when near a cat.

### Category B: Cat people (volunteer feeders, Camille, Manu, Kish)

These humans are in the gardens SPECIFICALLY for the cats. Their entire behavior is oriented around finding, greeting, and engaging with cats.

**Core behavior pattern (applies to all Category B humans):**

1. Enter the gardens at their designated entry point (e.g., Paseo de Roxas underpass for Camille)
2. Walk a circuit that passes by every known cat location (feeding stations, sleeping spots, territory zones, the fountain area, etc.)
3. When within ~64px of ANY cat (named or unnamed):
   - Stop walking
   - Turn to face the cat
   - Crouch (sprite pose change)
   - Pause for 3-5 seconds — they're greeting the cat
   - Show a small text bubble above their head with a gentle greeting: *"Hi sweetie."* / *"Kamusta, pusa."* / *"There you are."* / *"Good girl."* (vary these per human)
   - Show a ♥ emote floating briefly between the human and cat
   - Stand back up
   - Continue on their circuit
4. When they reach a feeding station during their scheduled times, stop longer — 30-60 seconds — place food, watch cats eat, then move on
5. After completing their circuit, exit via their entry point

**This behavior runs regardless of whether Mamma Cat is nearby.** The gardens should feel like a place where cat lovers genuinely care for the cats, not a stage that only activates when Mamma Cat is watching.

**The circuit:** A predefined list of waypoints covering the main cat areas — Blacky at the underpass, feeding stations in central gardens, the fountain area (Ginger Twins), the Blackbird area (Pedigree Cat), the pyramid steps (Jayco and family), Tiger's territory in central gardens, Fluffy's area.

### Camille, Manu, Kish specifics

They follow Category B behavior, but with personalization:

**Camille:**
- Has the most thorough circuit — visits every cat
- Spends longer at each crouch (5-7 seconds)
- Her gentle greetings are personalized if she knows the cat: *"Blacky, you handsome boy."* / *"Tiger, not hissing today?"*
- For unknown cats (including Mamma Cat before Encounter 2): *"And who are you, sweetheart?"*
- During Encounters 1-5 with Mamma Cat, the encounter dialogue ONLY triggers if Camille is within ~64px of Mamma Cat AND can see her (not blocked by buildings). If Mamma Cat is not in Camille's line of sight, Camille simply completes her circuit and leaves.

**Manu:**
- Accompanies Camille from Encounter 3 onwards
- Walks slightly behind her
- Also crouches and greets cats, but less frequently (every 2-3 cats, not every one)
- His greetings are quieter: *"Hey, little one."* / *"You're okay."*

**Kish:**
- Appears in Encounters 4 and 5 only
- More animated — moves faster between cats, less patient
- Her greetings are enthusiastic: *"OMG KITTY!"* / *"Hi hi hi!"*
- Camille occasionally gestures for her to slow down (sprite animation of Camille raising a hand)

### Implementation notes

```typescript
// Simplified Category B behavior loop
class CatPersonNPC {
  async runCircuit() {
    for (const waypoint of this.circuit) {
      await this.walkTo(waypoint)
      const nearbyCats = this.findCatsWithin(64)
      for (const cat of nearbyCats) {
        await this.greetCat(cat)
      }
    }
    await this.exitGardens()
  }
  
  async greetCat(cat: NPCCat) {
    this.stopMoving()
    this.faceToward(cat)
    this.playAnimation('crouch')
    this.showGreeting()  // text bubble + ♥ emote
    await this.scene.delay(4000)
    this.playAnimation('stand')
  }
}
```

### DO NOT

- Have feeders just teleport to the feeding station and vanish
- Have Camille walk in a straight line from underpass to The Shops ignoring every cat
- Have any Category B human ignore a cat they walk past
- Have greetings feel identical for every cat — use variety in the text bubbles

---

## TASK 4: STORY EVENTS MUST BE VISIBLE

The biggest immersion breaker: story events happen while Mamma Cat is nowhere near them, and she somehow "knows" they happened. This must be fixed.

### Core rule for all story events

**A story event only triggers when Mamma Cat is positioned to witness it.**

If Mamma Cat can't see it, it doesn't happen (yet). The event waits until she's in range, or cancels if the window passes.

### Dumping events

Currently: dialogue fires about a cat being dumped regardless of Mamma Cat's location.

**Fix:** Dumping events only trigger when Mamma Cat is within ~300px of the Makati Ave edge (the road where dumping happens). The event is ARMED when the chapter/trust threshold is met, but the trigger only fires when Mamma Cat is in position.

When Mamma Cat is in range AND the event is armed:
1. A car sprite drives into view on Makati Ave road
2. The car stops
3. The door opens (sprite swap)
4. A cat sprite appears on the sidewalk
5. Door closes, car drives away
6. The dumped cat sits frozen on the sidewalk
7. ONLY NOW does narration appear: *"A car. A door. A cat. You remember."*
8. The dumped cat eventually moves into the gardens

**If Mamma Cat wanders away mid-event, the event still completes** — she's already witnessed the key moment. But the event doesn't start until she arrives at the sidewalk area.

### Snatcher sightings

Currently: snatchers spawn at night and the player may or may not notice them.

**Fix:** The FIRST snatcher sighting in the game is a scripted moment. It's armed at a specific point (Chapter 3 trigger). It waits until Mamma Cat is out and about at night. When conditions are met:
1. A snatcher sprite walks into view from a garden path
2. NPC cats near the snatcher visibly flee (emote: ❗, sprites run toward shelter)
3. Only NOW does any narration fire: *"Something moves in the dark. The other cats run. You should too."*

If Mamma Cat is sleeping at a safe spot during the first-snatcher window, the event waits for the next night.

### Camille encounters

This is the most important fix. Currently Camille can walk to the steps and dialogue fires even if Mamma Cat is asleep on the other side of the park.

**Fix:** Each Camille encounter has THREE conditions that must ALL be true for dialogue to trigger:

1. Camille is at the encounter location (varies per encounter — underpass approach for #1, near the steps for #2-5)
2. Mamma Cat is within ~64px of Camille
3. Mamma Cat has line-of-sight to Camille (no building blocking the view — for now, approximate this as "not more than 3 tiles apart through a wall tile")

If conditions aren't met, Camille simply continues her circuit and leaves. The encounter tries again next evening.

**No dialogue fires if Mamma Cat isn't looking at Camille.** Period.

### All narration must be grounded

Every narration line must describe something Mamma Cat can currently perceive:

- Good: *"Her hand smells like fish treats and soap."* → only fires when Camille's hand is actually visibly near Mamma Cat
- Bad: *"A cat is being dumped on the far side of the park."* → Mamma Cat has no way to know this

If narration describes a sight, sound, or smell, the source of that sight/sound/smell must be within ~150px of Mamma Cat when the narration fires.

### Implementation approach

```typescript
interface StoryEvent {
  id: string
  triggerCondition: (state: GameState) => boolean   // is it time?
  witnessCondition: (state: GameState) => boolean   // can Mamma Cat see it?
  play: () => Promise<void>
}

function checkStoryEvents() {
  for (const event of armedEvents) {
    if (event.witnessCondition(gameState)) {
      event.play()
      disarmEvent(event)
    }
  }
}
```

---

## TASK 5: VISUAL STORYTELLING POLISH

Small touches that tie narrative to visuals:

### On-screen cues for story beats

- When a story event is about to begin (dumping, snatcher, Camille approach), play a subtle audio cue if possible (a sting, a chord)
- Screen edges can pulse gently for tension (snatcher appearing) or warm for kindness (Camille approaching)
- Camera can briefly pan or slow its follow to emphasize a moment (Camille crouching down)

### Chapter indicators (subtle)

The player currently has no idea what chapter they're in or what to do next. Add a very subtle chapter indicator:

- When a new chapter triggers, show a simple text card: *"Chapter 2: Newcomer"* — displayed for 3 seconds, then fades
- In the pause menu (Escape), show the current chapter title and a one-line hint of the current goal: *"Chapter 3: Finding Her Place — Explore beyond the central gardens"*

This is gentle guidance, not hand-holding. The player still has to figure out how to progress.

### Emote system consistency

Make sure the emote system (♥ ❗ ❓ 💤) is used EVERYWHERE it applies:
- Every cat that's sleeping shows 💤 periodically
- Every friendly greeting shows ♥ on both cats
- Every alert reaction shows ❗
- Every startled cat (dogs barking, humans yelling) shows ❗

These small visual signals do a lot of storytelling work without text.

---

## WHAT THIS PHASE IS NOT

- A rewrite of Phase 4
- A polish pass on graphics (the map is what it is for now — we'll improve it later)
- An AI integration (that's Phase 5)
- A new story or new characters

This phase ONLY fixes the disconnect between narrative and visuals. Same story, same characters, same mechanics — but now they're actually tied to what the player sees and does.

---

## IMPORTANT NOTES

- **The core principle: narrative only fires when visuals justify it.** If Mamma Cat can't see it, she doesn't know about it.
- **NPC cats must engage during dialogue.** They stop, face her, show the right pose, stay engaged until the conversation ends.
- **Category B humans actively seek out cats.** They're in the gardens for the cats. Their behavior should reflect that even when Mamma Cat isn't watching.
- **The start sequence is the first impression.** Keep it simple but make it count — a car, a door, Mamma Cat on the sidewalk alone.
- **Don't over-engineer.** This is v1. Simple sprite animations, simple camera work, simple line-of-sight checks. Get the basics right first.
- **Commit after each task.** Test in browser after each change.
- **Do NOT modify** anything in `docs/`.
- The character name is always **Mamma Cat** in player-visible text.

---

## DEFINITION OF DONE

Phase 4.5 is complete when:

- [ ] Start sequence plays: car drives up, door opens, Mamma Cat placed on sidewalk, car leaves, narration, then control
- [ ] Player cannot control Mamma Cat during the start sequence
- [ ] NPC cats stop, face Mamma Cat, and show the appropriate pose during dialogue
- [ ] Dialogue pose matches dialogue tone (friendly = tail up, wary = crouched, etc.)
- [ ] Joggers, dog walkers, office workers glance at cats as they pass
- [ ] Volunteer feeders walk a circuit visiting every cat, crouching and greeting each one
- [ ] Camille walks a circuit visiting every cat, crouching and greeting each one
- [ ] Manu accompanies Camille from Encounter 3 with his own greeting behavior
- [ ] Kish appears in Encounters 4-5 with enthusiastic (too fast) behavior
- [ ] Category B humans continue their circuits even when Mamma Cat is not visible
- [ ] Dumping events only trigger when Mamma Cat is near the Makati Ave road
- [ ] Dumping events show a visible car, door, cat placement sequence
- [ ] First snatcher sighting is a scripted moment with NPC cats fleeing visibly
- [ ] Camille encounter dialogue only fires when Mamma Cat is within 64px AND has line-of-sight to Camille
- [ ] All narration lines describe things Mamma Cat can actually perceive
- [ ] Chapter title cards display briefly when a new chapter triggers
- [ ] Pause menu shows current chapter and a one-line goal hint
- [ ] Emote system is used consistently across all NPCs for sleeping, alert, friendly, and startled states
- [ ] The game still builds to static files and runs offline
