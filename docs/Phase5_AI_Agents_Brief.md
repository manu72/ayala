# Phase 5 Technical Brief — AI-Powered NPC Agents

**Project:** Ayala (2D top-down cat adventure game)
**Framework:** Phaser 3 + Vite + TypeScript + Deepseek API (primary) / OpenAI API (fallback)
**Branch:** `sit`
**Context:** Read `docs/Ayala_GDD_v0.1.md` for full game design. Phases 1-4.5 are complete — we have a playable game with scripted dialogue flowing through the `DialogueService` interface. This phase swaps scripted dialogue for AI-powered autonomous NPC personas.

---

## OBJECTIVE

Replace scripted NPC dialogue with AI-powered personas that behave autonomously, remember prior interactions, and respond dynamically to game state. Each named NPC becomes a persistent agent with personality, memory, and situational awareness.

---

## ARCHITECTURAL APPROACH

The `DialogueService` interface already exists from Phase 4. This phase implements a new `AIDialogueService` that replaces the `ScriptedDialogueService` as the primary service, with scripted dialogue retained as offline fallback (v2 concern).

NPCs are organised into tiers based on narrative importance and interaction frequency. Tier 1 and Tier 2 get AI personas. Tier 3 remains scripted (short canned lines).

---

## AGENT TIERS

### Tier 1 — Full AI Personas (deep personalities, rich memory)

These are the characters whose relationships define the game. Each gets a detailed persona file, full conversation memory in IndexedDB, and frequent AI-driven dialogue.

| NPC | Type | Role |
|-----|------|------|
| Blacky | Cat | Calm, wise gatekeeper. Sits at the Paseo de Roxas underpass. Camille's first friend. Mamma Cat's likely mentor. |
| Tiger | Cat | Territorial tabby in the Central Gardens. Hostile initially, slowly warms up. Classic "tough love" colony elder. |
| Jayco | Cat | Friendly resident of the pyramid steps. Curious, helpful, knows all the good scraps. Father of Jayco Junior. |
| Camille | Human | Mamma Cat's eventual adopter. Gentle, patient, returns nightly. The emotional centre of the game. |

### Tier 2 — Lighter AI Personas (simpler prompts, shorter memory)

These characters feel alive but require less depth. Shorter persona files, less frequent dialogue, faster turnaround.

| NPC | Type | Role |
|-----|------|------|
| Jayco Junior | Cat (kitten) | Playful, curious, attached to Jayco. Bouncy energy, short attention span. |
| Fluffy Cat | Cat | Aloof, dignified, long-furred. Dismissive at first, gradually warming. |
| Pedigree Cat | Cat | Former pet near the Blackbird area. Melancholy, recognises Mamma Cat's story. |
| Ginger Twin 1 | Cat | Territorial ginger near the fountain. Wary, protective of the water source. |
| Ginger Twin 2 | Cat | Silent shadow of Twin 1. Observes, rarely speaks. Follows Twin 1's cues. |
| Manu | Human | Camille's partner. Tall, quiet, friendly to cats. Accompanies Camille from Encounter 3. |
| Kish | Human | Camille's 12-year-old niece. Enthusiastic, sometimes too eager. Appears in Encounters 4-5. |

### Tier 3 — Scripted (no AI)

These entities do NOT get AI agents. They run scripted behaviour circuits from Phase 4.5 with short pre-written lines only.

- Volunteer feeders
- Joggers
- Dog walkers
- Guards (except brief AI hostile reactions if needed in future)
- Unnamed background colony cats
- Snatchers (they don't speak — their threat is enough)

---

## PERSONA FILES

Personas live in the repo as markdown files:

```
src/
  ai/
    personas/
      blacky.md
      tiger.md
      jayco.md
      jayco-junior.md
      fluffy.md
      pedigree.md
      ginger-twin-1.md
      ginger-twin-2.md
      camille.md
      manu.md
      kish.md
```

Each `.md` file follows a standard structure:

```markdown
# [Name]

## Identity
- Species: cat / human
- Age: (approximate)
- Appearance: (brief)

## Backstory
(2-4 sentences of history — how they came to be in the gardens, any prior life, key relationships)

## Personality
(Core traits — friendly, wary, calm, anxious, etc. 3-5 traits with brief explanation)

## Speech Style
- Cats use short "cat-speak" — "Mrrp", "Prrrrp", "Hssss", never full paragraphs
- Humans speak naturally but briefly, with their own quirks
- Keep lines short — 1 sentence typically, 2 at most

## Knowledge
(What they know about the colony, the gardens, other cats, threats, etc.)

## Relationship to Mamma Cat
(Default disposition — wary, curious, friendly. How their attitude evolves with trust.)

## Rules of Engagement
- When to approach Mamma Cat (proximity, mood, time of day)
- When to retreat or ignore
- What triggers warm behaviour (sharing food, time spent, trust thresholds)
- What triggers cold behaviour (entering their territory, hissing)
```

These files are loaded at game start and used as system prompts for that persona's agent.

---

## DIALOGUE SERVICE IMPLEMENTATION

### AIDialogueService

```typescript
class AIDialogueService implements DialogueService {
  async getDialogue(request: DialogueRequest): Promise<DialogueResponse> {
    const persona = this.personas[request.speaker]
    const history = await this.getConversationHistory(request.speaker)
    
    const systemPrompt = this.buildSystemPrompt(persona, request.gameState)
    const messages = this.buildMessages(history, request)
    
    const response = await this.callLLM({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.8,
      max_tokens: 150
    })
    
    const parsed = this.parseResponse(response)
    await this.storeConversation(request.speaker, parsed)
    
    return parsed
  }
}
```

### Model configuration

Primary: **Deepseek Chat** via OpenAI-compatible API
Fallback: **OpenAI gpt-4o-mini** (cheap, fast, high quality)

**Provider API keys MUST NOT be shipped in the client bundle.** The game builds to static files (see DoD), so any `VITE_`-prefixed variable is inlined verbatim into the JavaScript served to the browser and is trivially extractable by anyone viewing the page source. A leaked provider key means metered-API abuse billed to the project owner.

Calls therefore go through a thin **server-side proxy** on the same origin as the static host (e.g. a serverless function, or a small Node/Express adapter). The proxy holds the keys, selects upstream provider, injects `Authorization`, and returns (or streams) the completion. The client only ever speaks to the proxy via a relative URL.

Client-side env (`.env`) — safe to embed, no secrets:

```
VITE_AI_PRIMARY=deepseek
VITE_AI_FALLBACK=openai
VITE_AI_PROXY_URL=/api/ai/chat
```

Server-side env (proxy host only — **never** `VITE_`-prefixed, never touched by Vite):

```
DEEPSEEK_API_KEY=...
DEEPSEEK_API_BASE=https://api.deepseek.com/v1
OPENAI_API_KEY=...
OPENAI_API_BASE=https://api.openai.com/v1
```

Request flow:

1. `AIDialogueService.callLLM()` → `fetch(import.meta.env.VITE_AI_PROXY_URL, { method: 'POST', body: JSON.stringify({ provider, messages, temperature, max_tokens }) })`.
2. Proxy resolves `provider` → upstream base + key, calls the provider's chat-completions endpoint, returns the response to the client.
3. On proxy-reported upstream failure (timeout / 429 / 5xx), the service retries the request with `provider` set to the fallback. Both providers share the chat-completions shape, so the single proxy path handles both.

Before any secret lands on disk, confirm `.gitignore` contains `.env` and `.env.*.local` — the repo currently omits them, and that gap must be closed as part of this phase.

For local development without deploying a proxy, a dev-only shim can sit alongside `vite dev` (Vite middleware or a tiny Express adapter) that reads keys from the developer's machine env. This dev path is explicitly not for production and must not be reachable from the built static bundle.

### Response format

The AI must return a structured response. Prompt engineering should request JSON output:

```json
{
  "lines": ["Mrrp. You came back.", "I thought the shadows took you."],
  "speakerPose": "friendly",
  "emote": "♥",
  "narration": "Blacky's tail rises slowly as you approach.",
  "trustChange": 5
}
```

Parse this into the existing `DialogueResponse` shape. If parsing fails, fall back to a scripted line for that persona.

---

## MEMORY IN INDEXEDDB

Use the existing IndexedDB conversation store from Phase 4. Per-NPC conversation history is the memory.

For v1, keep it simple:
- Store all conversations with each NPC
- When building the AI request, include the last N conversations (configurable, start with 20)
- If more than 100 conversations accumulate with one NPC, drop the oldest ones
- No summarisation layer needed for v1 — context windows handle it

Schema (already built in Phase 4, confirm it includes these fields):

```typescript
interface ConversationRecord {
  id?: number
  speaker: string
  timestamp: number        // game time
  realTimestamp: number    // real time (for debugging)
  gameDay: number
  chapter: number
  lines: string[]          // what the NPC said
  playerAction?: string    // what Mamma Cat "did" (e.g. "approached tail up", "offered food")
  gameStateSnapshot: {
    trustWithSpeaker: number
    trustGlobal: number
    timeOfDay: string
    hunger: number
    // other relevant state
  }
}
```

---

## AUTONOMOUS BEHAVIOUR (STRETCH GOAL FOR PHASE 5)

Ideally each Tier 1 NPC's AI also drives their *movement intentions* — not pixel-by-pixel pathfinding, but high-level goals:

```typescript
interface NPCIntention {
  goal: 'approach_mamma_cat' | 'retreat' | 'stay' | 'move_to_shade' | 'seek_food'
  urgency: 'low' | 'medium' | 'high'
  reasoning: string
}
```

Every ~30 seconds of game time (configurable), the Tier 1 AI agent is asked: "Given your personality, the current situation, and your relationship with Mamma Cat, what do you want to do right now?"

The game engine executes the goal using existing pathfinding and behaviour states (idle, walking, sleeping, alert from Phase 2/3).

**For v1 Phase 5, this is optional.** If it proves too complex, keep existing rule-based NPC behaviour and only use AI for dialogue. Behaviour AI can come in a later phase.

---

## RATE LIMITING VIA GAMEPLAY

Natural game mechanics prevent runaway API calls:
- Sleeping cats don't talk (no call)
- Wary cats walk away when Mamma Cat approaches (no call)
- Cats outside proximity (~48px) aren't engaged (no call)
- Only one dialogue at a time (serialised)
- After a conversation, the NPC returns to normal behaviour — no follow-up call until re-triggered by player action

No artificial cooldowns or token budgets needed at the game-mechanic level. If costs spike in testing, reduce `max_tokens` or reduce conversation history length.

---

## OFFLINE FALLBACK (MINIMAL FOR V1)

If the API calls fail entirely (no network), the service falls back to the existing `ScriptedDialogueService` from Phase 4. The player sees scripted lines. The game still works.

This is v1-acceptable. Richer offline experience can be a Phase 6 concern.

---

## DEFINITION OF DONE

Phase 5 is complete when:

- [ ] Persona .md files exist for all Tier 1 and Tier 2 NPCs
- [ ] `AIDialogueService` implemented using Deepseek (primary) and OpenAI (fallback)
- [ ] Server-side proxy deployed on the same origin; client calls it via `VITE_AI_PROXY_URL`
- [ ] Provider API keys live only in server-side env (non-`VITE_`-prefixed); no secret appears in the built `dist/` bundle (`rg 'sk-|DEEPSEEK_API_KEY|OPENAI_API_KEY' dist/` is clean)
- [ ] `.gitignore` lists `.env` and `.env.*.local` before any `.env` file is created
- [ ] All Tier 1 NPCs produce AI-generated dialogue that feels in-character
- [ ] Tier 2 NPCs produce AI-generated dialogue (lighter persona prompts acceptable)
- [ ] Tier 3 entities continue to use scripted dialogue (unchanged)
- [ ] Conversation history persists in IndexedDB across sessions
- [ ] AI responses include pose, emote, narration, and trustChange fields
- [ ] Fallback to OpenAI triggers automatically if Deepseek fails
- [ ] Fallback to scripted dialogue triggers if both AI services fail
- [ ] No gameplay regressions from Phase 4.5
- [ ] The game still builds to static files

---

## IMPORTANT NOTES

- **The existing scripted dialogue is the safety net.** Do not delete it. It's the offline fallback.
- **All existing NPC behaviour, pathfinding, animation, and scene logic stays the same.** This phase only swaps the text source for named NPCs.
- **The DialogueService interface is already built.** This phase implements a new class that fulfills it — minimal plumbing changes needed in NPC code.
- **Cost control is primarily through game mechanics.** Sleeping cats, distance, proximity rules — these naturally limit call volume.
- **Persona writing matters more than code.** The .md files define how the cats feel. Iterate on them freely after implementation.
- **Commit after each Tier 1 persona is working.** Test each cat individually before moving to the next.
- **Do NOT modify** anything in `docs/`.
- The character name is always **Mamma Cat** in player-visible text.
