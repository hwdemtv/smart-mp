/*
* marked extension for code
*  - source code 
*  - charts
*  - mermaid
*  - admonition
* 
*  credits to Sun BooShi, author of note-to-mp plugin
*  */

import { Tokens } from "marked";
import { $t } from "src/lang/i18n";
import { replaceDivWithSection, serializeElement, escapeHtml } from "../../utils/utils.js";
import { ObsidianMarkdownRenderer } from "../markdown-render";
import { SmartMPMarkedExtension } from "./extension";
import { Logger } from "src/utils/logger";
import { Notice } from "obsidian";
import { hljs } from "../hljs-languages";
import { ResourceManager } from "src/assets/resource-manager";
import { fastHash64 } from "../../utils/content-hash";

export class CodeRenderer extends SmartMPMarkedExtension {
	showLineNumber: boolean;
	mermaidIndex: number = 0;
	admonitionIndex: number = 0;
	chartsIndex: number = 0;

	prepare(): Promise<void> {
		this.mermaidIndex = 0;
		this.admonitionIndex = 0;
		this.chartsIndex = 0;
		return Promise.resolve();
	}

	async postprocess(dom: HTMLElement): Promise<HTMLElement> {
		// Find all pre elements that might have been rendered by Obsidian or other plugins
		const preElements = dom.querySelectorAll('pre');
		preElements.forEach((pre) => {
			// Skip if already processed by our custom renderer (has header or our specific styles)
			// [Fix] marked code() 已完整渲染的 pre 带 data-smart-mp-rendered 标记，必须跳过：
			// 否则二次处理会把行号列读进代码内容（innerText 含行号文本），且 jsdom 无
			// innerText 时 <br/> 无法还原为换行，导致代码块结构损坏
			if (pre.hasAttribute('data-smart-mp-rendered') ||
				pre.getAttribute('style')?.includes('box-shadow') ||
				pre.previousElementSibling?.getAttribute('style')?.includes('code-header-bg')) {
				return;
			}

			// Extract language from class if available (Obsidian uses language-xyz)
			const classList = Array.from(pre.classList);
			const langClass = classList.find(c => c.startsWith('language-'));
			const lang = langClass ? langClass.replace('language-', '') : '';

			// IMPROVED: Get code content more reliably from Obsidian's DOM structure
			const codeElement = pre.querySelector('code');
			let code = '';
			if (codeElement) {
				// innerText preserves newlines better than textContent in some browsers
				code = (codeElement as HTMLElement).innerText || codeElement.textContent || '';
			} else {
				code = (pre as HTMLElement).innerText || pre.textContent || '';
			}

			if (!code.trim()) return;

			const newHtml = this.codeRenderer(code, lang);
			
			// Replace the existing pre with our styled version
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = newHtml;
			
			const parent = pre.parentElement;
			if (parent) {
				const fragment = document.createDocumentFragment();
				while (tempDiv.firstChild) {
					fragment.appendChild(tempDiv.firstChild);
				}
				parent.replaceChild(fragment, pre);
			}
		});
		return dom;
	}

	static srcToBlob(src: string) {
		const base64 = src.split(',')[1];
		const byteCharacters = atob(base64);
		const byteNumbers = new Array(byteCharacters.length);
		for (let i = 0; i < byteCharacters.length; i++) {
			byteNumbers[i] = byteCharacters.charCodeAt(i);
		}
		const byteArray = new Uint8Array(byteNumbers);
		return new Blob([byteArray], { type: 'image/png' });
	}

	// Simple LRU cache
	static HighlightCache = new Map<string, string>();
	static readonly MAX_CACHE_SIZE = 100;
	static readonly CACHE_VERSION = "v14"; // v14: 全主题官方色板（从 hljs styles/*.css 精确提取）



	codeRenderer(code: string, infostring: string | undefined): string {
		const lang = (infostring || '').match(/^\S*/)?.[0];
		const theme = this.plugin.settings.codeTheme || 'github';
		const showLineNumbers = this.plugin.settings.codeLineNumber === true;
		// [Fix] 64 位全量哈希：此前 32 位只取前 1000 字符，前缀相同的长代码块
		// （如相同 import 头）会错误共享缓存键，渲染出别人的高亮
		const codeHash = fastHash64(code);
		const cacheKey = `${CodeRenderer.CACHE_VERSION}:${theme}:${lang || 'auto'}:${codeHash}:${showLineNumbers ? 'ln' : ''}`;

		if (CodeRenderer.HighlightCache.has(cacheKey)) {
			return CodeRenderer.HighlightCache.get(cacheKey)!;
		}

		let highlighted = code.replace(/\n$/, '');
		try {
			if (lang && hljs.getLanguage(lang)) {
				highlighted = hljs.highlight(highlighted, { language: lang }).value;
			} else if (code.length < 1000) {
				highlighted = hljs.highlightAuto(highlighted).value;
			} else {
				// [Security] 未高亮的长代码必须转义：postprocess 会把该 HTML 经 innerHTML
				// 重新解析（发生在 SafeHTML 净化之后），未转义的标签会直接执行
				highlighted = escapeHtml(highlighted);
			}
		} catch (err) {
			Logger.error('CodeRenderer', err);
			highlighted = escapeHtml(code);
		}

		// [Fix] 官方 highlight.js 主题色板（从 node_modules/highlight.js/styles/*.css 精确提取）
		// 此前仅 github/atom-one-dark 有真实色板，dracula/monokai/vs2015/default
		// 全部静默回退为 atom-one-dark 配色，且映射表缺类导致部分 token 丢色
		const CODE_THEMES: Record<string, { bg: string; fg: string; headerBg: string; colors: Record<string, string> }> = {
			'github': {
				bg: '#f6f8fa', fg: '#24292e', headerBg: '#e1e4e8',
				colors: {
					'hljs-doctag': '#d73a49',
					'hljs-keyword': '#d73a49',
					'hljs-template-tag': '#d73a49',
					'hljs-template-variable': '#d73a49',
					'hljs-type': '#d73a49',
					'hljs-title': '#6f42c1',
					'hljs-attr': '#005cc5',
					'hljs-attribute': '#005cc5',
					'hljs-literal': '#005cc5',
					'hljs-meta': '#005cc5',
					'hljs-number': '#005cc5',
					'hljs-operator': '#005cc5',
					'hljs-variable': '#005cc5',
					'hljs-selector-attr': '#005cc5',
					'hljs-selector-class': '#005cc5',
					'hljs-selector-id': '#005cc5',
					'hljs-regexp': '#032f62',
					'hljs-string': '#032f62',
					'hljs-built_in': '#e36209',
					'hljs-symbol': '#e36209',
					'hljs-comment': '#6a737d',
					'hljs-code': '#6a737d',
					'hljs-formula': '#6a737d',
					'hljs-name': '#22863a',
					'hljs-quote': '#22863a',
					'hljs-selector-tag': '#22863a',
					'hljs-selector-pseudo': '#22863a',
					'hljs-subst': '#24292e',
					'hljs-section': '#005cc5',
					'hljs-bullet': '#735c0f',
					'hljs-emphasis': '#24292e',
					'hljs-strong': '#24292e',
					'hljs-addition': '#22863a',
					'hljs-deletion': '#b31d28'
				},
			},
			'github-light': {
				bg: '#f6f8fa', fg: '#24292e', headerBg: '#e1e4e8',
				colors: {
					'hljs-doctag': '#d73a49',
					'hljs-keyword': '#d73a49',
					'hljs-template-tag': '#d73a49',
					'hljs-template-variable': '#d73a49',
					'hljs-type': '#d73a49',
					'hljs-title': '#6f42c1',
					'hljs-attr': '#005cc5',
					'hljs-attribute': '#005cc5',
					'hljs-literal': '#005cc5',
					'hljs-meta': '#005cc5',
					'hljs-number': '#005cc5',
					'hljs-operator': '#005cc5',
					'hljs-variable': '#005cc5',
					'hljs-selector-attr': '#005cc5',
					'hljs-selector-class': '#005cc5',
					'hljs-selector-id': '#005cc5',
					'hljs-regexp': '#032f62',
					'hljs-string': '#032f62',
					'hljs-built_in': '#e36209',
					'hljs-symbol': '#e36209',
					'hljs-comment': '#6a737d',
					'hljs-code': '#6a737d',
					'hljs-formula': '#6a737d',
					'hljs-name': '#22863a',
					'hljs-quote': '#22863a',
					'hljs-selector-tag': '#22863a',
					'hljs-selector-pseudo': '#22863a',
					'hljs-subst': '#24292e',
					'hljs-section': '#005cc5',
					'hljs-bullet': '#735c0f',
					'hljs-emphasis': '#24292e',
					'hljs-strong': '#24292e',
					'hljs-addition': '#22863a',
					'hljs-deletion': '#b31d28'
				},
			},
			'atom-one-dark': {
				bg: '#282c34', fg: '#abb2bf', headerBg: '#21252b',
				colors: {
					'hljs-comment': '#5c6370',
					'hljs-quote': '#5c6370',
					'hljs-doctag': '#c678dd',
					'hljs-keyword': '#c678dd',
					'hljs-formula': '#c678dd',
					'hljs-section': '#e06c75',
					'hljs-name': '#e06c75',
					'hljs-selector-tag': '#e06c75',
					'hljs-deletion': '#e06c75',
					'hljs-subst': '#e06c75',
					'hljs-literal': '#56b6c2',
					'hljs-string': '#98c379',
					'hljs-regexp': '#98c379',
					'hljs-addition': '#98c379',
					'hljs-attribute': '#98c379',
					'hljs-attr': '#d19a66',
					'hljs-variable': '#d19a66',
					'hljs-template-variable': '#d19a66',
					'hljs-type': '#d19a66',
					'hljs-selector-class': '#d19a66',
					'hljs-selector-attr': '#d19a66',
					'hljs-selector-pseudo': '#d19a66',
					'hljs-number': '#d19a66',
					'hljs-symbol': '#61aeee',
					'hljs-bullet': '#61aeee',
					'hljs-link': '#61aeee',
					'hljs-meta': '#61aeee',
					'hljs-selector-id': '#61aeee',
					'hljs-title': '#61aeee',
					'hljs-built_in': '#e6c07b'
				},
			},
			'dracula': {
				// 官方 highlight.js 内置 Dracula（styles/base16/dracula.css，逐字节提取）
				bg: '#282936', fg: '#e9e9f4', headerBg: '#3a3c4e',
				colors: {
					'hljs-comment': '#626483',
					'hljs-tag': '#62d6e8',
					'hljs-subst': '#e9e9f4',
					'hljs-punctuation': '#e9e9f4',
					'hljs-operator': '#e9e9f4',
					'hljs-bullet': '#ea51b2',
					'hljs-variable': '#ea51b2',
					'hljs-template-variable': '#ea51b2',
					'hljs-selector-tag': '#ea51b2',
					'hljs-name': '#ea51b2',
					'hljs-deletion': '#ea51b2',
					'hljs-symbol': '#b45bcf',
					'hljs-number': '#b45bcf',
					'hljs-link': '#b45bcf',
					'hljs-attr': '#b45bcf',
					'hljs-literal': '#b45bcf',
					'hljs-title': '#00f769',
					'hljs-strong': '#00f769',
					'hljs-code': '#ebff87',
					'hljs-addition': '#ebff87',
					'hljs-string': '#ebff87',
					'hljs-built_in': '#a1efe4',
					'hljs-doctag': '#a1efe4',
					'hljs-quote': '#a1efe4',
					'hljs-regexp': '#a1efe4',
					'hljs-attribute': '#62d6e8',
					'hljs-section': '#62d6e8',
					'hljs-type': '#b45bcf',
					'hljs-template-tag': '#b45bcf',
					'hljs-keyword': '#b45bcf',
					'hljs-emphasis': '#b45bcf',
					'hljs-meta': '#00f769',
					'hljs-title function_': '#62d6e8'
				},
			},
			'monokai': {
				bg: '#272822', fg: '#ddd', headerBg: '#1e1f1c',
				colors: {
					'hljs-tag': '#f92672',
					'hljs-keyword': '#f92672',
					'hljs-selector-tag': '#f92672',
					'hljs-literal': '#f92672',
					'hljs-strong': '#f92672',
					'hljs-number': '#f92672',
					'hljs-name': '#f92672',
					'hljs-code': '#66d9ef',
					'hljs-attribute': '#bf79db',
					'hljs-attr': '#bf79db',
					'hljs-symbol': '#bf79db',
					'hljs-regexp': '#bf79db',
					'hljs-link': '#bf79db',
					'hljs-string': '#a6e22e',
					'hljs-bullet': '#a6e22e',
					'hljs-subst': '#a6e22e',
					'hljs-title': '#a6e22e',
					'hljs-section': '#a6e22e',
					'hljs-emphasis': '#a6e22e',
					'hljs-type': '#a6e22e',
					'hljs-built_in': '#a6e22e',
					'hljs-selector-attr': '#a6e22e',
					'hljs-selector-pseudo': '#a6e22e',
					'hljs-addition': '#a6e22e',
					'hljs-variable': '#a6e22e',
					'hljs-template-tag': '#a6e22e',
					'hljs-template-variable': '#a6e22e',
					'hljs-comment': '#75715e',
					'hljs-quote': '#75715e',
					'hljs-deletion': '#75715e',
					'hljs-meta': '#75715e'
				},
			},
			'vs2015': {
				bg: '#1E1E1E', fg: '#DCDCDC', headerBg: '#252526',
				colors: {
					'hljs-keyword': '#569CD6',
					'hljs-literal': '#569CD6',
					'hljs-symbol': '#569CD6',
					'hljs-name': '#569CD6',
					'hljs-link': '#569CD6',
					'hljs-built_in': '#4EC9B0',
					'hljs-type': '#4EC9B0',
					'hljs-number': '#B8D7A3',
					'hljs-class': '#B8D7A3',
					'hljs-string': '#D69D85',
					'hljs-regexp': '#9A5334',
					'hljs-template-tag': '#9A5334',
					'hljs-subst': '#DCDCDC',
					'hljs-function': '#DCDCDC',
					'hljs-title': '#DCDCDC',
					'hljs-params': '#DCDCDC',
					'hljs-formula': '#DCDCDC',
					'hljs-comment': '#57A64A',
					'hljs-quote': '#57A64A',
					'hljs-doctag': '#608B4E',
					'hljs-meta': '#9B9B9B',
					'hljs-tag': '#9B9B9B',
					'hljs-variable': '#BD63C5',
					'hljs-template-variable': '#BD63C5',
					'hljs-attr': '#9CDCFE',
					'hljs-attribute': '#9CDCFE',
					'hljs-section': '#ffd700',
					'hljs-bullet': '#D7BA7D',
					'hljs-selector-tag': '#D7BA7D',
					'hljs-selector-id': '#D7BA7D',
					'hljs-selector-class': '#D7BA7D',
					'hljs-selector-attr': '#D7BA7D',
					'hljs-selector-pseudo': '#D7BA7D'
				},
			},
			'default': {
				bg: '#F3F3F3', fg: '#444', headerBg: '#e4e4e4',
				colors: {
					'hljs-comment': '#697070',
					'hljs-tag': '#444a',
					'hljs-punctuation': '#444a',
					'hljs-type': '#880000',
					'hljs-string': '#880000',
					'hljs-number': '#880000',
					'hljs-selector-id': '#880000',
					'hljs-selector-class': '#880000',
					'hljs-quote': '#880000',
					'hljs-template-tag': '#880000',
					'hljs-deletion': '#880000',
					'hljs-title': '#880000',
					'hljs-section': '#880000',
					'hljs-regexp': '#ab5656',
					'hljs-symbol': '#ab5656',
					'hljs-variable': '#ab5656',
					'hljs-template-variable': '#ab5656',
					'hljs-link': '#ab5656',
					'hljs-selector-attr': '#ab5656',
					'hljs-operator': '#ab5656',
					'hljs-selector-pseudo': '#ab5656',
					'hljs-literal': '#695',
					'hljs-built_in': '#397300',
					'hljs-bullet': '#397300',
					'hljs-code': '#397300',
					'hljs-addition': '#397300',
					'hljs-meta': '#1f7199'
				},
			},
		};

		const themeKey = theme === 'github-light' ? 'github' : theme;
		const preset = CODE_THEMES[themeKey] || CODE_THEMES['atom-one-dark'];
		const currentThemeMap = preset.colors;
		const bg = preset.bg;
		const color = preset.fg;
		const headerBg = preset.headerBg;


		// Convert hljs classes to inline styles (微信不支持 !important)
		highlighted = highlighted.replace(/<span class="([^"]+)">/g, (match, classString) => {
			const classes = classString.split(/\s+/);
			const styles: string[] = [];

			// [Fix] 复合选择器优先：官方主题（如 base16/dracula）对
			// .hljs-title.function_ 单独定义颜色，完整类名精确命中
			let colorValue = currentThemeMap[classString];

			// Find matching styles from classes
			for (const className of classes) {
				// [Fix] hljs 11 的复合类名（title function_/title class_ 等）：
				// 子标记跟随基础类（hljs-title）或复合选择器着色
				if (className === 'hljs' || className.endsWith('_')) continue;
				if (!colorValue && currentThemeMap[className]) {
					colorValue = currentThemeMap[className];
				}
				if (className === 'hljs-strong') {
					styles.push(`font-weight:bold`);
				}
				if (className === 'hljs-emphasis') {
					styles.push(`font-style:italic`);
				}
			}
			if (colorValue) {
				styles.unshift(`color:${colorValue}`);
			}

			if (styles.length > 0) {
				const mergedStyle = styles.join(';');
				Logger.debug('CodeRenderer', `[Code Highlight] Classes: ${classString} → Styles: ${mergedStyle}`);
				return `<span style="${mergedStyle}">`;
			}

			Logger.warn('CodeRenderer', `[Code Highlight] Unmapped classes: ${classString}`);
			return `<span style="color:${color}">`; // 确保所有 span 都有文字颜色
		});

		// [FIX] Force line breaks for WeChat Editor compatibility
		// Replace \n with <br/> to ensure segments are preserved even if pre style is stripped
		highlighted = highlighted.replace(/\n/g, '<br/>');

		// Determine border radius based on header visibility
		const hasHeader = this.plugin.settings.showCodeMacHeader !== false && !!lang;
		const finalCodeRadius = hasHeader ? '0 0 6px 6px' : '6px';
		const finalHeaderRadius = '6px 6px 0 0';

		// Line numbers support
		let codeContent = highlighted;
		if (showLineNumbers) {
			const lines = highlighted.split('<br/>');
			const lineCount = lines.length;
			const lineNumWidth = String(lineCount).length;
			// [Fix] 行号采用逐行结构：每行「行号 + 代码」在同一个 display:block 行内，
			// 行号与代码永不错位（两列 inline-block 方案在代码行折行/高度不齐时会整体错位）。
			// 行号 span 必须 display:inline-block + min-width，保证右对齐且不与代码混排行内
			const lineNumStyle = `color:#999;text-align:right;padding-right:1em;border-right:1px solid #ddd;margin-right:1em;display:inline-block;min-width:${lineNumWidth}em;`;
			codeContent = lines.map((line, i) =>
				`<section style="display:block;"><span style="${lineNumStyle}">${i + 1}</span>${line}</section>`
			).join('');
		}

		// [Fix] 微信不支持 CSS var()，直接使用硬编码颜色值
		const codeStyle = `display:block;background:${bg};color:${color};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.5;padding:12px;border-radius:${finalCodeRadius};margin:0 0 0.5em 0;`;

		let codeSection = '';
		if (hasHeader) {
			const headerStyle = `display:block;background:${headerBg};padding:8px 12px;border-radius:${finalHeaderRadius};border-bottom:1px solid #e0e0e0;`;
			// Standard macOS window button colors
			const dotStyle = 'width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:6px;';
			const labelStyle = 'font-size:11px;color:#6a737d;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;';

			codeSection = `<pre style="${headerStyle}" data-smart-mp-rendered="1"><span style="${dotStyle}background:#FF5F56;"></span><span style="${dotStyle}background:#FFBD2E;"></span><span style="${dotStyle}background:#27C93F;"></span><span style="${labelStyle}">${lang}</span></pre><pre style="${codeStyle}" data-smart-mp-rendered="1">${codeContent}</pre>`;
		} else {
			codeSection = `<pre style="${codeStyle}" data-smart-mp-rendered="1">${codeContent}</pre>`;
		}

		if (CodeRenderer.HighlightCache.size >= CodeRenderer.MAX_CACHE_SIZE) {
			CodeRenderer.HighlightCache.clear();
		}
		CodeRenderer.HighlightCache.set(cacheKey, codeSection);

		return codeSection;
	}

	static getMathType(lang: string | null) {
		if (!lang) return null;
		let l = lang.toLowerCase();
		l = l.trim();
		if (l === 'am' || l === 'asciimath') return 'asciimath';
		if (l === 'latex' || l === 'tex') return 'latex';
		return null;
	}

	renderAdmonition(_token: Tokens.Generic, _type: string) {
		let root = ObsidianMarkdownRenderer.getInstance(this.plugin.app).queryElement(this.admonitionIndex, '.callout.admonition')
		if (!root) {
			return $t('render.admonition-failed');
		}
		this.admonitionIndex++

		const editDiv = root.querySelector('.edit-block-button');
		if (editDiv) {
			editDiv.parentNode!.removeChild(editDiv);
		}
		const foldDiv = root.querySelector('.callout-fold');
		if (foldDiv) {

			try {
				foldDiv.parentNode!.removeChild(foldDiv);
			} catch (e) {
				Logger.error('CodeHighlight', 'Failed to remove callout fold', e)
			}

		}
		return serializeElement(root)
	}
	renderAdmonitionAsync(_token: Tokens.Generic, _type: string): Promise<string> {
		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app);
		let root = renderer.queryElement(this.admonitionIndex, '.callout.admonition')
		if (!root) {
			return Promise.resolve($t('render.admonition-failed'));
		}
		this.admonitionIndex++

		const editDiv = root.querySelector('.edit-block-button');
		if (editDiv) {
			editDiv.parentNode!.removeChild(editDiv);
		}
		const foldDiv = root.querySelector('.callout-fold');
		if (foldDiv) {

			try {
				foldDiv.parentNode!.removeChild(foldDiv);
			} catch (e) {
				Logger.error('CodeHighlight', 'Failed to remove callout fold', e)
			}

		}
		const newRoot = replaceDivWithSection(root);
		return Promise.resolve(newRoot.outerHTML)
	}

	// Font Awesome to Unicode/Emoji mapping for WeChat compatibility
	private static readonly iconMap: { [key: string]: string } = {
		'book': '📚',
		'gear': '⚙️',
		'cog': '⚙️',
		'user': '👤',
		'home': '🏠',
		'file': '📄',
		'folder': '📁',
		'link': '🔗',
		'check': '✅',
		'x': '❌',
		'times': '❌',
		'arrow-right': '➡️',
		'arrow-left': '⬅️',
		'arrow-up': '⬆️',
		'arrow-down': '⬇️',
		'plus': '➕',
		'minus': '➖',
		'edit': '✏️',
		'pen': '✏️',
		'trash': '🗑️',
		'search': '🔍',
		'star': '⭐',
		'heart': '❤️',
		'info': 'ℹ️',
		'warning': '⚠️',
		'exclamation-triangle': '⚠️',
		'error': '❗',
		'exclamation-circle': '❗',
		'success': '✅',
		'check-circle': '✅',
		'calendar': '📅',
		'clock': '🕒',
		'envelope': '✉️',
		'thumbs-up': '👍',
		'thumbs-down': '👎'
	};

	private processMermaidIcons(text: string): string {
		// Replace [fa:fa-iconName] or fa:fa-iconName with Emoji
		return text.replace(/\[?fa:fa-([a-z0-9-]+)\]?/gi, (match, iconName) => {
			const normalized = iconName.toLowerCase();
			return CodeRenderer.iconMap[normalized] || match;
		});
	}

	async renderMermaidAsync(token: Tokens.Generic) {
		Logger.debug('CodeRenderer', `[Mermaid] Starting render for diagram #${this.mermaidIndex}`);

		// [Enhancement] Pre-process icons for WeChat compatibility
		token.text = this.processMermaidIcons(token.text);

		// define default failed
		token.html = $t('render.mermaid-failed');

		const index = this.mermaidIndex;
		this.mermaidIndex++;

		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app);

		// 1. Wait for preview container availability
		if (!renderer.previewEl) {
			Logger.debug('CodeRenderer', `[Mermaid] Preview element not ready, waiting...`);
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		// 2. Try to find root with multiple selectors
		let root = renderer.queryElement(index, '.mermaid') ||
			renderer.queryElement(index, 'div.mermaid') ||
			renderer.queryElement(index, '.block-language-mermaid');

		if (!root) {
			Logger.debug('CodeRenderer', `[Mermaid] Root not found immediately, retrying...`);
			// Retry loop for root element
			const maxRetries = 15;
			const retryInterval = 300;

			for (let i = 0; i < maxRetries; i++) {
				await new Promise(resolve => setTimeout(resolve, retryInterval)); // Incremental backoff removed for consistency
				root = renderer.queryElement(index, '.mermaid') ||
					renderer.queryElement(index, 'div.mermaid') ||
					renderer.queryElement(index, '.block-language-mermaid');
				if (root) break;
			}
		}

		if (!root) {
			Logger.error('CodeRenderer', `[Mermaid] Failed to find root element for diagram #${index}`);
			// Fallback: show raw code block
			token.html = `<pre class="mermaid-block-fallback"><code>${escapeHtml(token.text)}</code></pre>`;
			return;
		}

		Logger.debug('CodeRenderer', `[Mermaid] Found root element, waiting for SVG...`);

		// 3. Wait for SVG generation (Mermaid rendering is async)
		let svg = root.querySelector<SVGElement>("svg");
		if (!svg) {
			try {
				await renderer.waitForSelector(root, "svg", 5000);
				svg = root.querySelector<SVGElement>("svg");
			} catch (e) {
				Logger.warn('CodeRenderer', `[Mermaid] Timeout waiting for SVG:`, e);
			}
		}

		if (!svg) {
			Logger.error('CodeRenderer', `[Mermaid] SVG not found after wait.`);
			token.html = `<pre class="mermaid-block-fallback"><code>${escapeHtml(token.text)}</code></pre>`;
			return;
		}

		const previewer = root.closest<HTMLElement>(".smart-mp-render-preview");
		const previewerHadClass =
			previewer?.classList.contains("smart-mp-render-preview-visible") ?? false;
		const rootHadClass = root.classList.contains("smart-mp-mermaid-visible");

		try {
			previewer?.classList.add("smart-mp-render-preview-visible");
			root.classList.add("smart-mp-mermaid-visible");

			const { width, height } = this.getMermaidSize(svg);
			const dataUrl = await renderer.domToImage(svg, {
				width,
				height,
			});

			token.html = `<section id="smart-mp-mermaid-${index}" class="mermaid"><img src="${dataUrl}" class="mermaid-image" style="width:${width}px;height:auto;"></section>`;
		} catch (error) {
			Logger.error('CodeRenderer', error);
		} finally {
			if (previewer && !previewerHadClass) {
				previewer.classList.remove("smart-mp-render-preview-visible");
			}
			if (!rootHadClass) {
				root.classList.remove("smart-mp-mermaid-visible");
			}
		}
	}

	private getMermaidSize(svg: SVGElement) {
		const rect = svg.getBoundingClientRect();
		let width = Math.round(rect.width);
		let height = Math.round(rect.height);
		if (!width || !height) {
			const viewBox = (svg as SVGSVGElement).viewBox?.baseVal;
			if (viewBox && viewBox.width && viewBox.height) {
				width = Math.round(viewBox.width);
				height = Math.round(viewBox.height);
			}
		}
		if (!width || !height) {
			const attrWidth = svg.getAttribute("width");
			const attrHeight = svg.getAttribute("height");
			const parsedWidth = attrWidth ? parseFloat(attrWidth) : 0;
			const parsedHeight = attrHeight ? parseFloat(attrHeight) : 0;
			if (parsedWidth) width = Math.round(parsedWidth);
			if (parsedHeight) height = Math.round(parsedHeight);
		}
		if (!width) width = 800;
		if (!height) height = 400;
		return { width, height };
	}

	renderCharts(_token: Tokens.Generic) {
		//the MarkdownRender doen't work well with it. use the preview instead.
		if (!this.isPluginInstlled('obsidian-charts')) {
			Logger.debug('CodeRenderer', `charts plugin not installed.`);
			new Notice($t('render.charts-plugin-not-installed'))
			return false;
		}
		const root = ResourceManager.getInstance(this.plugin).getMarkdownRenderedElement(this.chartsIndex, '.block-language-chart')

		if (!root) {
			return $t('render.charts-failed');
		}
		const containerId = `charts-img-${this.chartsIndex}`;
		this.chartsIndex++;
		const canvas = root.querySelector('canvas')
		if (canvas) {
			const MIME_TYPE = "image/png";
			const imgURL = canvas.toDataURL(MIME_TYPE);
			return `<section id="${containerId}" class="charts" >
			<img src="${imgURL}" class="charts-image" />
			</section>`;
		}
		return $t('render.charts-failed');
	}
	renderSmartMPProfile(token: Tokens.Generic) {
		// 按行分割并过滤空行
		const lines = token.text.split(/\r?\n/).filter((line: string) => line.trim() !== '');
		const result: Record<string, string> = {};

		const keyValueRegex = /^(\w+):\s*"?(.*?)"?$/; // 匹配键值对

		lines.forEach((line: string) => {
			const match = line.match(keyValueRegex);
			if (match) {
				const key = match[1].trim().toLocaleLowerCase();
				const value = match[2].trim();
				result[key] = value;
			}
		});

		// [Security] 用户 YAML 值未经转义直接拼入 HTML 属性/文本，先转义防注入
		const v = (key: string): string => escapeHtml(result[key] || '');
		const html = `<div class="smart-mp-profile-card">
		<a class="smart-mp-profile-card-link" href="${v('url')}">
			<div class="card-main">
				<div class="avatar">
					<img src="${v('avatar')}" alt="${v('nickname')}" avatar class="smart-mp-avatar-image" >
				</div>
			<div class="content">
				<div class="title">${v('nickname')}</div>
				<div class="description">${v('description')}</div>
				<div class="meta">${v('tips')}</div>
			</div>
			<div class="arrow"><i class="weui-icon-arrow"></i></div>
			</div>
			<div class="card-footer">${v('footer')}</div>
		</a>
  	</div>`
		return html;
	}
	markedExtension() {
		return {
			renderer: {
				code: (token: Tokens.Code) => {
					if (token.lang && token.lang.trim().toLocaleLowerCase() == 'mermaid') {
						return (token as any).html || '';
					}
					else if (token.lang && token.lang.trim().toLocaleLowerCase() == 'chart') {
						return this.renderCharts(token);
					}
					else if (token.lang && token.lang.trim().toLocaleLowerCase() == 'smart-mp-profile') {
						return this.renderSmartMPProfile(token);
					}
					else if (token.lang && token.lang.trim().toLocaleLowerCase().startsWith('ad-')) {
						return (token as any).html || '';
					}
					return this.codeRenderer(token.text, token.lang);
				}
			},
			async: true,
			walkTokens: async (token: Tokens.Generic) => {
				if (token.lang && token.lang.trim().toLocaleLowerCase() == 'mermaid') {
					await this.renderMermaidAsync(token);
				}
				if (token.lang && token.lang.trim().toLocaleLowerCase() == 'smart-mp-profile') {
					// await this.renderProfileAsync(token); 
					// No async profile renderer found, assuming synchronous renderer handles it or no async work needed.
					// If async is needed, restore the correct method name. But for now, keeping it consistent with valid code.
				}
				else if (token.lang && token.lang.trim().toLocaleLowerCase().startsWith('ad-')) {
					token.html = await this.renderAdmonitionAsync(token, token.lang.trim().toLocaleLowerCase().replace('ad-', ''))
				}
			}
		}
	}
}
