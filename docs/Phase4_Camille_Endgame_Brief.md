# Phase 4 Technical Brief — Camille, Endgame & Colony Dynamics

**Project:** Ayala (2D top-down cat adventure game)
**Framework:** Phaser 3 + Vite + TypeScript
**Branch:** `sit`
**Context:** Read `docs/Ayala_GDD_v0.1.md` for full game design. Phases 1-3 are complete — we have a tilemap, player movement, NPC cats with AI behaviors and dialogue, stats/HUD, food/water sources, threat indicators, trust system, day/night cycle, save/load, colony journal, human NPCs, dogs, body language emotes, and story Chapters 1-3.

---

## OBJECTIVE

Complete the story and add the systems that bring the game to a satisfying conclusion:

1. Implement Chapters 4-6 story progression
2. Add Camille, Manu, and Kish as named human NPCs
3. Build the Camille-Mamma Cat relationship encounter sequence
4. Implement snatchers as a night threat
5. Implement colony dynamics (dumping events, population flux)
6. Build the dialogue service interface (scripted now, designed for AI swap in Phase 5)
7. Create the epilogue and end screen
8. Territory claiming mechanic for The Shops / Pyramid Steps

---

## TASK 1: DIALOGUE SERVICE INTERFACE

**This task comes first because it affects how ALL dialogue is delivered from this point forward.**

Currently, dialogue is hardcoded strings in the NPC classes. Refactor all dialogue to flow through a centralized DialogueService that can be swapped from scripted to AI-powered in Phase 5.

### Interface design

```typescript
interface DialogueRequest {
  speaker: string              // 'Blacky', 'Tiger', 'Camille', etc.
  speakerType: 'cat' | 'human'
  target: string               // always 'Mamma Cat' for v1
  gameState: {
    chapter: number
    timeOfDay: string          // 'dawn' | 'midday' | 'evening' | 'night'
    trustGlobal: number
    trustWithSpeaker: number
    hunger: number
    thirst: number
    energy: number
    daysSurvived: number
    knownCats: string[]
    recentEvents: string[]     // ['met_tiger', 'witnessed_dumping', 'snatcher_sighting']
  }
  conversationHistory: ConversationEntry[]  // previous exchanges with this speaker
}

interface ConversationEntry {
  timestamp: number            // game time
  speaker: string
  text: string
}

interface DialogueResponse {
  lines: string[]              // array of dialogue lines to display sequentially
  emote?: string               // optional emote to show: '♥', '❗', '💤', etc.
  narration?: string           // optional narration text (Mamma Cat's perception)
  trustChange?: number         // optional trust adjustment
  event?: string               // optional event trigger: 'unlock_territory', 'camille_encounter_3'
}

interface DialogueService {
  getDialogue(request: DialogueRequest): Promise<DialogueResponse>
}
```

### Scripted implementation (Phase 4)

```typescript
class ScriptedDialogueService implements DialogueService {
  private scripts: Record<string, DialogueScript[]>
  
  async getDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    const script = this.scripts[request.speaker]
    // Find the appropriate dialogue based on trust level, conversation count, chapter, etc.
    const match = script.find(s => s.matches(request))
    return match?.response || this.getDefaultResponse(request)
  }
}
```

### Storage for conversation history

Use the browser's IndexedDB to persist conversation history per cat. This data will be consumed by the AI dialogue service in Phase 5.

```typescript
// IndexedDB schema
const DB_NAME = 'ayala_conversations'
const DB_VERSION = 1

interface ConversationRecord {
  id?: number                  // auto-increment
  speaker: string              // cat/human name
  timestamp: number            // game time
  gameDay: number
  lines: string[]              // what was said
  trustBefore: number
  trustAfter: number
  chapter: number
}

// Store conversations after each dialogue interaction
async function storeConversation(record: ConversationRecord): Promise<void> {
  const db = await openDB()
  const tx = db.transaction('conversations', 'readwrite')
  tx.objectStore('conversations').add(record)
}

// Retrieve recent conversations for a specific speaker (for AI context in Phase 5)
async function getRecentConversations(speaker: string, limit: number = 10): Promise<ConversationRecord[]> {
  const db = await openDB()
  const tx = db.transaction('conversations', 'readonly')
  const index = tx.objectStore('conversations').index('speaker')
  const records = await index.getAll(speaker)
  return records.slice(-limit)  // most recent N
}
```

### Refactor existing dialogue

Move ALL existing cat dialogue (Blacky, Tiger, Jayco, etc.) from their NPC classes into the ScriptedDialogueService. Each cat's dialogue should be a data structure, not embedded code:

```typescript
const blackyScript: DialogueScript[] = [
  {
    condition: (req) => req.gameState.trustWithSpeaker === 0,
    response: {
      lines: ['Mrrp. New here, are you?', 'This is Ayala Triangle. The gardens are home to all of us.', 'Find shade. Find food. Stay away from the roads.', 'And at night... stay hidden. Not all humans are kind.'],
      emote: '❓',
      narration: 'This black cat watches you with calm, knowing eyes.',
      trustChange: 10
    }
  },
  {
    condition: (req) => req.gameState.trustWithSpeaker > 0 && req.gameState.trustWithSpeaker < 30,
    response: {
      lines: ['Still here? Good. You\'re tougher than you look.'],
      emote: '♥',
      trustChange: 5
    }
  },
  // ... more stages
]
```

---

## TASK 2: CHAPTERS 4-6

### Chapter 4: The Steps

**Trigger:** Global trust ≥ 80, AND Mamma Cat has visited Zone 6 (The Shops).

**Chapter 4 opening narration:** *"The steps near the glass building. Warm air rises from below. The smell of food. Shelter from the rain. This could be yours."*

**Key events:**

1. **Territory discovery:** When Mamma Cat first enters Zone 6 (The Shops / Pyramid Steps area), trigger a special exploration sequence. Camera pans slowly across the area showing key features: the stepped structure, the Starbucks below, the planters, the sheltered corners.

2. **Territory negotiation:** Jayco and Jayco Junior already live here. Jayco's dialogue shifts:
   - If trust with Jayco ≥ 50: *"You want to stay? ...There's room. The steps are wide enough for all of us."*
   - If trust with Jayco < 50: *"These are MY steps. You'll need to prove you belong here."* (Player must raise trust with Jayco before claiming territory)

3. **Territory claimed:** Once Jayco accepts Mamma Cat (trust ≥ 50 with Jayco, or global trust ≥ 80):
   - Narration: *"For the first time since the car door slammed, you have a place. Your place."*
   - The `poi_safe_sleep` point at The Shops becomes Mamma Cat's primary rest spot
   - Sleeping here fully restores energy and triggers auto-save
   - Mamma Cat's name label changes to show a small ♥ next to "Mamma Cat" (she has a home now)
   - Colony journal updates: "Territory established: The Shops pyramid steps"

4. **Chapter 4 complete** when territory is claimed.

### Chapter 5: Camille

**Trigger:** Global trust ≥ 90, AND territory claimed, AND at least 5 game days survived.

**Chapter 5 is a sequence of 5 encounters** that play out over several game-day cycles. Camille appears at specific times and locations. The encounters cannot be rushed — they happen on a schedule, one per game day.

**Encounter 1: The First Sighting**
- Camille enters from the Paseo de Roxas underpass (where Blacky sits) during evening
- She walks slowly through the gardens toward The Shops area
- She stops to greet Blacky (crouches, offers treats)
- Mamma Cat sees her from a distance. Narration: *"A new human. She moves differently from the others. Slowly. Gently. She smells like... kindness?"*
- Camille walks past Mamma Cat's territory but doesn't approach directly
- Threat indicator: Yellow (unknown)
- No interaction possible — Mamma Cat observes only

**Encounter 2: Recognition**
- Next evening, Camille returns. Same path from underpass.
- This time she notices Mamma Cat on the steps. She stops. Crouches down about 10 tiles away.
- She places a treat on the ground between them. Doesn't move closer.
- Narration: *"She sees you. She's not coming closer. She's... waiting. For you."*
- Player can approach the treat (restores hunger +30) or ignore it
- If approached: Camille stays still. Narration: *"She watches you eat. She doesn't reach for you. She understands."*
- Threat indicator shifts: Yellow → Green

**Encounter 3: The Slow Blink**
- Camille sits on the steps near Mamma Cat's territory. She's brought food.
- Mamma Cat can approach closer this time (within 3 tiles)
- Camille looks at Mamma Cat and blinks slowly. Narration: *"She closes her eyes. Slowly. Opens them again. That means... trust. You've seen other cats do this."*
- Player is prompted: "Slow blink back?" [Yes / Not yet]
- If yes: Both exchange slow blinks. Emote: ♥ on both. Narration: *"Something shifts between you. A thread, invisible but real."*
- Manu appears behind Camille — taller than most humans, carrying a bag. He sits beside her. Green indicator.

**Encounter 4: First Touch**
- Camille is on the steps again. Mamma Cat approaches without prompting (auto-walk to proximity)
- Camille extends her hand, palm down, fingers curled — the correct way to greet a cat
- Narration: *"Her hand smells like fish treats and soap. And something else. Home."*
- Mamma Cat head-bumps Camille's hand. Emote: ♥♥
- Narration: *"You push your head against her fingers. You haven't done this since... before."*
- Kish appears — excited, moves too fast. Mamma Cat flinches. Camille gently restrains Kish.
- Narration: *"The small one is loud. But Camille keeps her still. She understands you."*

**Encounter 5: Chosen**
- Final encounter. Camille arrives with a cat carrier (visible sprite — a box with holes).
- Narration: *"She has a box. You've seen boxes before. Cats go in. They don't come back."*
- Mamma Cat must choose: approach the carrier, or flee.
- If flee: Narration: *"Not today. But she'll come back. She always comes back."* (Encounter 5 repeats next day)
- If approach: Camille opens the carrier door. Places treats inside. Waits.
- Narration: *"This is different. She's not grabbing. She's asking. And you... you want to say yes."*
- Mamma Cat enters the carrier. Screen begins to fade.
- Narration: *"The garden shrinks behind you. The smells change. The sounds change. But the hand on the carrier is warm. And for the first time in a long time... you're not afraid."*
- Chapter 5 complete. Transition to Chapter 6.

### Chapter 6: Home

**Trigger:** Immediately follows Chapter 5, Encounter 5 completion.

**Sequence:**
1. Black screen. Silence.
2. Narration: *"A door opens. A room. Soft floor. A bed — a real bed, with a blanket."*
3. Narration: *"A bowl of water. Fresh. A plate of food. Just for you."*
4. Narration: *"Camille sits on the floor beside you. She doesn't grab. She just... sits."*
5. Narration: *"And you climb into her lap. And you close your eyes. And the purring starts before you even decide to purr."*
6. Brief pause. Then:
7. Narration: *"You are Mamma Cat. You were lost. Now you are found."*
8. Narration: *"You are home."*
9. Fade to epilogue.

---

## TASK 3: CAMILLE, MANU & KISH NPCs

### Camille
- **Sprite:** Human sprite, 5ft proportional (scale relative to other humans). Pink cap, dark hair, casual clothes — based on the real photo reference.
- **Behavior:** Enters from the Paseo de Roxas underpass. Walks the path through the gardens toward The Shops area. Moves slowly, deliberately — she's here for the cats, not exercise.
- **Schedule:** Appears during evening phase only. Not every day — 60% chance of appearing on any given evening after Chapter 5 triggers.
- **Threat indicator:** Yellow initially, shifts to Green after Encounter 2.
- **Path:** Underpass → garden paths → The Shops steps area. Stops to interact with cats along the way (crouches near Blacky, pauses near other cats).

### Manu
- **Sprite:** Human sprite, noticeably taller (6ft — `setScale(1.2)` relative to other humans).
- **Behavior:** Accompanies Camille from Encounter 3 onwards. Walks beside or slightly behind her.
- **Threat indicator:** Green (carries food, friendly to cats)
- **Interaction:** No direct dialogue. Mamma Cat can observe him: *"The tall one carries food too. He moves carefully, like her."*

### Kish
- **Sprite:** Human sprite, shorter (child-sized — `setScale(0.85)`).
- **Behavior:** Appears in Encounters 4 and 5 only. More animated than Camille — moves faster, changes direction.
- **Threat indicator:** Yellow (unpredictable — she's enthusiastic but startling)
- **Interaction:** *"The small one is excited. Too excited. But she means well."*

---

## TASK 4: SNATCHERS

The most threatening entities in the game. Dark-clad humans who appear only at night and take cats.

### Behavior
- **Appearance:** Dark sprite (use guard.png heavily tinted to near-black, or a simple dark silhouette). No name — always "???" even after multiple sightings.
- **Schedule:** Night phase only (10pm-6am). 1-2 snatchers per night, not every night (40% chance per night).
- **Movement:** Slow, deliberate — walking speed ~40px/s. They patrol garden paths, pausing near known cat sleeping spots.
- **Detection:** Snatchers have a detection radius of ~128px. If Mamma Cat is within this radius AND not hidden (crouching near cover), the snatcher turns toward her and begins approaching at 60px/s.
- **Threat indicator:** Red skull (☠). Always. No yellow phase — by the time you see them, the indicator is red.
- **Warning:** When a snatcher spawns, a subtle audio cue plays (low rumble) and the screen edges darken slightly. This gives the player a chance to find shelter before the snatcher is in range.

### Capture mechanic
- If a snatcher reaches Mamma Cat (within 16px): screen goes black instantly
- Narration: *"Hands. Darkness. You can't move. You can't breathe."*
- 2-second pause
- Narration: *"..."*
- Game reloads from last save point
- After reload, narration: *"You wake up gasping. A nightmare? No. A warning. Stay hidden at night."*

### Evasion
- **Crouching near cover** reduces Mamma Cat's detection radius by 75%. A snatcher can walk right past a cat hidden under a bush.
- **Running** is effective but noisy — it increases detection radius temporarily. Running should be a last resort.
- **Safe sleeping spots** are invisible to snatchers. If Mamma Cat is resting at a designated safe spot, snatchers cannot detect her.
- **Other cats** also react to snatchers — NPC cats flee when a snatcher is within 160px. This can serve as an early warning: if cats around you suddenly scatter, something is wrong.

### Impact on colony
- Once per 3-5 game days, a background colony cat disappears (removed from the map). The colony journal updates: *"[Cat description] — Not seen since Day [X]"*
- Named cats are NOT taken by snatchers in v1 (story-essential), but they may reference disappearances: *"Did you see the grey one by the fountain? She's gone. Taken in the night."*

---

## TASK 5: COLONY DYNAMICS

### Dumping events (2-3 per playthrough)

Scripted scenes triggered at specific chapter/trust thresholds:

**Event 1: The Cruel Dump (triggers during Chapter 2-3)**
- Night time. Near the Makati Ave road edge.
- A car sprite appears on the road. Stops briefly.
- A cat sprite is pushed out. The car drives away immediately.
- The dumped cat freezes on the sidewalk for 5 seconds, then slowly walks into the garden edge.
- Mamma Cat observes from a distance. Narration: *"A car. A door. A cat. You remember."*
- The new cat becomes a background colony cat (wary disposition, spawns near starting zone).

**Event 2: The Reluctant Goodbye (triggers during Chapter 3-4)**
- Evening. Same road edge.
- A car stops. A human gets out, holding a cat. They kneel. They pet the cat.
- They place the cat on the sidewalk. The human stays. Looks back. Walks to the car slowly.
- The cat sits and watches the car leave. Doesn't move.
- Narration: *"This one wasn't thrown away. This one was... left. With love, and grief, and no choice."*
- Narration: *"You sit beside her. You don't speak. There's nothing to say."*
- The dumped cat eventually moves into the gardens (next dawn).

**Event 3: The Confused Carrier (triggers during Chapter 4-5)**
- Morning. Near the park entrance.
- A cat carrier appears on the sidewalk. No human visible.
- Meowing sounds from inside. NPC cats gather nearby, curious.
- Eventually a volunteer human approaches, opens the carrier. A cat emerges, disoriented.
- Narration: *"Another one. How many of us started this way?"*

### Population flux
- Background colony cats can appear or disappear between chapters
- Colony count displayed in journal fluctuates: ~42 → ~44 (after dump) → ~40 (after snatch + wandered off) → ~43 (after kittens born)
- This is cosmetic in v1 — it doesn't affect gameplay mechanically, but it makes the colony feel alive

---

## TASK 6: TERRITORY MECHANIC

### Claiming The Shops / Pyramid Steps

The territory system is simple for v1:

```typescript
interface Territory {
  name: string
  zone: string           // 'zone_6_shops'
  claimed: boolean
  claimedOnDay: number
  benefits: string[]     // ['safe_sleep', 'food_proximity', 'shelter']
}
```

### How it works
- Before claiming: Mamma Cat can visit Zone 6 but gets wary reactions from resident cats
- After Chapter 4 triggers (trust ≥ 80, visited Zone 6): territory negotiation with Jayco begins
- After Jayco accepts: territory is claimed
- **Benefits of territory:**
  - Safe sleeping spot (full energy restore, auto-save)
  - Proximity to Starbucks food scraps (food source nearby)
  - Sheltered rest areas (faster energy restore)
  - Home base feeling — Mamma Cat's sprite shows a subtle ♥ indicator when in her territory
  - Fast travel option: when in territory, rest/sleep advances time to next dawn or evening (skip the waiting)

---

## TASK 7: EPILOGUE & END SCREEN

### Epilogue sequence (after Chapter 6)

1. Fade from black to a still scene: a simple illustrated view of a room with a cat bed, food bowl, and a window showing the Makati skyline at sunset.
2. Text overlay, slow reveal:
   - *"Mamma Cat found her home."*
   - *"But 40 million stray cats in Southeast Asia are still waiting."*
   - *"In the Philippines alone, millions of cats live on the streets."*
   - *"Organizations like CARA Welfare Philippines cared for the ATG cats for 15 years."*
   - *"Community volunteers continue that work today."*
3. A gentle call to action:
   - *"What can you do?"*
   - *"Adopt, don't shop."*
   - *"Support local TNR (Trap-Neuter-Return) programs."*
   - *"Feed a stray. Leave water out."*
   - *"Or just stop. And see them."*
4. Links (clickable):
   - CARA Welfare Philippines
   - @atgcats on Instagram
   - Local shelter finder
5. Final text: *"For Mamma Cat, and all the cats still waiting."*
6. Return to title screen. Save file is marked as "completed" — player can start New Game+ or revisit the garden.

### Credits
- Developer credits (Manu, Claude)
- "For Camille"
- Asset credits (LPC tilesets, sprite artists — list all sources)
- "Based on the real cat colony at Ayala Triangle Gardens, Makati, Manila"

---

## TASK 8: NEW GAME PLUS (stretch goal)

After completing the game, offer the option to replay the garden as Mamma Cat with full trust, all cats known, territory established. The player can explore freely, interact with all cats, and experience the colony without survival pressure. This is "cozy mode" — the version where Mamma Cat is content and safe, exploring her home.

---

## IMPORTANT NOTES

- **The Camille encounters are the emotional climax of the game.** Take time with them. The pacing should be slow, deliberate, gentle. Each encounter should feel like a small miracle — a scared cat choosing to trust one more time.
- **The snatcher mechanic should be genuinely tense.** Night should feel dangerous. The player should feel relief when dawn comes. But it should never feel unfair — always give the player a warning and a way to hide.
- **The dumping events should hit hard.** The player has been through this themselves in Chapter 1. Watching it happen to another cat should trigger recognition and empathy.
- **The epilogue should be quiet, not preachy.** The facts speak for themselves. The player has just lived the experience — they don't need a lecture. The call to action should feel like an invitation, not a guilt trip.
- **The dialogue service interface is critical infrastructure.** Even though it's scripted in Phase 4, building it properly now means Phase 5's AI integration is a service swap, not a rewrite.
- **All dialogue should flow through the DialogueService.** No hardcoded strings in NPC classes.
- **Commit after each task.** Test in browser after each change.
- **Do NOT modify** anything in `docs/`.
- The character name is always **Mamma Cat** in player-visible text.

---

## DEFINITION OF DONE

Phase 4 is complete when:

- [ ] All dialogue flows through the DialogueService interface
- [ ] Conversation history is stored in IndexedDB
- [ ] Chapter 4 plays: territory discovery, negotiation with Jayco, territory claimed
- [ ] Chapter 5 plays: all 5 Camille encounters in sequence over multiple game days
- [ ] Chapter 6 plays: the adoption sequence with narration
- [ ] Camille, Manu, and Kish appear as NPCs with correct behaviors and schedules
- [ ] Snatchers appear at night with detection, evasion, and capture mechanics
- [ ] Crouching near cover effectively hides from snatchers
- [ ] Capture resets to last save with narration
- [ ] 2-3 dumping events trigger at appropriate story points
- [ ] Background colony population fluctuates (cats appear/disappear)
- [ ] Colony journal reflects population changes
- [ ] Epilogue and end screen display after Chapter 6
- [ ] End screen includes welfare information and links
- [ ] Territory at The Shops provides gameplay benefits (safe sleep, food proximity)
- [ ] The game is completable from start to finish — a player can experience the full story
- [ ] The game still builds to static files and runs offline
