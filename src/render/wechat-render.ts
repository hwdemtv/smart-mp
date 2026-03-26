/**
 * This is the customized render for WeChat
 *
 * it is based on marked and its extension mechanism
 *
 * this file the framework and entry point for the renderer
 *
 * each functionality will be implemented in different extensions of marked.
 *
 */
import { Logger } from '../utils/logger';
import { SafeHTML } from "../utils/sanitize-html";

import matter from "gray-matter";
import { Marked, Tokens, RendererObject, RendererThis } from "marked";
import { Component, TFile } from "obsidian";
import SmartMPPlugin from "src/main";
import { WechatClient } from "../wechat-api/wechat-client";
import { BlockquoteRenderer } from "./marked-extensions/blockquote";
import { CodeRenderer } from "./marked-extensions/code";
import { CodespanRenderer } from "./marked-extensions/codespan";
import { Embed } from "./marked-extensions/embed";
import { ObsidianMarkdownRenderer } from "./markdown-render";
import {
	PreviewRender,
	SmartMPMarkedExtension,
} from "./marked-extensions/extension";
import { Heading } from "./marked-extensions/heading";
import { IconizeRender } from "./marked-extensions/iconize";
import { MathRenderer } from "./marked-extensions/math";
import { RemixIconRenderer } from "./marked-extensions/remix-icon";
import { Table } from "./marked-extensions/table";
import { Footnote } from "./marked-extensions/footnote";
import { Links } from "./marked-extensions/links";
import { Summary } from "./marked-extensions/summary";
import { Image } from "./marked-extensions/image";
import { Highlight } from "./marked-extensions/highlight";
import { getCodeBlockMapper, processCodeBlockLineNumbers, resetCodeBlockMapper } from "../utils/code-block-mapper";
// import { ListItem } from './marked-extensions/list-item'

const markedOptiones = {
	gfm: true,
	breaks: true,
};

export class WechatRender {
	plugin: SmartMPPlugin;
	client: WechatClient;
	extensions: SmartMPMarkedExtension[] = [];
	private static instance: WechatRender;
	marked: Marked;
	previewRender: PreviewRender;
	// Smart Cache
	private contentCache = new Map<string, { hash: string; html: string }>();
	private tempContainer: HTMLElement | null = null;

	private simpleHash(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString(36);
	}

	delayParse = (path: string) => {
		return new Promise<HTMLElement>((resolve, reject) => {
			setTimeout(() => {
				void (async () => {
					const md = await this.plugin.app.vault.adapter.read(path);
					let html = await this.parse(md);
					const dom = await this.postprocess(html);
					resolve(dom);
				})().catch((error) => {
					const reason =
						error instanceof Error ? error : new Error(String(error));
					reject(reason);
				});
			}, 100);
		});
	}


    private constructor(plugin: SmartMPPlugin) {
        this.plugin = plugin;
        this.client = WechatClient.getInstance(plugin);
        this.marked = new Marked();
        this.marked.use(markedOptiones);
        const renderer: RendererObject = {
            list(this: RendererThis, token: Tokens.List) {
                let body = '';
                if (token.items) {
                    for (const item of token.items) {
                        body += renderListItem(this.parser, item);
                    }
                }
                const type = token.ordered ? 'ol' : 'ul';
                const startatt =
                    token.ordered && token.start !== 1
                        ? ` start="${token.start}"`
                        : '';
                return `<${type}${startatt} class="smart-mp-list list-paddingleft-1">${body}</${type}>`;
            },
            listitem(this: RendererThis, token: Tokens.ListItem) {
                return renderListItem(this.parser, token);
            },
        };
        this.marked.use({ renderer });
        // Extensions will be initialized when previewRender is set
    }

    public static getInstance(plugin: SmartMPPlugin): WechatRender {
        if (!WechatRender.instance) {
            WechatRender.instance = new WechatRender(plugin);
        }
        return WechatRender.instance;
    }

    public static onPluginUnload(): void {
        this.instance = undefined as any;
    }

    /**
     * Set or update the preview render context (usually from the active view)
     */
    public setPreviewRender(previewRender: PreviewRender) {
        this.previewRender = previewRender;
        // Re-initialize extensions with new context
        this.extensions = [];
        this.useExtensions();
    }
	addExtension(extension: SmartMPMarkedExtension) {
		this.extensions.push(extension);
		this.marked.use(extension.markedExtension());
	}
	useExtensions() {
		this.addExtension(
			new Footnote(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new IconizeRender(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Heading(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Embed(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new CodeRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new CodespanRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new MathRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new RemixIconRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new BlockquoteRenderer(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Table(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Links(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Summary(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Image(this.plugin, this.previewRender, this.marked)
		);
		this.addExtension(
			new Highlight(this.plugin, this.previewRender, this.marked)
		);
		// this.addExtension(new ListItem(this.plugin, this.previewRender, this.marked))
	}

	// Track line numbers for scroll sync
	private currentLineMap: Map<string, number> = new Map();
	private lineCounter = 0;

	async parse(md: string) {
		const { data, content } = matter(md);
		await Promise.all(this.extensions.map(ext => ext.prepare()));

		// Reset line tracking
		this.currentLineMap.clear();
		this.lineCounter = 0;

		// Reset code block mapper for each parse
		resetCodeBlockMapper();

		// Calculate line offsets for content (after frontmatter)
		// Precise detection of frontmatter lines
		const fmEndIndex = md.indexOf(content);
		const frontmatterLines = (md.substring(0, fmEndIndex).match(/\n/g) || []).length;

		// Use marked lexer to get tokens with positions
		const tokens = this.marked.lexer(content);

		// Record top-level block token lines
		let currentPos = 0;
		tokens.forEach((token, index) => {
			if (token.type === 'space') return;

			// Find token start position in content
			// token.raw contains the exact source text for this block
			const startPos = content.indexOf(token.raw, currentPos);
			if (startPos !== -1) {
				const beforeToken = content.substring(0, startPos);
				const line = (beforeToken.match(/\n/g) || []).length + frontmatterLines + 1;
				// Store line info in the token itself (for renderer if needed)
				(token as any).line = line;
				// Also store in map for postprocess phase
				this.currentLineMap.set(`block-${this.lineCounter++}`, line);
				currentPos = startPos + token.raw.length;
			}
		});

		// Use original marked for actual parsing
		return this.marked.parse(content);
	}

	public async postprocess(html: string): Promise<HTMLElement> {
		const strict = this.plugin.settings.enableStrictSecurityMode ?? true;
		const dom = SafeHTML.htmlToFragment(html, strict);
		const wrapper = document.createElement('div');
		wrapper.appendChild(dom);

		// [CRITICAL] Inject line numbers BEFORE other extensions modify the DOM structure
		this.injectLineNumbers(wrapper);

		// [Enhancement] Process code block internal line numbers if enabled
		if (this.plugin.settings.enableCodeBlockLineMapping) {
			const codeBlockMapper = getCodeBlockMapper();
			processCodeBlockLineNumbers(wrapper, codeBlockMapper);
		}

		for (let ext of this.extensions) {
			await ext.postprocess(wrapper);
		}
		// Return DOM element directly
		return this.removeEmptyListItems(wrapper);
	}

	private injectLineNumbers(wrapper: HTMLElement) {
		// Top-level children of the wrapper correspond to the block-level tokens
		const children = Array.from(wrapper.children);
		let tokenIndex = 0;

		children.forEach((child) => {
			const htmlEl = child as HTMLElement;
			const tagName = htmlEl.tagName.toLowerCase();

			// Skip metadata/stats sections added by logic (they don't have source lines)
			if (htmlEl.classList.contains('smart-mp-embedded-stats') ||
				htmlEl.classList.contains('smart-mp-footnotes')) return;

			const line = this.currentLineMap.get(`block-${tokenIndex++}`);
			if (line !== undefined) {
				htmlEl.setAttribute('data-source-line', String(line));

				// 段落内换行锚点注入：将 <br> 分割的文本包裹在带行号的 <span> 中
				if (tagName === 'p') {
					this.injectIntraLineAnchors(htmlEl, line);
				}

				// 引用块内递归处理段落
				if (tagName === 'blockquote') {
					const innerParagraphs = htmlEl.querySelectorAll('p');
					innerParagraphs.forEach((p) => {
						const pLine = p.getAttribute('data-source-line');
						if (pLine) {
							this.injectIntraLineAnchors(p as HTMLElement, parseInt(pLine));
						}
					});
				}

				// For lists, try to track individual item lines via raw content analysis
				if (tagName === 'ul' || tagName === 'ol') {
					const listItems = htmlEl.querySelectorAll(':scope > li');
					let itemLineOffset = 0;

					listItems.forEach((li, idx) => {
						const itemLine = line + itemLineOffset;
						(li as HTMLElement).setAttribute('data-source-line', String(itemLine));

						// Count newlines in the item's content to estimate height
						const itemText = li.textContent || '';
						const newlinesInItem = (itemText.match(/\n/g) || []).length;
						itemLineOffset += Math.max(1, newlinesInItem + 1);
					});
				}
			}
		});
	}

	/**
	 * 为段落内的 <br> 换行点注入行号锚点
	 * 将 <br> 前后的内容包裹在 <span data-source-line="N"> 中
	 * 使滚动同步的锚点密度从"每段落一个"提升到"每行一个"
	 */
	private injectIntraLineAnchors(el: HTMLElement, startLine: number) {
		const brElements = el.querySelectorAll('br');
		if (brElements.length === 0) return;

		// 收集所有 <br> 节点
		const brs = Array.from(brElements);

		// 使用 DocumentFragment 重建段落内容
		const fragment = document.createDocumentFragment();
		let currentLine = startLine;
		let currentSpan = document.createElement('span');
		currentSpan.setAttribute('data-source-line', String(currentLine));

		// 遍历所有子节点
		const childNodes = Array.from(el.childNodes);
		for (const node of childNodes) {
			if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
				// 遇到 <br>：结束当前 span，添加 <br>，开始新 span
				if (currentSpan.childNodes.length > 0) {
					fragment.appendChild(currentSpan);
				}
				fragment.appendChild(node.cloneNode(true));
				currentLine++;
				currentSpan = document.createElement('span');
				currentSpan.setAttribute('data-source-line', String(currentLine));
			} else {
				// 普通节点：追加到当前 span
				currentSpan.appendChild(node.cloneNode(true));
			}
		}

		// 添加最后一个 span
		if (currentSpan.childNodes.length > 0) {
			fragment.appendChild(currentSpan);
		}

		// 替换段落内容
		el.innerHTML = '';
		el.appendChild(fragment);
	}


	private removeEmptyListItems(wrapper: HTMLElement): HTMLElement {
		// WeChat 编辑器会保留空的 <li>，导致空序号，这里统一清理掉仅含换行/空白的条目。
		wrapper.querySelectorAll('ol li, ul li').forEach((li) => {
			const hasMedia = li.querySelector('img, video, figure');
			const clone = li.cloneNode(true) as HTMLElement;
			clone.querySelectorAll('br').forEach((br) => br.remove());
			clone.querySelectorAll('span, section, div').forEach((node) => {
				if ((node.textContent ?? '').trim() === '') {
					node.remove();
				}
			});
			const textContent = (clone.textContent ?? '')
				.replace(/\u00A0/g, '')
				.replace(/[\s\u200B-\u200D]+/g, '')
				.trim();
			if (!hasMedia && textContent === '') {
				li.remove();
			}
		});
		return wrapper;
	}

	public async parseNote(
		path: string,
		container: HTMLElement,
		view: Component,
		contentOverride?: string
	): Promise<HTMLElement> {
		Logger.debug('WechatRender', `Starting parseNote for ${path}`);
		const content = contentOverride ?? await this.plugin.app.vault.adapter.read(path);
		
		if (!content) {
			Logger.warn('WechatRender', `Content is empty for ${path}. Returning empty div.`);
			return createDiv({ text: '内容为空', cls: 'smart-mp-empty-notice' });
		}

		const hash = this.simpleHash(content);

		// 1. Check Cache
		if (this.contentCache.has(path)) {
			const cached = this.contentCache.get(path);
			if (cached && cached.hash === hash) {
				Logger.debug('WechatRender', `Cache HIT for ${path}`);
				return await this.postprocess(cached.html);
			}
		}

		Logger.debug('WechatRender', `Cache MISS for ${path}. Starting fresh parse...`);

		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app as any);

		if (!this.tempContainer) {
			this.tempContainer = createDiv();
			this.tempContainer.style.position = 'absolute';
			this.tempContainer.style.left = '-9999px';
			this.tempContainer.style.top = '-9999px';
			// Removed width/height as they are not strictly necessary for a hidden container
			this.tempContainer.addClasses(['markdown-preview-view', 'markdown-rendered']);
			document.body.appendChild(this.tempContainer);
			Logger.debug('WechatRender', `Created new tempContainer.`);
		}
		const tempContainer = this.tempContainer;
		tempContainer.empty();
		Logger.debug('WechatRender', `tempContainer cleared for new render.`);

		// Optimize: Conditional Rendering
		// Only run Obsidian render if strictly necessary for known plugins
		const needsExcalidraw = /!\[\[.*?\.excalidraw.*?\]\]/i.test(content);
		const needsMermaid = /```\s*mermaid/i.test(content);
		const needsCharts = /```\s*chart/i.test(content); // Keep charts for completeness
		const needsAdmonition = /```\s*ad-\w+/i.test(content); // Keep admonition
		const needsDataview = /```\s*dataview/i.test(content); // Keep dataview
		const needsPDF = /!\[\[.*?\.pdf.*?\]\]/i.test(content); // Keep PDF++
		const needsTable = /^(\s*>)*\s*\|.*\|/m.test(content); // Tables also depend on ObsidianMarkdownRenderer

		const needsObsidianRender = needsExcalidraw || needsMermaid || needsCharts || needsAdmonition || needsDataview || needsPDF || needsTable;

		let htmlString = "";

		if (needsObsidianRender) {
			Logger.debug('WechatRender', `Complex content detected (Excalidraw: ${needsExcalidraw}, Mermaid: ${needsMermaid}, Table: ${needsTable}, etc.), triggering Obsidian render.`);
			try {
				// Render to temp container to initialize previewEl and markdownBody
				await renderer.render(path, tempContainer, view);
				Logger.debug('WechatRender', `Obsidian renderer finished for ${path}.`);

				// Give a small buffer for plugins to react to DOM insertion
				await new Promise(resolve => setTimeout(resolve, 50));
				
				// [Patch] Manually inject Excalidraw embeds if they are missing
				// This forces the Excalidraw plugin to recognize and render them
				const excalidrawMatches = content.match(/!\[\[(.*?\.excalidraw.*?)\]\]/g);

				if (excalidrawMatches && renderer.previewEl) {
					Logger.debug('WechatRender', `Found ${excalidrawMatches.length} Excalidraw links, checking for missing renders...`);
					const embedsContainer = renderer.previewEl.createDiv({ cls: 'manual-excalidraw-container' });
					// Make sure it doesn't affect layout
					embedsContainer.style.display = 'block';

					for (const match of excalidrawMatches) {
						// Remove ![[ and ]]
						const linkText = match.slice(3, -2);
						const [linkPath, alias] = linkText.split('|');

						// Check if already rendered (by src or alt)
						const existing = renderer.previewEl.querySelector(`span.internal-embed[src*="${linkPath}"]`);
						if (!existing) {
							Logger.debug('WechatRender', `Injecting missing embed for: ${linkPath}`);
							const file = this.plugin.app.metadataCache.getFirstLinkpathDest(linkPath, path);
							if (file instanceof TFile) {
								// Manually create the embed structure that Obsidian uses
								const embedEl = embedsContainer.createEl('span', {
									cls: 'internal-embed is-loaded',
									attr: {
										'src': linkText,
										'alt': alias || linkText
									}
								});
							}
						}
					}
					// Give a small buffer for plugins to react to DOM insertion
					await new Promise(resolve => setTimeout(resolve, 50));
				}

				// Enhanced waiting mechanism: check if elements actually appeared
				let attempts = 0;
				const maxAttempts = 15;
				let elementsFound = false;

				if (needsExcalidraw || needsMermaid) {
					Logger.debug('WechatRender', `Waiting for dynamic elements (Excalidraw: ${needsExcalidraw}, Mermaid: ${needsMermaid})`);
					while (attempts < maxAttempts && !elementsFound) {
						attempts++;

						const excalidrawFound = tempContainer.querySelector('.excalidraw') ||
							tempContainer.querySelector('.excalidraw-svg');
						const mermaidFound = tempContainer.querySelector('.mermaid') ||
							tempContainer.querySelector('.block-language-mermaid');

						// If we found what we need, we can proceed
						if ((needsExcalidraw && excalidrawFound) || (needsMermaid && mermaidFound)) {
							elementsFound = true;
							Logger.debug('WechatRender', `Dynamic elements found`, { attempts });
							break;
						}

						// If user has both, we wait for at least one to appear, assuming renderer handles the rest
						if (needsExcalidraw && needsMermaid && (excalidrawFound || mermaidFound)) {
							if (attempts > 5) { // Give a bit more time for the second one
								elementsFound = true;
								break;
							}
						}

						await new Promise(resolve => setTimeout(resolve, 100));
					}
					if (!elementsFound) {
						Logger.warn('WechatRender', `Timeout waiting for dynamic elements`, { attempts });
					}
				} else {
					// Check for callouts or just wait a tiny bit
					await new Promise(resolve => setTimeout(resolve, 50));
				}

				htmlString = tempContainer.innerHTML;
				Logger.debug('WechatRender', `Captured HTML from tempContainer for ${path}.`);

			} catch (error) {
				Logger.error('WechatRender', `Obsidian render failed for ${path}, falling back to marked:`, error);
				// Fallback to marked if Obsidian render fails
				htmlString = await this.parse(content);
				Logger.debug('WechatRender', `Fallback to marked parse for ${path}.`);
			}
		} else {
			Logger.debug('WechatRender', `Simple content detected for ${path}, using standard marked parse.`);
			htmlString = await this.parse(content);
		}

		if (!htmlString || htmlString.trim() === "") {
			Logger.warn('WechatRender', `Parsed HTML is empty for ${path}.`);
			htmlString = "<p>(解析后内容为空)</p>";
		}

		// 2. Update Cache
		this.contentCache.set(path, { hash, html: htmlString });
		Logger.debug('WechatRender', `Cache updated for ${path}.`);

		const domElement = await this.postprocess(htmlString);
		// Do not remove tempContainer, keep it for reuse
		// if (tempContainer.parentNode) {
		// 	tempContainer.parentNode.removeChild(tempContainer);
		// }

		return domElement;

	}

}

function renderListItem(parser: RendererThis["parser"], token: Tokens.ListItem) {
	const body = token.tokens ? parser.parse(token.tokens) : (token.text || '');
	return `<li><section>${body}</section></li>`;
}
