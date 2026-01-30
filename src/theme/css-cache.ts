import { Root } from 'postcss';

export interface CachedCSS {
    ast: Root;
    timestamp: number;
    variables: Map<string, string>;
    state: any; // Cached processed state (CssMerger state)
}

export class CSSCache {
    private static instance: CSSCache;
    private cache = new Map<string, CachedCSS>();
    private readonly MAX_SIZE = 10; // Cache cache size
    private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours

    static getInstance(): CSSCache {
        if (!CSSCache.instance) {
            CSSCache.instance = new CSSCache();
        }
        return CSSCache.instance;
    }

    get(cssKey: string): CachedCSS | null {
        const item = this.cache.get(cssKey);
        if (!item) return null;

        const now = Date.now();
        if (now - item.timestamp > this.TTL) {
            this.cache.delete(cssKey);
            return null;
        }

        return item;
    }

    set(cssKey: string, ast: Root, variables: Map<string, string>, state: any) {
        // Eviction policy: Remove oldest if full
        if (this.cache.size >= this.MAX_SIZE) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }

        this.cache.set(cssKey, {
            ast,
            timestamp: Date.now(),
            variables,
            state
        });
    }

    clear() {
        this.cache.clear();
    }
}
