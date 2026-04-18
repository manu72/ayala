# Ayala Triangle

**A 2D browser-based adventure game about a homeless cat in Manila.**

_For Cam and Mamma Cat and every abandoned pet looking for their forever home._

---

## About

Ayala is a cozy-but-real top-down adventure game set in the [Ayala Triangle Gardens](https://en.wikipedia.org/wiki/Ayala_Triangle_Gardens), a 2-hectare urban park in the Makati Central Business District, Metro Manila, Philippines. You play as **Mamma Cat**, a black-and-white former pet dumped in the gardens by her owners. Survive the colony of 40-50 homeless cats, find food and water, establish territory, build relationships, and ultimately find your human who will adopt you and take you home.

The game is inspired by the real cat colony at Ayala Triangle Gardens and the volunteers who care for them. Every cat in the colony is innocent. None are villains. But there are shadowy creatures who come out at night...

## Project Status

**Version 0.3.3** -- Phases 1 through 4, **Phase 4.5**, **Phase 5** (AI-powered dialogue), **Phase 5.1** (AI-powered human NPCs), **Phase 5.1a** (consolidated human-spoken bubbles + paired narrator/spoken beats), and **Phase 5.1b** (Camille beat-5 player-consent decision gate + stationary greeting cap) are complete for the core loop. The game is playable from start to finish: survival mechanics, social systems, 6 story chapters, territory claiming, snatchers, the full adoption story arc through to the epilogue, plus intro cinematic, grounded narration hooks, and human/cat engagement polish. **Named colony cats** and **named humans** both use LLM-backed dialogue when a same-origin proxy is configured; scripted dialogue remains the fallback if the network or API fails.

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

- 100x80 tile map of Ayala Triangle Gardens with 7 distinct zones, roads, and landmarks
- Mamma Cat player character with walk, run, crouch, and rest animations
- **Survival system:** hunger, thirst, and energy stats with environmental modifiers and collapse mechanics
- **Food and water sources** scattered across the map with cooldowns and time-of-day availability
- **Day/night cycle** (dawn, day, evening, night) with smooth colour transitions and a game clock
- **8 named NPC cats** (Blacky, Tiger, Jayco, Jayco Jr, Fluffy, Pedigree, Ginger, Ginger B) with unique dispositions and multi-stage dialogue
- **12 background colony cats** with randomised appearances and behaviours
- **Guard NPC** that patrols and chases the player away from food scraps
- **Human NPCs** (joggers, feeders, dog walkers) following waypoint paths on time-of-day schedules
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
| Escape                              | Pause menu (Save Game, Colony Journal, Resume, Quit to Title)                                                                |

### Tips

- **Survival stats** (hunger, thirst, energy) are shown as bars in the top-left corner alongside the in-game clock. Keep them topped up by finding food sources, water, and safe resting spots around the park.
- **Running** is costly -- it drains energy fast and should be used to escape threats, not for casual travel.
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

Maps are generated programmatically via Node.js scripts (not via the Tiled GUI), exported as Tiled-compatible JSON consumed by Phaser's tilemap loader.

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

Named colony cats use LLM-backed dialogue when a same-origin proxy is configured. The proxy (`proxy/`, a Cloudflare Worker) forwards `POST /api/ai/chat` to Deepseek (primary) or OpenAI (fallback) using **server-held API keys only** — no secret ever ships to the browser. Scripted dialogue (`src/data/cat-dialogue.ts`) remains the automatic fallback if the proxy is unreachable or the model returns malformed output.

### One-time setup

1. Copy [.env.example](.env.example) to `.env` (no secrets; only `VITE_AI_PROXY_URL=/api/ai/chat` and provider preferences).
2. Copy `proxy/.dev.vars.example` to `proxy/.dev.vars` (gitignored) and paste real keys:

   ```bash
   DEEPSEEK_API_KEY=sk-...
   OPENAI_API_KEY=sk-...
   # Optional overrides — defaults are fine locally:
   # DEEPSEEK_MODEL=deepseek-chat
   # OPENAI_MODEL=gpt-4.1-mini
   # ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   ```

3. Install Worker deps once: `cd proxy && npm install`.

Without `VITE_AI_PROXY_URL`, the game runs scripted-only — identical to Phase 4 behaviour, zero network calls.

### Deploy to production

```bash
cd proxy
npx wrangler deploy
```

Set secrets via the Cloudflare dashboard or `wrangler secret put DEEPSEEK_API_KEY` / `wrangler secret put OPENAI_API_KEY`. Set `ALLOWED_ORIGINS` to the exact `Origin` values the browser will send (e.g. `https://yourname.github.io` for GitHub Pages) — anything else gets a 403.

Bind the Worker to the **same hostname** as your static site so the browser calls `/api/ai/chat` same-origin, or configure a route like `yourdomain.com/api/*` → this Worker. After each production build, run `npm run verify:dist` to confirm no secret patterns leaked into `dist/`.

## AI Prompts & Character Personalities

The system prompt is **assembled per request** — it's not a static string. The persona files are the single source of truth for character; everything else (scene facts, output contract) is injected in code so the contract stays consistent across cats **and humans**.

### Where things live

| Concern                                                      | File                                                                           | Notes                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Prompt assembly (`buildSystemPrompt`, `buildMessages`)       | [src/services/AIDialogueService.ts](src/services/AIDialogueService.ts)         | One prompt per `getDialogue()` call; `max_tokens` 150             |
| Persona markdown (one file per speaker, cats **and** humans) | [src/ai/personas/\*.md](src/ai/personas/)                                      | Source of truth for character — edit these to change voice        |
| Persona → speaker map + tier table                           | [src/ai/personas/index.ts](src/ai/personas/index.ts)                           | `AI_PERSONAS` (canonical) + `CAT_PERSONAS` alias + `PERSONA_TIER` |
| Scripted anchors (trust, story flags)                        | [src/data/cat-dialogue.ts](src/data/cat-dialogue.ts)                           | Authoritative `trustChange` + `event` — AI never controls these   |
| Human encounter side-effects (Camille beats 1-5)             | [src/scenes/GameScene.ts](src/scenes/GameScene.ts) (`runCamilleEncounterBeat`) | Registry / chapter / stats side-effects — AI never controls these |

### AI-backed speakers

| Speaker                                                            | Type  | Tier          | Where AI fires                                 |
| ------------------------------------------------------------------ | ----- | ------------- | ---------------------------------------------- |
| Blacky, Tiger, Jayco, Fluffy, Pedigree, Ginger, Ginger B, Jayco Jr | cat   | tier1 / tier2 | Space-engaged dialogue                         |
| Camille                                                            | human | tier1         | Ambient greeting bubbles + encounter beats 2-4 |
| Manu, Kish                                                         | human | tier2         | Ambient greeting bubbles                       |
| Rose, Ben (named feeders)                                          | human | tier2         | Ambient greeting bubbles while feeding         |

Tier 1 personas get the full **20-turn** history window for richer continuity; Tier 2 personas get **10 turns** to keep prompts compact and cheap. The split is defined in `PERSONA_TIER` and applied in `buildMessages`.

### System prompt structure

`buildSystemPrompt(personaMarkdown, request)` concatenates three or four blocks:

1. **`## Current scene`** — live facts from `DialogueRequest.gameState`: speaker, species (`cat` or `human`), target, chapter, time of day, `trustWithSpeaker`, `trustGlobal`, Mamma Cat's hunger / thirst / energy, days survived, known cats, and optional `nearbyCat` for human speakers. Rebuilt every turn.
2. **`## Story beat context`** — _optional_, only present when `DialogueRequest.encounterBeat` is set (Camille encounters 2-4). Tells the model which beat we are in and the emotional objective, with an explicit reminder that registry side-effects are owned by the game.
3. **`## Your persona`** — full markdown for that speaker, inserted verbatim (trimmed) from `AI_PERSONAS[request.speaker]`.
4. **`## Output format`** — the JSON contract (`lines`, `speakerPose`, `emote`, optional `narration`), a **species-specific** speech reminder ("cats use cat-speak" vs "humans speak plainly and briefly"), and a one-line example matching that species.

Prior conversation turns are **not** in the system prompt. They go in as alternating `user` / `assistant` chat messages via `buildMessages()`, windowed per the speaker's tier (20 turns for Tier 1, 10 for Tier 2) from `ConversationStore` (IndexedDB, pruned to 100 per speaker).

Per-request knobs live next to `getDialogue()`:

- `temperature`: `0.6` for speakers in `HARSHER_TEMP_SPEAKERS` (tighter, colder), `0.8` for the rest.
- `max_tokens`: `150` — keeps responses short and cheap.
- `timeoutMs`: per-call override passed through to the upstream `AbortController`. Defaults to 8s for engaged cat dialogue; **1.5s** for human ambient bubbles and **5s** for Camille encounter beats. On 429/5xx the service retries once against the fallback provider before surfacing the error to `FallbackDialogueService`.

### Fallback rule (important)

Every AI path has a scripted safety net. If the LLM is slow, unreachable, rate-limited, or returns malformed JSON:

- **Engaged cat dialogue** → `FallbackDialogueService` delivers the scripted line from `cat-dialogue.ts`.
- **Human ambient bubbles** → render a scripted line from `catPersonGreetings` / `camillePersonalLines` (or the caller-forced line for first-meet Camille).
- **Camille encounter beats 2–4** → render the authored `steps[i].spoken` line for that step (narrator line is unchanged either way).
- **Camille beats 1 and 5** → always authored, never LLM-sourced. Beat 1 is pure narrator POV; beat 5 is the chapter-6 handoff and must run byte-for-byte.

No LLM response is allowed to mutate trust, registry keys, chapter state, or story flags. That split is enforced in `AIDialogueService.getDialogue()` (`trustChange` and `event` are always taken from `matchScriptedResponse`) and in `runCamilleEncounterBeat` (all registry / stats / emote side-effects live in `onComplete`, independent of dialogue source).

### What the persona markdown controls (and what it doesn't)

The persona drives **voice and behaviour only**. Game-state progression stays deterministic.

| Controlled by persona markdown                                              | Controlled by scripted anchors                                  |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `lines` — what the speaker actually says                                    | `trustChange` — trust deltas applied to speaker and colony      |
| `speakerPose` — friendly / wary / hostile / sleeping / curious / submissive | `event` — story flags, chapter progression, Camille triggers    |
| `emote` — heart / alert / curious / sleep / hostile / danger                | HUD narration, stats restore, chapter-6 handoff (Camille beats) |
| `narration` — optional body-language line                                   | —                                                               |

### Persona markdown format

Every persona (cat or human) follows the same seven-section structure so prompts stay comparable:

```markdown
# <Name>

## Identity

- Species (cat / human), age, appearance (one-line bullets)

## Backstory

Short paragraph — what do they remember, where do they usually sit/stand

## Personality

- 3 bullets, behaviour-led (not adjectives alone)

## Speech Style

- Length rules ("one sentence, two at most")
- For cats: cat-speak examples ("Mrrp", "Prrp")
- For humans: "no baby-talk, no cat-speak, speak plainly"

## Knowledge

- What they know about the park, humans, threats, the colony

## Relationship to Mamma Cat

- How they treat her at low vs high trust

## Rules of Engagement

- When to approach / retreat
- What warms them, what cools them
```

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
| 4 — First touch                 | Scripted `steps[i].narrator` | AI (`encounterBeat.n = 4`) → falls back to `steps[i].spoken` | Kish is loud nearby; Camille stays steady                 |
| 5 — Carrier / chapter-6 handoff | Scripted `steps[i].narrator` | Scripted `steps[i].spoken`                                   | Never AI; Camille still gets a bubble for her asking line |

The paired data lives in [src/data/camille-encounter-beats.ts](src/data/camille-encounter-beats.ts); `GameScene.playPairedBeat` drives the sequence using `DialogueSystem`'s `onLineShown` + `onHide` hooks to keep the modal and bubble in lockstep. Hooks tear down the persistent bubble on every exit path (completion, Space-past-end, backdrop click, close button).

Tweak the `objective` field to change the LLM's emotional target for a beat; tweak `steps[i].spoken` to change the scripted fallback line that plays when the LLM is unavailable.

### Human ambient bubbles (throttling)

When a cat person (Camille, Manu, Kish, Rose, Ben) gets within greet range of Mamma Cat or a named colony cat:

- **Per-human cooldown:** 30s between AI-sourced bubbles for that specific human. During the cooldown, scripted bubbles still fire from the existing pools so the world does not fall silent.
- **Global single-flight:** at most one AI ambient bubble may be in flight at any time across all humans. A second proximity event falls through to scripted.
- **Tight budget:** 1.5s `timeoutMs` for the upstream call. Anything slower renders the scripted line.
- **Abort on disappearance:** if the human becomes inactive mid-flight (walked off-screen, deactivated), the scripted path is skipped and nothing renders.

These knobs live as `HUMAN_AI_BUBBLE_COOLDOWN_MS` / `HUMAN_AI_BUBBLE_TIMEOUT_MS` in `GameScene.ts`.

### Editing or adding a character

**Editing voice.** Edit the `.md` file. No code change, no rebuild config. Vite hot-reloads the raw import and the next turn uses the updated markdown — earlier turns in history still reflect the old voice (they're replayed from IndexedDB).

**Adding a new AI-backed cat.**

1. Create `src/ai/personas/<slug>.md` using the seven-section format above.
2. Register it in [src/ai/personas/index.ts](src/ai/personas/index.ts) with the `?raw` import, keyed by the **exact** `NPCCat.npcName` set in [GameScene.ts](src/scenes/GameScene.ts). Also add it to `PERSONA_TIER`.
3. Add the expected key to [tests/ai/personas.test.ts](tests/ai/personas.test.ts) so the persona file is guaranteed to load.
4. If the cat should read as colder or more clipped, add the name to `HARSHER_TEMP_SPEAKERS` in [AIDialogueService.ts](src/services/AIDialogueService.ts) to drop their temperature to `0.6`.
5. Add scripted anchor entries to [src/data/cat-dialogue.ts](src/data/cat-dialogue.ts) for any trust deltas or story events — AI alone cannot create them.

**Adding a new AI-backed human.**

1. Create `src/ai/personas/<slug>.md` using the seven-section format (Identity states `Species: human, ...`).
2. Register in `src/ai/personas/index.ts` — key by the exact `HumanNPC.identityName`, add to `PERSONA_TIER` (tier2 unless they deserve tier1 memory like Camille).
3. Wire `identityName` on the `HumanConfig` so the `HumanNPC` instance links to the persona. For named types (`camille` / `manu` / `kish`) the default identity name is auto-derived; for anonymous types (`feeder`) pass `identityName: "Rose"` etc. explicitly.
4. If they're involved in an encounter beat, extend `CAMILLE_ENCOUNTER_BEATS` (or add a sibling table) in [src/data/camille-encounter-beats.ts](src/data/camille-encounter-beats.ts) with paired `{ narrator, spoken? }` steps, and route the beat through `runCamilleEncounterBeat` / `playPairedBeat` so side-effects stay deterministic and the spoken bubble renders above the right speaker.
5. Extend [tests/ai/personas.test.ts](tests/ai/personas.test.ts) with the new key.

### Tuning tips

- **Too rambly?** Reinforce the "one sentence per line, two at most" rule in the persona's `Speech Style`. `max_tokens=150` is already a hard ceiling.
- **Out of character?** Tighten `Personality` and `Rules of Engagement` with concrete do/don't bullets; persona markdown is prompt-weight, so specific beats abstract.
- **Ignoring the scene?** The `## Current scene` block already surfaces chapter / trust / stats / nearbyCat; if you want the speaker to react to more, extend `DialogueRequest.gameState` in [DialogueService.ts](src/services/DialogueService.ts) and add a line to `buildSystemPrompt`.
- **Camille encounter beat feels off?** Edit the `objective` string in `camilleEncounterBeats` — that's the one-sentence brief the LLM sees under `## Story beat context`.
- **Humans sound too formal?** The human example line in `buildSystemPrompt` deliberately shows one short, warm sentence. Adjust it there or tighten the persona's `Speech Style` with concrete examples.
- **Breaking JSON?** `parseAIJson` strips markdown fences and validates enums; on parse failure `FallbackDialogueService` delivers the scripted line instead, so a malformed reply degrades gracefully rather than crashing.

## Local Development & Testing

The repo ships two npm projects — the game (root) and the Worker (`proxy/`). Tests and dev servers for each are separate.

### Unit tests (fast fail, run first)

```bash
npm test            # Vitest: game systems, AIDialogueService, FallbackDialogueService, personas, ConversationStore
npm run test:proxy  # Vitest (in proxy/): worker origin check, validation, timeout paths
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

Vite's `server.proxy` in [vite.config.ts](vite.config.ts) forwards `/api/ai/chat` → `127.0.0.1:8787`, so the client uses the same relative URL in dev and prod.

### Smoke-test AI dialogue in the browser

**Engaged cat dialogue.** Approach one of the **eight AI cats** (Blacky, Tiger, Jayco, Jayco Jr, Fluffy, Pedigree, Ginger, Ginger B) and press **Space**. Verify:

| Check                                                  | Where to look                                              |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| 400ms "thinking" curious emote if the model is slow    | Above the engaged cat                                      |
| Lines feel in character (cat-speak, short)             | Dialogue box                                               |
| First-meeting trust, indicator, registry all fire once | Journal (J key)                                            |
| Turn persisted to IndexedDB                            | DevTools → Application → IndexedDB → `ayala_conversations` |
| Second conversation references the first               | Re-approach the same cat                                   |

Each Space on a named cat should produce one `POST /api/ai/chat` with status **200** in DevTools → Network. Body shape: `{ provider, messages, temperature, max_tokens }`.

**Human ambient bubbles.** Walk near **Camille / Manu / Kish** (evening Chapter 5+) or **Rose / Ben** (dawn/evening feeder circuit). Verify:

| Check                                                                                       | Where to look                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Bubble appears within ~1.5s of proximity                                                    | Floating text above the human                                            |
| Line reflects their persona (Rose warm Tita voice, Ben gruff one-liner, Kish excited, etc.) | Bubble contents                                                          |
| Same human does **not** fire another AI bubble for 30s                                      | DevTools → Network (no repeat `/api/ai/chat`)                            |
| Scripted line still fires during cooldown when approaching again                            | Bubble contents (shorter, from pool)                                     |
| When Worker is stopped, scripted fallback fires within 1.5s                                 | Bubble still appears; console shows `AI failed; using scripted fallback` |

**Camille encounter beats 2–5 (paired surfaces).** Progress to Chapter 5 and trigger a Camille encounter (one per eligible evening). Verify:

| Check                                                                                  | Where to look                  |
| -------------------------------------------------------------------------------------- | ------------------------------ |
| Narrator POV appears in the modal dialogue box at the bottom                           | Modal text                     |
| Camille's spoken line appears as a bubble **above her head**, not in the modal         | Floating bubble                |
| Pressing Space advances **both** the modal and the bubble to the next pair             | Modal + bubble                 |
| Dismissing the modal (backdrop click / x) tears down the current bubble too            | No orphan bubble after dismiss |
| Beat 1 is narrator-only in the HUD; Camille has no bubble for beat 1                   | HUD narration                  |
| Beat 5 still plays byte-for-byte when Worker is stopped (fully scripted)               | Modal + bubble                 |
| `CAMILLE_ENCOUNTER` registry key increments exactly once per beat, even on LLM failure | DevTools → saved state         |

For beats 2–4, one `POST /api/ai/chat` fires per beat (Camille persona, `encounterBeat.n` in the prompt). Kish's "Kish, slow down." line also renders in the same bubble style — not as a bare text overlay.

### Test the fallback paths (do not skip)

- **AI down, scripted fallback.** Stop the Worker (Ctrl+C in Terminal A) and talk to any named cat. After the 8s client abort the scripted line from `cat-dialogue.ts` fires; console logs `[Dialogue] AI failed; using scripted fallback` from [FallbackDialogueService](src/services/FallbackDialogueService.ts).
- **No proxy configured at all.** Comment out `VITE_AI_PROXY_URL` in `.env`, restart Vite. Zero AI network calls — scripted-only.
- **Provider retry.** Put a bad `DEEPSEEK_API_KEY` in `proxy/.dev.vars` and restart `dev:proxy`. Deepseek 401s; the client retries with `provider: "openai"` automatically. Two POSTs in Network.

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
│   │   ├── ginger-IDLE.png            #     Ginger cat strip (64x64 frames)
│   │   ├── ginger-WALK.png            #     Ginger cat strip
│   │   ├── ginger-RUN.png             #     Ginger cat strip
│   │   └── Black-*.png                #     Additional black cat animation strips
│   ├── tilemaps/
│   │   └── atg.json                    #   100x80 Tiled JSON map (generated)
│   └── tilesets/
│       └── park-tiles.png              #   40-tile textured tileset (generated)
│
├── scripts/                             # Dev-time asset generators + CI helpers (Node.js)
│   ├── generate-tileset.mjs            #   Generates park-tiles.png + tile-indices.json
│   ├── generate-map.mjs               #   Generates atg.json from tile indices
│   ├── tile-indices.json               #   Named tile ID map (generated output)
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
│   │   └── ConversationStore.ts        #   IndexedDB conversation history persistence
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
│   ├── src/worker.ts                   #   Origin check, validation, upstream forwarding
│   ├── tests/worker.test.ts            #   Vitest suite (npm run test:proxy)
│   ├── wrangler.toml                   #   Worker config
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

The tileset and map are generated procedurally, not drawn in a GUI. To regenerate after editing the scripts:

```bash
node scripts/generate-tileset.mjs   # Regenerates park-tiles.png and tile-indices.json
node scripts/generate-map.mjs       # Regenerates atg.json (reads tile-indices.json)
```

Both scripts use `pngjs` (dev dependency) and write to `public/assets/`. The generated files are committed to git so the game runs without needing to regenerate them.

Cat spritesheets use a mix of 32x32 grid sheets (mammacat, blacky, tiger, jayco, fluffy) and 64x64 strip sheets (ginger cats, though ginger cats currently use fluffy with an orange tint in-game). Human NPCs use per-type spritesheets: `girl.png` for joggers, `dogwalker.png` for dog walkers, and the guard spritesheet with a green tint for feeders. Dog walkers are accompanied by dog sprites (`SmallDog.png`, `BrownDog.png`, `WhiteDog.png`).

## Architecture

The game uses Phaser 3's scene system with six scenes:

1. **BootScene** preloads all assets (tileset image, tilemap JSON, spritesheets)
2. **StartScene** shows the title screen with Continue (if save exists), New Game, and New Game+ (if completed) options
3. **GameScene** is the main gameplay loop:
   - Creates a 3-layer tilemap (ground, objects with collision, overhead canopy)
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

## License

TBD

---

_There are millions of cats like Mamma Cat. What can you do?_
