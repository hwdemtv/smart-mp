/**
 * Tests for crypto-helper.ts
 */
import { describe, it, expect } from 'vitest';
import { CryptoHelper } from '../../utils/crypto-helper';

describe('CryptoHelper', () => {
    describe('generateKey', () => {
        it('should generate a 64-character hex string (256 bit)', () => {
            const key = CryptoHelper.generateKey();
            expect(key).toHaveLength(64);
            expect(/^[0-9a-f]+$/.test(key)).toBe(true);
        });

        it('should generate unique keys', () => {
            const key1 = CryptoHelper.generateKey();
            const key2 = CryptoHelper.generateKey();
            expect(key1).not.toBe(key2);
        });
    });

    describe('sha256', () => {
        it('should compute SHA-256 hash', async () => {
            const hash = await CryptoHelper.sha256('test');
            expect(hash).toHaveLength(64); // SHA-256 produces 256 bits = 64 hex chars
            expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
        });

        it('should produce consistent hashes', async () => {
            const hash1 = await CryptoHelper.sha256('hello');
            const hash2 = await CryptoHelper.sha256('hello');
            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes for different inputs', async () => {
            const hash1 = await CryptoHelper.sha256('hello');
            const hash2 = await CryptoHelper.sha256('world');
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('encrypt and decrypt', () => {
        const testKey = '0'.repeat(64); // Test key

        it('should encrypt and decrypt text correctly', async () => {
            const plaintext = 'my secret api key';
            const encrypted = await CryptoHelper.encrypt(plaintext, testKey);
            expect(encrypted).not.toBe(plaintext);
            expect(encrypted.startsWith('aes:')).toBe(true);

            const decrypted = await CryptoHelper.decrypt(encrypted, testKey);
            expect(decrypted).toBe(plaintext);
        });

        it('should handle empty string', async () => {
            const encrypted = await CryptoHelper.encrypt('', testKey);
            expect(encrypted).toBe('');

            const decrypted = await CryptoHelper.decrypt('', testKey);
            expect(decrypted).toBe('');
        });

        it('should produce different ciphertexts for same plaintext (random IV)', async () => {
            const plaintext = 'same text';
            const encrypted1 = await CryptoHelper.encrypt(plaintext, testKey);
            const encrypted2 = await CryptoHelper.encrypt(plaintext, testKey);

            // Due to random IV, ciphertexts should be different
            expect(encrypted1).not.toBe(encrypted2);

            // But both should decrypt to same plaintext
            const decrypted1 = await CryptoHelper.decrypt(encrypted1, testKey);
            const decrypted2 = await CryptoHelper.decrypt(encrypted2, testKey);
            expect(decrypted1).toBe(plaintext);
            expect(decrypted2).toBe(plaintext);
        });

        it('should handle unicode characters', async () => {
            const plaintext = '中文测试 🎉 émoji';
            const encrypted = await CryptoHelper.encrypt(plaintext, testKey);
            const decrypted = await CryptoHelper.decrypt(encrypted, testKey);
            expect(decrypted).toBe(plaintext);
        });
    });

    describe('obfuscate and deobfuscate (legacy)', () => {
        const testKey = 'test_key_123';

        it('should obfuscate and deobfuscate text', () => {
            const plaintext = 'api_secret_123';
            const obfuscated = CryptoHelper.obfuscate(plaintext, testKey);
            expect(obfuscated).not.toBe(plaintext);

            const deobfuscated = CryptoHelper.deobfuscate(obfuscated, testKey);
            expect(deobfuscated).toBe(plaintext);
        });

        it('should handle empty string', () => {
            expect(CryptoHelper.obfuscate('', testKey)).toBe('');
            expect(CryptoHelper.deobfuscate('', testKey)).toBe('');
        });

        it('should return plaintext if not base64', () => {
            const plaintext = 'not base64 encoded!';
            const result = CryptoHelper.deobfuscate(plaintext, testKey);
            expect(result).toBe(plaintext);
        });
    });

    describe('deobfuscateLegacy', () => {
        it('should use default legacy key', () => {
            const plaintext = 'legacy_secret';
            // Encrypt with legacy key
            const obfuscated = CryptoHelper.obfuscate(plaintext, 'smartmp_secret_key');
            const deobfuscated = CryptoHelper.deobfuscateLegacy(obfuscated);
            expect(deobfuscated).toBe(plaintext);
        });
    });
});
