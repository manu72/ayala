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

const TRACKED_KEYS = ['MET_BLACKY', 'TIGER_TALKS', 'JAYCO_TALKS', 'KNOWN_CATS'] as const

const VALID_PHASES: ReadonlySet<string> = new Set(['dawn', 'day', 'evening', 'night'])

function isValidSave(data: unknown): data is SaveData {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (typeof d.version !== 'number' || d.version > CURRENT_VERSION) return false
  if (typeof d.gameTimeMs !== 'number') return false
  if (typeof d.timeOfDay !== 'string' || !VALID_PHASES.has(d.timeOfDay)) return false

  const pos = d.playerPosition as Record<string, unknown> | undefined
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return false

  const stats = d.stats as Record<string, unknown> | undefined
  if (!stats || typeof stats.hunger !== 'number' || typeof stats.thirst !== 'number' || typeof stats.energy !== 'number') return false

  return true
}

export const SaveSystem = {
  hasSave(): boolean {
    return this.load() !== null
  },

  save(
    playerX: number,
    playerY: number,
    stats: CatStats,
    timeOfDay: TimeOfDay,
    gameTimeMs: number,
    registry: Phaser.Data.DataManager,
  ): boolean {
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
      return true
    } catch {
      return false
    }
  },

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw)
      if (!isValidSave(data)) return null
      return data
    } catch {
      return null
    }
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
