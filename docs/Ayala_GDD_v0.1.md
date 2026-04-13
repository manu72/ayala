# AYALA — Game Design Document v0.1

**A 2D browser-based adventure game about a homeless cat finding love in the heart of Manila**

*Draft: April 2026*
*Developers: Manu & Claude (AI co-developer)*
*For: Camille — and every cat who needs a forever home*

---

## 1. CONCEPT & VISION

### 1.1 Elevator Pitch

Ayala is a cozy-but-real 2D top-down adventure game set in the Ayala Triangle Gardens in Makati, Manila. You play as Mamma Cat (MC), a black-and-white former pet dumped in the gardens by her owners. You must survive the colony of 40-50 homeless cats, find food and water, establish territory, and ultimately find and befriend your human, Camille — who will adopt you and take you home.

### 1.2 Emotional Core

This is a universal tale of loss, abandonment, and hope. Every cat in the colony is innocent — former pets or kittens born homeless. None are villains. The game is educational without being overt: by the time the player finishes, they should feel moved to think about what they can do for stray animals in the real world. The call to action is baked into the experience of playing, not delivered as a lecture.

### 1.3 Tone & Arc

The game starts with vulnerability and stress. MC is alone, scared, and doesn't understand the colony dynamics. As she establishes territory and friendships, tension eases — but she is never truly "content" or "cozy" until she finds her human and is adopted. The emotional curve mirrors a real stray cat's experience.

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

The cats are mostly former pets (dumped) or kittens born in the gardens. They are generally clean, healthy, and socialized to humans — comfortable approaching people, especially those with food. Dedicated feeding stations exist, and cats gather at specific hotspots throughout the park.

There is also a dark side: mysterious individuals (typically appearing at night, dark-clad, faces covered) who snatch unwary cats. These cats are never seen again. This is a real and documented threat.

### 2.3 Key Landmarks (for Game Map)

**Starting Zone — Makati Avenue / Sto. Tomas Corner**
Where MC is dumped. Busy sidewalk, traffic, pedestrian crossings. The Ayala Triangle Walkways entrance is here. Adjacent to the stepped/terraced facade of The Shops building.

**The Shops / Pyramid Steps (MC's eventual home territory)**
The northeast corner at the Makati Ave / Paseo de Roxas intersection. A large pyramid-shaped structure with stepped stairs on either side leading down to an underground mall containing a Starbucks, a supermarket, and restaurants. This is MC's designated safe space and final territory. Cats sleep on and around these steps.

**The Starbucks (at The Shops)**
Below the pyramid steps. Outdoor seating, glass facade. A real white cat sleeps curled up in front of the entrance. This becomes a key location in MC's territory.

**Ayala Triangle Gardens Tower 1 & Tower 2**
The twin office towers flanking The Shops. A helipad sits on the roof/podium area (visible from above as a circular feature). Not accessible to cats but forms a visual landmark.

**Central Gardens (the deep green heart)**
Dense tree canopy of massive rain trees and acacias. Winding walkways labeled "Ayala Triangle Walkways." Manicured lawns, ornamental shrub beds, decorative boulders, tropical foliage (snake plants, golden palms, orange jasmine hedges). Public art installations scattered throughout. Benches, picnic areas. This is the core cat territory — prime hunting, sleeping, and socializing ground.

**Tower One & Exchange Plaza**
Southwest edge along Ayala Avenue. A dramatic sweeping concrete canopy over a large stone-paved plaza. A Starbucks at the mezzanine level. The fountain nearby provides drinking water for cats.

**Paseo de Roxas Underpass (Western entrance)**
An underpass leading under Paseo de Roxas into the gardens from the western/Salcedo Village side. An escalator brings people up into the park. Blacky (an NPC cat) always sits at the top of this escalator. This is Camille's entry point into the park.

**Blackbird / Nielson Tower**
The historic former airport control tower, now a fine dining restaurant called Blackbird, located in the southeast portion of the triangle, surrounded by trees.

**Ninoy Aquino Monument**
Northwest apex of the triangle. A monument to the assassinated opposition leader. Quieter, more secluded area.

**Manam at the Triangle**
A Filipino restaurant on the southeast edge. Outdoor dining area with white umbrellas. A potential food source area for cats.

**The Grassy Areas**
Open lawns between the walkways. Popular with joggers, picnickers, families, and dog walkers. Dogs are welcome in ATG and generally stick to these grassy areas and pathways.

---

## 3. CHARACTERS

### 3.1 Mamma Cat (MC) — The Player Character

- **Appearance:** Black and white spotted cat (based on a real ATG cat). Distinctive markings that Camille can recognise.
- **Backstory:** A former pet, dumped on the Makati Ave sidewalk from a car by unseen owners. She retains some trust in humans but is confused and frightened.
- **Personality:** Cautious but curious. Resilient. Capable of deep affection once trust is built.
- **Arc:** From terrified newcomer → navigating colony politics → establishing territory → finding Camille → adoption.

### 3.2 Named NPC Cats (v1 cast — 8 core NPCs + additional)

All cats are based on real ATG cats. None are villains.

1. **Blacky** — A black cat who sits at the top of the Paseo de Roxas underpass escalator. A gatekeeper figure. Calm, wise, knows the lay of the land. One of the first friendly NPCs MC can encounter. Camille's first friend in the park.

2. **Tiger** — (Details TBD with developer — likely tabby/striped pattern, personality to be defined)

3. **Jayco** — (Details TBD — established colony member)

4. **Jayco Junior** — Jayco's kitten. Young, playful, vulnerable. Could serve as a character MC feels protective toward.

5. **Fluffy Cat** — A longer-haired cat, distinctive in the colony. (Personality TBD)

6. **Pedigree Cat** — A cat that is clearly a former pet of a recognizable breed — not a typical Filipino puspin (short for "pusang pinoy" / street cat). This cat's appearance drives home the "dumped pet" theme. Has a companion. (Breed/personality TBD)

7. **Ginger Twin 1** — One of two orange/ginger cats. (Name TBD)

8. **Ginger Twin 2** — The other ginger twin. (Name TBD)

**Additional named cats (details TBD):**
- **Pedigree Cat's Companion** — Always found near Pedigree Cat. (Appearance/personality TBD)
- **MC's Friend 1** — One of two cats who become MC's close allies in the colony. (Details TBD)
- **MC's Friend 2** — The other close ally. (Details TBD)

### 3.3 Background Colony Cats

An additional 30-40 unnamed cats populate the garden zones. They have basic behaviors (sleeping, grooming, eating, wandering) and can be interacted with at a basic level. Some are friendly, some are wary, some are territorial. Their attitudes toward MC change as she gains experience and reputation.

### 3.4 Human NPCs

Humans are not directly controllable or deeply interactive in v1. They are environmental elements that MC must read and respond to.

**Friendly Humans:**
- **Camille** — MC's eventual adopter. 5ft. Enters from the Paseo de Roxas underpass. Visits regularly. Encounters MC at the pyramid steps/Starbucks area. The relationship builds over multiple fixed encounters that feel organic — MC encounters many humans, but Camille is special and MC will come to see her as her "hooman."
- **Manu** — Camille's partner. 6ft — noticeably taller than most ATG humans. Often accompanies Camille. Friendly to cats, carries food.
- **Kish** — Camille's 12-year-old niece. 5ft. Sometimes visits with Camille. Enthusiastic about cats but needs to learn to be gentle/patient.
- **Volunteer Feeders** — Appear at specific times/locations. Carry food bags. Cats gather around them. Green threat indicator.
- **Vet Volunteers** — Occasionally take sick cats away but bring them back after treatment. Initially indistinguishable from snatchers to MC (a source of early-game tension).
- **Adoption Volunteers** — Take cats to forever homes. Positive outcome but cats disappear.

**Neutral Humans:**
- **Joggers** — Move along pathways at speed. Unpredictable. Can startle cats.
- **Office Workers** — Lunch crowds, especially midday. Potential food-dropping sources.
- **Families with Children** — Weekend visitors. Sometimes kind, sometimes grabby/rough.
- **Dog Walkers** — See Dogs section below. Yellow indicator.
- **Guards** — Park security. Most are neutral. Some are unfriendly to cats.

**Threatening Humans:**
- **The Snatchers** — Dark-clad, faces covered, appear only at night. They move through the park looking for unwary cats. If they catch MC, the player is reset to their last save point. Deep red / skull threat indicator. The real nightmare.
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
- **Night (10:00 PM–6:00 AM):** Park officially closed. Quiet. Dangerous. Snatchers most active. Cats who are exposed and alone are at risk. MC should be in a safe sleeping spot.

### 4.3 Cat Stats (simplified for v1)

- **Hunger** — Decreases over time. MC must find food regularly. Sources: feeding stations, volunteer feeders, restaurant scraps, supermarket area near The Shops, hunting (bugs, lizards).
- **Thirst** — Decreases over time. Sources: fountains, rain puddles, water bowls left by feeders.
- **Energy/Rest** — Depletes with activity, especially in heat. MC must find safe sleeping spots to rest. Shade is essential during midday.
- **Trust/Reputation** — A points-based measure of how the colony perceives MC. Starts at zero. Builds through positive interactions with named cats (sharing food, helping, spending time). Affects which areas MC can access and which cats will share food/space. Specific point thresholds unlock new story chapters and territory access.

### 4.4 Territory System

MC starts with no territory. Establishing territory is a key progression goal.

- Territory is claimed by spending time in an area, scent-marking, and not being chased off by other cats.
- Some areas are already claimed by established cats. MC must either earn permission, find unclaimed spots, or (later in the game) be ceded space by friendly NPCs.
- MC's designated safe space is the Starbucks pyramid steps area. This becomes her territory through the story progression — it's not available immediately.

### 4.5 Cat Communication System

Cats are amazingly social creatures who communicate primarily through body language. The game represents this through visible sprite animations and dialogue-style indicators.

**Core Body Language Animations (v1 priorities):**

1. **Tail Up** — Friendly greeting. The universal "I come in peace" signal. MUST HAVE for v1. When MC approaches a friendly cat, both cats raise their tails.

2. **Crouching, Ears Flat** — Frightened / submissive. MC's default early in the game when encountering established colony members. Also triggered by dogs, loud humans, snatchers.

3. **Switching/Flicking Tail** — Alert, agitated, ready to flee or fight. Indicates tension. Other cats display this when MC enters their territory uninvited.

4. **Slow Blink** — Trust signal. The cat equivalent of "I love you." Used in relationship-building interactions. Could be a key mechanic for building trust with Camille.

5. **Arched Back / Puffed Fur** — Defensive threat display. Rare — used in confrontations.

6. **Head Bump / Rubbing** — Affection and scent-marking. Used between friendly cats and between MC and Camille once trust is high enough.

**Dialogue System:**

Cats don't speak human language, but the game can convey meaning through:
- Body language animations (above)
- Thought bubbles with simple icons (fish = hungry, zzz = tired, heart = friendly, skull = danger, question mark = curious)
- Short "cat-speak" text in dialogue boxes that conveys tone/intent (e.g., *"Mrrp?"* for a friendly inquiry, *"HSSSS!"* for a warning, *"Prrrrr..."* for contentment)
- Contextual narration (text describing what MC perceives: "This cat's tail is low and twitching. She doesn't want you here.")

### 4.6 Threat/Friend Indicator System

A floating indicator above humans, cats, and dogs that conveys their disposition toward MC. This represents MC's ability to read body language, scent/pheromones, and intent.

- **Green (heart)** — Friendly/known. Feeders, Camille (eventually), friendly cats.
- **Yellow (dash)** — Neutral/unknown. Most humans, unfamiliar cats. Unpredictable.
- **Orange (exclamation)** — Cautious. Territorial cats, some guards, excitable dogs.
- **Red (skull)** — Dangerous. Snatchers, hostile humans. Flee immediately.

Known entities display their name above the indicator once MC has learned who they are. Unknown entities show "???" until identified through interaction or observation.

### 4.7 Food & Survival

Food sources (in order of reliability):
1. **Volunteer feeding stations** — Appear at set times (morning and evening). Reliable but competitive — other cats are there too.
2. **Feeder NPCs** — Volunteers with kibble bags who walk routes through the park.
3. **Restaurant/cafe areas** — Scraps near Manam, Starbucks, other dining spots. Risky (guards, dogs).
4. **The Shops supermarket area** — Near MC's eventual territory. Occasional scraps.
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
MC is abandoned on Makati Ave at night. The player learns basic movement, the threat indicator system, and the need to find shelter. MC must navigate off the busy sidewalk and into the garden edges. First encounter with a colony cat (wary/hostile reaction). MC finds a temporary hiding spot for the night.

**Chapter 2: Newcomer**
MC begins exploring the gardens during the safer dawn/evening periods. She encounters several named NPCs. Some are wary, some are curious, one or two may be friendly. MC learns about food sources, water, and the daily rhythm. She starts to understand colony dynamics — who owns what territory, where the feeding stations are.

**Chapter 3: Finding Her Place**
MC has survived the initial days. She's made a few allies (perhaps Blacky, who is wise and helpful). She's learned to avoid threats. She begins ranging further through the gardens. A conflict or challenge — perhaps a confrontation with a territorial cat, or a close call with a snatcher — raises the stakes.

**Chapter 4: The Steps**
MC discovers the pyramid steps / Starbucks area and recognizes it as a good territory — warm, close to food, sheltered sleeping spots. She begins establishing herself there, with or without the cooperation of cats already in the area. This may involve building trust with local cats.

**Chapter 5: Camille**
Camille appears. MC observes her from a distance at first. Camille is kind to the cats, brings treats, sits quietly. MC is drawn to her but cautious (she was betrayed by her previous owners). Over several encounters, MC approaches closer. The slow blink. The first touch. The first time Camille offers food and MC eats from her hand.

**Chapter 6: Home**
Camille decides to adopt MC. The final sequence. MC leaves the gardens — not abandoned this time, but chosen. A bittersweet ending: joy for MC, but the other cats remain. A quiet moment acknowledging all the cats still waiting for their forever homes.

**Epilogue / End Screen:**
Information about real cat welfare. Links to organizations (CARA, local shelters). A gentle prompt: "There are millions of cats like Mamma Cat. What can you do?"

### 5.2 Side Content (v1 stretch goals)

- Individual storylines for named NPC cats (learning their backstories through repeated interaction)
- A "colony journal" that fills in as MC meets and befriends cats
- Environmental storytelling (finding discarded collars, old feeding bowls, signs of cats who were snatched)
- The Festival of Lights Christmas event (a special visual sequence)
- Car-Free Sundays (a different, calmer gameplay experience on Sundays)

---

## 6. GAME MAP

### 6.1 Map Zones

The game world is divided into interconnected zones that correspond to real areas of ATG. In RPG JS terms, these could be individual maps stitched together via the World system, or a single large map with distinct regions.

**Zone 1: Makati Ave Edge (Starting Zone)**
- Busy sidewalk, cars, pedestrian crossings
- The Sto. Tomas corner where MC is dumped
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

**Zone 6: The Shops / Pyramid Steps (MC's Home Territory)**
- The pyramid-shaped stepped structure
- Stairs on either side leading down to underground level
- Starbucks (The Shops location)
- Underground mall area (supermarket, restaurants)
- MC's designated safe space — becomes available as territory in Chapter 4
- Glass railings, stone tiles, planters

**Zone 7: Northwest Playground Area**
- A beautiful children's playground surrounded by trees
- Large geometric/origami-style sculptures: a carabao (water buffalo) and a hornbill bird, both functioning as climbing structures
- Colorful rubberized ground with swirling blue and green patterns
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
- Character sprites need enough detail to distinguish cat colors/patterns (MC's black and white spots must be recognizable)

### 7.2 Cat Sprites Needed

For each named cat, we need at minimum:
- Idle (sitting, standing)
- Walking (4 directions)
- Sleeping (curled up)
- Eating
- Key body language poses: tail up, ears flat/crouching, tail switching, slow blink, arched back, head bump

For background colony cats, a smaller set of animations with color variations.

### 7.3 Art Sources (v1 — free/existing assets only)

- **Cat sprites:** Free pixel art from itch.io (Elthen's 2D Pixel Art Cat Sprites, Cat Pack series, Cat 16x16 with 33+ animations) and OpenGameArt.org collections. Modify with color palette swaps for MC's distinctive black-and-white markings and named cat appearances.
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

**RPG JS v4** — An open-source TypeScript framework for creating 2D RPGs in the browser.

Key technologies:
- TypeScript 5
- PixiJS v7 (WebGL rendering)
- ViteJS v4 (compilation and hot-reload)
- Vue 3 (GUI — dialogue boxes, menus, HUD)
- Tiled Map Editor (map creation)

### 8.2 Build Mode

**RPG (single-player standalone)**
- Built with `RPG_TYPE=rpg npm run build`
- Produces static files in `dist/standalone/`
- Deployable to any static host (Netlify, Vercel, GitHub Pages) or playable locally
- No server required

### 8.3 Offline / PWA

- RPG JS v4 has built-in PWA support (enabled by default in production builds)
- Service worker automatically caches game assets for offline play
- Configurable via `rpg.toml` (game name, icon, theme color)
- Camille can "install" the game to her iPad/iPhone home screen

### 8.4 Mobile / Responsive

- RPG JS includes responsive design support via CSS media queries
- Mobile touch controls available via `@rpgjs/mobile-gui` plugin (virtual d-pad)
- iPad landscape is the target mobile experience
- iPhone landscape is secondary (smaller screen, same controls)
- Desktop/keyboard is the development target

### 8.5 Save System

- `player.save()` serializes all player state to JSON
- In standalone mode, save to `localStorage`
- Auto-save at key story moments
- Manual save via interaction (e.g., sleeping in MC's safe spot)
- Title screen / save screen plugins available (`@rpgjs/save`, `@rpgjs/title-screen`)

### 8.6 Key RPG JS Features We'll Use

| Game Need | RPG JS Feature |
|-----------|---------------|
| Cat NPC characters | Events (Scenario mode for per-player state) |
| Cat dialogue/body language | `player.showText()`, `player.showChoices()`, custom GUI |
| Colony relationship tracking | `player.setVariable()` / `player.getVariable()` |
| Map zones | Tiled World (.world) with connected maps |
| Day/night cycle | Custom time system with event hooks |
| Threat indicators | Component system (floating elements above entities) |
| Items (food, water) | Database items system |
| Story progression | Variable-driven event changes via `onChanges()` hook |
| Save/load | `player.save()` → localStorage |
| Mobile controls | `@rpgjs/mobile-gui` plugin |
| Offline play | Built-in PWA support |

---

## 9. DEVELOPMENT ROADMAP

### Phase 1: Foundation (Weeks 1-4)
- Set up RPG JS v4 development environment
- Create basic map of ATG in Tiled (simplified, one or two zones)
- Implement MC sprite with basic movement (4-directional walking)
- Implement basic day/night visual cycle
- Test standalone build and offline play

### Phase 2: Core Mechanics (Weeks 5-8)
- Implement hunger/thirst/energy stats and HUD
- Add food/water sources to map
- Create NPC cat events with basic behavior (idle, wander, sleep)
- Implement threat/friend indicator system
- Add first named NPC (Blacky) with dialogue
- Implement basic collision and territory boundaries

### Phase 3: Social & Story (Weeks 9-12)
- Add remaining named NPC cats with dialogue trees
- Implement cat body language animations (tail up, ears flat, etc.)
- Implement trust/reputation system
- Build Chapter 1-3 story progression
- Add human NPC types (joggers, feeders, dog walkers)
- Add dog NPCs

### Phase 4: Camille & Endgame (Weeks 13-16)
- Implement Camille NPC and encounter sequence
- Build Chapters 4-6
- Implement snatchers (night threat)
- Build epilogue and end screen with welfare message
- Polish save/load system
- Mobile touch control testing

### Phase 5: Polish & Release (Weeks 17-20)
- Playtesting (Camille is primary tester!)
- Bug fixes, balance adjustments
- Audio implementation
- PWA configuration and offline testing
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

1. **Named cat personalities:** Need detailed descriptions for Tiger, Jayco, Jayco Junior, Fluffy Cat, Pedigree Cat, the Ginger Twins, Pedigree Cat's companion, and MC's two friends (names, appearances, personalities, locations, backstories). Developer has details and will fill in progressively.
2. ~~**Trust/reputation system?**~~ **RESOLVED:** Points-based. Positive interactions earn trust points; thresholds unlock story chapters and territory.
3. ~~**Snatcher consequence?**~~ **RESOLVED:** Reset to last save. Not game over — too harsh for the tone.
4. ~~**Camille relationship mechanic?**~~ **RESOLVED:** Fixed encounter sequence triggered by story progress. Encounters feel organic — MC meets many humans but recognizes Camille as special.
5. ~~**Colony journal?**~~ **RESOLVED:** Yes. A "cat-dex" or colony journal that fills in as MC meets and befriends cats.
6. ~~**Art style?**~~ **RESOLVED:** Free existing sprites (itch.io, OpenGameArt) with color modifications. No commissioned art for v1.
7. **Custom tiles:** Minimal. Confirmed needed: carabao sculpture, hornbill sculpture, fountain(s). Possibly Starbucks facade and pyramid steps. Keep as few as possible.
8. ~~**Music?**~~ **RESOLVED:** Source ambient tracks from free libraries.
9. ~~**Localization?**~~ **RESOLVED:** English only for v1. Taglish (Tagalog-English mix) in a future version.
10. ~~**CARA/snatcher acknowledgment?**~~ **RESOLVED:** Background subtext only. Not overt.
11. **Manu and Kish NPC details:** Need sprite descriptions, when they appear in the story, and their interactions with MC.
12. **MC's two friends:** Need names, appearances, where MC meets them, their personalities.
13. **Festival of Lights:** Include as a special event in v1, or defer to v2?
14. **Car-Free Sundays:** Include as a different gameplay mode, or defer?

---

*This document is a living reference. It will evolve as we research, design, and build together.*

*For Mamma Cat, and all the cats still waiting.*
