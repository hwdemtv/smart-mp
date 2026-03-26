import Logger from "./logger";

// Database configuration
const DB_NAME = 'smart-mp-cache';
const DB_VERSION = 1;
const STORE_NAME = 'css-cache';

export interface CachedEntry {
    key: string;
    timestamp: number;
    hitCount: number;
    // Serialized state (Maps converted to plain objects)
    vars: Record<string, string>;
    rules: Record<string, Record<string, { value: string; important: boolean }>>;
    keyedRules: Record<string, string[]>;
    universalRules: string[];
}

/**
 * Open IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
    });
}

/**
 * Get all cached entries from IndexedDB
 */
export async function loadAllCacheEntries(): Promise<CachedEntry[]> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    } catch (error) {
        Logger.warn("IndexedDB", "Failed to load cache:", error);
        return [];
    }
}

/**
 * Save a cache entry to IndexedDB
 */
export async function saveCacheEntry(entry: CachedEntry): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(entry);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        Logger.warn("IndexedDB", "Failed to save cache:", error);
    }
}

/**
 * Delete a cache entry from IndexedDB
 */
export async function deleteCacheEntry(key: string): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        Logger.warn("IndexedDB", "Failed to delete cache:", error);
    }
}

/**
 * Clear all cache entries from IndexedDB
 */
export async function clearAllCacheEntries(): Promise<void> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        Logger.warn("IndexedDB", "Failed to clear cache:", error);
    }
}
