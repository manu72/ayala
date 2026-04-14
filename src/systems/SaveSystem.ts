import type { CatStats } from './StatsSystem'
import type { TimeOfDay } from './DayNightCycle'

const STORAGE_KEY = 'ayala_save'

export interface SaveData {
  version: number
  playerPosition: { x: number; y: number }
  stats: CatStats
  timeOfDay: TimeOfDay
  gameTimeMs: number
  variables: Record<string, unknown>
}

const CURRENT_VERSION = 1

/** Tracked registry keys that should be persisted. */
const TRACKED_KEYS = [
  'MET_BLACKY',
  'TIGER_TALKS',
  'JAYCO_TALKS',
  'KNOWN_CATS',
] as const

export const SaveSystem = {
  hasSave(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null
  },

  save(
    playerX: number,
    playerY: number,
    stats: CatStats,
    timeOfDay: TimeOfDay,
    gameTimeMs: number,
    registry: Phaser.Data.DataManager,
  ): void {
    const variables: Record<string, unknown> = {}
    for (const key of TRACKED_KEYS) {
      const val = registry.get(key)
      if (val !== undefined) variables[key] = val
    }

    const data: SaveData = {
      version: CURRENT_VERSION,
      playerPosition: { x: playerX, y: playerY },
      stats,
      timeOfDay,
      gameTimeMs,
      variables,
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // localStorage full or unavailable — fail silently
    }
  },

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw) as SaveData
      if (typeof data.version !== 'number' || data.version > CURRENT_VERSION) return null
      return data
    } catch {
      return null
    }
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
