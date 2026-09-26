/**
 * @vitest-environment jsdom
 *
 * 真实源码测试：HTMLSanitizer / SafeHTML
 * 此前本文件为同义反复测试（0 个真实导入，断言测试文件里自写的字符串字面量）。
 * 现在直接导入 src/utils/sanitize-html.ts，验证白名单净化器的实际行为。
 */
import { describe, it, expect } from 'vitest';
import { SafeHTML } from 'src/utils/sanitize-html';

// Obsidian 为 Element 扩展的 empty()（jsdom 没有），setSafeHTML 依赖
if (!(Element.prototype as any).empty) {
	(Element.prototype as any).empty = function (): void {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
}

function sanitizeToDiv(html: string): HTMLElement {
	const div = document.createElement('div');
	SafeHTML.setSafeHTML(div, html);
	return div;
}

describe('HTMLSanitizer（真实源码）', () => {
	it('保留普通标签与文本', () => {
		const out = sanitizeToDiv('<p>段落 <strong>加粗</strong></p>');
		expect(out.querySelector('p')).toBeTruthy();
		expect(out.querySelector('strong')).toBeTruthy();
		expect(out.textContent).toContain('段落');
	});

	it('剥离 script 标签', () => {
		const out = sanitizeToDiv('<p>安全</p><script>alert(1)</script>');
		expect(out.querySelector('script')).toBeNull();
	});

	it('剥离 iframe 标签', () => {
		const out = sanitizeToDiv('<iframe src="https://evil.example"></iframe>');
		expect(out.querySelector('iframe')).toBeNull();
	});

	it('剥离 on* 事件属性（XSS 主路径）', () => {
		const out = sanitizeToDiv('<img src="x.png" onerror="alert(1)">');
		const img = out.querySelector('img');
		// img 本身是合法标签应保留，但 onerror 必须被剥掉
		expect(img).toBeTruthy();
		expect(img?.getAttribute('onerror')).toBeNull();
	});

	it('拦截 javascript: 协议链接', () => {
		const out = sanitizeToDiv('<a href="javascript:alert(1)">点我</a>');
		const a = out.querySelector('a');
		if (a) {
			// 若保留 a，href 不得是 javascript:
			expect(a.getAttribute('href')?.toLowerCase().startsWith('javascript:')).toBeFalsy();
		}
	});

	it('拦截 javascript: 协议图片', () => {
		const out = sanitizeToDiv('<img src="javascript:alert(1)">');
		const img = out.querySelector('img');
		expect(img?.getAttribute('src')?.toLowerCase().startsWith('javascript:')).toBeFalsy();
	});

	it('style 属性经过过滤（剔除危险 CSS）', () => {
		const out = sanitizeToDiv('<p style="color:red; position:fixed; top:0">文字</p>');
		const p = out.querySelector('p');
		const style = p?.getAttribute('style') ?? '';
		// position:fixed 这类布局劫持属性不应保留
		expect(style.toLowerCase()).not.toContain('position:fixed');
	});

	it('htmlToFragment 强制净化：strict=false 也走白名单（防绕过）', () => {
		const frag = SafeHTML.htmlToFragment('<script>alert(1)</script><p>ok</p>', false);
		const div = document.createElement('div');
		div.appendChild(frag);
		expect(div.querySelector('script')).toBeNull();
		expect(div.textContent).toContain('ok');
	});
});
