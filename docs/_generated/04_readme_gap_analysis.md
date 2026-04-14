# README Gap Analysis

**Classification: Partially stale**

The README was updated after Phase 1.5 but has several inaccuracies and omissions.

## Detailed Findings

| Area | Status | Issue |
|------|--------|-------|
| **Project description** | Accurate | Good summary of the game concept and emotional intent. |
| **Project status** | Partially stale | Says "Phase 1.5 -- Visual Polish. Refining the prototype..." — should say Phase 1.5 is **complete**, not in progress. The "What exists" list is accurate. |
| **Roadmap table** | Accurate | Phase 1 and 1.5 marked Complete, rest Not started. Correct. |
| **Tech stack table** | Inaccurate | Lists "Tiled Map Editor" as a technology for map creation, but maps are generated programmatically via Node.js scripts, not via the Tiled GUI. Misleading. |
| **Prerequisites** | Incomplete | Says "Node.js >= 18" but doesn't mention that asset generation scripts (`generate-tileset.mjs`, `generate-map.mjs`) must be run separately if assets need regeneration. |
| **Install and Run** | Mostly accurate | Port hardcoded as 5173 but Vite may use a different port if 5173 is occupied. Minor. |
| **Production Build** | Accurate | Correct. |
| **Architecture tree** | Partially stale | Missing `scripts/` folder entirely. Missing `fluffy.png` from sprites listing. Missing `_generated/` from docs. The `src/` tree is accurate. |
| **Game Design section** | Accurate | Good summary with link to GDD. |
| **Target Platform** | Accurate (aspirational) | PWA/offline not yet implemented but correctly flagged as a future phase. |
| **Developers** | Accurate | Lists Manu and Claude. |
| **License** | Accurate | "TBD" — honest. |
| **Testing** | **Missing entirely** | No mention of test strategy (none exists, but should be noted as a known gap). |
| **Configuration/env** | **Missing** | No mention of environment variables or configuration beyond scripts. Not critical for current state but should note there are none. |
| **Asset generation** | **Missing entirely** | The `scripts/` folder and its generators are not documented. A contributor wouldn't know how to regenerate tiles or the map. |
| **Controls/gameplay** | **Missing** | No mention of how to actually play the game (arrow keys to move, Enter to interact, Space to advance dialogue). |
| **Version** | **Inconsistent** | VERSION file says 0.1.1, package.json says 0.1.0. README doesn't mention version. |
| **Known limitations** | **Missing** | No mention of: no audio, no save/load, no tests, stale `generate-sprites.mjs`, identical sprites for both cats, 60s phase duration is a testing placeholder. |
| **Branch info** | **Missing** | Active development is on `sit` branch, not mentioned. |

## Priority Fixes

1. **Add controls/gameplay section** — critical for anyone trying the game
2. **Add asset generation documentation** — critical for contributors
3. **Update architecture tree** to include `scripts/`, `fluffy.png`, `docs/_generated/`
4. **Fix tech stack** — replace "Tiled Map Editor" with "pngjs (procedural asset generation)"
5. **Add known limitations** section
6. **Update project status** to reflect Phase 1.5 is complete
7. **Add version info** and resolve VERSION/package.json mismatch
