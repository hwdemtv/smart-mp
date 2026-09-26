/**
 * @vitest-environment jsdom
 *
 * 真实源码测试：marked 扩展
 * 此前本文件 1661 行全部为"自嗨式"测试（不导入 src 源码，在测试内复刻逻辑，
 * 永远不会失败也发现不了真 bug）。现改为直接导入真实扩展类，用 mock 的
 * plugin/previewRender 驱动，断言真实渲染输出。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Marked } from 'marked';

// mock obsidian：sanitizeHTMLToDom 用仓库内真实净化器实现（Obsidian API 的行为等价替身），
// 使 Heading 的 sanitize 路径可被真实断言
vi.mock('obsidian', async () => {
	const { SafeHTML } = await import('src/utils/sanitize-html');
	return {
		sanitizeHTMLToDom: (html: string) => {
			const div = document.createElement('div');
			SafeHTML.setSafeHTML(div, html);
			return div;
		},
		Notice: class {},
	};
});

import { BlockquoteRenderer, preprocessCalloutContainers } from 'src/render/marked-extensions/blockquote';
import { CodespanRenderer } from 'src/render/marked-extensions/codespan';
import { Heading } from 'src/render/marked-extensions/heading';
import { Footnote } from 'src/render/marked-extensions/footnote';
import { PreviewRender } from 'src/render/marked-extensions/extension';

// Obsidian 为 Element 扩展的 API（jsdom 没有），footnote/heading 渲染依赖
if (!(Element.prototype as any).createEl) {
	(Element.prototype as any).createEl = function (tag: string, opts?: any): HTMLElement {
		const el = document.createElement(tag);
		if (opts?.cls) el.className = opts.cls;
		if (opts?.text != null) el.textContent = opts.text;
		if (opts?.attr) for (const [k, v] of Object.entries(opts.attr)) el.setAttribute(k, String(v));
		this.appendChild(el);
		return el;
	};
	(Element.prototype as any).createSpan = function (opts?: any): HTMLElement {
		return (this as any).createEl('span', opts);
	};
	(Element.prototype as any).createDiv = function (opts?: any): HTMLElement {
		return (this as any).createEl('div', opts);
	};
	(Element.prototype as any).empty = function (): void {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
	(Element.prototype as any).addClass = function (...cls: string[]): void {
		this.classList.add(...cls);
	};
	(Element.prototype as any).removeClass = function (...cls: string[]): void {
		this.classList.remove(...cls);
	};
	(Element.prototype as any).toggleClass = function (cls: string, force?: boolean): void {
		if (force === undefined) this.classList.toggle(cls);
		else this.classList.toggle(cls, force);
	};
}

/** 构造最小可用的 plugin/previewRender mock */
function makeDeps(settings: Record<string, unknown> = {}) {
	const plugin: any = {
		settings: { codeTheme: 'github', ...settings },
		app: { plugins: { plugins: {} } },
	};
	const previewRender: PreviewRender = {
		updateElementByID: vi.fn(),
		addElementByID: vi.fn(),
		articleProperties: new Map<string, string>(),
	};
	return { plugin, previewRender };
}

function newMarked() {
	const marked = new Marked();
	marked.use({ gfm: true, breaks: true });
	return marked;
}

// ============ preprocessCalloutContainers（纯函数） ============
describe('preprocessCalloutContainers（真实源码）', () => {
	it('将 ::: callout 容器转换为带 callout data 的 blockquote', () => {
		const md = ':::note\n内容行\n:::';
		const out = preprocessCalloutContainers(md);
		expect(out).toContain('[!note]');
		expect(out).toContain('内容行');
	});

	it('无 ::: 容器的文本原样返回', () => {
		const md = '# 标题\n\n普通段落';
		expect(preprocessCalloutContainers(md)).toBe(md);
	});
});

// ============ BlockquoteRenderer（真实类，经 marked 渲染） ============
describe('BlockquoteRenderer（真实源码）', () => {
	it('渲染 [!tip] callout 为带类型的 section', async () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new BlockquoteRenderer(plugin, previewRender, newMarked());
		const marked = newMarked();
		marked.use(ext.markedExtension());

		const html = await marked.parse('> [!tip] 小标题\n> 正文内容');
		const dom = document.createElement('div');
		dom.innerHTML = html;
		await ext.postprocess(dom as unknown as HTMLElement);

		const section = dom.querySelector('blockquote') || dom.querySelector('section');
		expect(section).toBeTruthy();
		expect(dom.innerHTML).toContain('正文内容');
	});

	it('普通引用块正常渲染', async () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new BlockquoteRenderer(plugin, previewRender, newMarked());
		const marked = newMarked();
		marked.use(ext.markedExtension());

		const html = await marked.parse('> 普通引用');
		expect(html).toContain('普通引用');
	});
});

// ============ CodespanRenderer（真实类） ============
describe('CodespanRenderer（真实源码）', () => {
	it('行内代码转义 HTML 并带微信兼容内联样式', () => {
		const { plugin, previewRender } = makeDeps({ codeTheme: 'github' });
		const ext = new CodespanRenderer(plugin, previewRender, newMarked());
		const out = ext.codespanRenderer('Array<Image>');
		expect(out).toContain('smart-mp-codespan');
		expect(out).toContain('Array&lt;Image&gt;'); // 必须转义，否则微信会剥掉标签
		expect(out).toContain('background-color: #f6f8fa');
	});

	it('暗色主题使用 One Dark 配色', () => {
		const { plugin, previewRender } = makeDeps({ codeTheme: 'atom-one-dark' });
		const ext = new CodespanRenderer(plugin, previewRender, newMarked());
		const out = ext.codespanRenderer('code');
		expect(out).toContain('#282c34');
	});

	it('wwcap: 前缀提取为图片题注', () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new CodespanRenderer(plugin, previewRender, newMarked());
		const out = ext.codespanRenderer('wwcap: 这是题注');
		expect(out).toContain('smart-mp-image-caption');
		expect(out).toContain('这是题注');
	});

	it('经 marked 全链路渲染行内代码', async () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new CodespanRenderer(plugin, previewRender, newMarked());
		const marked = newMarked();
		marked.use(ext.markedExtension());
		const html = await marked.parse('使用 `npm install` 安装');
		expect(html).toContain('smart-mp-codespan');
		expect(html).toContain('npm install');
	});
});

// ============ Heading（真实类 postprocess） ============
describe('Heading postprocess（真实源码）', () => {
	it('为标题注入 prefix/leaf/tail 结构', async () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new Heading(plugin, previewRender, newMarked());
		const dom = document.createElement('div');
		dom.innerHTML = '<h2>章节标题</h2>';
		await ext.postprocess(dom as unknown as HTMLElement);

		const h2 = dom.querySelector('h2')!;
		expect(h2.querySelector('.smart-mp-heading-prefix')).toBeTruthy();
		const leaf = h2.querySelector('.smart-mp-heading-leaf');
		expect(leaf?.textContent).toBe('章节标题');
		expect(h2.querySelector('.smart-mp-heading-tail')).toBeTruthy();
	});

	it('含 HTML 的标题经过 sanitize', async () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new Heading(plugin, previewRender, newMarked());
		const dom = document.createElement('div');
		dom.innerHTML = '<h1>标题 <img src=x onerror=alert(1)>注入</h1>';
		await ext.postprocess(dom as unknown as HTMLElement);

		const leaf = dom.querySelector('.smart-mp-heading-leaf')!;
		expect(leaf.querySelector('img')?.getAttribute('onerror')).toBeNull();
		expect(leaf.textContent).toContain('注入');
	});
});

// ============ Footnote（真实类，walkTokens + postprocess 全链路） ============
describe('Footnote（真实源码）', () => {
	it('脚注标记与文末列表正确配对', async () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new Footnote(plugin, previewRender, newMarked());
		const marked = newMarked();
		marked.use(ext.markedExtension());
		await ext.prepare();

		const html = await marked.parse('正文有脚注[^1]。\n\n[^1]: 这是脚注内容');
		const dom = document.createElement('div');
		dom.innerHTML = html;
		await ext.postprocess(dom as unknown as HTMLElement);

		// 正文中的上标标记
		expect(dom.querySelector('sup a.footnote-mark')).toBeTruthy();
		// 文末脚注列表
		const list = dom.querySelector('.smart-mp-footnotes');
		expect(list).toBeTruthy();
		expect(dom.querySelector('.footnote-content')?.textContent).toContain('这是脚注内容');
	});

	it('无脚注的文档不生成脚注区', async () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new Footnote(plugin, previewRender, newMarked());
		const marked = newMarked();
		marked.use(ext.markedExtension());
		await ext.prepare();

		const html = await marked.parse('普通段落，无脚注');
		const dom = document.createElement('div');
		dom.innerHTML = html;
		await ext.postprocess(dom as unknown as HTMLElement);
		expect(dom.querySelector('.smart-mp-footnotes')).toBeNull();
	});

	it('prepare() 重置状态：上一篇的脚注不会串到下一篇', async () => {
		const { plugin, previewRender } = makeDeps();
		const ext = new Footnote(plugin, previewRender, newMarked());
		const marked = newMarked();
		marked.use(ext.markedExtension());

		await ext.prepare();
		await marked.parse('A[^x]\n\n[^x]: A 的脚注');

		await ext.prepare(); // 关键：渲染第二篇前必须重置
		const html = await marked.parse('B 无脚注');
		const dom = document.createElement('div');
		dom.innerHTML = html;
		await ext.postprocess(dom as unknown as HTMLElement);
		expect(dom.querySelector('.smart-mp-footnotes')).toBeNull();
	});
});
