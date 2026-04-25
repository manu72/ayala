/**
 * IndexedDB-backed conversation history store.
 *
 * Persists every dialogue interaction for later retrieval.
 * Phase 4: used to track conversation count for scripted dialogue gating.
 * Phase 5: conversation history feeds the AI dialogue service as context.
 */

const DB_NAME = "ayala_conversations";
const DB_VERSION = 2;
const CONVERSATIONS_STORE = "conversations";
const MEMORIES_STORE = "memories";

const VALID_MEMORY_KINDS = ["identity", "preference", "event", "relationship", "trait"] as const;
const VALID_MEMORY_SOURCES = ["ai", "scripted"] as const;
const MEMORY_LABEL_MAX = 48;
const MEMORY_VALUE_MAX = 240;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export interface ConversationRecord {
  id?: number;
  speaker: string;
  /** Game-time ms (DayNightCycle). */
  timestamp: number;
  /** Wall clock for debugging / ordering. */
  realTimestamp?: number;
  gameDay: number;
  /** The Mamma Cat side of the prior exchange, if captured. */
  mammaCatTurn?: string;
  lines: string[];
  trustBefore: number;
  trustAfter: number;
  chapter: number;
  /** Optional label for what Mamma Cat did this beat (future use). */
  playerAction?: string;
  gameStateSnapshot?: {
    trustWithSpeaker: number;
    trustGlobal: number;
    timeOfDay: string;
    hunger: number;
    thirst: number;
    energy: number;
  };
}

export type NpcMemoryKind = typeof VALID_MEMORY_KINDS[number];
export type NpcMemorySource = typeof VALID_MEMORY_SOURCES[number];

export interface NpcMemory {
  id?: number;
  npc: string;
  kind: NpcMemoryKind;
  label?: string;
  value: string;
  source: NpcMemorySource;
  createdAt: number;
  gameDay: number;
}

export type NewNpcMemory = Omit<NpcMemory, "id" | "npc" | "createdAt"> & {
  createdAt?: number;
};

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
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeConversation(record: ConversationRecord): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(CONVERSATIONS_STORE, "readwrite");
    tx.objectStore(CONVERSATIONS_STORE).add(record);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await pruneConversations(record.speaker, 100);
  } catch {
    // IndexedDB may be unavailable in some contexts (private browsing, etc.)
    // Fail silently — conversation storage is non-critical for gameplay.
  }
}

/** Keeps at most `maxKeep` newest records per speaker by INSERTION order. */
export async function pruneConversations(speaker: string, maxKeep = 100): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(CONVERSATIONS_STORE, "readonly");
    const index = tx.objectStore(CONVERSATIONS_STORE).index("speaker");
    const request = index.getAll(speaker);
    const records = await new Promise<ConversationRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as ConversationRecord[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (records.length <= maxKeep) return;
    // Sort by auto-increment `id` (reliable write-order key) rather than game
    // `timestamp`, which can run backwards relative to insertion — e.g. after
    // New Game+ the game clock resets to 0 while prior-run records persist in
    // IDB. Falling back to `timestamp` preserves ordering for any legacy rows
    // written before the schema assigned ids (shouldn't occur, defensive).
    const sorted = [...records].sort((a, b) => {
      const aKey = a.id ?? a.timestamp ?? 0;
      const bKey = b.id ?? b.timestamp ?? 0;
      return aKey - bKey;
    });
    const toDrop = sorted.slice(0, sorted.length - maxKeep).filter((r) => r.id !== undefined);
    const db2 = await openDB();
    const tx2 = db2.transaction(CONVERSATIONS_STORE, "readwrite");
    const store = tx2.objectStore(CONVERSATIONS_STORE);
    for (const r of toDrop) {
      store.delete(r.id!);
    }
    await new Promise<void>((resolve, reject) => {
      tx2.oncomplete = () => resolve();
      tx2.onerror = () => reject(tx2.error);
    });
    db2.close();
  } catch {
    // Non-critical
  }
}

export async function getRecentConversations(
  speaker: string,
  limit = 20,
): Promise<ConversationRecord[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(CONVERSATIONS_STORE, "readonly");
    const index = tx.objectStore(CONVERSATIONS_STORE).index("speaker");
    const request = index.getAll(speaker);

    const records = await new Promise<ConversationRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as ConversationRecord[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return sortByInsertion(records).slice(-limit);
  } catch {
    return [];
  }
}

export async function getLastConversationContext(
  speaker: string,
): Promise<ConversationRecord | null> {
  const recent = await getRecentConversations(speaker, 1);
  return recent[0] ?? null;
}

export async function getConversationCount(speaker: string): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(CONVERSATIONS_STORE, "readonly");
    const index = tx.objectStore(CONVERSATIONS_STORE).index("speaker");
    const request = index.count(speaker);

    const count = await new Promise<number>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  } catch {
    return 0;
  }
}

export async function clearAllConversations(): Promise<void> {
  try {
    const db = await openDB();
    const stores = [CONVERSATIONS_STORE, MEMORIES_STORE].filter((store) =>
      db.objectStoreNames.contains(store),
    );
    const tx = db.transaction(stores, "readwrite");
    for (const store of stores) {
      tx.objectStore(store).clear();
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
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

    const existing = await getNpcMemories(normalized.npc, 1000);
    const duplicate = existing.some((item) =>
      item.kind === normalized.kind &&
      (item.label ?? "") === (normalized.label ?? "") &&
      normalizeComparable(item.value) === normalizeComparable(normalized.value),
    );
    if (duplicate) return;

    const db = await openDB();
    const tx = db.transaction(MEMORIES_STORE, "readwrite");
    tx.objectStore(MEMORIES_STORE).add(normalized);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    await pruneNpcMemories(normalized.npc, 20);
  } catch {
    // Non-critical
  }
}

export async function getNpcMemories(
  npc: string,
  limit = 20,
): Promise<NpcMemory[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(MEMORIES_STORE, "readonly");
    const index = tx.objectStore(MEMORIES_STORE).index("npc");
    const request = index.getAll(npc);
    const memories = await new Promise<NpcMemory[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as NpcMemory[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return sortByInsertion(memories).slice(-limit);
  } catch {
    return [];
  }
}

export async function pruneNpcMemories(npc: string, maxKeep = 20): Promise<void> {
  try {
    const memories = await getNpcMemories(npc, 1000);
    if (memories.length <= maxKeep) return;
    const toDrop = sortByInsertion(memories)
      .slice(0, memories.length - maxKeep)
      .filter((memory) => memory.id !== undefined);
    const db = await openDB();
    const tx = db.transaction(MEMORIES_STORE, "readwrite");
    const store = tx.objectStore(MEMORIES_STORE);
    for (const memory of toDrop) {
      store.delete(memory.id!);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
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

function normalizeMemory(npc: string, memory: NewNpcMemory): NpcMemory | null {
  const normalizedNpc = normalizeText(npc, MEMORY_LABEL_MAX);
  if (!normalizedNpc) return null;
  if (!isValidKind(memory.kind) || !isValidSource(memory.source)) return null;

  let label: string | undefined;
  if (memory.label !== undefined) {
    const normalizedLabel = normalizeText(memory.label, MEMORY_LABEL_MAX);
    if (!normalizedLabel) return null;
    label = normalizedLabel;
  }

  const value = normalizeText(memory.value, MEMORY_VALUE_MAX);
  if (!value) return null;

  return {
    npc: normalizedNpc,
    kind: memory.kind,
    label,
    value,
    source: memory.source,
    createdAt: memory.createdAt ?? Date.now(),
    gameDay: memory.gameDay,
  };
}

function normalizeText(value: string, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  if (CONTROL_CHARS.test(value)) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function normalizeComparable(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isValidKind(kind: string): kind is NpcMemoryKind {
  return VALID_MEMORY_KINDS.includes(kind as NpcMemoryKind);
}

function isValidSource(source: string): source is NpcMemorySource {
  return VALID_MEMORY_SOURCES.includes(source as NpcMemorySource);
}
