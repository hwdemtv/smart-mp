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
import { replaceDivWithSection, serializeElement } from "../../utils/utils.js";
import { ObsidianMarkdownRenderer } from "../markdown-render";
import { SmartMPMarkedExtension } from "./extension";
import { Logger } from "src/utils/logger";
import { Notice } from "obsidian";
import { hljs } from "../hljs-languages";
import { ResourceManager } from "src/assets/resource-manager";

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
			if (pre.getAttribute('style')?.includes('box-shadow') || 
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
	static readonly CACHE_VERSION = "v11"; // Restored highlighting with better inline styles

	private simpleHash(str: string): string {
		let hash = 0;
		// Limit hash calculation to first 1000 chars for speed, usually enough for cache collision avoidance in this context
		for (let i = 0; i < Math.min(str.length, 1000); i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString(36);
	}

	codeRenderer(code: string, infostring: string | undefined): string {
		const lang = (infostring || '').match(/^\S*/)?.[0];
		const theme = this.plugin.settings.codeTheme || 'github';
		const showLineNumbers = this.plugin.settings.codeLineNumber === true;
		const codeHash = this.simpleHash(code);
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
			}
		} catch (err) {
			Logger.error('CodeRenderer', err);
			highlighted = code;
		}

		// Comprehensive theme colors mapping for inline styles
		const themeColorMap: Record<string, string> = {
			// Atom One Dark (Default fallback)
			'hljs-comment': '#5c6370',
			'hljs-quote': '#5c6370',
			'hljs-variable': '#e06c75',
			'hljs-template-variable': '#e06c75',
			'hljs-tag': '#e06c75',
			'hljs-name': '#e06c75',
			'hljs-selector-id': '#e06c75',
			'hljs-selector-class': '#e06c75',
			'hljs-regexp': '#e06c75',
			'hljs-deletion': '#e06c75',
			'hljs-number': '#d19a66',
			'hljs-built_in': '#d19a66',
			'hljs-builtin-name': '#d19a66',
			'hljs-literal': '#d19a66',
			'hljs-type': '#d19a66',
			'hljs-params': '#d19a66',
			'hljs-meta': '#d19a66',
			'hljs-link': '#d19a66',
			'hljs-attribute': '#e6c07b',
			'hljs-string': '#98c379',
			'hljs-symbol': '#98c379',
			'hljs-bullet': '#98c379',
			'hljs-addition': '#98c379',
			'hljs-title': '#61aeee',
			'hljs-section': '#e06c75', // Heading
			'hljs-keyword': '#c678dd',
			'hljs-selector-tag': '#c678dd',
			'hljs-emphasis': '#c678dd', 
			'hljs-strong': '#d19a66',   
			'hljs-punctuation': '#abb2bf',
			'hljs-attr': '#d19a66',
			'hljs-operator': '#56b6c2',
			'hljs-class': '#e6c07b',
			'hljs-function': '#61aeee',
			'hljs-property': '#d19a66',
			'hljs-subst': '#abb2bf' 
		};

		// Github Theme (Light)
		const githubThemeColorMap: Record<string, string> = {
			'hljs-comment': '#6a737d',
			'hljs-quote': '#6a737d',
			'hljs-variable': '#e36209',
			'hljs-template-variable': '#e36209',
			'hljs-tag': '#22863a',
			'hljs-name': '#22863a',
			'hljs-selector-id': '#6f42c1',
			'hljs-selector-class': '#6f42c1',
			'hljs-regexp': '#032f62',
			'hljs-deletion': '#b31d28',
			'hljs-number': '#005cc5',
			'hljs-built_in': '#005cc5',
			'hljs-builtin-name': '#6f42c1',
			'hljs-literal': '#005cc5',
			'hljs-type': '#24292e',
			'hljs-params': '#24292e',
			'hljs-meta': '#24292e',
			'hljs-link': '#032f62',
			'hljs-attribute': '#6f42c1',
			'hljs-string': '#032f62',
			'hljs-symbol': '#005cc5',
			'hljs-bullet': '#735c0f',
			'hljs-addition': '#22863a',
			'hljs-title': '#6f42c1',
			'hljs-section': '#005cc5',
			'hljs-keyword': '#cf222e', // Improved red for github
			'hljs-selector-tag': '#22863a',
			'hljs-emphasis': '#24292e',
			'hljs-strong': '#24292e',
			'hljs-punctuation': '#24292e',
			'hljs-attr': '#0550ae',
			'hljs-operator': '#0550ae',
			'hljs-class': '#953800',
			'hljs-function': '#8250df',
			'hljs-property': '#0550ae',
			'hljs-subst': '#24292e'
		};

		let currentThemeMap = themeColorMap;
		let bg = '#282c34';
		let color = '#abb2bf';
		let headerBg = '#21252b';

		if (theme === 'github' || theme === 'github-light') {
			currentThemeMap = githubThemeColorMap;
			bg = '#f6f8fa';
			color = '#24292e';
			headerBg = '#e1e4e8';
		}


		// Convert hljs classes to inline styles with !important
		highlighted = highlighted.replace(/<span class="([^"]+)">/g, (match, classString) => {
			const classes = classString.split(/\s+/);
			const styles: string[] = [];

			// Find matching styles from classes
			for (const className of classes) {
				if (currentThemeMap[className]) {
					styles.push(`color:${currentThemeMap[className]} !important`);
				}
				if (className === 'hljs-strong') {
					styles.push(`font-weight:bold !important`);
				}
				if (className === 'hljs-emphasis') {
					styles.push(`font-style:italic !important`);
				}
			}

			if (styles.length > 0) {
				const mergedStyle = styles.join('; ');
				Logger.debug('CodeRenderer', `[Code Highlight] Classes: ${classString} → Styles: ${mergedStyle}`);
				return `<span style="${mergedStyle};">`;
			}

			Logger.warn('CodeRenderer', `[Code Highlight] Unmapped classes: ${classString}`);
			return `<span>`; // Strip class to prevent WeChat filtering issues
		});

		// [FIX] Force line breaks for WeChat Editor compatibility
		// Replace \n with <br/> to ensure segments are preserved even if pre style is stripped
		highlighted = highlighted.replace(/\n/g, '<br/>');

		// Determine border radius based on header visibility
		const hasHeader = this.plugin.settings.showCodeMacHeader !== false && !!lang;
		const finalCodeRadius = hasHeader ? '0 0 6px 6px' : 'var(--code-radius, 6px)';
		const finalHeaderRadius = '6px 6px 0 0';

		// Line numbers support
		let codeContent = highlighted;
		if (showLineNumbers) {
			const lines = highlighted.split('<br/>');
			const lineCount = lines.length;
			const lineNumWidth = String(lineCount).length;
			const lineNumStyle = `color:#999 !important;user-select:none !important;text-align:right !important;padding-right:1em !important;border-right:1px solid #ddd !important;margin-right:1em !important;display:inline-block !important;min-width:${lineNumWidth}em !important;font-variant-numeric:tabular-nums !important;`;
			const lineNums = Array.from({ length: lineCount }, (_, i) =>
				`<span style="${lineNumStyle}">${i + 1}</span>`
			).join('<br/>');
			const codeLines = lines.join('<br/>');
			codeContent = `<span style="display:inline-block !important;">${lineNums}</span><span style="display:inline-block !important;white-space:pre-wrap !important;">${codeLines}</span>`;
		}

		// Basic Code Block Styles - Using CSS Variables with hardcoded fallbacks
		// Use pre-wrap with <br/> for maximum compatibility
		const codeStyle = `display:block !important;background:var(--code-bg, ${bg}) !important;color:var(--code-text, ${color}) !important;font-family:var(--code-font, ui-monospace,SFMono-Regular,Menlo,Consolas,monospace) !important;font-size:14px !important;line-height:1.5 !important;padding:12px !important;border-radius:${finalCodeRadius} !important;overflow-x:auto !important;white-space:pre-wrap !important;word-wrap:break-word !important;margin:0 0 0.5em 0 !important;border:var(--code-border, none) !important;box-shadow: 0 2px 8px rgba(0,0,0,0.05) !important;`;

		let codeSection = '';
		if (hasHeader) {
			const headerStyle = `display:var(--code-header-display, flex);background:var(--code-header-bg, ${headerBg});padding:8px 12px;align-items:center;gap:8px;border-radius:${finalHeaderRadius};border-bottom:1px solid rgba(0,0,0,0.05);`;
			// Standard macOS window button colors
			const dotStyle = 'width:12px;height:12px;border-radius:50%;display:inline-block;';
			const labelStyle = 'margin-left:auto;font-size:11px;color:var(--code-header-text, #6a737d);font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;';

			codeSection = `<pre style="${headerStyle}"><span style="${dotStyle}background:#FF5F56;"></span><span style="${dotStyle}background:#FFBD2E;"></span><span style="${dotStyle}background:#27C93F;"></span><span style="${labelStyle}">${lang}</span></pre><pre style="${codeStyle}">${codeContent}</pre>`;
		} else {
			codeSection = `<pre style="${codeStyle}">${codeContent}</pre>`;
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
			token.html = `<pre class="mermaid-block-fallback"><code>${token.text}</code></pre>`;
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
			token.html = `<pre class="mermaid-block-fallback"><code>${token.text}</code></pre>`;
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

		const html = `<div class="smart-mp-profile-card">
		<a class="smart-mp-profile-card-link" href="${result.url || ''}">
			<div class="card-main">
				<div class="avatar">
					<img src="${result.avatar || ''}" alt="${result.nickname || ''}" avatar class="smart-mp-avatar-image" >
				</div>
			<div class="content">
				<div class="title">${result.nickname || ''}</div>
				<div class="description">${result.description || ''}</div>
				<div class="meta">${result.tips || ''}</div>
			</div>
			<div class="arrow"><i class="weui-icon-arrow"></i></div>
			</div>
			<div class="card-footer">${result.footer || ''}</div>
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
