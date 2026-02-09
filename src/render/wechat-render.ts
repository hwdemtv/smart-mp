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


	private constructor(plugin: SmartMPPlugin, previewRender: PreviewRender) {
		this.plugin = plugin;
		this.previewRender = previewRender;
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
		this.useExtensions();
	}
	static getInstance(plugin: SmartMPPlugin, previewRender: PreviewRender) {
		if (!WechatRender.instance) {
			WechatRender.instance = new WechatRender(plugin, previewRender);
		} else {
			// [Fix] Refresh context to ensure renderer uses the latest view/service
			WechatRender.instance.plugin = plugin;
			WechatRender.instance.previewRender = previewRender;

			// Re-sync basic extensions which might hold old references
			// Ideally extensions should access plugin/previewRender via 'this.wechatRender.plugin' if they were designed that way, 
			// but they hold their own references.
			// So we need to potentialy re-create extensions or update them.
			// For now, let's update the references in the extensions if possible, 
			// OR fully re-instantiate WechatRender to be safe.

			// Stronger Fix: Force re-instantiation if context changed, or just update extensions.
			// Since extensions hold references to 'plugin' and 'previewRender' in their constructors,
			// we MUST re-create attributes or the extensions will point to old/dead objects.
			WechatRender.instance = new WechatRender(plugin, previewRender);
		}
		return this.instance;
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

		// Calculate line offsets for content (after frontmatter)
		const frontmatterLines = md.substring(0, md.indexOf(content)).split('\n').length - 1;

		// Track token positions using walkTokens
		const lineTracker = {
			walkTokens: (token: any) => {
				// Only track block-level tokens
				if (token.type === 'heading' || token.type === 'paragraph' ||
					token.type === 'code' || token.type === 'blockquote' ||
					token.type === 'list' || token.type === 'table' ||
					token.type === 'hr' || token.type === 'html') {
					// Use raw token text to create unique key
					const key = `${token.type}-${this.lineCounter++}`;
					// Calculate approximate line from token raw position
					if (token.raw) {
						const beforeToken = content.substring(0, content.indexOf(token.raw));
						const line = (beforeToken.match(/\n/g) || []).length + frontmatterLines + 1;
						this.currentLineMap.set(key, line);
					}
				}
			}
		};

		// Temporarily apply line tracker
		const tempMarked = new Marked(markedOptiones);
		tempMarked.use(lineTracker);

		// Use original marked for actual parsing (extensions already applied)
		return await this.marked.parse(content);
	}

	public async postprocess(html: string): Promise<HTMLElement> {
		const strict = this.plugin.settings.enableStrictSecurityMode ?? true;
		const dom = SafeHTML.htmlToFragment(html, strict);
		const wrapper = document.createElement('div');
		wrapper.appendChild(dom);

		// Inject line numbers to block elements
		this.injectLineNumbers(wrapper);

		for (let ext of this.extensions) {
			await ext.postprocess(wrapper);
		}
		// Return DOM element directly
		return this.removeEmptyListItems(wrapper);
	}

	private injectLineNumbers(wrapper: HTMLElement) {
		// [P1] Multi-level anchors: inject line numbers to all block-level elements
		// Selector includes headings, paragraphs, code blocks, lists, tables, images, etc.
		const blockSelectors = [
			'h1', 'h2', 'h3', 'h4', 'h5', 'h6',  // Headings
			'p',                                   // Paragraphs
			'pre',                                 // Code blocks
			'blockquote',                          // Quotes
			'ul', 'ol',                            // Lists
			'table',                               // Tables
			'hr',                                  // Horizontal rules
			'figure',                              // Figures (images)
			'img',                                 // Inline images
			'.block-math',                         // Math blocks
			'.mermaid',                            // Mermaid diagrams
			'.callout'                             // Callouts
		].join(', ');

		const blockElements = wrapper.querySelectorAll(blockSelectors);
		let lineNumber = 1;

		blockElements.forEach((el) => {
			const htmlEl = el as HTMLElement;

			// Skip if already has a line number (e.g., nested elements)
			if (htmlEl.hasAttribute('data-source-line')) return;

			// Skip if parent already has line number (avoid duplicate anchors)
			const parent = htmlEl.parentElement;
			if (parent && parent.hasAttribute('data-source-line')) return;

			htmlEl.setAttribute('data-source-line', String(lineNumber));

			// Estimate lines based on element type and content
			const tagName = htmlEl.tagName.toLowerCase();
			const text = htmlEl.textContent || '';

			let estimatedLines = 1;

			if (tagName.match(/^h[1-6]$/)) {
				// Headings are usually 1-2 lines
				estimatedLines = 1;
			} else if (tagName === 'pre') {
				// Code blocks: count actual newlines
				estimatedLines = Math.max(1, (text.match(/\n/g) || []).length + 1);
			} else if (tagName === 'p') {
				// Paragraphs: estimate based on character count (~80 chars per line)
				estimatedLines = Math.max(1, Math.ceil(text.length / 80));
			} else if (tagName === 'ul' || tagName === 'ol') {
				// Lists: count list items
				const items = htmlEl.querySelectorAll('li');
				estimatedLines = Math.max(1, items.length);
			} else if (tagName === 'table') {
				// Tables: count rows
				const rows = htmlEl.querySelectorAll('tr');
				estimatedLines = Math.max(2, rows.length + 1); // +1 for header row
			} else if (tagName === 'blockquote') {
				// Blockquotes: count based on content
				estimatedLines = Math.max(1, (text.match(/\n/g) || []).length + 1);
			} else if (tagName === 'img' || tagName === 'figure') {
				// Images/figures: typically 1 line in source
				estimatedLines = 1;
			} else if (tagName === 'hr') {
				// Horizontal rules: 1 line
				estimatedLines = 1;
			} else {
				// Default: estimate based on newlines
				estimatedLines = Math.max(1, (text.match(/\n/g) || []).length + 1);
			}

			lineNumber += estimatedLines;
		});

		// Also inject line numbers for list items (finer granularity)
		const listItems = wrapper.querySelectorAll('li');
		listItems.forEach((li, index) => {
			const htmlLi = li as HTMLElement;
			// Find parent list's line number
			const parentList = htmlLi.closest('ul, ol');
			if (parentList) {
				const parentLine = parseInt(parentList.getAttribute('data-source-line') || '1');
				htmlLi.setAttribute('data-source-line', String(parentLine + index));
			}
		});
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
		const content = contentOverride ?? await this.plugin.app.vault.adapter.read(path);
		const hash = this.simpleHash(content);

		// 1. Check Cache
		if (this.contentCache.has(path)) {
			const cached = this.contentCache.get(path);
			if (cached && cached.hash === hash) {
				Logger.debug('WechatRender', `Cache HIT for ${path}`);
				// Skip Obsidian Render & Marked Parse
				return await this.postprocess(cached.html);
			}
		}

		console.debug(`[WechatRender] Cache MISS for ${path} (or first run)`);

		// [Fixed] Initialize ObsidianMarkdownRenderer to create previewEl
		// This is required for extensions (Excalidraw, Table, RemixIcon) that need to query the DOM
		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app as any);

		// [Fixed] Reuse persistent temp container to avoid DOM thrashing
		if (!this.tempContainer) {
			this.tempContainer = createDiv();
			this.tempContainer.style.position = 'absolute';
			this.tempContainer.style.left = '-9999px';
			this.tempContainer.style.top = '-9999px';
			this.tempContainer.style.width = '1200px';
			this.tempContainer.style.height = '2000px';
			this.tempContainer.addClasses(['markdown-preview-view', 'markdown-rendered', 'node-insert-event']);
			document.body.appendChild(this.tempContainer);
		}
		const tempContainer = this.tempContainer;
		tempContainer.empty(); // Clear previous run


		// Optimize: Conditional Rendering
		// Only run Obsidian render if strictly necessary for known plugins
		const needsExcalidraw = /!\[\[.*?\.excalidraw.*?\]\]/i.test(content);
		const needsMermaid = /```\s*mermaid/i.test(content);
		const needsCharts = /```\s*chart/i.test(content);
		const needsAdmonition = /```\s*ad-\w+/i.test(content);
		const needsDataview = /```\s*dataview/i.test(content);
		const needsPDF = /!\[\[.*?\.pdf.*?\]\]/i.test(content); // PDF++ support
		// Tables also depend on ObsidianMarkdownRenderer (see table.ts)
		// Support tables inside blockquotes/callouts (prefixed with >)
		const needsTable = /^(\s*>)*\s*\|.*\|/m.test(content);

		const needsObsidianRender = needsExcalidraw || needsMermaid || needsCharts || needsAdmonition || needsDataview || needsPDF || needsTable;

		if (needsObsidianRender) {
			console.debug(`[WechatRender] Complex content detected (Excalidraw: ${needsExcalidraw}, Mermaid: ${needsMermaid}, Charts: ${needsCharts}), triggering Obsidian render.`);
			try {
				// Render to temp container to initialize previewEl and markdownBody
				// We must render every time to ensure 'previewEl' contains the LATEST content
				await renderer.render(path, tempContainer, view);


				// [Patch] Manually inject Excalidraw embeds if they are missing
				// This forces the Excalidraw plugin to recognize and render them
				const excalidrawMatches = content.match(/!\[\[(.*?\.excalidraw.*?)\]\]/g);

				if (excalidrawMatches && renderer.previewEl) {
					console.debug(`[WechatRender] Found ${excalidrawMatches.length} Excalidraw links, checking for missing renders...`);
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
							console.debug(`[WechatRender] Injecting missing embed for: ${linkPath}`);
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
							console.debug(`[WechatRender] Dynamic elements found after ${attempts} attempts`);
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
						console.warn(`[WechatRender] Timeout waiting for dynamic elements after ${attempts} attempts`);
					}
				} else {
					// Check for callouts or just wait a tiny bit
					await new Promise(resolve => setTimeout(resolve, 50));
				}

				console.debug(`[WechatRender] ObsidianMarkdownRenderer updated, previewEl exists:`, !!renderer.previewEl);

			} catch (error) {
				console.error(`[WechatRender] Failed to update ObsidianMarkdownRenderer:`, error);
			}
		} else {
			console.debug(`[WechatRender] Simple content detected, skipping Obsidian render for speed.`);
		}

		// Directly read file content and parse with marked for performance
		// Reset extension states before parsing
		let htmlString = await this.parse(content);

		// 2. Update Cache
		this.contentCache.set(path, { hash, html: htmlString });

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
