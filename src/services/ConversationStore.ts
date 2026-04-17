/**
 * IndexedDB-backed conversation history store.
 *
 * Persists every dialogue interaction for later retrieval.
 * Phase 4: used to track conversation count for scripted dialogue gating.
 * Phase 5: conversation history feeds the AI dialogue service as context.
 */

const DB_NAME = "ayala_conversations";
const DB_VERSION = 1;
const STORE_NAME = "conversations";

export interface ConversationRecord {
  id?: number;
  speaker: string;
  /** Game-time ms (DayNightCycle). */
  timestamp: number;
  /** Wall clock for debugging / ordering. */
  realTimestamp?: number;
  gameDay: number;
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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("speaker", "speaker", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeConversation(record: ConversationRecord): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(record);
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

/** Keeps at most `maxKeep` newest records per speaker (by game `timestamp`). */
export async function pruneConversations(speaker: string, maxKeep = 100): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("speaker");
    const request = index.getAll(speaker);
    const records = await new Promise<ConversationRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as ConversationRecord[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (records.length <= maxKeep) return;
    const sorted = [...records].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    const toDrop = sorted.slice(0, sorted.length - maxKeep).filter((r) => r.id !== undefined);
    const db2 = await openDB();
    const tx2 = db2.transaction(STORE_NAME, "readwrite");
    const store = tx2.objectStore(STORE_NAME);
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
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("speaker");
    const request = index.getAll(speaker);

    const records = await new Promise<ConversationRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as ConversationRecord[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records.slice(-limit);
  } catch {
    return [];
  }
}

export async function getConversationCount(speaker: string): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("speaker");
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
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fail silently
  }
}
