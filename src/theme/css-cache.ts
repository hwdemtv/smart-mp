import { loadAllCacheEntries, saveCacheEntry, deleteCacheEntry, clearAllCacheEntries, CachedEntry } from '../utils/indexeddb';
import Logger from '../utils/logger';

/**
 * Simple hash function for CSS content (djb2 variant)
 * Generates a short, collision-resistant hash for cache keys
 */
function hashCSS(css: string): string {
    let hash = 5381;
    for (let i = 0; i < css.length; i++) {
        const char = css.charCodeAt(i);
        hash = ((hash << 5) + hash) ^ char; // hash * 33 ^ char
    }
    // Convert to hex string, ensuring positive number
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * CSS 缓存状态接口
 */
export interface CachedCSSState {
    vars: Map<string, string>;
    rules: Map<string, Map<string, { value: string; important: boolean }>>;
    keyedRules: Map<string, string[]>;
    universalRules: string[];
}

export interface CachedCSS {
    timestamp: number;
    variables: Map<string, string>;
    state: CachedCSSState | null; // Cached processed state (CssMerger state)
    hitCount: number; // Number of times this entry was accessed
}

export interface CacheStats {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    entries: Array<{
        key: string;
        age: number; // milliseconds since creation
        hitCount: number;
    }>;
}

/**
 * Convert plain objects to Maps (deserialize from IndexedDB)
 */
function deserializeState(entry: CachedEntry): CachedCSSState {
    const vars = new Map<string, string>(Object.entries(entry.vars || {}));

    const rules = new Map<string, Map<string, { value: string; important: boolean }>>();
    if (entry.rules) {
        for (const [selector, ruleObj] of Object.entries(entry.rules)) {
            const typedRuleObj = ruleObj as Record<string, { value: string; important: boolean }>;
            rules.set(selector, new Map<string, { value: string; important: boolean }>(Object.entries(typedRuleObj)));
        }
    }

    const keyedRules = new Map<string, string[]>();
    if (entry.keyedRules) {
        for (const [key, arr] of Object.entries(entry.keyedRules)) {
            keyedRules.set(key, arr as string[]);
        }
    }

    return {
        vars,
        rules,
        keyedRules,
        universalRules: entry.universalRules || []
    };
}

/**
 * Convert Maps to plain objects (serialize for IndexedDB)
 */
function serializeState(state: CachedCSSState): Omit<CachedEntry, 'key' | 'timestamp' | 'hitCount'> {
    const vars: Record<string, string> = {};
    state.vars.forEach((value, key) => {
        vars[key] = value;
    });

    const rules: Record<string, Record<string, { value: string; important: boolean }>> = {};
    state.rules.forEach((rule, selector) => {
        const ruleObj: Record<string, { value: string; important: boolean }> = {};
        rule.forEach((decl, prop) => {
            ruleObj[prop] = { value: decl.value, important: decl.important };
        });
        rules[selector] = ruleObj;
    });

    const keyedRules: Record<string, string[]> = {};
    state.keyedRules.forEach((arr, key) => {
        keyedRules[key] = arr;
    });

    return {
        vars,
        rules,
        keyedRules,
        universalRules: state.universalRules
    };
}

/**
 * Enhanced CSS cache with LRU eviction strategy, statistics, and IndexedDB persistence
 */
export class CSSCache {
    private static instance: CSSCache;
    private cache = new Map<string, CachedCSS>();
    private readonly MAX_SIZE = 10; // Maximum cache entries
    private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    // Statistics
    private hits = 0;
    private misses = 0;
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    static getInstance(): CSSCache {
        if (!CSSCache.instance) {
            CSSCache.instance = new CSSCache();
        }
        return CSSCache.instance;
    }

    /**
     * Generate a hash key from CSS content
     * Use this to create cache keys instead of passing full CSS strings
     */
    static generateKey(cssContent: string): string {
        return hashCSS(cssContent);
    }

    /**
     * Initialize cache from IndexedDB (lazy load)
     */
    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            const entries = await loadAllCacheEntries();
            const now = Date.now();

            for (const entry of entries) {
                // Skip expired entries
                if (now - entry.timestamp > this.TTL) {
                    await deleteCacheEntry(entry.key);
                    continue;
                }

                const state = deserializeState(entry);
                this.cache.set(entry.key, {
                    timestamp: entry.timestamp,
                    variables: new Map(Object.entries(entry.vars || {})),
                    state,
                    hitCount: entry.hitCount
                });
            }

            this.initialized = true;
            Logger.debug('CSSCache', `Loaded ${this.cache.size} entries from IndexedDB`);
        })();

        return this.initPromise;
    }

    /**
     * Get a cached CSS entry
     * Implements LRU by moving accessed items to the end
     */
    async get(cssKey: string): Promise<CachedCSS | null> {
        // Lazy initialization from IndexedDB
        await this.ensureInitialized();

        const item = this.cache.get(cssKey);
        if (!item) {
            this.misses++;
            return null;
        }

        const now = Date.now();
        if (now - item.timestamp > this.TTL) {
            this.cache.delete(cssKey);
            deleteCacheEntry(cssKey); // Remove from IndexedDB
            this.misses++;
            return null;
        }

        // LRU: Move to end (most recently used)
        this.cache.delete(cssKey);
        item.hitCount++;
        this.cache.set(cssKey, item);
        this.hits++;

        return item;
    }

    /**
     * Set a cached CSS entry
     * Implements LRU eviction when cache is full
     */
    async set(cssKey: string, ast: null, variables: Map<string, string>, state: CachedCSSState | null) {
        // Ensure initialized before set to prevent race conditions
        await this.ensureInitialized();

        // Remove existing entry if present (for LRU update)
        if (this.cache.has(cssKey)) {
            this.cache.delete(cssKey);
        }

        // LRU eviction: Remove least recently used (first entry)
        if (this.cache.size >= this.MAX_SIZE) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
                await deleteCacheEntry(firstKey); // Await to ensure deletion completes
            }
        }

        const timestamp = Date.now();
        this.cache.set(cssKey, {
            timestamp,
            variables,
            state,
            hitCount: 0
        });

        // Persist to IndexedDB
        if (state) {
            const serialized = serializeState(state);
            // Merge variables into the serialized state
            const vars: Record<string, string> = {};
            variables.forEach((v, k) => vars[k] = v);

            const entry: CachedEntry = {
                key: cssKey,
                timestamp,
                hitCount: 0,
                vars,
                rules: serialized.rules,
                keyedRules: serialized.keyedRules,
                universalRules: serialized.universalRules
            };
            // Fire and forget with error handling for performance
            saveCacheEntry(entry).catch(err => {
                Logger.warn('CSSCache', 'Failed to persist cache entry:', err);
            });
        }
    }

    /**
     * Check if a key exists in cache (without updating LRU order)
     */
    async has(cssKey: string): Promise<boolean> {
        // Ensure initialized for consistent state
        await this.ensureInitialized();

        const item = this.cache.get(cssKey);
        if (!item) return false;

        const now = Date.now();
        return (now - item.timestamp) <= this.TTL;
    }

    /**
     * Delete a specific entry
     */
    async delete(cssKey: string): Promise<boolean> {
        const result = this.cache.delete(cssKey);
        await deleteCacheEntry(cssKey);
        return result;
    }

    /**
     * Clear all cache entries and reset statistics
     */
    async clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
        await clearAllCacheEntries();
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const now = Date.now();
        const total = this.hits + this.misses;

        return {
            size: this.cache.size,
            maxSize: this.MAX_SIZE,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? this.hits / total : 0,
            entries: Array.from(this.cache.entries()).map(([key, value]) => ({
                key,
                age: now - value.timestamp,
                hitCount: value.hitCount
            }))
        };
    }

    /**
     * Prune expired entries
     */
    async prune(): Promise<number> {
        const now = Date.now();
        let pruned = 0;

        for (const [key, item] of this.cache.entries()) {
            if (now - item.timestamp > this.TTL) {
                this.cache.delete(key);
                await deleteCacheEntry(key);
                pruned++;
            }
        }

        return pruned;
    }

    /**
     * Get current cache size
     */
    get size(): number {
        return this.cache.size;
    }
}
