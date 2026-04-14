# AYALA — Game Design Document v0.1

**A 2D browser-based adventure game about a homeless cat finding love in the heart of Manila**

_Draft: April 2026_
_Developers: Manu & Claude (AI co-developer)_
_For: Camille — and every cat who needs a forever home_

---

## 1. CONCEPT & VISION

### 1.1 Elevator Pitch

Ayala is a cozy-but-real 2D top-down adventure game set in the Ayala Triangle Gardens in Makati, Manila. You play as Mamma Cat, a black-and-white former pet dumped in the gardens by her owners. You must survive the colony of 40-50 homeless cats, find food and water, establish territory, and ultimately find and befriend your human, Camille — who will adopt you and take you home.

### 1.2 Emotional Core

This is a universal tale of loss, abandonment, and hope. Every cat in the colony is innocent — former pets or kittens born homeless. None are villains. The game is educational without being overt: by the time the player finishes, they should feel moved to think about what they can do for stray animals in the real world. The call to action is baked into the experience of playing, not delivered as a lecture.

### 1.3 Tone & Arc

The game starts with vulnerability and stress. Mamma Cat is alone, scared, and doesn't understand the colony dynamics. As she establishes territory and friendships, tension eases — but she is never truly "content" or "cozy" until she finds her human and is adopted. The emotional curve mirrors a real stray cat's experience.

### 1.4 Target Audience

- **Primary:** Camille (the developer's partner) playing on iPad/iPhone
- **Secondary:** Cat lovers, animal welfare supporters, casual gamers
- **Age:** All ages, family-friendly
- **Platform:** Browser-based (Chrome), playable offline. iPad landscape is the ideal form factor.

---

## 2. THE REAL WORLD: AYALA TRIANGLE GARDENS

### 2.1 Location Overview

Ayala Triangle Gardens (ATG) is a 2-hectare landscaped urban park in the Makati Central Business District, Metro Manila, Philippines. It is bounded by three roads forming a triangle:

- **Ayala Avenue** — southwest edge
- **Paseo de Roxas** — north/northeast edge
- **Makati Avenue** — east/southeast edge

The park was formerly the site of Nielson Field, Manila's pre-WWII airport. The runways became roads. The park opened to the public in November 2009 and features over 100 trees (rain trees, golden palms, fire trees, kamuning), winding walkways, public art, fountains, and is surrounded by office towers, restaurants, and malls.

Operating hours: 6:00 AM – 10:00 PM daily.

### 2.2 The Cat Colony

ATG is home to an established colony of approximately 40-50 stray cats. These cats are collectively cared for by the community — volunteer feeders, the @atgcats Instagram community, and (historically) CARA Welfare Philippines, which ran cat welfare programs in the area for 15 years before financial constraints forced them to stop at end of 2024. New volunteers have since stepped in to fill the gap.

The cats are mostly former pets (dumped) or kittens born in the gardens. They are generally clean, healthy, and socialised to humans — comfortable approaching people, especially those with food. Dedicated feeding stations exist, and cats gather at specific hotspots throughout the park.

There is also a dark side: mysterious individuals (typically appearing at night, dark-clad, faces covered) who snatch unwary cats. These cats are never seen again. This is a real and documented threat.

### 2.3 Key Landmarks (for Game Map)

**Starting Zone — Makati Avenue / Sto. Tomas Corner**
Where Mamma Cat is dumped. Busy sidewalk, traffic, pedestrian crossings. The Ayala Triangle Walkways entrance is here. Adjacent to the stepped/terraced facade of The Shops building.

**The Shops / Pyramid Steps (Mamma Cat's eventual home territory)**
The northeast corner at the Makati Ave / Paseo de Roxas intersection. A large pyramid-shaped structure with stepped stairs on either side leading down to an underground mall containing a Starbucks, a supermarket, and restaurants. This is Mamma Cat's designated safe space and final territory. Cats sleep on and around these steps.

**The Starbucks (at The Shops)**
Below the pyramid steps. Outdoor seating, glass facade. A real white cat sleeps curled up in front of the entrance. This becomes a key location in Mamma Cat's territory.

**Ayala Triangle Gardens Tower 1 & Tower 2**
The twin office towers flanking The Shops. A helipad sits on the roof/podium area (visible from above as a circular feature). Not accessible to cats but forms a visual landmark.

**Central Gardens (the deep green heart)**
Dense tree canopy of massive rain trees and acacias. Winding walkways labeled "Ayala Triangle Walkways." Manicured lawns, ornamental shrub beds, decorative boulders, tropical foliage (snake plants, golden palms, orange jasmine hedges). Public art installations scattered throughout. Benches, picnic areas. This is the core cat territory — prime hunting, sleeping, and socializing ground.

**Tower One & Exchange Plaza**
Southwest edge along Ayala Avenue. A dramatic sweeping concrete canopy over a large stone-paved plaza. A Starbucks at the mezzanine level. The fountain nearby provides drinking water for cats.

**Paseo de Roxas Underpass (Western entrance)**
An underpass leading under Paseo de Roxas into the gardens from the western/Salcedo Village side. An escalator brings people up into the park. Blacky (an NPC cat) always sits at the top of this escalator. This is Camille's entry point into the park.

**Blackbird / Nielson Tower**
The historic former airport control tower, now a fine dining restaurant called Blackbird, located in the southeast portion of the triangle, surrounded by trees. This area is not public space and volunteer feeders do not enter. Cats can hide in the trees and bushes but are largely out of sight apart from the Blackbird guards who may or may not be friendly.

**Children's Playground**
Northwest edge of the triangle. Playground sculptures are unique and visually incredible — a giant geometric/origami-style carabao (water buffalo, the Philippines' national animal!) and a hornbill bird, both serving as climbing structures for kids. The colorful rubberized ground with those swirling blue and green patterns, the exercise equipment nearby, the trees framing everything. It's a daytime zone full of children and families and old people exercising in the mornings and early evenings. The carabao and hornbill would make distinctive pixel art landmarks that players would recognize instantly.

**Manam at the Triangle**
A Filipino restaurant on the southeast edge. Outdoor dining area with white umbrellas. A potential food source area for cats.

**The Grassy Areas**
Open lawns between the walkways. Popular with joggers, picnickers, families, and dog walkers. Dogs are welcome in ATG and generally stick to these grassy areas and pathways.

---

## 3. CHARACTERS

### 3.1 Mamma Cat — The Player Character

- **Appearance:** Black and white spotted cat (based on a real ATG cat). Distinctive markings that Camille can recognise.
- **Backstory:** A former pet, dumped on the Makati Ave sidewalk from a car by unseen owners. She retains some trust in humans but is confused and frightened.
- **Personality:** Cautious but curious. Resilient. Capable of deep affection once trust is built.
- **Arc:** From terrified newcomer → navigating colony politics → establishing territory → finding Camille → adoption.

### 3.2 Named NPC Cats (v1 cast — 8 core NPCs + additional)

All cats are based on real ATG cats. None are villains.

1. **Blacky** — A black cat who sits at the top of the Paseo de Roxas underpass escalator. A gatekeeper figure. Calm, wise, knows the lay of the land. One of the first friendly NPCs Mamma Cat can encounter. Camille's first friend in the park.

2. **Tiger** — (Details TBD with developer — likely tabby/striped pattern, personality to be defined)

3. **Jayco** — (Details TBD — established colony member)

4. **Jayco Junior** — Jayco's kitten. Young, playful, vulnerable. Could serve as a character Mamma Cat feels protective toward.

5. **Fluffy Cat** — A longer-haired cat, distinctive in the colony. (Personality TBD)

6. **Pedigree Cat** — A cat that is clearly a former pet of a recognizable breed — not a typical Filipino puspin (short for "pusang pinoy" / street cat). This cat's appearance drives home the "dumped pet" theme. Has a companion. (Breed/personality TBD)

7. **Ginger Twin 1** — One of two orange/ginger cats. (Name TBD)

8. **Ginger Twin 2** — The other ginger twin. (Name TBD)

**Additional named cats (details TBD):**

- **Pedigree Cat's Companion** — Always found near Pedigree Cat. (Appearance/personality TBD)
- **Mamma Cat's Friend 1** — One of two cats who become Mamma Cat's close allies in the colony. (Details TBD)
- **Mamma Cat's Friend 2** — The other close ally. (Details TBD)

### 3.3 Background Colony Cats

An additional 30-40 unnamed cats populate the garden zones. They have basic behaviors (sleeping, grooming, eating, wandering) and can be interacted with at a basic level. Some are friendly, some are wary, some are territorial. Their attitudes toward Mamma Cat change as she gains experience and reputation.

### 3.4 Human NPCs

Humans are not directly controllable or deeply interactive in v1. They are environmental elements that Mamma Cat must read and respond to.

**Friendly Humans:**

- **Camille** — Mamma Cat's eventual adopter. 5ft. Enters from the Paseo de Roxas underpass. Visits regularly. Encounters Mamma Cat at the pyramid steps/Starbucks area. The relationship builds over multiple fixed encounters that feel organic — Mamma Cat encounters many humans, but Camille is special and Mamma Cat will come to see her as her "hooman."
- **Manu** — Camille's partner. 6ft — noticeably taller than most ATG humans. Often accompanies Camille. Friendly to cats, carries food.
- **Kish** — Camille's 12-year-old niece. 5ft. Sometimes visits with Camille. Enthusiastic about cats but needs to learn to be gentle/patient.
- **Volunteer Feeders** — Appear at specific times/locations. Carry food bags. Cats gather around them. Green threat indicator.
- **Vet Volunteers** — Occasionally take sick cats away but bring them back after treatment. Initially indistinguishable from snatchers to Mamma Cat (a source of early-game tension).
- **Adoption Volunteers** — Take cats to forever homes. Positive outcome but cats disappear.

**Neutral Humans:**

- **Joggers** — Move along pathways at speed. Unpredictable. Can startle cats.
- **Office Workers** — Lunch crowds, especially midday. Potential food-dropping sources.
- **Families with Children** — Weekend visitors. Sometimes kind, sometimes grabby/rough.
- **Dog Walkers** — See Dogs section below. Yellow indicator.
- **Guards** — Park security. Most are neutral. Some are unfriendly to cats.

**Threatening Humans:**

- **The Snatchers** — Dark-clad, faces covered, appear only at night. They move through the park looking for unwary cats. If they catch Mamma Cat, the player is reset to their last save point. Deep red / skull threat indicator. The real nightmare.
- **Hostile Individuals** — Rare humans who kick at cats, throw things. Orange/red indicator.

### 3.5 Dogs

Dogs are welcome in ATG and mostly walk on leads with their owners on the grassy areas and main pathways. They are NOT villains. They are peripheral characters that cats need to be aware of and generally keep a safe distance from. Most are harmless but some are excitable or aggressive. From a cat's perspective, dogs are large, loud, and unpredictable — even friendly ones can be terrifying.

---

## 4. GAMEPLAY MECHANICS

### 4.1 Core Loop

Explore → Find food/water → Build relationships → Avoid threats → Establish territory → Progress story

### 4.2 Day/Night Cycle

The Manila heat creates natural rhythms:

- **Dawn (6:00–9:00 AM):** Active period. Cats come out. Joggers, dog walkers, early office workers. Good foraging time. Moderate threat.
- **Midday (10:00 AM–5:00 PM):** Survival mode. Extreme heat. Cats hide in shade. Only emerge if very hungry. Humans mostly gone (lunch rush 12-1pm is an exception — food opportunity). Low threat but high heat stress.
- **Evening (6:00–10:00 PM):** Social peak. Feeders arrive. Cats gather for meals. Camille visits. Restaurants active (food scraps). Moderate-to-high threat as snatchers may appear after dark.
- **Night (10:00 PM–6:00 AM):** Park officially closed. Quiet. Dangerous. Snatchers most active. Cats who are exposed and alone are at risk. Mamma Cat should be in a safe sleeping spot.

### 4.3 Cat Stats (simplified for v1)

- **Hunger** — Decreases over time. Mamma Cat must find food regularly. Sources: feeding stations, volunteer feeders, restaurant scraps, supermarket area near The Shops, hunting (bugs, lizards).
- **Thirst** — Decreases over time. Sources: fountains, rain puddles, water bowls left by feeders.
- **Energy/Rest** — Depletes with activity, especially in heat. Mamma Cat must find safe sleeping spots to rest. Shade is essential during midday.
- **Trust/Reputation** — A points-based measure of how the colony perceives Mamma Cat. Starts at zero. Builds through positive interactions with named cats (sharing food, helping, spending time). Affects which areas Mamma Cat can access and which cats will share food/space. Specific point thresholds unlock new story chapters and territory access.

### 4.4 Territory System

Mamma Cat starts with no territory. Establishing territory is a key progression goal.

- Territory is claimed by spending time in an area, scent-marking, and not being chased off by other cats.
- Some areas are already claimed by established cats. Mamma Cat must either earn permission, find unclaimed spots, or (later in the game) be ceded space by friendly NPCs.
- Mamma Cat's designated safe space is the Starbucks pyramid steps area. This becomes her territory through the story progression — it's not available immediately.

### 4.5 Cat Communication System

Cats are amazingly social creatures who communicate primarily through body language. The game represents this through visible sprite animations and dialogue-style indicators.

**Core Body Language Animations (v1 priorities):**

1. **Tail Up** — Friendly greeting. The universal "I come in peace" signal. MUST HAVE for v1. When Mamma Cat approaches a friendly cat, both cats raise their tails.

2. **Crouching, Ears Flat** — Frightened / submissive. Mamma Cat's default early in the game when encountering established colony members. Also triggered by dogs, loud humans, snatchers.

3. **Switching/Flicking Tail** — Alert, agitated, ready to flee or fight. Indicates tension. Other cats display this when Mamma Cat enters their territory uninvited.

4. **Slow Blink** — Trust signal. The cat equivalent of "I love you." Used in relationship-building interactions. Could be a key mechanic for building trust with Camille.

5. **Arched Back / Puffed Fur** — Defensive threat display. Rare — used in confrontations.

6. **Head Bump / Rubbing** — Affection and scent-marking. Used between friendly cats and between Mamma Cat and Camille once trust is high enough.

**Dialogue System:**

Cats don't speak human language, but the game can convey meaning through:

- Body language animations (above)
- Thought bubbles with simple icons (fish = hungry, zzz = tired, heart = friendly, skull = danger, question mark = curious)
- Short "cat-speak" text in dialogue boxes that conveys tone/intent (e.g., _"Mrrp?"_ for a friendly inquiry, _"HSSSS!"_ for a warning, _"Prrrrr..."_ for contentment)
- Contextual narration (text describing what Mamma Cat perceives: "This cat's tail is low and twitching. She doesn't want you here.")

### 4.6 Threat/Friend Indicator System

A floating indicator above humans, cats, and dogs that conveys their disposition toward Mamma Cat. This represents Mamma Cat's ability to read body language, scent/pheromones, and intent.

- **Green (heart)** — Friendly/known. Feeders, Camille (eventually), friendly cats.
- **Yellow (dash)** — Neutral/unknown. Most humans, unfamiliar cats. Unpredictable.
- **Orange (exclamation)** — Cautious. Territorial cats, some guards, excitable dogs.
- **Red (skull)** — Dangerous. Snatchers, hostile humans. Flee immediately.

Known entities display their name above the indicator once Mamma Cat has learned who they are. Unknown entities show "???" until identified through interaction or observation.

### 4.7 Food & Survival

Food sources (in order of reliability):

1. **Volunteer feeding stations** — Appear at set times (morning and evening). Reliable but competitive — other cats are there too.
2. **Feeder NPCs** — Volunteers with kibble bags who walk routes through the park.
3. **Restaurant/cafe areas** — Scraps near Manam, Starbucks, other dining spots. Risky (guards, dogs).
4. **The Shops supermarket area** — Near Mamma Cat's eventual territory. Occasional scraps.
5. **Hunting** — Bugs, lizards. Low reward but always available.
6. **Kind strangers** — Random humans who offer food. Unpredictable.

Water sources:

1. **Fountain near Exchange Plaza** — Reliable.
2. **Water bowls left by feeders** — At feeding stations.
3. **Rain puddles** — Seasonal/weather-dependent.

---

## 5. STORY PROGRESSION

### 5.1 Chapter Structure (v1)

**Chapter 1: Dumped (Tutorial)**
Mamma Cat is abandoned on Makati Ave at night. The player learns basic movement, the threat indicator system, and the need to find shelter. Mamma Cat must navigate off the busy sidewalk and into the garden edges. First encounter with a colony cat (wary/hostile reaction). Mamma Cat finds a temporary hiding spot for the night.

**Chapter 2: Newcomer**
Mamma Cat begins exploring the gardens during the safer dawn/evening periods. She encounters several named NPCs. Some are wary, some are curious, one or two may be friendly. Mamma Cat learns about food sources, water, and the daily rhythm. She starts to understand colony dynamics — who owns what territory, where the feeding stations are.

**Chapter 3: Finding Her Place**
Mamma Cat has survived the initial days. She's made a few allies (perhaps Blacky, who is wise and helpful). She's learned to avoid threats. She begins ranging further through the gardens. A conflict or challenge — perhaps a confrontation with a territorial cat, or a close call with a snatcher — raises the stakes.

**Chapter 4: The Steps**
Mamma Cat discovers the pyramid steps / Starbucks area and recognises it as a good territory — warm, close to food, sheltered sleeping spots. She begins establishing herself there, with or without the cooperation of cats already in the area. This may involve building trust with local cats.

**Chapter 5: Camille**
Camille appears. Mamma Cat observes her from a distance at first. Camille is kind to the cats, brings treats, sits quietly. Mamma Cat is drawn to her but cautious (she was betrayed by her previous owners). Over several encounters, Mamma Cat approaches closer. The slow blink. The first touch. The first time Camille offers food and Mamma Cat eats from her hand.

**Chapter 6: Home**
Camille decides to adopt Mamma Cat. The final sequence. Mamma Cat leaves the gardens — not abandoned this time, but chosen. A bittersweet ending: joy for Mamma Cat, but the other cats remain. A quiet moment acknowledging all the cats still waiting for their forever homes.

**Epilogue / End Screen:**
Information about real cat welfare. Links to organizations (CARA, local shelters). A gentle prompt: "There are millions of cats like Mamma Cat. What can you do?"

### 5.2 Colony Dynamics — A Living Population

The colony is not static. Throughout the game, cats arrive and leave, and the population fluctuates — just as it does in real life.

**Cats arriving:**

- **Dumped by owners** — 2-3 scripted "dumping events" occur during a playthrough. MC observes from a distance as a car pulls up on Makati Ave and a cat is placed on the sidewalk. She cannot intervene. Each event is different:
  - _The cruel dump:_ Owner opens the car door, pushes the cat out, drives away immediately. The cat freezes in terror.
  - _The reluctant goodbye:_ Owner kneels, pets the cat, lingers. They are clearly upset — maybe they are moving overseas, maybe they lost their job, maybe their landlord won't allow pets. They leave slowly, looking back. The cat sits and waits for them to return.
  - _The confused arrival:_ A cat is left in a carrier near the park entrance. By the time anyone notices, the owner is gone. The cat meows inside the carrier until someone opens it.
- **Kittens born** — Colony cats occasionally have kittens, adding to the population.
- These events mirror MC's own Chapter 1 experience. Early in the game, MC identifies with the terror. Later, as she is more established, she may feel protective — or helpless.

**Cats leaving:**

- **Snatched** — Cats disappear after being taken by snatchers at night. Their absence is noticed — an empty sleeping spot, a name in the colony journal marked "not seen since..."
- **Adopted** — Volunteers occasionally take cats to forever homes. A positive departure, but still a loss for the colony.
- **Wandered off** — Some cats cross the roads (dangerous) or leave via the underpass, seeking other territory. They simply stop appearing.
- **Taken for vet care** — Temporarily absent, then return (distinguishable from snatching only after the cat comes back).

**Effect on gameplay:**

- The colony journal reflects these changes dynamically
- Background colony cats (unnamed) may appear or disappear between game chapters
- Named NPCs are protected from random departure in v1 (they are essential to the story), but their dialogue may reference cats who have left
- The overall effect is that ATG feels alive — it's not a museum, it's an ecosystem with real churn and real stakes

### 5.3 Side Content (v1 stretch goals)

- Individual storylines for named NPC cats (learning their backstories through repeated interaction)
- A "colony journal" that fills in as MC meets and befriends cats
- Environmental storytelling (finding discarded collars, old feeding bowls, signs of cats who were snatched)
- The Festival of Lights Christmas event (a special visual sequence)
- Car-Free Sunday mornings (Paseo de Roxas, Ayala Ave and Makati Ave are closed to cars leading to a different gameplay experience on Sundays with more people and activities, no traffic)

---

## 6. GAME MAP

### 6.1 Map Zones

The game world is divided into interconnected zones that correspond to real areas of ATG. In RPG JS terms, these could be individual maps stitched together via the World system, or a single large map with distinct regions.

**Zone 1: Makati Ave Edge (Starting Zone)**

- Busy sidewalk, cars, pedestrian crossings
- The Sto. Tomas corner where Mamma Cat is dumped
- The entrance to the Ayala Triangle Walkways
- The stepped/terraced facade of The Shops building (exterior, upper level)
- High threat from traffic, noise, disorientation

**Zone 2: Southeast Walkways & Blackbird Area**

- Tree-lined paths leading into the gardens from Makati Ave
- The historic Nielson Tower / Blackbird restaurant
- Moderate tree cover, decorative plantings
- Some colony cats, transitional territory

**Zone 3: Central Gardens**

- The deep green heart of the park
- Massive rain tree canopy, winding walkways
- Ornamental shrub beds, decorative boulders
- Public art installations, benches, picnic areas
- Open lawn areas (dog zone)
- Largest concentration of colony cats
- Multiple sub-areas with different cat "cliques"

**Zone 4: The Fountain & Exchange Plaza**

- Tower One & Exchange Plaza with dramatic concrete canopy
- The fountain (water source for cats)
- Large stone-paved plaza (exposed, open)
- Starbucks at Tower One mezzanine
- Office worker lunch crowds (food opportunity, midday only)

**Zone 5: Paseo de Roxas Edge & Underpass**

- The northern boundary of the gardens along Paseo de Roxas
- The underpass with escalator (Camille's entry point)
- Blacky's territory (top of the escalator)
- Street-level views of traffic and buildings across Paseo de Roxas

**Zone 6: The Shops / Pyramid Steps (Mamma Cat's Home Territory)**

- The pyramid-shaped stepped structure
- Stairs on either side leading down to underground level
- Starbucks (The Shops location)
- Underground mall area (supermarket, restaurants)
- Mamma Cat's designated safe space — becomes available as territory in Chapter 4
- Glass railings, stone tiles, planters

**Zone 7: Northwest Playground Area**

- A beautiful children's playground surrounded by trees
- Large geometric/origami-style sculptures: a carabao (water buffalo) and a hornbill bird, both functioning as climbing structures
- Colorful rubberised ground with swirling blue and green patterns
- Exercise equipment nearby
- Popular with families and children during daytime — a lively, noisy zone
- Potential food source (families with snacks) but also a dog-heavy, unpredictable area for cats
- The Ninoy Aquino Monument is nearby at the northwest apex

### 6.2 Map Scale & Style

- Top-down 2D tilemap (16x16 or 32x32 pixel tiles)
- Created with Tiled Map Editor
- Multiple layers: ground (stone, grass, dirt), objects (trees, benches, art), collision (buildings, walls, hedges), overhead (tree canopy, building overhangs)
- The overall map should feel like a real place — recognizable to anyone who has been to ATG
- Buildings are simplified but identifiable by shape and position
- The surrounding roads are visible but act as impassable boundaries (cats don't cross busy Manila roads)

---

## 7. ART & AUDIO

### 7.1 Visual Style

- Pixel art, top-down perspective
- Warm tropical palette: lush greens, warm greys for stone, deep browns for tree trunks, pops of color from flowers and art installations
- Distinct visual identity for day vs. night (warm golden light vs. cool blue/purple with warm lamp pools)
- Midday should feel oppressively bright with harsh shadows
- Character sprites need enough detail to distinguish cat colors/patterns (Mamma Cat's black and white spots must be recognizable)

### 7.2 Cat Sprites Needed

For each named cat, we need at minimum:

- Idle (sitting, standing)
- Walking (4 directions)
- Sleeping (curled up)
- Eating
- Key body language poses: tail up, ears flat/crouching, tail switching, slow blink, arched back, head bump

For background colony cats, a smaller set of animations with color variations.

### 7.3 Art Sources (v1 — free/existing assets only)

- **Cat sprites:** Free pixel art from itch.io (Elthen's 2D Pixel Art Cat Sprites, Cat Pack series, Cat 16x16 with 33+ animations) and OpenGameArt.org collections. Modify with color palette swaps for Mamma Cat's distinctive black-and-white markings and named cat appearances.
- **Environment tilesets:** Free urban/park tilesets from OpenGameArt.org and itch.io. Minimal custom tiles — only for ATG-specific elements that cannot be approximated.
- **Custom tiles needed (minimal):** The carabao playground sculpture, the hornbill playground sculpture, the fountain(s), and possibly the Starbucks facade and pyramid steps.
- **Human/dog sprites:** Free sprite packs with color/height modifications.

### 7.4 Audio (v1 — sourced from free libraries)

- Ambient city/park sounds (distant traffic, birds, rustling leaves) — sourced from free sound libraries (Freesound.org, OpenGameArt)
- Cat sounds (meows, purrs, hisses) — sourced from free sound libraries
- Simple background music — sourced ambient tracks (gentle, tropical — different tracks for day/night)
- Sound effects for key moments (eating, drinking, threat alert) — sourced

---

## 8. TECHNICAL ARCHITECTURE

### 8.1 Framework

**Phaser 3** — A mature, widely-used open-source HTML5 game framework for 2D games.

Key technologies:

- TypeScript 5
- Phaser 3.90+ (Canvas/WebGL rendering via Phaser's built-in renderer)
- ViteJS (compilation, hot-reload, production bundling)
- Tiled Map Editor (map creation, exported as JSON)

Note: The project originally used RPG JS v4 but switched to Phaser 3 during Phase 1 due to build issues with RPG JS's standalone mode (TSX tileset files conflicted with Vite's JSX compiler). Phaser 3 provides a simpler, purely client-side architecture with no server/client separation.

### 8.2 Build Mode

**Static single-player build**

- Built with `npm run build` (Vite production build)
- Produces static files in `dist/`
- Deployable to any static host (Netlify, Vercel, GitHub Pages) or playable locally
- No server required — everything runs in the browser

### 8.3 Offline / PWA

- Offline play achievable by adding a service worker to cache game assets
- Can be configured as a PWA so Camille can "install" the game to her iPad/iPhone home screen
- Service worker implementation planned for Phase 5 (polish)

### 8.4 Mobile / Responsive

- Phaser 3 Scale Manager handles responsive sizing (`Phaser.Scale.FIT` + `CENTER_BOTH`)
- Touch input supported natively by Phaser
- Virtual d-pad overlay for mobile controls (to be implemented — Phase 2 or later)
- iPad landscape is the target mobile experience
- iPhone landscape is secondary (smaller screen, same controls)
- Desktop/keyboard is the development target

### 8.5 Save System

- Game state serialised to JSON
- Saved to `localStorage` in the browser
- Auto-save at key story moments
- Manual save via interaction (e.g., sleeping in Mamma Cat's safe spot)
- Phaser's `registry` and `data` systems used for game state tracking

### 8.6 Key Phaser 3 Features We'll Use

| Game Need                    | Phaser 3 Feature                                         |
| ---------------------------- | -------------------------------------------------------- |
| Cat NPC characters           | Arcade Physics sprites with custom AI behaviors          |
| Cat dialogue/body language   | Custom DialogueSystem overlay (DOM or Phaser text)       |
| Colony relationship tracking | `this.registry.set()` / `this.registry.get()`            |
| Map zones                    | Tiled JSON tilemaps loaded via `tilemapTiledJSON()`      |
| Day/night cycle              | Color-tinted overlay rectangle with `setScrollFactor(0)` |
| Threat indicators            | Text/sprite labels floating above entities               |
| Items (food, water)          | Custom inventory system using game registry              |
| Story progression            | State machine driven by registry variables               |
| Save/load                    | JSON serialise → localStorage                            |
| Mobile controls              | Phaser touch input + virtual d-pad overlay               |
| Offline play                 | Service worker + PWA manifest (Phase 5)                  |
| Camera                       | `this.cameras.main` with zoom (2.5x) and follow          |

---

## 9. DEVELOPMENT ROADMAP

### Phase 1: Foundation ✅ COMPLETE

- Set up Phaser 3 + Vite + TypeScript project
- Create tilemap of ATG (100x80 tiles, triangle boundaries)
- Implement Mamma Cat sprite with 4-directional movement
- Implement basic day/night visual cycle (day → evening → night)
- Add Blacky NPC with dialogue system
- Verify production build works as static files

### Phase 1.5: Visual Polish ✅ COMPLETE

- Camera zoom (2.5x) — world feels large, Mamma Cat feels small
- Improved tileset with texture and variation
- Environmental objects (trees with canopies, benches, boulders, lampposts)
- Road boundaries with lane markings and sidewalk strip
- Expanded map to 100x80 tiles (3200x2560 pixels)
- Zone transitions between grass, paths, and plaza areas

### Phase 2: Core Mechanics (current)

- Implement hunger/thirst/energy stats and HUD
- Add food/water sources to map
- Create NPC cat behaviors (idle, wander, sleep cycles)
- Implement threat/friend indicator system
- Add more named NPC cats with dialogue
- Implement basic collision and territory boundaries

### Phase 3: Social & Story

- Add remaining named NPC cats with dialogue trees
- Implement cat body language animations (tail up, ears flat, etc.)
- Implement trust/reputation points system
- Build Chapter 1-3 story progression
- Add human NPC types (joggers, feeders, dog walkers)
- Add dog NPCs

### Phase 4: Camille & Endgame

- Implement Camille NPC and fixed encounter sequence
- Build Chapters 4-6
- Implement snatchers (night threat — caught = reset to last save)
- Implement colony dynamics (dumping events, cats arriving/leaving)
- Build epilogue and end screen with welfare message
- Colony journal / cat-dex

### Phase 5: Polish & Release

- Visual overhaul — real tilesets, organic paths, ATG-accurate landmarks
- Playtesting (Camille is primary tester!)
- Bug fixes, balance adjustments
- Audio implementation (sourced ambient tracks, cat sounds)
- PWA / service worker for offline play
- Mobile touch controls (virtual d-pad)
- Deploy to hosting
- Gift to Camille

---

## 10. RESEARCH REFERENCES

### 10.1 Location Research

- Ayala Triangle Gardens is a 2-hectare (20,000 sq m) landscaped urban park in Makati CBD
- Bounded by Ayala Ave (SW), Paseo de Roxas (N/NE), Makati Ave (E/SE)
- Formerly Nielson Field — Manila's pre-WWII airport (decommissioned 1948)
- Opened to public November 19, 2009
- Over 100 trees: rain trees, golden palms, fire trees, kamuning, podocarpus
- Public art by Filipino artists Ovvian Castrillo-Hill and Ral Arrogante
- Ninoy Aquino Jr. monument at northwest corner (erected 1986)
- Annual Festival of Lights (Nov-Jan) — lights and sound display every 30 min from 6-10 PM
- Car-Free Sundays since September 2023 — sections of surrounding roads closed to traffic
- The Shops at Ayala Triangle Gardens — underground mall at Makati Ave / Paseo de Roxas corner
- Starbucks locations: (1) The Shops at Ayala Triangle Gardens, (2) Tower One mezzanine
- Blackbird restaurant in restored Nielson Tower

### 10.2 Cat Colony Research

- @atgcats Instagram account documents the ATG cat colony
- CARA Welfare Philippines ran community cat programs at ATG for 15 years (feeding, medical care, neutering) before stopping at end of 2024 due to financial constraints
- New volunteer feeders have since filled the gap (uptick in 2025-2026)
- Cats congregate around Dela Rosa walkways, courtyard benches, and specific garden areas
- Feeders carry bags of kibble; cats come out from behind trees and shrubs when they hear rustling
- Feeding typically on paper plates, morning and evening
- Dedicated feeding stations exist in certain locations
- Cats are generally comfortable with human interaction
- The broader Makati/BGC area has a strong community cat culture — cats at Ayala Malls are also collectively cared for

### 10.3 Technical Research

- RPG JS v4: Open-source TypeScript RPG framework, PixiJS rendering, Vue 3 GUI, Tiled map editor support
- Standalone RPG build produces static files deployable anywhere
- Built-in PWA support for offline play
- Mobile responsive design guide and touch control plugin available
- Cat sprite assets available on itch.io and OpenGameArt.org
- Phaser 3 is a fallback option if RPG JS proves insufficient

### 10.4 Photo References (from developer)

Photos on file documenting:

- Satellite/aerial views of ATG with cat hotspot annotations (pink shading on map)
- Annotated map showing Paseo de Roxas underpass entrance where Blacky sits
- Street View of Tower One & Exchange Plaza (dramatic concrete canopy)
- Street View of Makati Ave showing The Shops terraced facade and garden entry
- Street View of Ayala Triangle Walkways showing tree canopy, lawns, paths, outdoor dining
- Mamma Cat — the real black and white cat (close-up, lying on stone edging by garden bed)
- Starbucks at The Shops — white cat sleeping in front of entrance, another cat by door
- Feeding time — three cats (two black-and-white, one ginger) eating kibble from paper plates at night
- Young tabby kitten eating alone under stairs
- White cat with calico markings perched on decorative boulder among snake plants
- Low-angle shot of white/tabby cat with Makati towers behind
- Camille crouching on the pyramid steps, offering food to a black-and-white cat with tail up in greeting
- Northwest playground — geometric carabao (water buffalo) sculpture/climbing structure
- Northwest playground — origami hornbill bird sculpture with WWF information sign
- Overview of playground area from elevated garden position showing both sculptures and colorful ground

---

## 11. OPEN QUESTIONS

1. **Named cat personalities:** Need detailed descriptions for Tiger, Jayco, Jayco Junior, Fluffy Cat, Pedigree Cat, the Ginger Twins, Pedigree Cat's companion, and Mamma Cat's two friends (names, appearances, personalities, locations, backstories). Developer has details and will fill in progressively.
2. ~~**Trust/reputation system?**~~ **RESOLVED:** Points-based. Positive interactions earn trust points; thresholds unlock story chapters and territory.
3. ~~**Snatcher consequence?**~~ **RESOLVED:** Reset to last save. Not game over — too harsh for the tone.
4. ~~**Camille relationship mechanic?**~~ **RESOLVED:** Fixed encounter sequence triggered by story progress. Encounters feel organic — Mamma Cat meets many humans but recognises Camille as special.
5. ~~**Colony journal?**~~ **RESOLVED:** Yes. A "cat-dex" or colony journal that fills in as Mamma Cat meets and befriends cats.
6. ~~**Art style?**~~ **RESOLVED:** Free existing sprites (itch.io, OpenGameArt) with color modifications. No commissioned art for v1.
7. **Custom tiles:** Minimal. Confirmed needed: carabao sculpture, hornbill sculpture, fountain(s). Possibly Starbucks facade and pyramid steps. Keep as few as possible.
8. ~~**Music?**~~ **RESOLVED:** Source ambient tracks from free libraries.
9. ~~**Localization?**~~ **RESOLVED:** English only for v1. Taglish (Tagalog-English mix) in a future version.
10. ~~**CARA/snatcher acknowledgment?**~~ **RESOLVED:** Background subtext only. Not overt.
11. **Manu and Kish NPC details:** Need sprite descriptions, when they appear in the story, and their interactions with Mamma Cat.
12. **Mamma Cat's two friends:** Need names, appearances, where Mamma Cat meets them, their personalities.
13. **Festival of Lights:** Include as a special event in v1, or defer to v2?
14. **Car-Free Sundays:** Include as a different gameplay mode, or defer?

---

_This document is a living reference. It will evolve as we research, design, and build together._

_For Mamma Cat, and all the cats still waiting._
