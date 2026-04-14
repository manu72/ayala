# README Gap Analysis

> Generated: 2026-04-14 | Version: 0.1.3

## Classification: **Materially inaccurate**

The README describes the project as it existed at v0.1.1 (Phase 1.5 complete). Two full development phases (Phase 2: Core Mechanics, Phase 3: Social & Story) have been completed since then, adding ~18 source files, multiple game systems, and significant gameplay features.

## Gap Details

| Area | Current README | Actual State | Action |
| --- | --- | --- | --- |
| **Version** | "Version 0.1.1" in 3 places | 0.1.3 | Update |
| **Phase table** | Phase 2-5 "Not started" | Phase 2 and 3 are Complete | Update |
| **"What exists now" list** | Lists only Phase 1/1.5 features | Missing: stats, food/water, guard, save/load, rest, crouch, HUD, named NPCs, trust, emotes, chapters, humans, dogs, journal | Rewrite section |
| **Controls table** | Missing J (journal); descriptions slightly stale | Full controls include J, updated crouch/rest mechanics | Update |
| **Tips section** | Mostly accurate but missing new features | Missing: journal, trust/social, chapter progression | Update |
| **Project Structure** | 8 source files listed | 22 source files exist; missing scenes (StartScene, HUDScene, JournalScene), sprites (GuardNPC, HumanNPC, DogNPC), systems (StatsSystem, FoodSource, SaveSystem, TrustSystem, EmoteSystem, ChapterSystem, ThreatIndicator), config (constants.ts) | Rewrite section |
| **Architecture** | 2 scenes described | 5 scenes; missing save/load, trust, chapters, entire systems layer | Rewrite section |
| **Known Limitations** | "No save/load", "No linter or formatter" | Save/load exists; TypeScript strict mode configured | Update |
| **Asset Generation** | Accurate | Still accurate | Keep |
| **Tech Stack table** | Accurate versions | Versions match package.json | Keep |
| **Setup instructions** | Accurate | Still work | Keep |
| **Sprites section** | "Both cat sprites use fluffy.png" | 5 grid sheets + 3 ginger strips + guard + Black-* strips | Update |
