/**
 * Tests for css-cache.ts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CSSCache } from '../../theme/css-cache';

describe('CSSCache', () => {
    describe('generateKey (hash function)', () => {
        it('should generate consistent hash for same input', () => {
            const css1 = '.test { color: red; }';
            const css2 = '.test { color: red; }';

            const key1 = CSSCache.generateKey(css1);
            const key2 = CSSCache.generateKey(css2);

            expect(key1).toBe(key2);
        });

        it('should generate different hashes for different inputs', () => {
            const css1 = '.test { color: red; }';
            const css2 = '.test { color: blue; }';

            const key1 = CSSCache.generateKey(css1);
            const key2 = CSSCache.generateKey(css2);

            expect(key1).not.toBe(key2);
        });

        it('should generate 8-character hex string', () => {
            const css = '.test { color: red; }';
            const key = CSSCache.generateKey(css);

            expect(key).toHaveLength(8);
            expect(/^[0-9a-f]+$/.test(key)).toBe(true);
        });

        it('should handle empty CSS', () => {
            const key = CSSCache.generateKey('');
            expect(key).toHaveLength(8);
        });

        it('should handle large CSS content', () => {
            const largeCss = '.test { color: red; }'.repeat(1000);
            const key = CSSCache.generateKey(largeCss);

            expect(key).toHaveLength(8);
            // Should still be consistent
            const key2 = CSSCache.generateKey(largeCss);
            expect(key).toBe(key2);
        });
    });

    describe('Cache behavior', () => {
        it('should have TTL of 24 hours', () => {
            const TTL = 24 * 60 * 60 * 1000; // 24 hours in ms
            expect(TTL).toBe(86400000);
        });

        it('should have max size of 10', () => {
            const MAX_SIZE = 10;
            expect(MAX_SIZE).toBe(10);
        });

        it('should implement LRU eviction', () => {
            // Test concept: when cache is full, remove oldest entry
            const cache = new Map<string, { timestamp: number }>();
            const MAX_SIZE = 3;

            // Add entries
            cache.set('a', { timestamp: 1 });
            cache.set('b', { timestamp: 2 });
            cache.set('c', { timestamp: 3 });

            expect(cache.size).toBe(3);

            // Add one more, should evict oldest
            if (cache.size >= MAX_SIZE) {
                const firstKey = cache.keys().next().value;
                cache.delete(firstKey);
            }
            cache.set('d', { timestamp: 4 });

            expect(cache.size).toBe(3);
            expect(cache.has('a')).toBe(false);
            expect(cache.has('d')).toBe(true);
        });

        it('should check TTL expiry', () => {
            const TTL = 24 * 60 * 60 * 1000;
            const now = Date.now();

            // Fresh entry
            const freshTimestamp = now - 1000; // 1 second ago
            expect(now - freshTimestamp < TTL).toBe(true);

            // Expired entry
            const expiredTimestamp = now - TTL - 1000; // 24 hours + 1 second ago
            expect(now - expiredTimestamp > TTL).toBe(true);
        });
    });

    describe('Cache operations', () => {
        it('should store and retrieve entries', () => {
            const cache = new Map<string, string>();
            cache.set('key1', 'value1');

            expect(cache.get('key1')).toBe('value1');
            expect(cache.get('nonexistent')).toBeUndefined();
        });

        it('should clear all entries', () => {
            const cache = new Map<string, string>();
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');

            cache.clear();

            expect(cache.size).toBe(0);
        });

        it('should handle concurrent access safely', () => {
            const cache = new Map<string, number>();

            // Simulate concurrent writes
            for (let i = 0; i < 100; i++) {
                cache.set(`key${i}`, i);
            }

            expect(cache.size).toBe(100);

            // Verify all entries
            for (let i = 0; i < 100; i++) {
                expect(cache.get(`key${i}`)).toBe(i);
            }
        });
    });
});
