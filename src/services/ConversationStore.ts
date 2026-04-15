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
  timestamp: number;
  gameDay: number;
  lines: string[];
  trustBefore: number;
  trustAfter: number;
  chapter: number;
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
  } catch {
    // IndexedDB may be unavailable in some contexts (private browsing, etc.)
    // Fail silently — conversation storage is non-critical for gameplay.
  }
}

export async function getRecentConversations(
  speaker: string,
  limit = 10,
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
