import type { CatStats } from './StatsSystem'
import type { TimeOfDay } from './DayNightCycle'
import type { SourceType } from './FoodSource'
import type { TrustData } from './TrustSystem'
import { createDefaultRunScoreState, type RunScoreState } from './ScoringSystem'
import { DEFAULT_LIVES } from '../utils/lifeFlow'

const STORAGE_KEY = 'ayala_save'

export interface SaveData {
  version: number
  playerPosition: { x: number; y: number }
  stats: CatStats
  timeOfDay: TimeOfDay
  gameTimeMs: number
  variables: Record<string, unknown>
  sourceStates?: Array<{ type: SourceType; x: number; y: number; lastUsedAt: number }>
  trust?: TrustData
  territory?: { claimed: boolean; claimedOnDay: number }
  lives: number
  runScore: RunScoreState
}

const CURRENT_VERSION = 2
const LEGACY_VERSION = 1

const TRACKED_KEYS = [
  'MET_BLACKY', 'TIGER_TALKS', 'JAYCO_TALKS', 'KNOWN_CATS',
  'CHAPTER', 'CH1_RESTED', 'FLUFFY_TALKS', 'PEDIGREE_TALKS',
  'MET_GINGER_A', 'MET_GINGER_B', 'JAYCO_JR_TALKS', 'JOURNAL_MET_DAYS',
  // Phase 4: territory, Camille encounters, snatchers, colony dynamics
  'VISITED_ZONE_6', 'TERRITORY_CLAIMED', 'TERRITORY_DAY',
  'CAMILLE_ENCOUNTER', 'CAMILLE_ENCOUNTER_DAY', 'ENCOUNTER_5_COMPLETE',
  'COLONY_COUNT', 'DUMPING_EVENTS_SEEN', 'CATS_SNATCHED',
  'GAME_COMPLETED', 'GAME_OVER', 'NEW_GAME_PLUS', 'INTRO_SEEN', 'FIRST_SNATCHER_SEEN',
  'COLLAPSE_COUNT', 'PLAYER_SNATCHED_COUNT', 'SNATCHED_THIS_NIGHT',
] as const

const VALID_PHASES: ReadonlySet<string> = new Set(['dawn', 'day', 'evening', 'night'])
const VALID_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'feeding_station',
  'fountain',
  'restaurant_scraps',
  'water_bowl',
  'bugs',
  'safe_sleep',
])

export function isValidSave(data: unknown): data is SaveData {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (typeof d.version !== 'number' || d.version < LEGACY_VERSION || d.version > CURRENT_VERSION) return false
  if (typeof d.gameTimeMs !== 'number' || !Number.isFinite(d.gameTimeMs)) return false
  if (typeof d.timeOfDay !== 'string' || !VALID_PHASES.has(d.timeOfDay)) return false

  const pos = d.playerPosition as Record<string, unknown> | undefined
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return false
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return false

  const stats = d.stats as Record<string, unknown> | undefined
  if (!stats || typeof stats.hunger !== 'number' || typeof stats.thirst !== 'number' || typeof stats.energy !== 'number') return false
  if (!Number.isFinite(stats.hunger) || !Number.isFinite(stats.thirst) || !Number.isFinite(stats.energy)) return false

  const sourceStates = d.sourceStates as unknown
  if (sourceStates !== undefined) {
    if (!Array.isArray(sourceStates)) return false
    for (const entry of sourceStates) {
      if (typeof entry !== 'object' || entry === null) return false
      const s = entry as Record<string, unknown>
      if (typeof s.type !== 'string' || !VALID_SOURCE_TYPES.has(s.type)) return false
      if (typeof s.x !== 'number' || typeof s.y !== 'number' || typeof s.lastUsedAt !== 'number') return false
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.lastUsedAt)) return false
    }
  }

  if (d.version >= CURRENT_VERSION) {
    if (
      typeof d.lives !== 'number' ||
      !Number.isFinite(d.lives) ||
      !Number.isInteger(d.lives) ||
      d.lives < 0 ||
      d.lives > DEFAULT_LIVES
    ) return false
    if (!isValidRunScore(d.runScore)) return false
  }

  return true
}

function isValidRunScore(data: unknown): data is RunScoreState {
  if (typeof data !== 'object' || data === null) return false
  const score = data as Record<string, unknown>
  const numericKeys = [
    'catEngagements',
    'humanEngagements',
    'cleanNights',
    'nightsSurvived',
    'distanceTravelledPx',
    'totalExplorableCells',
    'closeFriendsMade',
    'runSnatchCount',
  ]
  for (const key of numericKeys) {
    const val = score[key]
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) return false
  }
  return (
    isNumberArray(score.visitedCells) &&
    isNumberArray(score.dumpedPetsComforted) &&
    isStringArray(score.foodSourcesDiscovered)
  )
}

function isNumberArray(data: unknown): boolean {
  return Array.isArray(data) && data.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry >= 0)
}

function isStringArray(data: unknown): boolean {
  return Array.isArray(data) && data.every((entry) => typeof entry === 'string')
}

function migrateSave(data: SaveData): SaveData {
  if (data.version >= CURRENT_VERSION) return data
  return {
    ...data,
    version: CURRENT_VERSION,
    lives: DEFAULT_LIVES,
    runScore: createDefaultRunScoreState(),
  }
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
    sourceStates?: Array<{ type: SourceType; x: number; y: number; lastUsedAt: number }>,
    trust?: TrustData,
    territory?: { claimed: boolean; claimedOnDay: number },
    lives = DEFAULT_LIVES,
    runScore: RunScoreState = createDefaultRunScoreState(),
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
      sourceStates,
      trust,
      territory,
      lives,
      runScore,
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
      return migrateSave(data)
    } catch {
      return null
    }
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
