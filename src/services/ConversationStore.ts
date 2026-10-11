/**
 * IndexedDB-backed conversation history store.
 *
 * Persists every dialogue interaction for later retrieval.
 * Phase 4: used to track conversation count for scripted dialogue gating.
 * Phase 5: conversation history feeds the AI dialogue service as context.
 */

import {
  NPC_MEMORY_LABEL_MAX,
  NPC_MEMORY_VALUE_MAX,
  isNpcMemoryKind,
  normalizeNpcMemoryText,
  type NpcMemoryKind,
} from "./NpcMemoryValidation";

const DB_NAME = "ayala_conversations";
const DB_VERSION = 3;
const CONVERSATIONS_STORE = "conversations";
const MEMORIES_STORE = "memories";
const MEMORY_DEDUPE_INDEX = "byDedupe";

const VALID_MEMORY_SOURCES = ["ai", "scripted"] as const;

/** Records kept per speaker. The Worker accepts 1 system + 2 × this + 1 messages. */
export const CONVERSATION_KEEP = 100;

/**
 * talk: engaged cat dialogue, the only kind that advances a cat's scripts.
 * ambient: a named human's greeting bubble aimed at Mamma Cat.
 * story: authored story lines (rumours, egg lines, Camille's beats, ...).
 */
export type ConversationKind = "talk" | "ambient" | "story";

export interface ConversationRecord {
  id?: number;
  speaker: string;
  /** Missing on legacy rows; read through {@link recordKind}. */
  kind?: ConversationKind;
  /** Game-time ms (DayNightCycle). */
  timestamp: number;
  /** Wall clock for debugging / ordering. */
  realTimestamp?: number;
  gameDay: number;
  /** Short factual sentence about what Mamma Cat did / what happened (game-authored). */
  mammaCatTurn?: string;
  lines: string[];
  /** Per-speaker trust; humans have none. */
  trustBefore?: number;
  trustAfter?: number;
  chapter: number;
  /** Optional label for what Mamma Cat did this beat (future use). */
  playerAction?: string;
  gameStateSnapshot?: {
    trustWithSpeaker?: number;
    trustGlobal?: number;
    timeOfDay: string;
    hunger: number;
    thirst: number;
    energy: number;
  };
}

export type NpcMemorySource = typeof VALID_MEMORY_SOURCES[number];
export type { NpcMemoryKind };

export interface NpcMemory {
  id?: number;
  npc: string;
  kind: NpcMemoryKind;
  label?: string;
  value: string;
  dedupeKey: string;
  source: NpcMemorySource;
  createdAt: number;
  gameDay: number;
  /** Game time (`totalGameTimeMs`) it was formed; absent on rows from older builds. */
  timestamp?: number;
}

export type NewNpcMemory = Omit<NpcMemory, "id" | "npc" | "createdAt" | "dedupeKey"> & {
  createdAt?: number;
};

/** Legacy rows have no kind: ambient greetings and Camille beats are told apart by `playerAction`. */
export function recordKind(record: Pick<ConversationRecord, "kind" | "playerAction">): ConversationKind {
  if (record.kind) return record.kind;
  if (record.playerAction === "ambient_greeting") return "ambient";
  return record.playerAction?.startsWith("camille_encounter_") ? "story" : "talk";
}

/** Per-day "Shared a <cat> return exchange" rows written by older builds; nothing reads them. */
export function isLegacyReturnFiller(memory: Pick<NpcMemory, "source" | "label">): boolean {
  return memory.source === "scripted" && (memory.label?.endsWith("_return") ?? false);
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        const store = db.createObjectStore(CONVERSATIONS_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("speaker", "speaker", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains(MEMORIES_STORE)) {
        const store = db.createObjectStore(MEMORIES_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("npc", "npc", { unique: false });
        store.createIndex(MEMORY_DEDUPE_INDEX, "dedupeKey", { unique: true });
      } else {
        const store = request.transaction!.objectStore(MEMORIES_STORE);
        if (!store.indexNames.contains("npc")) {
          store.createIndex("npc", "npc", { unique: false });
        }
        if (!store.indexNames.contains(MEMORY_DEDUPE_INDEX)) {
          store.createIndex(MEMORY_DEDUPE_INDEX, "dedupeKey", { unique: true });
          backfillMemoryDedupeKeys(store);
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Settles on commit, error or abort; a plain `abort()` has a null `tx.error`, so reject with a real Error. */
function transactionComplete(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Runs `work` in one transaction, resolves once it commits, and always closes the connection. */
async function withTransaction<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const db = await openDB();
  try {
    const tx = db.transaction(stores, mode);
    const [result] = await Promise.all([work(tx), transactionComplete(tx)]);
    return result;
  } finally {
    db.close();
  }
}

export async function storeConversation(record: ConversationRecord): Promise<void> {
  try {
    await withTransaction(CONVERSATIONS_STORE, "readwrite", (tx) => {
      tx.objectStore(CONVERSATIONS_STORE).add(record);
    });
    await pruneConversations(record.speaker, CONVERSATION_KEEP);
  } catch {
    // IndexedDB may be unavailable in some contexts (private browsing, etc.)
    // Fail silently — conversation storage is non-critical for gameplay.
  }
}

/** Keeps at most `maxKeep` newest records per speaker by INSERTION order. */
export async function pruneConversations(speaker: string, maxKeep = CONVERSATION_KEEP): Promise<void> {
  try {
    // Sorted by auto-increment `id` (reliable write-order key) rather than game
    // `timestamp`, which can run backwards relative to insertion — e.g. after
    // New Game+ the game clock resets to 0 while prior-run records persist in
    // IDB.
    const records = await getRecentConversations(speaker);
    if (records.length <= maxKeep) return;
    const toDrop = records.slice(0, records.length - maxKeep);
    await withTransaction(CONVERSATIONS_STORE, "readwrite", (tx) => {
      const store = tx.objectStore(CONVERSATIONS_STORE);
      for (const r of toDrop) {
        if (r.id !== undefined) store.delete(r.id);
      }
    });
  } catch {
    // Non-critical
  }
}

/** The speaker's records in insertion order; only the newest `limit` when given. */
export async function getRecentConversations(
  speaker: string,
  limit?: number,
): Promise<ConversationRecord[]> {
  try {
    const records = await withTransaction(CONVERSATIONS_STORE, "readonly", (tx) =>
      requestToPromise(tx.objectStore(CONVERSATIONS_STORE).index("speaker").getAll(speaker)),
    );
    const sorted = sortByInsertion(records as ConversationRecord[]);
    return limit === undefined ? sorted : sorted.slice(-limit);
  } catch {
    return [];
  }
}

export async function getConversationCount(speaker: string): Promise<number> {
  try {
    return await withTransaction(CONVERSATIONS_STORE, "readonly", (tx) =>
      requestToPromise(tx.objectStore(CONVERSATIONS_STORE).index("speaker").count(speaker)),
    );
  } catch {
    return 0;
  }
}

export async function clearAllConversations(): Promise<void> {
  try {
    await withTransaction([CONVERSATIONS_STORE, MEMORIES_STORE], "readwrite", (tx) => {
      tx.objectStore(CONVERSATIONS_STORE).clear();
      tx.objectStore(MEMORIES_STORE).clear();
    });
  } catch {
    // Fail silently
  }
}

export async function addNpcMemory(
  npc: string,
  memory: NewNpcMemory,
): Promise<void> {
  try {
    const normalized = normalizeMemory(npc, memory);
    if (!normalized) return;

    const inserted = await withTransaction(MEMORIES_STORE, "readwrite", async (tx) => {
      const store = tx.objectStore(MEMORIES_STORE);
      const existing = await requestToPromise(store.index(MEMORY_DEDUPE_INDEX).get(normalized.dedupeKey));
      if (existing) return false;
      await requestToPromise(store.add(normalized));
      return true;
    });

    if (inserted) await pruneNpcMemories(normalized.npc, 20);
  } catch {
    // Non-critical
  }
}

/** The NPC's memories in insertion order; only the newest `limit` when given. */
export async function getNpcMemories(
  npc: string,
  limit?: number,
): Promise<NpcMemory[]> {
  try {
    const memories = await withTransaction(MEMORIES_STORE, "readonly", (tx) =>
      requestToPromise(tx.objectStore(MEMORIES_STORE).index("npc").getAll(npc)),
    );
    const sorted = sortByInsertion(memories as NpcMemory[]);
    return limit === undefined ? sorted : sorted.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Keeps at most `maxKeep` memories. Legacy `_return` filler goes first (nothing
 * reads it), then the model's own impressions, oldest first, so scripted
 * milestones such as the first meeting survive longest.
 */
export async function pruneNpcMemories(npc: string, maxKeep = 20): Promise<void> {
  try {
    const memories = await getNpcMemories(npc);
    if (memories.length <= maxKeep) return;
    const evictionRank = (m: NpcMemory): number => (isLegacyReturnFiller(m) ? 0 : m.source === "ai" ? 1 : 2);
    // Stable sort: insertion order (oldest first) is kept within each rank.
    const toDrop = [...memories]
      .sort((a, b) => evictionRank(a) - evictionRank(b))
      .slice(0, memories.length - maxKeep);
    await withTransaction(MEMORIES_STORE, "readwrite", (tx) => {
      const store = tx.objectStore(MEMORIES_STORE);
      for (const memory of toDrop) {
        if (memory.id !== undefined) store.delete(memory.id);
      }
    });
  } catch {
    // Non-critical
  }
}

function sortByInsertion<T extends { id?: number; timestamp?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aKey = a.id ?? a.timestamp ?? 0;
    const bKey = b.id ?? b.timestamp ?? 0;
    return aKey - bKey;
  });
}

function backfillMemoryDedupeKeys(store: IDBObjectStore): void {
  const seen = new Set<string>();
  const request = store.openCursor();

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;

    const memory = cursor.value as Partial<NpcMemory>;
    if (typeof memory.dedupeKey === "string" && memory.dedupeKey) {
      seen.add(memory.dedupeKey);
      cursor.continue();
      return;
    }

    const canonicalKey = buildStoredMemoryDedupeKey(memory);
    const dedupeKey = canonicalKey && !seen.has(canonicalKey)
      ? canonicalKey
      : `legacy:${String(cursor.primaryKey)}`;
    seen.add(dedupeKey);
    cursor.update({ ...memory, dedupeKey });
    cursor.continue();
  };
}

function normalizeMemory(npc: string, memory: NewNpcMemory): NpcMemory | null {
  const normalizedNpc = normalizeNpcMemoryText(npc, NPC_MEMORY_LABEL_MAX);
  if (!normalizedNpc) return null;
  if (!isValidKind(memory.kind) || !isValidSource(memory.source)) return null;

  let label: string | undefined;
  if (memory.label !== undefined) {
    const normalizedLabel = normalizeNpcMemoryText(memory.label, NPC_MEMORY_LABEL_MAX);
    if (!normalizedLabel) return null;
    label = normalizedLabel;
  }

  const value = normalizeNpcMemoryText(memory.value, NPC_MEMORY_VALUE_MAX);
  if (!value) return null;

  return {
    npc: normalizedNpc,
    kind: memory.kind,
    label,
    value,
    dedupeKey: buildMemoryDedupeKey(normalizedNpc, memory.kind, label, value),
    source: memory.source,
    createdAt: memory.createdAt ?? Date.now(),
    gameDay: memory.gameDay,
    timestamp: memory.timestamp,
  };
}

function buildStoredMemoryDedupeKey(memory: Partial<NpcMemory>): string | null {
  const npc = normalizeNpcMemoryText(memory.npc, NPC_MEMORY_LABEL_MAX);
  const value = normalizeNpcMemoryText(memory.value, NPC_MEMORY_VALUE_MAX);
  if (!npc || !value || typeof memory.kind !== "string" || !isValidKind(memory.kind)) {
    return null;
  }
  const label = memory.label === undefined
    ? undefined
    : normalizeNpcMemoryText(memory.label, NPC_MEMORY_LABEL_MAX);
  if (memory.label !== undefined && !label) return null;
  return buildMemoryDedupeKey(npc, memory.kind, label, value);
}

function buildMemoryDedupeKey(
  npc: string,
  kind: NpcMemoryKind,
  label: string | undefined,
  value: string,
): string {
  return JSON.stringify([npc, kind, label ?? "", normalizeComparable(value)]);
}

function normalizeComparable(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isValidKind(kind: string): kind is NpcMemoryKind {
  return isNpcMemoryKind(kind);
}

function isValidSource(source: string): source is NpcMemorySource {
  return VALID_MEMORY_SOURCES.includes(source as NpcMemorySource);
}
