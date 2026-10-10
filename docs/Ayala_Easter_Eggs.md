# Ayala — Easter Eggs (Living Document)

**Purpose:** Track easter eggs and secret content for the game. These are designed primarily for Camille (primary player) and Kish (secondary player).

**Status key:**

- 🎯 **Priority** — build in v1
- 💭 **Idea** — parked for v2 or later
- ✅ **Built** — implemented

_Last updated: 10 October 2026_

---

## PERSONAL — FOR CAMILLE

### ✅ The Hidden Letter

A folded piece of paper hidden somewhere in the gardens — under a bench, behind a bush, or tucked beside a particular boulder. When Mamma Cat finds it, she picks it up in her mouth (sprite change). She can carry it.

If she brings it to Camille during an encounter, Camille "reads" it — the screen fades to a text overlay showing a letter from Manu to Camille. The content is private between them, written by Manu for the final build.

**Trigger:** Mamma Cat discovers the letter (exact location TBD — should be somewhere she might plausibly stumble upon by accident, maybe near the Blackbird area).

**Payoff:** Deeply personal moment between Manu and Camille. The kind of thing that makes the game a true gift, not just a game.


**Built (`EasterEggSystem`):** The letter (map place `egg_letter`, by a bush near Blackbird) is picked up with Space and carried in her mouth; Space beside Camille (an encounter or a care visit) gives it to her, and a paper card reads "nom noms" while she reads it. Space anywhere else sets it down; it stays where she left it.
---

### ✅ The Sunset Viewpoint

If Mamma Cat stands on a specific tile of the pyramid steps during the exact transition from evening to night (the 2-second crossover between day/night cycle phases), the camera pulls back briefly and shows a sunset silhouette of the Makati skyline.

A single line of narration fades in: _"You will remember this."_

Auto-saves the moment. Plays exactly once per save file — feels like a rare moment of grace.

**Trigger:** Specific tile + specific time-of-day transition.

**Payoff:** Reinforces ATG as a real place Camille knows. Cinematic moment rewarding careful observation.


**Built (`EasterEggSystem`):** On the pyramid steps (`poi_pyramid_steps`, within 40 px) at the moment evening turns to night: the camera pulls back, the Makati skyline stands black against the sunset, and "You will remember this." Once per save; autosaves.
---

### ✅ The Complete Colony Gathering ❤️❤️❤️ LOVE THIS!!

If Camille reaches maximum trust (≥80) with EVERY named cat in the colony before the final Camille encounter, the adoption sequence changes.

On Mamma Cat's last night in the gardens, before Encounter 5, every named cat she's befriended slowly appears near the pyramid steps — one by one, from their home zones. They sit around her in a loose circle. No dialogue. Just presence. The camera briefly pans around showing all of them.

Narration: _"They came. All of them. To say goodbye."_

Then the final encounter with Camille proceeds as normal, but with the colony watching from a respectful distance as Mamma Cat enters the carrier.

**Trigger:** ≥80 trust with all named cats + Chapter 5 Encounter 5 ready to fire.

**Payoff:** Rewards the player who has truly earned the colony's love. Makes the ending even more emotional — Mamma Cat isn't just chosen, she's _blessed_ by her community.


**Built (`EasterEggSystem`):** When Camille's last encounter is waiting and every named cat's trust is 80+, the eight walk in one by one (from far off they appear a short walk away), sit round Mamma Cat facing her, the camera pulls back, and the line plays. The encounter waits until they have gathered; beat 5 itself is unchanged.
---

### ✅ The Developer's Note

A specific obscure corner of the gardens where, if Mamma Cat sits still for 60+ seconds, a single line fades in:

_"Made with love for Cam. For every cat we've ever fed. For Mamma Cat."_

Plays once per save. Very subtle. Easy to miss.

**Trigger:** Stillness in a specific low-traffic corner.

**Payoff:** A quiet moment of authorship. Cam finding this without being told would be special.


**Built (`EasterEggSystem`):** A full minute of stillness at `egg_dev_corner` (the park's west tip, by the monument). Once per save.
---

### ✅ The Ghost of Mamma Cat's Past

At the fountain in Exchange Plaza, at exactly midnight in-game, if Mamma Cat sits on a specific tile facing the water, the reflection shows her current self PLUS a small faded kitten beside her — who she was before she was dumped. A ghost of what was lost.

Narration: _"You don't remember being that small. But something in you does."_

**Trigger:** Midnight + specific tile + facing direction.

**Payoff:** A melancholy moment tying to the game's themes of loss and recovery.


**Built (`EasterEggSystem`):** Sitting still at `egg_ghost` (the Exchange Plaza fountain) around midnight (23:36–00:24): a faded, upside-down Mamma Cat and a small kitten appear in the nearest water. Once per save.
---

## FOR KISH

### ✅ The Balloon

A child's lost balloon is caught in a tree branch somewhere in the central gardens. If Mamma Cat jumps or bats at it (requires being right beneath it, interact key), the balloon comes loose and drifts slowly upward out of the frame.

If Kish is nearby (during Encounter 4 or 5), she exclaims: _"Oh! There's a balloon! Bye balloon!"_

**Trigger:** Mamma Cat interacts with the specific tree.

**Payoff:** Kid-friendly moment. Small, silly, memorable.


**Built (`EasterEggSystem`):** A red balloon in the big central tree (`egg_balloon_tree`); Space beneath it sets it free. If Kish is within ~10 m she calls "Oh! There's a balloon! Bye balloon!"
---

### ✅ The Stuffed Cat

A tiny stuffed cat toy is hidden in the playground area (near the carabao or hornbill sculptures). Someone's lost plushie.

Mamma Cat can pick it up and carry it (sprite change showing her with the toy in her mouth).

If she carries it to Kish during an encounter, Kish reacts with delight: _"OMG it's a TINY cat! Can we keep it?"_ Camille gently reminds her it belongs to someone else.

The toy can be placed on the playground for another child to find, or carried back to Mamma Cat's territory as a memento.

**Trigger:** Find toy + carry to Kish.

**Payoff:** Kish gets a moment that's hers. Shows her character without making her annoying.


**Built (`EasterEggSystem`):** A tiny pink plush cat by the carabao (`egg_plush`): picked up and carried like the letter. Space beside Kish: "OMG it's a TINY cat! Can we keep it?", Camille answers, and it goes back on the playground. Set down on her steps or the playground, it gets a line of its own.
---

### ✅ The Hidden Kittens

A few background kitten sprites (scaled-down cat sprites) are hidden in bushes and under benches throughout the gardens. Each one discovered adds a tiny entry to the colony journal: _"You found a kitten hiding here. They're still too small to know you."_

There are 5-7 to find in total. Kish would love the treasure hunt aspect.

**Trigger:** Mamma Cat gets within a few tiles of each hidden kitten location.

**Payoff:** Collection mechanic for Kish. Also reinforces that the colony has more cats than just the named ones.


**Built (`EasterEggSystem`):** Six (`egg_kitten_1`–`6`, one per colony zone and two more), invisible until she is close, then a pair of small sitting kittens; finding one plays a mew and the line, and the Journal counts "Hidden kittens: n/6".
---

## COLONY-BASED

### ✅ Blacky's Midnight Story

If Mamma Cat visits Blacky at exactly 3am in-game (in the quiet hours after night, before dawn), Blacky is awake when he'd normally be sleeping. He tells her a story about "the one who came before" — a cat he was close to who was snatched.

Narration sequence, no choices. Builds the colony lore.

**Trigger:** Visit Blacky at 3am.

**Payoff:** Deepens a named character, adds weight to the snatcher threat.


**Built (`EasterEggSystem`):** Between 02:30 and 03:30 Blacky is awake; talking to him then tells the story of the grey cat with the torn ear who taught him the roads. Once per save.
---

### ✅ Pedigree Cat's Collar

Buried near where Pedigree Cat lives (Blackbird area) is an old, worn collar with a faded name tag. If Mamma Cat digs at a specific spot and uncovers it, narration fires:

_"The name on the tag is faded. But someone called her this, once. Before they left."_

Pedigree Cat's dialogue changes slightly afterwards — she thanks Mamma Cat for finding it.

**Trigger:** Dig at specific tile near Pedigree Cat.

**Payoff:** Environmental storytelling. Ties to the dumped pet theme.


**Built (`EasterEggSystem`):** A disturbed-earth glyph shows near `egg_collar` (Pedigree's spot) when she is close; three digs uncover the collar. Pedigree's next conversation thanks her: the friend was old and sick, and Pedigree never left her side (Manu: no name, no resolution).
---

### ✅ The Kittens Are Coming

Once per playthrough, at a certain trust threshold, if Mamma Cat rests in a specific hidden spot (behind a dense bush in the central gardens), she witnesses a colony cat giving birth to kittens.

No dialogue. Just the visual sequence — a pregnant cat settles, time passes, small kittens appear beside her. Mamma Cat sits watch nearby.

Narration: _"Life goes on here. Even now. Even with all this."_

**Trigger:** Rest at a specific spot + trust threshold + random chance.

**Payoff:** The colony is a living ecosystem. Hopeful contrast to the dumping events.


**Built (`EasterEggSystem`):** Resting by the hidden bush (`egg_birth`) with global trust 50+: a 40% chance per rest, once per playthrough. A tabby settles, the screen fades, and three kittens are beside her; they stay there for the rest of the run.
---

## LOCATION-BASED (ATG LANDMARKS)

### 💭 The Ninoy Aquino Monument

If Mamma Cat sits at the base of the monument and interacts, a short narration plays about the site's history — the airfield that came before the park, the man the monument commemorates. Educational, brief.

**Trigger:** Interact with monument.

**Payoff:** Real-world context. Rewards curiosity.

---

### 💭 The Playground Sculptures

If Mamma Cat climbs on the carabao or hornbill sculpture during daytime when children are in the playground, a brief animation plays — a child points at her and laughs, a parent takes a photo. Mamma Cat gets a small treat dropped nearby.

**Trigger:** Climb sculpture during day with families present.

**Payoff:** Playful moment. Kish would love it.

---

### 💭 The Helipad

If Mamma Cat can find a way up to the tower podium (maybe via a specific sequence of jumps during a specific time), she reaches the helipad and gets a unique rooftop view of Makati. Possibly the only location in the game where she can see the actual skyline from above.

**Trigger:** Complex traversal sequence.

**Payoff:** Reward for creative exploration. Feels like breaking out of the normal play area.

---

### ✅ The City Across Makati Ave

Six swarms of 5 or 6 zombies (green-tinted office workers) loiter on the city side of Makati Ave against the map's east edge. They stand still until one spots Mamma Cat; that wakes its whole swarm, the danger music starts, and they shamble after her and lunge, sending her leaping away. They follow her onto the road but never past the median: a close car scares them back, and one too slow gets knocked flat, then gets up and shuffles home.

**Trigger:** Cross Makati Ave and explore the far east side.

**Payoff:** A daft scare in an otherwise gentle game; traffic for once on her side.

---

## REAL-WORLD WEEKLY EVENTS

### ✅ The Sunday Market on Paseo (was Car-Free Sunday)

On every real-world Sunday (the device's date, any hour), the in-game dawn closes Paseo de Roxas, the road along the park's north-west side, and it becomes a pedestrian street market, as Manu sees it on real Sundays: food stalls, music and a lively crowd. Ayala Ave and Makati Ave keep their traffic. Vendors, browsers, dogs on leads, a busker and that week's programme (yoga, Zumba, a pet-adoption booth, chalk art or a Sunday visitor cat) fill the street. Mamma Cat can sit in the middle of Paseo de Roxas, between the stalls, or run Blacky's Sunday errand, but she has to put up with busy feet, barking dogs, kids who want to pet her and a vendor who shoos her from the food. At 09:30 a whistle starts the pack-up; at 10:00 the barriers go and real traffic returns.

**Trigger:** Play on a real Sunday. It runs at every in-game dawn that day, from in-game day 2.

**Payoff:** A weekly reason to come back, Sunday Book entries, and the city as Camille knows it on Sunday mornings. Design: `Surprise_and_Rewards_Design.md` §12.3.


**Built (`SundaySystem`):** the closure, 70 stalls, browsers, the busker, vendors who shoo her from the food stalls, market finds, a kid who wants to pet her, the five rotating programmes on the closed westbound carriageway (one a week; preview with `?programme=`), and the 09:30 whistle and pack-up. Not yet: dogs on leads at the market, Blacky's Sunday errand (needs the favours system).
---

### ✅ The Sunday Lights (Festival of Lights)

On every real-world Sunday, and only on Sundays, all year, the in-game evening and early night (17:00–23:00) become "the Sunday Lights": wrapped rain trees, projections on the Exchange Plaza canopy and Tower One, two shows and a finale. Mamma Cat can chase light butterflies she can never catch, or make a wish at the fountain. From 10 Nov to 15 Jan it becomes the Christmas Festival of Lights, with parol stars over Ayala Ave.

**Trigger:** Play on a real Sunday, from in-game day 2, in-game 17:00 to 23:00.

**Payoff:** The park's most famous spectacle, every week. Design: `Surprise_and_Rewards_Design.md` §12.4.


**Built (`SundaySystem`):** fairy lights in the trees round the Exchange Plaza fountain, the crowd, shows at 18:00 and 19:00 and the 20:00 finale, light butterflies she can't catch, a wish when she sits by the lit fountain, and the Christmas palette and parol stars from 10 Nov to 15 Jan. The music is a generated placeholder for a licensed track. Not yet: projections on the Exchange Plaza canopy and Tower One.
---

## META EASTER EGGS

### 💭 Title Screen Accumulation

Each time a playthrough completes, another cat sprite appears silently in the background of the title screen. After 5 completions, a small colony is visible. After 10, the full named cast is there.

**Trigger:** Game completion count (saved to localStorage).

**Payoff:** Rewards replay. Visual record of Camille's journey with the game.

---

### 💭 Photo Gallery Unlock

Complete the game once to unlock a "gallery" option on the title screen that shows the real-world reference photos — the actual ATG cats, the gardens, Camille and Manu on the steps.

**Trigger:** First completion.

**Payoff:** Reveals the game's real-world roots. Makes the connection explicit for those who want it.

---

### 💭 The Extended Credits

Complete the game with 100% cat discovery (all named park cats befriended + all hidden kittens found) and the credits sequence extends. The street colony across Ayala Ave is not required, because befriending it would need a live-road crossing (Ayala Ave never closes, even on Sundays). Includes:

- Dedications to real ATG cats
- Tribute to CARA Welfare Philippines
- Real photos of the colony
- A final dedication: _"For Mamma Cat, and every cat who is still waiting."_

**Trigger:** 100% discovery.

**Payoff:** Ultimate completionist reward. Ties fiction to reality.

---

## IDEAS PARKING LOT

- A cat who only appears during rain (requires weather system — future)
- A special dialogue tree with Blacky that unlocks only if Mamma Cat brings him a specific item
- Tagalog/Taglish hidden dialogue option — unlocks after finding a specific trigger
- A cameo of other real ATG cats not in the named cast — @atgcats Instagram feed as reference

---

## PRINCIPLES FOR DESIGNING EASTER EGGS

1. **Subtlety over spectacle.** Easter eggs should feel like discoveries, not achievements. No pop-up "ACHIEVEMENT UNLOCKED" banners.
   - This applies to easter eggs. The core reward loop (forage, collections, requests) may use reveal juice and visible totals; see `Surprise_and_Rewards_Design.md` §10.2 and §11.
2. **Personal > universal.** The best easter eggs in Ayala are the ones that only Camille and Kish will recognise as special.
3. **Reward observation and patience.** Easter eggs should come from careful play, not walkthroughs.
4. **Fit the tone.** Ayala is a gentle, melancholy, hopeful game. Easter eggs should match that tone — no jokes that break the fourth wall awkwardly.
5. **Make them findable.** An easter egg that no one ever finds is a waste. Include subtle clues, or make them discoverable through natural play patterns.
6. **Never gatekeep the main story.** Easter eggs enhance the experience for those who find them, but the story itself should be complete without them.
