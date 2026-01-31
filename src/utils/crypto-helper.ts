/**
 * Simple crypto helper for obfuscating sensitive settings.
 * Note: This is NOT strong encryption, just obfuscation to prevent plain text viewing.
 */

export class CryptoHelper {
    private static LEGACY_KEY = 'smartmp_secret_key';

    static generateKey(): string {
        return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    }

    /**
     * Obfuscate text using XOR + Base64 with a specific key
     */
    static obfuscate(text: string, key: string): string {
        if (!text) return '';
        try {
            const xor = this.xor(text, key);
            return window.btoa(xor);
        } catch (e) {
            console.error('[Crypto] Obfuscate failed', e);
            return text; // Fallback to plain text if failed
        }
    }

    /**
     * Deobfuscate text using Base64 + XOR with a specific key
     */
    static deobfuscate(text: string, key: string): string {
        if (!text) return '';
        try {
            // Check if it looks like base64
            if (!/^[A-Za-z0-9+/=]+$/.test(text)) {
                return text; // Assume it's already plain text
            }

            const decoded = window.atob(text);
            return this.xor(decoded, key);
        } catch (e) {
            // If atob fails, it's likely plain text
            return text;
        }
    }

    static deobfuscateLegacy(text: string): string {
        return this.deobfuscate(text, this.LEGACY_KEY);
    }

    private static xor(text: string, key: string): string {
        let result = '';
        if (!key) key = this.LEGACY_KEY;
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
    }
}
