/**
 * @vitest-environment jsdom
 *
 * 微信内容结构规范 —— 固定基准文章全管线导出测试。
 *
 * 双重用途：
 * 1. 作为常规回归测试（npm test）：断言导出 HTML 的结构性不变量（无 pre/var()/渐变/!important、行高显式 px）。
 * 2. 供 `npm run verify:wechat`（scripts/verify-wechat-structure.mjs）：产物 temp/fixture-export.html
 *    交给官方 CLI（wechatjs/verify-article-structure-spec）与补充条款脚本检测。
 *
 * 基准文章（fixtures/wechat-structure-fixture.md）刻意不含表格 / 图片 / Mermaid 等
 * 需回退 ObsidianMarkdownRenderer 的构造 —— jsdom 下无法复现该路径。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

import { WechatRender } from '../../render/wechat-render';
import { applyWechatCompatStyles } from '../../views/previewer';
import {
	inlineCssWithJuice,
	cleanHtmlForWechat,
	serializeChildren,
	stripUnsupportedCssFromHtml,
	stripCssVarReferences,
} from '../../utils/utils';
import { CSSMerger } from '../../theme/CssMerger';
import { getPresetCSS } from '../../theme/presets';

const FIXTURE_PATH = resolve(process.cwd(), 'src/__tests__/fixtures/wechat-structure-fixture.md');
const OUT_DIR = join(process.cwd(), 'temp');
const OUT_PATH = join(OUT_DIR, 'fixture-export.html');

/** 与用户生产 data.json 关键设置一致 */
const SETTINGS = {
	codeLineNumber: true,
	codeTheme: 'github',
	showCodeMacHeader: true,
	fontSize: '15px',
	firstLineIndent: false,
	linkFootnotes: true,
	showImageCaptions: false,
	hrStyle: 'dots',
	customHrText: '· · ·',
	embedArticleStats: false,
	enableCodeBlockLineMapping: false,
};

describe('微信内容结构规范：全管线导出（基准文章）', () => {
	it('导出 HTML 满足结构性不变量并写出 temp/fixture-export.html', async () => {
		expect(existsSync(FIXTURE_PATH)).toBe(true);
		const content = readFileSync(FIXTURE_PATH, 'utf-8');

		// --- 渲染（marked 管线） ---
		(WechatRender as any).instance = undefined;
		const pluginMock: any = {
			settings: { ...SETTINGS },
			app: {
				vault: {
					adapter: { read: () => content },
					getAbstractFileByPath: () => null,
				},
				metadataCache: { getFirstLinkpathDest: () => null, getFileCache: () => null },
				workspace: {},
				plugins: { plugins: {} },
			},
			manifest: { version: '1.5.4' },
		};
		const previewMock: any = {
			plugin: pluginMock,
			elementMap: new Map(),
			articleProperties: new Map(),
		};
		const wechatRender = WechatRender.getInstance(pluginMock as any);
		wechatRender.setPreviewRender(previewMock as any);

		const htmlString = await wechatRender.parse(content);
		expect(htmlString.length).toBeGreaterThan(500);
		const renderedDom = await wechatRender.postprocess(htmlString);
		expect(renderedDom.children.length).toBeGreaterThan(10);

		// --- 复刻 parseActiveMarkdown 的包装 ---
		const section = document.createElement('section');
		section.className = 'smart-mp-article-content smart-mp';
		section.appendChild(renderedDom);
		section.style.fontSize = SETTINGS.fontSize;

		// --- 复刻 applyLayoutEnhancements ---
		section.classList.add(`smart-mp-theme-${SETTINGS.codeTheme}`);
		section.querySelectorAll('table').forEach((table) => {
			if (table.parentElement?.classList.contains('smart-mp-table-container')) return;
			const wrapper = document.createElement('div');
			wrapper.className = 'smart-mp-table-container';
			table.parentElement?.insertBefore(wrapper, table);
			wrapper.appendChild(table);
		});
		section.querySelectorAll('hr').forEach((hr) => {
			const div = document.createElement('div');
			div.className = 'smart-mp-hr-replacement smart-mp-hr-dots';
			div.innerHTML = '<span></span>';
			hr.replaceWith(div);
		});

		// --- ThemeManager.applyTheme（默认预设） ---
		const merger = new CSSMerger();
		await merger.init(getPresetCSS('default'));
		merger.applyStyleToElement(section);

		// --- 复刻 processArticleForExport（uploadImages=false 分支） ---
		const articleDiv = document.createElement('div');
		articleDiv.appendChild(section);
		const finalArticleEl = articleDiv.cloneNode(true) as HTMLElement;

		applyWechatCompatStyles(finalArticleEl);
		await inlineCssWithJuice(finalArticleEl);
		stripCssVarReferences(finalArticleEl);

		const cleanedArticleEl = cleanHtmlForWechat(finalArticleEl);
		const html = serializeChildren(cleanedArticleEl);
		const finalHtml = stripUnsupportedCssFromHtml(html);

		expect(finalHtml.length).toBeGreaterThan(1000);

		// --- 结构性不变量（微信规范核心条款，随 npm test 持续回归） ---
		// 1.8 pre 标签
		expect(finalHtml).not.toContain('<pre');
		// var() / 渐变 / !important（4.1.2、4.5.2 及 45166 兜底）
		expect(finalHtml).not.toContain('var(');
		expect(finalHtml).not.toMatch(/gradient/i);
		expect(finalHtml).not.toContain('!important');
		// 1.3 line-height 全部显式 px 且 ≥ 字号（逐元素校验见 utils/wechat-structure.test.ts 全管线用例）
		expect(finalHtml).not.toMatch(/line-height:\s*[\d.]+\s*(;|")/);
		// 1.6 text-align start/end
		expect(finalHtml).not.toMatch(/text-align:\s*(start|end)/);
		// --- 写出产物供 verify:wechat 使用（先写再断言，失败时也保留产物便于诊断） ---
		mkdirSync(OUT_DIR, { recursive: true });
		writeFileSync(OUT_PATH, finalHtml, 'utf-8');

		// 代码块逐行结构（CodeRenderer 行号回归：每行「行号+代码」同在一个 display:block 行内，
		// 行号 span 为 display:inline-block + min-width —— 行号与代码永不交错误位）
		const lineNumRows = finalHtml.match(/display:\s*block[^>]*>\s*<span[^>]*display:\s*inline-block[^>]*min-width:\s*\d+em/g) || [];
		expect(lineNumRows.length, '行号逐行结构（display:block 行 + inline-block 行号）').toBeGreaterThan(0);
		// 行号与代码同行：行号 span 后紧跟代码内容（不能是孤立行号列堆叠后接代码列）
		expect(finalHtml).not.toMatch(/<span[^>]*>1<\/span><br\s*\/?><span[^>]*>2<\/span>/);
	}, 60000);
});
