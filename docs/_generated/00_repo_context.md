# Repo Context

> Generated: 2026-04-14 | Version: 0.1.3

## Identity

- **Project:** Ayala -- 2D cat adventure game
- **Stack:** Phaser 3.90 + Vite 8.x + TypeScript 6.x (strict)
- **Branch:** `sit` (active development), `main` (stable)
- **Commits:** 65

## Version

- `VERSION` file: **0.1.3**
- `package.json` version: **0.1.1** (drift -- should be aligned)

## Recent History (last 30 commits)

Phase 3 (Social & Story) implemented and bug-fixed:
- Trust system, emote system, chapter system
- Named cats (Jayco Jr, Fluffy, Pedigree, Ginger Twins), colony cats
- Human NPCs (joggers, feeders, dog walkers) and dog NPCs
- Colony journal
- Bug fixes: dog lunge animation, feeder linger, colony cat identity, journal met-day persistence

Prior: Phase 2 (Core Mechanics) complete -- stats, food/water, save/load, guard, rest, crouch, HUD.

## Dependencies

| Package | Version | Role |
| --- | --- | --- |
| phaser | ^3.90.0 | Game engine |
| vite | ^8.0.8 | Dev server, bundler |
| typescript | ^6.0.2 | Language |
| pngjs | ^7.0.0 | Dev-only tileset/map generation |

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run build` | `tsc && vite build` to `dist/` |
| `npm run preview` | Serve `dist/` locally |
