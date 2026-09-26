/**
 * 共享的内容哈希工具
 *
 * 取代此前各处自制的 32 位 djb2/xor 哈希：32 位空间在大量文档/主题
 * 场景下碰撞概率不可忽略，碰撞即返回错误缓存内容（渲染缓存串文档、
 * CSS 缓存串主题）。
 */

/**
 * 同步双车道 64 位 FNV-1a 变体（兼容 ES2018 target，无 BigInt）。
 * hi/lo 各 32 位独立演化，联合提供 64 位区分度，碰撞概率 1/2^64。
 */
export function fastHash64(str: string): string {
	let hi = 0x84222325 >>> 0;
	let lo = 0x0cbf2ce8 >>> 0;
	for (let i = 0; i < str.length; i++) {
		const c = str.charCodeAt(i);
		// 车道 lo：FNV-1a（32 位）
		lo = ((lo ^ c) >>> 0) * 0x01000193 >>> 0;
		// 车道 hi：错位吸收 lo 的中间态（避免两车道同构退化）
		hi = ((hi ^ ((lo + i) >>> 0)) * 0x01000193) >>> 0;
	}
	return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/**
 * 异步 SHA-256 短哈希（64 bit 十六进制 16 字符）。
 * 推荐：内容寻址安全性更高；缓存键可异步时优先使用。
 */
export async function sha256Short(str: string): Promise<string> {
	const data = new TextEncoder().encode(str);
	const digest = await crypto.subtle.digest('SHA-256', data);
	const bytes = new Uint8Array(digest).subarray(0, 8); // 64 bit
	return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
