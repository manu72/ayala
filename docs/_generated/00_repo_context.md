# Repo Context

## Git History Summary

- **Current branch:** `sit` (active development), 5 commits ahead of `origin/sit`
- **Other branches:** `main` (base), `remotes/origin/main`, `remotes/origin/sit`
- **Total commits on `sit`:** ~20 (linear history, no merges)
- **History arc:**
  1. Initial GDD and README setup
  2. Failed RPG JS attempt (commits `a2b3440`..`2d660a9`)
  3. Clean switch to Phaser 3 (`7d4762f`)
  4. Phase 1 foundation tasks 1-7 (`738b48c`..`f11aa5b`): scaffold, sprites, tilemap, player, NPC, day/night, build
  5. Phase 1.5 visual polish tasks 1-6 (`0eafab4`..`8792da4`): zoom, tileset, fluffy sprites, map expansion, verification

## Package Manifest

- **Name:** `ayala` (private)
- **Version:** `0.1.0` (package.json), `0.1.1` (VERSION file) — **mismatch**
- **Runtime deps:** `phaser` ^3.90.0
- **Dev deps:** `pngjs` ^7.0.0, `typescript` ^6.0.2, `vite` ^8.0.8
- **Scripts:** `dev`, `build` (tsc + vite build), `preview`
- **No test framework, no linter, no formatter configured**

## Config Files

- `tsconfig.json`: strict mode, ES2020 target, bundler resolution, `noEmit`
- `vite.config.ts`: relative base, output to `dist/`
- `.gitignore`: dist, node_modules, CLAUDE.md, .claude/, .DS_Store

## Notable Findings

- VERSION file (0.1.1) disagrees with package.json version (0.1.0)
- `generate-sprites.mjs` generates a 4-col x 5-row layout, but actual sprites now use fluffy.png (8-col x 10-row). Script is obsolete/stale.
- No CI/CD pipeline configured
- No test infrastructure
- No audio assets
- No save/load system
- No PWA/service worker yet
