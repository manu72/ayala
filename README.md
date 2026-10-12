# Ayala Triangle

**A 2D browser-based adventure game about a homeless cat in Manila.**

_For Cam and Mamma Cat and every abandoned pet looking for their forever home._

---

## About

Ayala is a cozy-but-real top-down adventure game set in the [Ayala Triangle Gardens](https://en.wikipedia.org/wiki/Ayala_Triangle_Gardens), a 2-hectare urban park in the Makati Central Business District, Metro Manila, Philippines. You play as **Mamma Cat**, a black-and-white former pet dumped in the gardens by her owners. Survive the colony of 40-50 homeless cats, find food and water, establish territory, build relationships, and ultimately find your human who will adopt you and take you home.

The game is inspired by the real cat colony at Ayala Triangle Gardens and the volunteers who care for them. Every cat in the colony is innocent. None are villains. But there are shadowy creatures who come out at night...

## Project Status

**Version 0.6.0** -- Phases 1 through 4, **Phase 4.5**, **Phase 5** (AI-powered dialogue), **Phase 5.1** (AI-powered human NPCs), **Phase 5.1a** (consolidated human-spoken bubbles + paired narrator/spoken beats), and **Phase 5.1b** (Camille beat-5 player-consent decision gate + stationary greeting cap) are complete for the core loop. The game is playable from start to finish: survival mechanics, social systems, 6 story chapters, territory claiming, snatchers, the full adoption story arc through to the epilogue, plus intro cinematic, grounded narration hooks, and human/cat engagement polish. **Named colony cats** and **named humans** both use LLM-backed dialogue when a same-origin proxy is configured; scripted dialogue remains the fallback if the network or API fails.

### Development Roadmap

| Phase                                | Focus                                                                                                                                                                                          | Status            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1. Foundation                        | Phaser 3 setup, ATG map, Mamma Cat movement, Blacky NPC, day/night cycle                                                                                                                       | Complete          |
| 1.5 Visual Polish                    | Camera zoom, textured tiles, animated sprites, map expansion, dense trees                                                                                                                      | Complete          |
| 2. Core Mechanics                    | Hunger/thirst/energy stats, food/water sources, guard NPC, save/load, HUD                                                                                                                      | Complete          |
| 3. Social & Story                    | Named NPC cats, trust system, emotes, chapters 1-3, humans, dogs, journal                                                                                                                      | Complete          |
| 4. Cam & Endgame                     | Cam encounters, Chapters 4-6, snatchers, territory, epilogue, NG+                                                                                                                              | Complete          |
| 4.5 Visual & Narrative               | Intro cinematic, dialogue poses, cat-person circuits, witness-gated events, chapter cards                                                                                                      | Complete          |
| 5. AI cat dialogue + proxy           | LLM personas, Cloudflare Worker proxy, scripted fallback, dist leak checks                                                                                                                     | Complete (v0.2.0) |
| 5.1 AI human dialogue                | Camille / Manu / Kish personas, named feeders (Rose, Ben), AI ambient bubbles, AI-sourced Camille beats 2-4                                                                                    | Complete (v0.3.0) |
| 5.1a Consolidated human bubbles      | All human-spoken dialogue renders in the floating bubble channel; Camille encounter beats are paired narrator (modal) + spoken (bubble)                                                        | Complete (v0.3.1) |
| 5.1b Beat-5 consent gate + greet cap | Humans freeze during encounter beats; beat 5 has a 10s player-consent window (approach Camille + Space to say yes); stationary Mamma Cat no longer traps cat-persons in endless greeting loops | Complete (v0.3.2) |
| 5b. Polish & Release                 | Playtesting, audio, PWA/offline, deployment                                                                                                                                                    | Not started       |

### What exists now

- 290x229 tile map (2 m per tile, north up) of the real Ayala Triangle Gardens, built from OpenStreetMap: the triangle inside Paseo de Roxas, Makati Avenue and Ayala Avenue, with its real walkways, buildings, underpasses, steps, pond, fountains and landmarks
- Mamma Cat player character with walk, run, crouch, and rest animations
- **Survival system:** hunger, thirst, and energy stats with environmental modifiers and collapse mechanics
- **Real water:** the PSE pond, the McMicking water-curtain pool and the Starbucks waterfall are drinkable all along their edges and never run out (Space beside the water). The colony cats, named story cats included, walk there now and then (a few times a day, at most four at once), drink a while (💧) and walk home, as the real ATG cats do (`CatWaterTrips`, `src/utils/waterEdge.ts`)
- **Colony cats have names:** greet one (Space beside it) and Mamma Cat learns its name, shown over it from then on. Names and looks stay with each cat across saves, and a cat lost to a snatcher doesn't come back
- **Food and water sources** scattered across the map with cooldowns and time-of-day availability
- **Day/night cycle** (dawn, day, evening, night) with smooth colour transitions and a game clock
- **8 named NPC cats** (Blacky, Tiger, Jayco, Jayco Jr, Fluffy, Pedigree, Ginger, Ginger B) with unique dispositions and multi-stage dialogue
- **Up to 24 background colony cats** with randomised appearances and behaviours
- **Guard NPC** that patrols and chases the player away from food scraps, plus **10 more security guards** at real posts (mostly passive, three friendly who stop and look at Mamma Cat, one more hostile; a smaller night shift)
- **Human NPCs** (joggers, feeders, dog walkers) following routes along the real walkways on time-of-day schedules
- **Park crowd:** walkers, office workers on breaks, tourists taking selfies, joggers, diners at the restaurant row and Starbucks, picnickers, bench sitters, lunch eaters and smokers, busiest at lunch and after work and almost gone at night (`AmbientCrowdSystem`, tuned in `src/data/ambient-roles.ts`). Anonymous park people drawn with PixelLab in the same style as Camille and Manu (`public/assets/sprites/crowd/`, packed by `scripts/build-crowd-sheets.py`, provenance in `scripts/pixellab-crowd.json`). People notice Mamma Cat (a heart, a curious look, a tourist's camera flash), and someone eating may toss her a morsel if she lingers — eat it with the interact key (+8 hunger, at most 4 a day; no story effects)
- **Traffic** on Paseo de Roxas, Makati Avenue and Ayala Avenue in their real lanes and directions, with morning and evening rush hours: sedans, taxis, jeepneys, P2P buses and motorbikes, drawn top-down with soft shadows and headlights after dusk (`TrafficSystem`), plus painted lane lines and zebra crossings (`RoadMarkings`)
- **Crossing the roads**: Mamma Cat (only her — people, snatchers and the other cats are still kept off the asphalt; the zombies below may step out but never cross) can cross every road and explore the whole map. Cars are never allowed to run her over: drivers who see her ahead brake calmly, one she darts out in front of screeches to a halt (tyre screech) and may honk until she moves, and if she sits, sleeps or collapses on the road they slow to a crawl and steer round her, borrowing the next lane only when it is clear. Motorbikes don't wait for her to settle: they squeeze past slowly through far smaller gaps, on either side, a wheel on the pavement if need be. She can slip under a stopped car; a car never moves while she is under or against it. The screech and horn are synthesised by `scripts/generate-sfx.mjs`
- **Easter egg — the city across Makati Ave (spoiler):** six swarms of 5 or 6 zombies loiter against the map's east edge (`ZombieSystem`, swarms gather round the map's `zombie_home` places). Green-tinted office workers who barely move until one spots Mamma Cat (128 px, 64 crouching, 192 running; never while she sleeps), which wakes its whole swarm and brings on the danger music; they shamble after her at a third of her walking pace and lunge when they reach her: she hisses and leaps clear. They may follow her out over Makati's northbound lanes, but never past the median; a car within about 2.5 m turns them back, and as drivers don't stop for them, a slow one gets knocked flat (tyre screech). It gets up after a few seconds and retraces its steps home
- **More easter eggs (spoilers):** the hidden letter and a lost plushie she can carry to Camille and Kish, Pedigree's buried collar, a balloon in a tree, six hidden kittens, a sunset over the skyline, a reflection at midnight, Blacky's 3am story, kittens being born, the developer's note, and the whole colony gathering to say goodbye once Mamma Cat says yes to Camille (`EasterEggSystem`; where and how each is found: `docs/Ayala_Easter_Eggs.md`; spots are map places `egg_*`)
- **Night lights:** lamp posts along the walks light warm pools on the ground from dusk to dawn (`NightLights`)
- **More park animals:** Cat cat and Mittens live together in the west colony and Ella the long-haired dachshund comes out with a dog walker whose walk passes them. The three are friends: they greet each other whenever they are near (hearts, and Ella tugs on her leash toward them), Ella greets Mamma Cat instead of barking, and the two cats are friendly to her from the start. PixelLab sheets in `public/assets/sprites/pets/` (layout in `src/data/pets.ts`, packed by `scripts/build-pixellab-extras.py`, provenance in `scripts/pixellab-extras.json`)
- **The street colony across Ayala Ave:** where the underpass comes up by the end of Legazpi St, three cats live on the pavement that the office and security guards look after: Simba, golden and fluffy, who spends his days sunning himself on a big rock in the middle of the walkway; Bantay; and Pandan. Their three little houses stand in a nook of the L.V. Locsin wall and count as shelter; their food bowl (filled at the dawn and dusk shift changes) and water bowl are real food sources Mamma Cat may share (map places `street_colony`, `cat_rock`, `cat_house`, `colony_bowl`; `ColonyDynamicsSystem.spawnStreetColony`). They're friendly from the start, and like other colony cats she learns their names by greeting them
- **Kish's wardrobe:** Kish wears her usual clothes on odd days and her other outfit on even days (`kishProfileForDay`; same girl, same behaviour)
- **Hunt and sniff** (`ForageSystem`, pure rolls in `src/utils/forage.ts`): every in-game day hides 24 seeded tells: beetles in the shrubs, crusts under benches at dawn, moths at the lamps at night, treasure buried under the trees. She notices one passing close (closer still crouched); Space with nobody to greet is a **sniff** (reveals what's near and draws a scent trail to the nearest thing beyond), Space beside a tell **paws** it, and disturbed earth takes three presses to **dig**. Finds come in common / uncommon / rare (at most one rare a day, never three days without one), score points and fill the Journal's **Field notes** and **Treasure box**. Hazards (garlic rice, cooked bones, toxic hedge berries, wild mushrooms, lilies) are sniffed and refused, never eaten, each with a "Real cats:" welfare line in the Journal. Forage tops up at most 20 hunger a day; the feeding stations stay the backbone. The day's tells are fixed by a run seed, so reloading doesn't re-roll them
- **Sundays (real calendar, device time)** (`SundaySystem`, `src/utils/realCalendar.ts`): from in-game Day 2, the **street market** on Paseo de Roxas stays open from Dawn through Evening (06:00–21:00 in-game). Guards begin clearing both Paseo carriageways at 03:00; once the last car leaves they place barriers and vendors put up their stalls before Dawn. Browsers, a busker, visiting cats, proximity greetings, vendors who shoo her off the fish, and seeded market finds remain through the day. At 20:30 a whistle starts pack-up; people and finds leave at 21:00 and guards lift the barriers before traffic returns at 21:30. Ayala Ave and Makati Ave keep their traffic. Continuing a daylight save restores the open market; cars still clearing the road delay setup safely. The Journal shows its current status and labels in-game hours. The **Sunday Lights** (17:00–23:00 in-game) light the trees round the Exchange Plaza fountain with a crowd and shows at 18:00, 19:00 and a 20:00 finale. From 10 Nov to 15 Jan it is the **Festival of Lights** (Christmas palette, parol stars on the lamps). The show music `sunday_lights.wav` is a generated placeholder (`scripts/generate-sfx.mjs`) for a licensed royalty-free track. Preview any day with `?sunday=1` (and `&season=xmas`); the market still starts on Day 2.
- **Curiosity loops** (`CuriositySystem`): cats pass on rumours that point at real places, once she has met them: Blacky warns her off the road east (the humans there "walk wrong"), Jayco says zombies and gives a true tip, and seeing them pays it off (persisted once per save). Tiger grumbles about a tabby slipping into the **empty shop** on restaurant row (map place `shop_window`): through its glass, day by day, a breathing box, kittens, then the volunteers' rescue note. Sit still beside one of the three friendly guards and, every couple of days, he tells her a story. The Journal keeps "Things I wonder about"
- **Dogs** that follow dog walkers, bark and lunge when the player gets close
- **Trust and reputation system** tracking global colony trust and per-cat relationships
- **Emote system** showing floating mood indicators above cats
- **Story chapters 1-3** with narration overlays triggered by trust, met-cat counts, and days survived
- **Colony journal** (J key) displaying known cats, trust levels, and colony statistics
- **Save/load system** using localStorage with auto-save and manual save from the pause menu
- **HUD** with stat bars, game clock, rest progress ring, pause menu, and contextual narration
- Camera zoom (2.5x) making Mamma Cat feel small in a large world
- Tree canopies on the overhead layer that render above the player
- **Story chapters 4-6** completing the full narrative arc from territory claiming through adoption
- **Territory system** at The Shops / Pyramid Steps with safe sleep, food proximity, and a home-base heart indicator
- **Camille encounter sequence** (5 encounters over multiple game days) building the human-cat relationship
- **Snatchers** (night threat) with detection radius, crouching/cover evasion, capture-reload mechanic for Mamma Cat, and a colony-cat capture sweep. Eligibility rule mirrors Mamma Cat's: any active cat is vulnerable unless sleeping near a shelter POI. Named cats can also be taken if caught napping unsafely, though they usually stay close to their home POIs
- **Colony dynamics** with 3 dumping events and fluctuating background population
- **Dumped pets are frightened house cats, not street cats** (`NewcomerCats`): bewildered by the traffic and the people, half of them stay low, keep still and creep slowly away; the rest bolt for the nearest cover (a shrub, or deep under a tree's canopy, where they can't be seen) and stay hidden until it has been quiet for a while. They shy from people, other cats and Mamma Cat on the move (crouching lets her come closer; sitting still doesn't scare them at all). Sitting with them, greeting them gently and the days passing settle them, but never faster than about three game days (alone, about a week); they give their name once half settled. Their state and home are saved (registry `COLONY_NEWCOMERS`) once she has seen them arrive, and settled they live on as ordinary colony cats where they settled. Greeting one while it's still frightened counts as comforting it
- **Centralized DialogueService** with `AIDialogueService` + `FallbackDialogueService` — named cats use AI lines when `VITE_AI_PROXY_URL` is set; story flags still come from scripted condition matching; **IndexedDB** stores up to 100 turns per cat (pruned automatically) with optional game-state snapshots
- **Cloudflare Worker** (`proxy/`) holds Deepseek/OpenAI keys and exposes `POST /api/ai/chat` — see [AI Dialogue Proxy](#ai-dialogue-proxy) below
- **Epilogue and end screen** with welfare information, links to CARA Philippines and @atgcats, and credits
- **New Game+** (cozy mode) unlocked after completing the story -- replay with full trust and territory
- **Phase 4.5:** Opening abandonment cinematic; NPC dialogue engagement with `speakerPose`-driven animations; Category A/B human behaviour (glances vs circuits); witness-gated dumping and snatcher narration; Camille encounter re-validation on delayed dialogue; chapter title cards + pause-menu chapter hint; `prefers-reduced-motion` support for decorative HUD/emote/intro tweens; gameplay radii centralised in `src/config/gameplayConstants.ts`
- **Mamma Cat 8-way movement** with north/south walk and run animations completing the movement set
- **Mamma Cat greeting action** -- press Space when no food or cat is in range to play a directional greeting animation (east/west sheets); non-interruptible for the ~1s play duration
- **Male jogger circuit** running a clockwise loop complementing the existing counter-clockwise female jogger
- **Collapse narrative consequences:** collapse triggers HUD narration, a global-trust penalty, and a lifetime collapse counter; recovery is witness-aware, awarding per-cat trust when a nearby friendly cat has line-of-sight. Total "times you've fallen" is surfaced in the colony journal footer once it is above zero
- **Snatcher life-stat counters:** lifetime "Times you've been snatched" (Mamma Cat captures) and "Cats lost to snatchers" (colony cats lost, named or background) surfaced in the colony journal footer alongside the collapse count, each row only appears once its counter is above zero. Colony-cat loss narrates _"A cat was here. Now it's gone."_ only when Mamma Cat is within range and has line-of-sight to the event
- **Dynamic colony population:** the colony total (shown in the journal) is now a real running count that includes named cats, Mamma Cat, and the unseen background. Dumping events add to it; snatcher captures subtract from it. A floor equal to the named roster + Mamma Cat prevents total narrative collapse. Once the total thins enough, the visible background roster shrinks with it so the world actually feels smaller after heavy losses

## How to Play

### Controls

| Input                               | Action                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Arrow keys / WASD                   | Move Mamma Cat                                                                                                               |
| Shift + direction                   | Run (2x speed, drains energy faster)                                                                                         |
| C (tap to toggle, or hold)          | Crouch / hide (slow, harder for threats to detect)                                                                           |
| Space (tap)                         | Interact -- context-sensitive: eat food, talk to nearby cat, or play Mamma Cat's greeting animation when nothing is in range |
| Space                               | Advance dialogue text                                                                                                        |
| Z (hold 2 seconds while stationary) | Rest / sleep -- restores energy over time                                                                                    |
| Any movement key, Space, or Z       | Wake up from rest                                                                                                            |
| J                                   | Open colony journal                                                                                                          |
| Tab (toggle)                        | Look around -- camera zooms out to survey the area, press again to return                                                    |
| Tab Tab (quick double tap)          | Whole map -- camera lets go of Mamma Cat and fits the full map in view; Tab or moving returns to her                         |
| Escape                              | Pause menu (Save Game, Colony Journal, Resume, Quit to Title)                                                                |

### Tips

- **Survival stats** (hunger, thirst, energy) are shown as bars in the top-left corner alongside the in-game clock. Keep them topped up by finding food sources, water, and safe resting spots around the park. Any pond, fountain pool or waterfall edge is drinkable.
- **Running** is costly -- it burns 2.5x the energy per metre of walking and makes her thirsty three times as fast (worse in the midday sun), so use it to escape threats, not for casual travel.
- **Crouching** near bushes or tree canopy makes Mamma Cat much harder for the guard to spot.
- **Resting** requires you to hold Z for 2 seconds while standing still. A progress ring appears so you know it's working. Energy restores faster in shade and even faster at designated safe spots.
- **Look around** (Tab) is useful for spotting food, water, threats, and other cats before committing to a direction.
- The **day/night cycle** advances automatically. Different food sources and NPC behaviours are tied to the time of day.
- **Trust** builds over time by spending time near cats, having conversations, and surviving days. Higher trust unlocks new dialogue and changes cat dispositions.
- The **colony journal** (J key) tracks cats you have met, their trust level (shown as hearts), and when you first encountered them.
- The game **auto-saves** at key story moments and safe rest spots. You can also save manually from the pause menu (Escape).

## Tech Stack

| Technology                                   | Version | Role                                           |
| -------------------------------------------- | ------- | ---------------------------------------------- |
| [Phaser 3](https://phaser.io)                | 3.90.0  | WebGL/Canvas 2D game engine, Arcade physics    |
| [Vite](https://vitejs.dev)                   | 8.x     | Build tooling, dev server, hot-reload          |
| [TypeScript](https://www.typescriptlang.org) | 6.x     | Language (strict mode)                         |
| [Vitest](https://vitest.dev)                 | 3.x     | Unit testing with V8 coverage                  |
| [pngjs](https://github.com/lukeapage/pngjs)  | 7.x     | Dev-only procedural tileset and map generation |

Maps are generated programmatically via Node.js scripts from OpenStreetMap data (not via the Tiled GUI), exported as Tiled-compatible JSON consumed by Phaser's tilemap loader.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 18
- npm (comes with Node.js)

### Install and Run

```bash
git clone <repo-url> ayala
cd ayala
npm install
npm run dev
```

Vite will start a dev server (default port 5173, or the next available port). Open the URL shown in the terminal.

### Production Build

```bash
npm run build
```

Output goes to `dist/` -- static files deployable to any host (Netlify, Vercel, S3, etc.).

### Preview Production Build

```bash
npm run preview
```

Serves the `dist/` folder locally to verify the production build before deploying.

## AI Dialogue Proxy

Named colony cats and named humans use LLM-backed dialogue when a proxy URL is configured. The proxy (`proxy/`, a Cloudflare Worker) forwards `POST /api/ai/chat` to DeepSeek (primary, `deepseek-flash` with thinking disabled) or OpenAI (fallback) using **server-held API keys only** — no secret ever ships to the browser. Scripted dialogue remains the automatic fallback if the proxy is unreachable, refuses the request, or the model returns malformed output.

The client reads `VITE_AI_PROXY_URL` at build time. In dev it is a relative path (`/api/ai/chat`) proxied by Vite to `wrangler dev` — effectively same-origin. In production the value depends on how the static site is hosted: on Cloudflare Pages (or any zone that routes `/api/*` → this Worker) it can stay relative; on GitHub Pages it must be the absolute Worker URL, because `*.github.io` cannot route a path to a Worker.

### One-time setup

1. Copy [.env.example](.env.example) to `.env` (no secrets; only `VITE_AI_PROXY_URL=/api/ai/chat` and provider preferences).
2. Copy `proxy/.dev.vars.example` to `proxy/.dev.vars` (gitignored) and paste real keys:

   ```bash
   DEEPSEEK_API_KEY=sk-...
   OPENAI_API_KEY=sk-...
   # Optional overrides — defaults are fine locally:
   # DEEPSEEK_MODEL=deepseek-flash
   # OPENAI_MODEL=gpt-4.1-mini
   # ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   # AI_DISABLED=1   # kill switch: every chat POST gets 503 ai_disabled
   ```

   A `DEEPSEEK_MODEL` line in an existing `.dev.vars` overrides the `deepseek-flash` default under `wrangler dev`; delete it if it still says `deepseek-chat`.

3. Install Worker deps once: `cd proxy && npm install`.

Without `VITE_AI_PROXY_URL`, the game runs scripted-only — identical to Phase 4 behaviour, zero network calls.

### Deploy to production

```bash
cd proxy
npx wrangler deploy --dry-run   # must list AI_RATE_LIMIT_BURST and AI_RATE_LIMIT_MINUTE under "Rate Limit"
npx wrangler deploy
```

**Deploy the Worker before the client.** A push to `main` publishes the client to GitHub Pages; the Worker ships only with `wrangler deploy`. When a change makes the client send more (this client sends up to `PROMPT_CHAR_BUDGET` = 28,000 characters; Workers before it reject anything over 12,000), run `wrangler deploy` first and merge after. An older Worker answers the larger requests with 400 `messages exceed size limit`, which the client does not retry, so every speaker with a long stored history falls back to scripted lines until the Worker is deployed.

The dry run is the only check that the rate-limit bindings ship: without them the Worker logs one warning and serves every request unlimited. `[[ratelimits]]` needs Wrangler 4.36+. The bindings don't show in the dashboard; watch for 429s in Workers Logs or `npx wrangler tail`.

Set secrets via the Cloudflare dashboard or `wrangler secret put DEEPSEEK_API_KEY` / `wrangler secret put OPENAI_API_KEY`. Set `ALLOWED_ORIGINS` to the exact `Origin` values the browser will send (e.g. `https://yourname.github.io` for GitHub Pages) — anything else gets a 403.

**Kill switch.** `npx wrangler secret put AI_DISABLED` with the value `1` makes every chat POST return 503 `ai_disabled`; the game stops calling for 5 minutes at a time and plays scripted lines. `npx wrangler secret delete AI_DISABLED` turns AI back on (any value other than `1` also leaves it on). Keep it a secret: a plain-text variable set in the dashboard is overwritten by the next `wrangler deploy`, because `wrangler.toml` does not set `keep_vars = true`.

Pick one of the two hosting shapes below and configure `VITE_AI_PROXY_URL` accordingly. After each production build, run `npm run verify:dist` to confirm no secret patterns leaked into `dist/`.

**Hosting shape A — true same-origin (Cloudflare Pages / own domain).** Bind the Worker to the same hostname as the static site, or add a route like `yourdomain.com/api/*` → this Worker. The browser calls `/api/ai/chat` same-origin — no preflight, no CORS. `.env.production` can keep the relative path.

**Hosting shape B — cross-origin (GitHub Pages).** `*.github.io` cannot route `/api/*` to a Worker, so the client must call the Worker on its own origin (e.g. `https://<name>-ai-proxy.<subdomain>.workers.dev/api/ai/chat`). This project ships a committed `.env.production` pointing at that URL; `ALLOWED_ORIGINS` on the Worker must include the Pages origin (`https://<you>.github.io`) so the CORS preflight returns 204 + the correct `Access-Control-Allow-*` headers. The Worker already implements this — see `proxy/src/worker.ts` and the Phase 5.1 notes in [WORKING_MEMORY.md](WORKING_MEMORY.md).

Symptom of a mis-set prod URL: the client logs `[AIDialogueService] Proxy returned HTML (404) instead of JSON — VITE_AI_PROXY_URL is likely misrouted` and drops to scripted dialogue. That warning means the POST hit the static host's 404 page, not the Worker.

### What the Worker enforces

Checks run in this order ([proxy/src/worker.ts](proxy/src/worker.ts)), so preflights, forbidden origins, unknown paths, wrong methods and kill-switch refusals never use up a rate-limit token.

1. CORS preflight and `ALLOWED_ORIGINS` (bare 403 for other origins), then route (404) and method (405).
2. Kill switch: `AI_DISABLED === "1"` → 503 `{"error":"ai_disabled","retryAfterSeconds":300}` + `Retry-After: 300`.
3. Per-IP rate limit: `AI_RATE_LIMIT_BURST` (10 per 10 s) and `AI_RATE_LIMIT_MINUTE` (30 per 60 s), keyed on `CF-Connecting-IP` with IPv6 grouped by /64 → 429 `{"error":"rate_limited","retryAfterSeconds":30}` + `Retry-After: 30`. If the bindings are missing it warns once and lets requests through; if a limiter throws it logs the error and lets the request through.
4. Raw body at most 65,536 bytes, else 413.
5. Shape: exactly one system message and it comes first, the last message is from the user, at most 202 messages and 32,000 content characters, `max_tokens` at most 256. Anything else is a 400.
6. Upstream call (15 s timeout → 504, other network failures → 502). DeepSeek requests carry `thinking: { type: "disabled" }`; OpenAI requests never do. Upstream errors come back with the provider's status and body.

The Worker's own refusals carry a **string** `error`; upstream provider errors are forwarded with an **object** `error`. `AIDialogueService` relies on that split: on `rate_limited` / `ai_disabled` it throws `AIProxyThrottledError`, does not try the other provider, and makes no AI calls until `retryAfterSeconds` has passed (30 s / 300 s by default). It fails over to the secondary provider on 401, 429, 500, 502, 503 and 504, and on upstream 400 / 404 / 422 with an object `error` (for example a retired model name), but not on the Worker's own validation errors.

### Settings the owner must change outside code

Per-IP limits do not cap total spend: one IP at 30 requests a minute and 32k characters is an upper bound of roughly $120–160 a day, there are no accounts, and a caller can ask for `"provider": "openai"` directly. The real ceiling is the provider caps:

- **OpenAI:** use a dedicated project; under Project settings → Limits set a monthly spend limit, enable "Enforce a hard limit", and add an alert below it. Enforcement is not instant.
- **DeepSeek:** there is no budget cap, only a prepaid balance. Keep it small and turn off auto top-up. An empty balance returns 402, which the client does not fail over on (players get scripted lines).
- **Optional Cloudflare WAF rate-limiting rule:** needs the Worker on a custom domain in a Cloudflare zone (e.g. `api.ayalacats.app`); WAF rules can't apply to `*.workers.dev`. Then set `workers_dev = false` and `preview_urls = false`, and update `VITE_AI_PROXY_URL` and `ALLOWED_ORIGINS`.
- Confirm the Workers plan: the Free plan's 100k requests a day per account is a crude global ceiling.

## AI Prompts & Character Personalities

Every request is **assembled per call**: a system message that rarely changes (persona, rules, output contract, relationship, memories), the conversation history as chat turns, and one final user message describing the current scene. The persona files are the single source of truth for character; everything else is injected in code so the contract stays consistent across cats **and humans**.

### Where things live

| Concern                                                      | File                                                                                                | Notes                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Prompt assembly (`buildSystemPrompt`, `buildMessages`)       | [src/services/AIDialogueService.ts](src/services/AIDialogueService.ts)                              | One request per `getDialogue()` call; `max_tokens` 220             |
| Persona markdown (one file per speaker, cats **and** humans) | [src/ai/personas/\*.md](src/ai/personas/)                                                           | Source of truth for character — edit these to change voice         |
| Persona → speaker map                                        | [src/ai/personas/index.ts](src/ai/personas/index.ts)                                                | `AI_PERSONAS` (canonical) + `CAT_PERSONAS` alias                   |
| What an NPC knows, and the stored record shape               | [src/services/NpcContext.ts](src/services/NpcContext.ts)                                            | `loadNpcContext`, `toConversationEntry`, `buildConversationRecord` |
| "Story so far" facts, human relationship stage               | [src/utils/npcStoryFacts.ts](src/utils/npcStoryFacts.ts)                                            | Read from the save-backed registry                                 |
| Scripted anchors (trust, story flags)                        | [src/data/cat-dialogue.ts](src/data/cat-dialogue.ts)                                                | Authoritative `trustChange` + `event` — AI never controls these    |
| Named humans' first / return lines                           | [src/data/human-dialogue.ts](src/data/human-dialogue.ts)                                            | Each plays once, before AI is asked                                |
| Human encounter side-effects (Camille beats 1-5)             | [src/systems/CamilleEncounterSystem.ts](src/systems/CamilleEncounterSystem.ts) (`runEncounterBeat`) | Registry / chapter / stats side-effects — AI never controls these  |

### AI-backed speakers

| Speaker                                                            | Type  | Where AI fires                                 |
| ------------------------------------------------------------------ | ----- | ---------------------------------------------- |
| Blacky, Tiger, Jayco, Fluffy, Pedigree, Ginger, Ginger B, Jayco Jr | cat   | Space-engaged dialogue                         |
| Camille                                                            | human | Ambient greeting bubbles + encounter beats 2-4 |
| Manu, Kish                                                         | human | Ambient greeting bubbles                       |
| Rose, Ben (named feeders)                                          | human | Ambient greeting bubbles while feeding         |

There is no fixed history window. Every stored exchange with the speaker goes in, oldest first, and `buildMessages` drops the oldest pairs only while the whole request (system message included) is over `PROMPT_CHAR_BUDGET` (28,000 characters; the Worker rejects anything over 32,000). When pairs are dropped, the oldest remaining turn starts with "(Earlier meetings are not shown.)".

### Prompt structure

**System message** — `buildSystemPrompt(personaMarkdown, request)`. Per-turn scene facts are kept out of it, so the system message plus history stays a cacheable prefix (DeepSeek caches prefixes automatically).

1. `## Persona Identity` and `## Your Persona` — who is speaking, then the persona markdown verbatim.
2. `## Conversational Style` — species-specific. Cats: natural plain English, never cat-speak; 1–3 lines of one short sentence, under ~90 characters each; Mamma Cat is a cat who never speaks words, so never claim she told you anything. Humans: speaking aloud to a cat who can't answer; plain speech, no baby-talk, under ~60 characters a line; no re-introductions once there is history; no claims of giving her anything unless the story beat says so.
3. `## Conversation Principles` and `## Guardrails` — only reference events in the history, the story-so-far facts and the memory lists; never quote elapsed time or counts; never scold a repeat visit; never mention game mechanics.
4. `## Output Format` — the JSON contract (`lines` 1–3, `speakerPose`, `emote`, optional `narration`, optional `memoryNote`) and an example line for the speaker's species.
5. `## Relationship Context` — stage 1–4. Cats: `calculateRelationshipStage` (talk count, trust, memories). Humans: `humanRelationshipStage` — Camille by completed encounters, everyone else by the number of distinct game days in their records (0 → 1, 1–2 → 2, 3–5 → 3, 6+ → 4).
6. `## First Conversation` (only when the caller passes `isFirstConversation: true`, never for an encounter beat) or `## Conversation Continuity`.
7. Memories, split by source: `## What has happened between you (game record — true)` for scripted memories and `## Your own impressions of Mamma Cat (guesses; may be wrong …)` for the model's own notes, or "No durable memories are listed yet."

**Chat turns** — `buildMessages(request, systemPrompt)`. Each stored exchange becomes a user turn, `[Day N, phase]` plus a short game-authored sentence about Mamma Cat (e.g. `[Day 4, evening] Mamma Cat came over to talk. She was very hungry.`), and an assistant turn with what the speaker said. Then one **final user message**:

- `## Current scene (facts — follow these)` — speaker, species, target, chapter, time of day, game day, trust toward Mamma Cat (**cats only**; humans have no per-human trust), Mamma Cat's condition in words (`describeMammaCatCondition`; raw stats are never sent), cats she knows by name, and `Story so far:` bullets from `gameState.recentEvents`.
- `## Encounter context (game time only)` from `conversationRecency` (omitted on a first conversation).
- `## Story beat context` for Camille beats 2–4: the objective, "Reply with exactly N line(s), in order", and the narrator text each line is said beside (`encounterBeat.slots`).
- `## Final Instruction` — `[Day N, phase] Mamma Cat comes over to you / passes close by / is here with you.` from `request.interaction` (`talk` / `ambient` / `beat`). Ambient requests must answer with exactly one line under 60 characters.

**Story-so-far facts** (`buildNpcStoryFacts`), so speakers only mention progress the save actually holds:

| Speaker         | Facts                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| Every named cat | "Mamma Cat has met Camille…" once encounter 1 has happened                                  |
| Fluffy          | When Manu last came by (today / yesterday / N days ago)                                     |
| Camille         | One line per completed encounter (`CAMILLE_ENCOUNTER_MEMORY`) and the day of the last one   |
| Manu            | Has walked the evening rounds with Camille (encounter 2+); whether he has seen Fluffy today |
| Kish            | Has come along on the evening rounds (encounter 3+)                                         |
| Rose, Ben       | None                                                                                        |

Per-request knobs live next to `getDialogue()`:

- `temperature`: `0.6` for speakers in `HARSHER_TEMP_SPEAKERS` (tighter, colder), `0.8` for the rest.
- `max_tokens`: `220` (the Worker caps it at 256).
- `timeoutMs`: one deadline for the whole call, both providers included: 8 s for engaged cat dialogue, 3.5 s for human ambient bubbles, 5 s for Camille beats 2–4. The secondary provider is tried at most once, on the failures listed under [What the Worker enforces](#what-the-worker-enforces), and skipped when less than 750 ms remain. Timeouts, caller aborts and proxy refusals never fail over.
- `parseAIJson` rejects any line over 160 characters (the scripted fallback runs instead) and drops a `memoryNote` unless its kind is `identity`, `preference`, `trait` or `relationship`.

### What NPCs remember

`ConversationStore` (IndexedDB `ayala_conversations`) keeps two things per speaker:

- **Conversation records**, the newest 100. `lines` is exactly what the player saw, never the raw AI payload, and `mammaCatTurn` is a short game-authored sentence about what Mamma Cat did. `kind` is `talk` (engaged cat dialogue, the only kind that advances a cat's scripts), `ambient` (a named human's bubble aimed at Mamma Cat) or `story` (rumours, egg lines, Jayco's offer of the steps, Camille's beats 2–5 and their outcome, "Kish, slow down.", the plush and balloon reactions). Rows from older builds have no `kind` and are read through `recordKind`.
- **Memories**, at most 20. Scripted ones are milestones only (a cat's first meeting, Tiger warming up, Camille reading the letter); the rest are the model's `memoryNote` impressions, kept for cats and humans. Pruning drops legacy `_return` filler first, then the oldest AI impressions, then the oldest scripted memories.

`loadNpcContext(speaker, now)` reads all of it. Scripted progression and "already played" checks use every record; the prompt sees only records that exist at the current game time (so a restored older save doesn't leak the abandoned timeline) and only memories formed by the current game time (older memory rows without a timestamp fall back to their game day). A cat talk is stored once the player has seen its last line, even if they then close the box or walk off; closing before the last line stores nothing and awards nothing. Greetings a human aims at a nearby cat are not stored.

### Fallback rule (important)

Every AI path has a scripted safety net. If the LLM is slow, unreachable, throttled by the proxy, or returns malformed JSON:

- **Engaged cat dialogue** → an unplayed scripted line from `cat-dialogue.ts` always plays first, before AI is asked. If AI then fails and the matching script has already been shown, the cat gets a non-verbal placeholder for its pose (`*Blacky blinks slowly at you.*`, `*Tiger's ears flatten.*`, …) instead of a replay. The placeholder still applies that script's `event` and `trustChange` but is not stored as something the cat said.
- **Human ambient bubbles** → an unplayed line from `human-dialogue.ts` plays first (`*_first` on a first meeting, `*_return` only once there is a record from an earlier game day); otherwise AI; on failure, a line from the human's scripted pool (`catPersonGreetings`).
- **Camille encounter beats 2–4** → render the authored `steps[i].spoken` line for that step (narrator line is unchanged either way).
- **Camille beats 1 and 5** → always authored, never LLM-sourced. Beat 1 is pure narrator POV; beat 5 is the chapter-6 handoff and must run byte-for-byte.

No LLM response is allowed to mutate trust, registry keys, chapter state, or story flags. That split is enforced in `AIDialogueService.getDialogue()` (`trustChange` and `event` are always taken from `matchScriptedResponse`) and in `CamilleEncounterSystem.runEncounterBeat` (all registry / stats / emote side-effects live in `onComplete`, independent of dialogue source).

### What the persona markdown controls (and what it doesn't)

The persona drives **voice and behaviour only**. Game-state progression stays deterministic.

| Controlled by persona markdown                                              | Controlled by scripted anchors                                  |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `lines` — what the speaker actually says                                    | `trustChange` — trust deltas applied to speaker and colony      |
| `speakerPose` — friendly / wary / hostile / sleeping / curious / submissive | `event` — story flags, chapter progression, Camille triggers    |
| `emote` — heart / alert / curious / sleep / hostile / danger                | HUD narration, stats restore, chapter-6 handoff (Camille beats) |
| `narration` — optional body-language line                                   | Milestone memories and "Story so far" facts                     |
| `memoryNote` — optional impression of Mamma Cat (never an event)            | —                                                               |

### Persona markdown format

Every persona (cat or human) follows the same seven-section structure so prompts stay comparable:

```markdown
# <Name>  (the exact in-game name; the model says it out loud)

## Identity

- Species (cat with sex / human), age, appearance, usual spot (one-line bullets)

## Backstory

Short paragraph — what do they remember, where do they usually sit/stand

## Personality

- 3 bullets, behaviour-led (not adjectives alone)

## Speech Style

- Length rules ("one sentence per line, two at most")
- Plain English for everyone, no cat-speak; humans speak plainly, no baby-talk
- Sample lines marked "tone only, never copy"

## Knowledge

- What they know about the park, humans, threats, and 2–3 named colony cats (keep each relationship consistent across both files)
- Anything that depends on story progress is gated on the story facts ("names her only once the story facts say Mamma Cat has met her")

## Relationship to Mamma Cat

- She answers with meows and blinks, never words; never claim she told you anything
- How they treat her at low vs high trust (cats) or as the history grows (humans)

## Rules of Engagement

- When to approach / retreat; what warms them, what cools them
- Never repeat a tip or story already in the history
```

[tests/ai/personaCanon.test.ts](tests/ai/personaCanon.test.ts) checks the title, the seven headings in order, a 2,400-character cap (the file is sent with every request for that speaker), the "meows and blinks, never words" line, and that no persona presumes an absence ("Haven't seen you in a while"): only the encounter context in the prompt may raise one. Key behaviour to the story facts and the conversation history, not to counts the model can't see.

See [src/ai/personas/blacky.md](src/ai/personas/blacky.md) (cat) and [src/ai/personas/camille.md](src/ai/personas/camille.md) (human) as canonical examples.

### Camille encounter beats (paired narrator + spoken)

Camille's 5-encounter story arc is driven by **paired steps**. Each step has two surfaces that advance together on Space:

- `narrator` → modal dialogue box (Mamma Cat's POV, scene description)
- `spoken` → floating bubble above Camille's head (what she actually says aloud)

This keeps all human-spoken dialogue in the same visual channel as ambient greetings. The LLM only produces `spoken` lines; narrator is always authored and deterministic.

| Beat                            | Narrator source              | Spoken source                                                | Notes                                                     |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| 1 — First sighting              | Scripted (HUD narration)     | —                                                            | Pure interiority, no bubble                               |
| 2 — Places a treat              | Scripted `steps[i].narrator` | AI (`encounterBeat.n = 2`) → falls back to `steps[i].spoken` | AI lines replace authored spoken positionally             |
| 3 — Slow blink                  | Scripted `steps[i].narrator` | AI (`encounterBeat.n = 3`) → falls back to `steps[i].spoken` | Step 2 is narrator-only by design (Mamma Cat's memory)    |
| 4 — First touch                 | Scripted `steps[i].narrator` | AI (`encounterBeat.n = 4`) → falls back to `steps[i].spoken` | Objective doesn't mention Kish (she may be off-screen)    |
| 5 — Carrier / chapter-6 handoff | Scripted `steps[i].narrator` | Scripted `steps[i].spoken`                                   | Never AI; Camille still gets a bubble for her asking line |

The paired data lives in [src/data/camille-encounter-beats.ts](src/data/camille-encounter-beats.ts); `CamilleEncounterSystem.playPairedBeat` drives the sequence using `DialogueSystem`'s `onLineShown` + `onHide(completed)` hooks to keep the modal and bubble in lockstep. Hooks tear down the persistent bubble on every exit path (completion, Space-past-end, backdrop click, close button).

- **AI request.** `encounterBeat.slots` (from `beatSpokenSlots`) carries the narrator text of each step that has a `spoken` line, so the model writes exactly one line per slot.
- **Witness gate.** A beat plays only if `canRunBeatNow()` still holds after its 8–12 s delay and again when the AI reply arrives: Camille active, visible and not leaving, evening, within `CAMILLE_ENCOUNTER_DIST` with line of sight, no other dialogue open, input not frozen, game not paused. Otherwise it re-arms (`pendingEncounter = n`) and nothing is stored.
- **Re-arm vs complete.** `playPairedBeat` refuses to open over another modal and the caller re-arms. Closing a beat before its last line re-arms it (beat-5's question included); reading to the end never does.
- **Memory.** On completion, the spoken lines whose bubble actually rendered are stored under Camille as a `story` record, with `CAMILLE_ENCOUNTER_MEMORY[n]` as Mamma Cat's side. Beat 5's question, accept line and timeout line are stored the same way.
- **Beat 5 accept.** Input freezes at the accept itself; the journey waits while another dialogue is open instead of being dropped.
- **Beat 5 staging (ATG-009).** On her last visit Camille never adopts a care visit already on its rounds: she comes in through the underpass carrying a pet carrier (`public/assets/sprites/pet_carrier.png`, PixelLab; held at her side, set down beside her while she crouches). As soon as she's in view (not under a tree) and nothing else holds the screen, `GameScene.storyShot` freezes Mamma Cat and glides the camera to Camille for `CAMILLE_ARRIVAL_SHOT_HOLD_MS`, then back; the encounter can't arm until this shot has played. If the Complete Colony Gathering is owed, word then spreads through the colony (narration and a ripple of `!` over the cats she knows, nearest Camille first). After the accept line Camille stays crouched beside her while the colony gathers, and the journey starts once the camera is back in close; Mamma Cat walks into the carrier, and Camille picks it up and goes. Snatchers leave her alone from the yes onward (`isLeavingWithCamille`). The beat-5 text is unchanged.

Tweak the `objective` field to change the LLM's emotional target for a beat (don't put a line count in it; the slot instruction sets that); tweak `steps[i].spoken` to change the scripted fallback line that plays when the LLM is unavailable.

### Human ambient bubbles (throttling)

When a cat person (Camille, Manu, Kish, Rose, Ben) gets within greet range of Mamma Cat or a named colony cat:

- **Per-human cooldown:** 30s between AI-sourced bubbles for that specific human. During the cooldown, scripted bubbles still fire from the existing pools so the world does not fall silent.
- **Global single-flight:** at most one AI ambient bubble may be in flight at any time across all humans. A second proximity event falls through to scripted.
- **Budget:** 3.5 s `timeoutMs` for the whole call. Anything slower renders the scripted line.
- **Only Mamma Cat gets AI.** A greeting aimed at a nearby cat is always scripted (a pool line, or Camille's line for that cat) and is not stored; lines aimed at Mamma Cat (AI, scripted or pool) are stored as `ambient` records.
- **Held for story moments:** Camille, Manu and Kish don't greet while a Camille beat is waiting on its delay or AI request, nobody greets while input is frozen (Camille's arrival shot, and from the beat-5 yes through the pickup), and opening a beat aborts any in-flight ambient AI request.
- **Re-checked on arrival:** if, when the line arrives, the human is inactive, out of range, paused for a beat, held as above, or the request was aborted, nothing renders and nothing is stored.
- **Layout:** bubbles wrap at `HUMAN_BUBBLE_WRAP_PX` (160 world px) and grow upward from just above the head.

The cooldown and budget live as `HUMAN_AI_BUBBLE_COOLDOWN_MS` / `HUMAN_AI_BUBBLE_TIMEOUT_MS` in [src/systems/HumanPresenceSystem.ts](src/systems/HumanPresenceSystem.ts).

### Editing or adding a character

**Editing voice.** Edit the `.md` file. No code change, no rebuild config. Vite hot-reloads the raw import and the next turn uses the updated markdown — earlier turns in history still reflect the old voice (they're replayed from IndexedDB).

**Adding a new AI-backed cat.**

1. Create `src/ai/personas/<slug>.md` using the seven-section format above.
2. Register it in [src/ai/personas/index.ts](src/ai/personas/index.ts) with the `?raw` import, keyed by the **exact** `NPCCat.npcName` set in [GameScene.ts](src/scenes/GameScene.ts).
3. Add the expected key to [tests/ai/personas.test.ts](tests/ai/personas.test.ts) so the persona file is guaranteed to load; the file must also pass [tests/ai/personaCanon.test.ts](tests/ai/personaCanon.test.ts).
4. If the cat should read as colder or more clipped, add the name to `HARSHER_TEMP_SPEAKERS` in [AIDialogueService.ts](src/services/AIDialogueService.ts) to drop their temperature to `0.6`.
5. Add scripted anchor entries to [src/data/cat-dialogue.ts](src/data/cat-dialogue.ts) for any trust deltas or story events — AI alone cannot create them.

**Adding a new AI-backed human.**

1. Create `src/ai/personas/<slug>.md` using the seven-section format (Identity states `Species: human, ...`).
2. Register in `src/ai/personas/index.ts` — key by the exact `HumanNPC.identityName`.
3. Wire `identityName` on the `HumanConfig` so the `HumanNPC` instance links to the persona. For named types (`camille` / `manu` / `kish` / `ben`) the default identity name is auto-derived; for anonymous types (`feeder`) pass `identityName: "Rose"` etc. explicitly.
4. If they're involved in an encounter beat, extend `CAMILLE_ENCOUNTER_BEATS` (or add a sibling table) in [src/data/camille-encounter-beats.ts](src/data/camille-encounter-beats.ts) with paired `{ narrator, spoken? }` steps, and route the beat through `CamilleEncounterSystem.runEncounterBeat` / `playPairedBeat` (passing `slots: beatSpokenSlots(steps)`) so side-effects stay deterministic and the spoken bubble renders above the right speaker. Persist what was shown through `HumanPresenceSystem.recordHumanLines` as a `story` record.
5. If they should know about story progress, add their facts to `buildNpcStoryFacts` in [src/utils/npcStoryFacts.ts](src/utils/npcStoryFacts.ts); optionally add first / return lines to [src/data/human-dialogue.ts](src/data/human-dialogue.ts).
6. Extend [tests/ai/personas.test.ts](tests/ai/personas.test.ts) with the new key.

### Tuning tips

- **Too rambly?** Reinforce the "one sentence per line, two at most" rule in the persona's `Speech Style`. `max_tokens` 220 is the hard ceiling, and `parseAIJson` rejects any line over 160 characters.
- **Out of character?** Tighten `Personality` and `Rules of Engagement` with concrete do/don't bullets; persona markdown is prompt-weight, so specific beats abstract.
- **Ignoring the scene?** The `## Current scene` block in the final user message already surfaces chapter / trust (cats) / Mamma Cat's condition / story facts; if you want the speaker to react to more, extend `DialogueRequest.gameState` in [DialogueService.ts](src/services/DialogueService.ts) and add a line to `buildCurrentTurn` in AIDialogueService.ts.
- **Inventing shared history or story progress?** The model may only use the history, the story facts and the memory lists. Put anything that depends on progress into `buildNpcStoryFacts` and gate the persona on it, rather than stating it in the persona.
- **Camille encounter beat feels off?** Edit the `objective` string in `CAMILLE_ENCOUNTER_BEATS` — that's the brief the LLM sees under `## Story beat context`.
- **Humans sound too formal?** `HUMAN_EXAMPLE` in AIDialogueService.ts deliberately shows one short, warm sentence. Adjust it there or tighten the persona's `Speech Style` with concrete examples.
- **Breaking JSON?** `parseAIJson` strips markdown fences and validates enums; on parse failure `FallbackDialogueService` delivers the scripted line instead, so a malformed reply degrades gracefully rather than crashing.

## Local Development & Testing

The repo ships two npm projects — the game (root) and the Worker (`proxy/`). Tests and dev servers for each are separate.

### Unit tests (fast fail, run first)

```bash
npm test            # Vitest: game systems, AIDialogueService, FallbackDialogueService, personas, ConversationStore
npm run test:proxy  # Vitest (in proxy/): origin check, validation, timeout paths, rate limits, kill switch
```

### Static-bundle secret leak check

```bash
npm run build
npm run verify:dist
```

`check-dist-leaks.mjs` greps `dist/` for `sk-...`, `DEEPSEEK_API_KEY`, and `OPENAI_API_KEY`. CI runs this automatically after `npm run build` in [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml).

### Run game + proxy together (two terminals)

Terminal A — **Worker**:

```bash
npm run dev:proxy   # wrangler dev on http://127.0.0.1:8787
```

Terminal B — **Vite**:

```bash
npm run dev         # http://localhost:5173
```

Vite's `server.proxy` in [vite.config.ts](vite.config.ts) forwards `/api/ai/chat` → `127.0.0.1:8787`, so dev always uses the relative path in `.env`. Production may use the same relative path (hosting shape A) or an absolute Worker URL (hosting shape B) via `.env.production` — see [AI Dialogue Proxy](#ai-dialogue-proxy) above.

### Smoke-test AI dialogue in the browser

**Engaged cat dialogue.** Approach one of the **eight AI cats** (Blacky, Tiger, Jayco, Jayco Jr, Fluffy, Pedigree, Ginger, Ginger B) and press **Space**. Verify:

| Check                                                  | Where to look                                              |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| 400ms "thinking" curious emote if the model is slow    | Above the engaged cat                                      |
| Lines feel in character (plain English, short)         | Dialogue box                                               |
| First-meeting trust, indicator, registry all fire once | Journal (J key)                                            |
| Turn persisted to IndexedDB                            | DevTools → Application → IndexedDB → `ayala_conversations` |
| Second conversation references the first               | Re-approach the same cat                                   |

Once a cat's unplayed scripted lines are used up (first meetings and other authored beats play without AI), each Space on it should produce one `POST /api/ai/chat` with status **200** in DevTools → Network. Body shape: `{ provider, messages, temperature, max_tokens }`; the system message has no `## Current scene` block, the last user message does. No cat should claim Mamma Cat said anything.

**Human ambient bubbles.** Walk near **Camille / Manu / Kish** (evening Chapter 5+) or **Rose / Ben** (dawn/evening feeder circuit). Verify:

| Check                                                                                       | Where to look                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Bubble appears within ~3.5s of proximity                                                    | Floating text above the human                                            |
| Line reflects their persona (Rose warm Tita voice, Ben gruff one-liner, Kish excited, etc.) | Bubble contents                                                          |
| Same human does **not** fire another AI bubble for 30s                                      | DevTools → Network (no repeat `/api/ai/chat`)                            |
| Scripted line still fires during cooldown when approaching again                            | Bubble contents (shorter, from pool)                                     |
| When Worker is stopped, scripted fallback fires within 3.5s                                 | Bubble still appears; console shows `AI failed; using scripted fallback` |

**Camille encounter beats 2–5 (paired surfaces).** Progress to Chapter 5 and trigger a Camille encounter (one per eligible evening). Verify:

| Check                                                                                     | Where to look                  |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| Narrator POV appears in the modal dialogue box at the bottom                              | Modal text                     |
| Camille's spoken line appears as a bubble **above her head**, not in the modal            | Floating bubble                |
| Pressing Space advances **both** the modal and the bubble to the next pair                | Modal + bubble                 |
| Dismissing the modal (backdrop click / x) tears down the current bubble too               | No orphan bubble after dismiss |
| Beat 1 is narrator-only in the HUD; Camille has no bubble for beat 1                      | HUD narration                  |
| Beat 5 still plays byte-for-byte when Worker is stopped (fully scripted)                  | Modal + bubble                 |
| `CAMILLE_ENCOUNTER` registry key increments exactly once per beat, even on LLM failure    | DevTools → saved state         |
| Closing a beat before its last line replays it on the next approach; finishing it doesn't | Next approach to Camille       |

For beats 2–4, one `POST /api/ai/chat` fires per beat (Camille persona, `encounterBeat.n` in the prompt). Kish's "Kish, slow down." line also renders in the same bubble style — not as a bare text overlay.

### Test the fallback paths (do not skip)

- **AI down, scripted fallback.** Stop the Worker (Ctrl+C in Terminal A) and talk to any named cat. Within the 8 s budget the scripted line from `cat-dialogue.ts` fires, or, if that cat's matching line has already played, a non-verbal placeholder such as `*Blacky blinks slowly at you.*` (its trust/story effects still apply; it isn't stored). Console logs `[Dialogue] AI failed; using scripted fallback` from [FallbackDialogueService](src/services/FallbackDialogueService.ts).
- **No proxy configured at all.** Comment out `VITE_AI_PROXY_URL` in `.env`, restart Vite. Zero AI network calls — scripted-only.
- **Provider retry.** Put a bad `DEEPSEEK_API_KEY` in `proxy/.dev.vars` and restart `dev:proxy`. DeepSeek 401s; the client retries with `provider: "openai"` automatically. Two POSTs in Network. An upstream 400 / 404 / 422 with an object `error` (e.g. DeepSeek rejecting an unknown `DEEPSEEK_MODEL`) fails over the same way.
- **Kill switch.** Add `AI_DISABLED=1` to `proxy/.dev.vars` and restart `dev:proxy`. The next AI request gets 503 `ai_disabled`, a scripted line plays, and the game sends no further `/api/ai/chat` POSTs for 5 minutes (one POST, no OpenAI retry). Remove the line, restart, and reload the page to clear the client's cool-down.
- **Rate limit.** `wrangler dev` simulates the rate-limit bindings in memory. Twelve quick requests from the shell should show ten 400s (the empty body fails validation after the limiter) and then 429s:

  ```bash
  for i in $(seq 12); do curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8787/api/ai/chat \
    -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' -d '{}'; done
  ```

  In the game a 429 pauses AI calls for 30 s; players get scripted lines meanwhile.

### Reset conversation memory between tests

DevTools → Application → IndexedDB → right-click `ayala_conversations` → Delete database, then reload.

### Pre-push checklist

```bash
npm test && npm run test:proxy && npm run build && npm run verify:dist
```

All four must pass. CI runs these on every push and PR to `main`, so green locally = green on GitHub.

### Common gotcha

If you want to test the browser against a **deployed** Worker (not `wrangler dev`), `ALLOWED_ORIGINS` on the Worker must include `http://localhost:5173`, otherwise the Worker returns **403 forbidden origin**. Local `.dev.vars` defaults already allow it — this only bites once you deploy.

## Project Structure

```
ayala/
├── docs/                                # Design documents and phase briefs
│   ├── Ayala_GDD_v0.1.md              #   Game design document
│   ├── Phase1_Brief_Phaser3.md        #   Phase 1 plan
│   ├── Phase1_5_Visual_Polish_Brief.md #   Phase 1.5 plan
│   ├── Phase2_Core_Mechanics_Brief.md  #   Phase 2 plan
│   ├── P2_Controls_Update_Spec.md     #   Controls spec
│   ├── Phase3_Social_Story_Brief.md   #   Phase 3 plan
│   ├── Phase4_Camille_Endgame_Brief.md #   Phase 4 plan
│   └── _generated/                     #   Tool-generated doc snapshots
│
├── public/assets/                       # Static game assets (served as-is)
│   ├── sprites/                        #   Character spritesheets
│   │   ├── mammacat.png               #     Player (32x32 frames, 8x10 grid)
│   │   ├── blacky.png                 #     NPC cat
│   │   ├── tiger.png                  #     NPC cat
│   │   ├── jayco.png                  #     NPC cat
│   │   ├── fluffy.png                 #     NPC cat (also used as placeholder)
│   │   ├── guard.png                  #     Guard / human NPCs (64x64 frames)
│   │   ├── girl.png                   #     Jogger spritesheet (150x85 frames)
│   │   ├── dogwalker.png              #     Dog walker spritesheet (50x45 frames)
│   │   ├── SmallDog.png               #     Dog spritesheet (32x32 frames)
│   │   ├── BrownDog.png               #     Dog spritesheet (32x32 frames)
│   │   ├── WhiteDog.png               #     Dog spritesheet (32x32 frames)
│   │   ├── vehicles.png / .json       #     Top-down traffic + story cars atlas (generated)
│   │   ├── ginger-IDLE.png            #     Ginger cat strip (64x64 frames)
│   │   ├── ginger-WALK.png            #     Ginger cat strip
│   │   ├── ginger-RUN.png             #     Ginger cat strip
│   │   └── Black-*.png                #     Additional black cat animation strips
│   ├── tilemaps/
│   │   └── atg.json                    #   290x229 Tiled JSON map, 2 m/tile (generated from OSM)
│   └── tilesets/
│       └── park-tiles.png              #   40-tile textured tileset (generated)
│
├── scripts/                             # Dev-time asset generators + CI helpers (Node.js)
│   ├── generate-tileset.mjs            #   Generates park-tiles.png + tile-indices.json
│   ├── generate-map.mjs               #   Generates atg.json from the OSM extract + PLACES table
│   ├── generate-vehicles.mjs           #   Generates the top-down vehicles.png + vehicles.json atlas
│   ├── tile-indices.json               #   Named tile ID map (generated output)
│   ├── fetch-osm.mjs                   #   Pulls the OpenStreetMap extract (Overpass → GeoJSON)
│   ├── atg-osm.geojson                 #   Saved OSM extract of ATG (© OpenStreetMap contributors)
│   ├── atg-stamps.json                 #   Tree/plant stamps (trees-pale, plants) reused by the generator
│   ├── render-map.mjs                  #   Renders atg.json to a PNG overview for review
│   └── check-dist-leaks.mjs            #   CI: fail if secret-like patterns in dist/
│
├── src/                                 # Game source (TypeScript)
│   ├── main.ts                         #   Entry point -- creates Phaser.Game
│   ├── config/
│   │   ├── GameConfig.ts               #   Resolution, physics, scenes, scaling
│   │   └── gameplayConstants.ts        #   Shared gameplay radii, witness distances, input timings
│   ├── ai/
│   │   └── personas/                   #   Markdown LLM personas (?raw) for named characters (cats and humans)
│   ├── data/
│   │   └── cat-dialogue.ts             #   Named cat dialogue scripts (condition/response data)
│   ├── registry/
│   │   └── storyKeys.ts                #   Typed registry keys for story/endgame flags
│   ├── utils/
│   │   ├── colonySpawn.ts              #   Pure helpers for dynamic COLONY_COUNT (visible-spawn derivation, floored decrement) — unit tested
│   │   ├── dialoguePoseAnim.ts         #   Maps SpeakerPose tones to NPC animation rows
│   │   ├── lifetimeCount.ts            #   Defensive registry reader for lifetime life-stat counters (unit tested)
│   │   ├── lineOfSight.ts              #   Pure raymarch through tile collision for LOS checks
│   │   ├── mammaCatCondition.ts        #   Mamma Cat's stats in words for NPC prompts
│   │   ├── npcStoryFacts.ts            #   "Story so far" facts + human relationship stage for NPC prompts
│   │   └── snatcherSpawnLogic.ts       #   Pure nightly spawn decision logic (unit tested)
│   ├── scenes/
│   │   ├── BootScene.ts                #   Asset preloading
│   │   ├── StartScene.ts               #   Title screen, new/continue/NG+
│   │   ├── GameScene.ts                #   Main game loop (~3900 lines)
│   │   ├── HUDScene.ts                 #   Overlay: stats, dialogue, pause, narration
│   │   ├── JournalScene.ts             #   Colony journal overlay
│   │   └── EpilogueScene.ts            #   End-game sequence with credits and welfare links
│   ├── services/
│   │   ├── DialogueService.ts          #   Dialogue interface + scripted + AI + fallback wiring
│   │   ├── AIDialogueService.ts        #   Proxy-backed LLM dialogue + JSON parse
│   │   ├── FallbackDialogueService.ts  #   AI then scripted fallback
│   │   ├── NpcContext.ts               #   Loads an NPC's records + memories; builds stored records
│   │   └── ConversationStore.ts        #   IndexedDB conversation history + NPC memories
│   ├── sprites/
│   │   ├── BaseNPC.ts                  #   Abstract base for physics NPCs
│   │   ├── MammaCat.ts                 #   Player character
│   │   ├── NPCCat.ts                  #   NPC cat (AI, config-driven)
│   │   ├── GuardNPC.ts                #   Guard patrol and chase
│   │   ├── HumanNPC.ts                #   Waypoint-following humans
│   │   ├── DogNPC.ts                  #   Dog follower with bark/lunge
│   │   ├── SpriteProfiles.ts          #   Per-type sprite configs and animation registration
│   │   └── types.ts                   #   Shared Disposition and CatState types
│   └── systems/
│       ├── DayNightCycle.ts            #   4-phase time cycle
│       ├── StatsSystem.ts              #   Hunger/thirst/energy
│       ├── DialogueSystem.ts           #   Bottom-screen dialogue box
│       ├── FoodSource.ts               #   Food/water sources
│       ├── SaveSystem.ts               #   localStorage save/load
│       ├── TrustSystem.ts              #   Trust and reputation
│       ├── EmoteSystem.ts              #   Floating text emotes
│       ├── ChapterSystem.ts            #   Story chapter progression (Chapters 1-6)
│       ├── TerritorySystem.ts          #   Territory claiming and benefits at The Shops
│       ├── SnatcherSystem.ts           #   Facade re-exporting snatcher spawn policy
│       └── ThreatIndicator.ts          #   NPC disposition indicators
│
├── proxy/                               # Cloudflare Worker — POST /api/ai/chat (see AI Dialogue Proxy above)
│   ├── src/worker.ts                   #   Origin check, kill switch, rate limits, validation, upstream forwarding
│   ├── tests/                          #   Vitest suites: worker.test.ts, ratelimit.test.ts (npm run test:proxy)
│   ├── wrangler.toml                   #   Worker config + [[ratelimits]] bindings
│   └── .dev.vars.example               #   Copy to .dev.vars (gitignored) with real keys
├── index.html                           # Vite entry page
├── package.json                         # npm manifest
├── tsconfig.json                        # TypeScript config (strict)
├── vite.config.ts                       # Vite config (relative base, dev proxy to Worker)
├── tests/                               # Unit tests (Vitest)
│   ├── systems/                        #   StatsSystem, TrustSystem, SaveSystem, etc.
│   ├── services/                       #   DialogueService, AIDialogueService, ConversationStore
│   ├── ai/                             #   Persona loader
│   ├── data/                           #   cat-dialogue script conditions
│   └── sprites/                        #   BaseNPC helpers, SpriteProfiles
├── vitest.config.ts                     # Vitest configuration
└── VERSION                              # 0.3.3
```

## Asset Generation

The tileset is generated procedurally and the map is generated from real OpenStreetMap geometry; neither is drawn in a GUI. Don't hand-edit the committed PNG or JSON — change the scripts and regenerate:

```bash
node scripts/generate-tileset.mjs   # Regenerates park-tiles.png and tile-indices.json
node scripts/generate-map.mjs       # Regenerates atg.json + atg-ground.png from atg-osm.geojson (reads tile-indices.json, atg-stamps.json)
node scripts/render-map.mjs         # Optional: PNG overview of atg.json (default: your temp dir) for review
node scripts/generate-vehicles.mjs  # Regenerates sprites/vehicles.png + vehicles.json (top-down traffic and story cars)
```

The generators use `pngjs` (dev dependency) and write to `public/assets/`. The generated files are committed to git so the game runs without needing to regenerate them.

`generate-map.mjs` works at 2 m per 32 px tile, north up. It rasterises the extract onto the existing park-tiles indices: the three bounding roads (and every street in frame) collide, so the park is sealed for people and NPC cats (road tiles also carry a `road` property: Mamma Cat's collider ignores those, so only she can cross; water tiles carry `water`, which every cat drinks from); footways become stone paths, buildings and towers become solid blocks, the PSE pond and fountains become water. Places OSM doesn't map are in the `PLACES` table at the top of the script (the sunken plaza with the northern Starbucks and its waterfall, the steps down to the mall and up to the towers, the triangular cat shelter, the playground, smoking areas). Trees and plants are scattered from `scripts/atg-stamps.json`, stamps extracted from the earlier hand-made map. Every spawn/POI is snapped to reachable ground with one tile of clearance for human routing, and a `places` object layer is emitted for the game (traffic lanes, park exits, the chapter-4 shops zone, benches, dining tables, picnic spots, smoking areas, selfie spots, guard posts, ambient/snatcher routes, colony zones), read through `src/utils/mapPlaces.ts`. The script fails loudly if the park is not sealed or a POI is unreachable, and `tests/map/atgGeography.test.ts` pins the key places (Blacky's underpass, Starbucks beside the mall steps, the pyramid steps by the glass, …).

The ground the player sees is not the gameplay `ground` layer (that one stays hidden and only carries collision). `generate-map.mjs` bakes it into `public/assets/tilesets/atg-ground.png` with the painters in `scripts/terrain-art.mjs`, as three layers offset by half a tile: `groundArt`, `shade` and `roofArt`. Each art tile's corners sit on four cell centres (dual-grid autotiling), so lawns, paths and paving blend with organic edges, while kerbs, rooflines and pool rims follow signed distances to the real OSM lines and run straight at any angle. Cell centres are kept clear of drawn edges, so ground the cat can walk on never reads as asphalt, roof or water. There is one light direction throughout, from the north-west. Trees, shelters and buildings cast soft shadows down-right in the `shade` layer, roofs and kerbs are lit on their NW edges, stairs darken towards the bottom, and the Sedeño escalator falls away into the dark mouth of the underpass. Monuments and the McMicking / Starbucks water curtains are painted as one-off decals. Identical tiles are deduplicated and the atlas is written as an 8-bit palette PNG (`scripts/png-indexed.mjs`). Lane lines, zebra crossings (OSM `footway=crossing`, emitted as `crossing` places) and tyre-polished wheel tracks are drawn at runtime by `src/systems/RoadMarkings.ts` along the fitted traffic lanes.

`generate-vehicles.mjs` draws every car at the map's real scale (16 px per metre), seen straight down with the nose pointing east (rotation = heading, never mirrored) and shading symmetric about the long axis; the drop shadow is added at runtime. It bakes sedans, hatchbacks, SUVs, a taxi, jeepneys, P2P/city buses and motorbikes with riders in several colours, plus the story drop-off cars (`story_suv*`, `story_corolla`). `src/data/vehicles.ts` lists the frames and traffic mix, and `tests/data/vehicles.test.ts` keeps it in step with the atlas.

Real-world ground plan comes from OpenStreetMap. `scripts/atg-osm.geojson` is a saved extract (park, footways, roads, buildings, steps, underpasses, everything tagged in the bbox) so the generators run offline. Refresh it only when you want newer OSM data:

```bash
node scripts/fetch-osm.mjs          # Overpass API → scripts/atg-osm.geojson
```

[docs/atg-osm-preview.svg](docs/atg-osm-preview.svg) is the baseline ground plan drawn from that extract, with the key places numbered (underpasses, the pond, Openbook, the restaurant row, the steps, the monuments).

Map data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). The credit also appears in the in-game end credits (`EpilogueScene`).

Cat spritesheets use a mix of 32x32 grid sheets (mammacat, blacky, tiger, jayco, fluffy) and 64x64 strip sheets (ginger cats, though ginger cats currently use fluffy with an orange tint in-game). Human NPCs use per-type spritesheets: `girl.png` for joggers, `dogwalker.png` for dog walkers, and the guard spritesheet with a green tint for feeders. Dog walkers are accompanied by dog sprites (`SmallDog.png`, `BrownDog.png`, `WhiteDog.png`).

## Architecture

The game uses Phaser 3's scene system with six scenes:

1. **BootScene** preloads all assets (tileset image, tilemap JSON, spritesheets)
2. **StartScene** shows the title screen with Continue (if save exists), New Game, and New Game+ (if completed) options
3. **GameScene** is the main gameplay loop:
   - Creates the tilemap: a hidden gameplay `ground` layer (collision), the baked `groundArt` + `shade` art layers, `objects` (collision), the `overhead` canopy and `roofArt` shelter roofs
   - Spawns player, NPC cats, guard, human NPCs, and dogs
   - Runs day/night cycle, stat decay, trust ticking, and chapter progression (Chapters 1-6)
   - Manages snatchers (night threat), colony dynamics, territory, and Camille encounter sequences
   - Handles keyboard input and proximity-based interaction
   - Camera follows player at 2.5x zoom with dead zone
4. **HUDScene** runs as a parallel overlay, rendering stat bars, game clock, dialogue box, pause menu, rest progress, and contextual narration
5. **JournalScene** is launched on demand (J key or pause menu) to display known cats, trust levels, and territory status
6. **EpilogueScene** plays after Chapter 6 completion, showing an epilogue narrative, welfare links, and credits

Scenes communicate via direct typed references (`scene.get("GameScene")`), Phaser's registry for story flags, and `DayNightCycle`'s event emitter for `newDay` events.

Dialogue is routed through `DialogueService`, an interface-based service layer that selects responses from scripted dialogue data (`cat-dialogue.ts`). This is designed for a future swap to AI-generated dialogue in Phase 5. Conversation history is persisted in IndexedDB via `ConversationStore`.

State is persisted to `localStorage` via `SaveSystem`, which tracks player position, stats, time of day, food source states, trust data, territory data, and story flags. The save is validated on load with structure and range checks.

## Game Design

The full game design document covers story (6 chapters from abandonment to adoption), characters (8+ named NPC cats based on real ATG cats), mechanics (day/night cycle, survival stats, trust system, territory), and a map modelled on the real Ayala Triangle Gardens.

Read the full document: [docs/Ayala_GDD_v0.1.md](docs/Ayala_GDD_v0.1.md)

## Target Platform

- **Primary:** Browser-based (Chrome), playable offline via PWA (planned Phase 5)
- **Ideal form factor:** iPad landscape
- **Secondary:** iPhone landscape, desktop with keyboard

## Known Limitations

- No audio (planned Phase 5)
- GameScene is large (~3900 lines) and would benefit from extraction of subsystems (snatchers, colony dynamics, Camille encounters, territory); `src/systems/SnatcherSystem.ts` re-exports spawn policy logic as a stepping stone
- Colony cat spawn positions are hardcoded, not tied to map POIs
- The `"wary"` disposition affects indicators and narration but not yet NPC AI behaviour weights
- Dumping events fire probabilistically rather than on a deterministic schedule
- AI spend is bounded only by the Worker's per-IP limits and the provider-side caps (see [Settings the owner must change outside code](#settings-the-owner-must-change-outside-code)): there are no accounts, players behind one shared IP (mobile CGNAT) share a bucket, the client still chooses the provider, and a deploy without the rate-limit bindings is unlimited

## License

TBD

Map data © OpenStreetMap contributors (ODbL) — see [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright).

---

_There are millions of cats like Mamma Cat. What can you do?_
