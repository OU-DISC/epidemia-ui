const DB_NAME = "epidemia-offline-cache";
const STORE_NAME = "bootstrap";
const DB_VERSION = 1;

function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function openDatabase() {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

function reportGeneratedAtMs(payload) {
  const parsed = Date.parse(payload?.generated_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function readBootstrapCache(cacheKey) {
  if (!cacheKey || !isIndexedDbAvailable()) return null;

  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const entry = request.result;
        resolve(entry?.payload || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function writeBootstrapCache(cacheKey, payload) {
  if (!cacheKey || !payload || !isIndexedDbAvailable()) return;

  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(
        {
          payload,
          generatedAt: payload?.generated_at || null,
          generatedAtMs: reportGeneratedAtMs(payload),
          savedAt: new Date().toISOString(),
        },
        cacheKey
      );

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn("Failed to write bootstrap cache:", err);
  }
}

export function bootstrapCacheKey(kind, horizonWeeks = 8) {
  return `epidemia-${kind}-h${horizonWeeks}`;
}
