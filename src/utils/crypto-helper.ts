import Logger from "./logger";

// AES 加密数据前缀，用于区分新旧格式
const AES_PREFIX = 'aes:';
const LEGACY_KEY = 'smartmp_secret_key';

export class CryptoHelper {
    /**
     * 生成随机加密密钥 (256 bit)
     */
    static generateKey(): string {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 计算字符串的 SHA-256 哈希值
     * 用于密码验证等场景
     */
    static async sha256(text: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 加密文本 (AES-GCM)
     * 返回格式: aes:<base64(iv)>:<base64(ciphertext)>
     */
    static async encrypt(plaintext: string, keyHex: string): Promise<string> {
        if (!plaintext) return '';

        try {
            const key = await this.deriveKey(keyHex);
            const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
            const encoder = new TextEncoder();
            const data = encoder.encode(plaintext);

            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );

            const ivBase64 = btoa(String.fromCharCode(...iv));
            const ctBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

            return `${AES_PREFIX}${ivBase64}:${ctBase64}`;
        } catch (e) {
            Logger.error("Crypto", "Encrypt failed:", e);
            // 加密失败时回退到旧方法
            return this.obfuscate(plaintext, keyHex);
        }
    }

    /**
     * 解密文本
     * 自动识别格式：AES-GCM 或旧版 XOR
     */
    static async decrypt(ciphertext: string, keyHex: string): Promise<string> {
        if (!ciphertext) return '';

        // 检测是否为 AES 加密格式
        if (ciphertext.startsWith(AES_PREFIX)) {
            try {
                const data = ciphertext.slice(AES_PREFIX.length);
                const [ivBase64, ctBase64] = data.split(':');

                if (!ivBase64 || !ctBase64) {
                    throw new Error('Invalid AES format');
                }

                const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
                const ct = Uint8Array.from(atob(ctBase64), c => c.charCodeAt(0));
                const key = await this.deriveKey(keyHex);

                const plainBuffer = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv },
                    key,
                    ct
                );

                return new TextDecoder().decode(plainBuffer);
            } catch (e) {
                Logger.error("Crypto", "AES decrypt failed:", e);
                return ciphertext; // 解密失败返回原文
            }
        }

        // 尝试旧版 XOR 解密
        return this.deobfuscate(ciphertext, keyHex);
    }

    /**
     * 从十六进制字符串派生 AES 密钥
     */
    private static async deriveKey(keyHex: string): Promise<CryptoKey> {
        // 确保密钥长度为 32 字节 (256 bit)
        const keyBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            const hex = keyHex.slice(i * 2, i * 2 + 2) || '00';
            keyBytes[i] = parseInt(hex, 16) || 0;
        }

        return crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    // ========== 旧版兼容方法 ==========

    /**
     * [兼容] XOR + Base64 混淆
     */
    static obfuscate(text: string, key: string): string {
        if (!text) return '';
        try {
            const xor = this.xor(text, key || LEGACY_KEY);
            return btoa(xor);
        } catch (e) {
            Logger.error("Crypto", "Obfuscate failed", e);
            return text;
        }
    }

    /**
     * [兼容] Base64 + XOR 解混淆
     */
    static deobfuscate(text: string, key: string): string {
        if (!text) return '';
        try {
            // 检查是否为 base64 格式
            if (!/^[A-Za-z0-9+/=]+$/.test(text)) {
                return text; // 明文直接返回
            }
            const decoded = atob(text);
            return this.xor(decoded, key || LEGACY_KEY);
        } catch (e) {
            return text; // 解码失败返回原文
        }
    }

    /**
     * [兼容] 使用旧版固定密钥解密
     */
    static deobfuscateLegacy(text: string): string {
        return this.deobfuscate(text, LEGACY_KEY);
    }

    private static xor(text: string, key: string): string {
        let result = '';
        const k = key || LEGACY_KEY;
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ k.charCodeAt(i % k.length));
        }
        return result;
    }
}
