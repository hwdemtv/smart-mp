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

import matter from "gray-matter";
import { Marked, Tokens, RendererObject, RendererThis } from "marked";
import { Component, debounce, sanitizeHTMLToDom, TFile } from "obsidian";
import WeWritePlugin from "src/main";
import { WechatClient } from "../wechat-api/wechat-client";
import { BlockquoteRenderer } from "./marked-extensions/blockquote";
import { CodeRenderer } from "./marked-extensions/code";
import { CodespanRenderer } from "./marked-extensions/codespan";
import { Embed } from "./marked-extensions/embed";
import { ObsidianMarkdownRenderer } from "./markdown-render";
import {
	PreviewRender,
	WeWriteMarkedExtension,
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
	plugin: WeWritePlugin;
	client: WechatClient;
	extensions: WeWriteMarkedExtension[] = [];
	private static instance: WechatRender;
	marked: Marked;
	previewRender: PreviewRender;
	// Smart Cache
	private contentCache = new Map<string, { hash: string; html: string }>();

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


	private constructor(plugin: WeWritePlugin, previewRender: PreviewRender) {
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
				return `<${type}${startatt} class="wewrite-list list-paddingleft-1">${body}</${type}>`;
			},
			listitem(this: RendererThis, token: Tokens.ListItem) {
				return renderListItem(this.parser, token);
			},
		};
		this.marked.use({ renderer });
		this.useExtensions();
	}
	static getInstance(plugin: WeWritePlugin, previewRender: PreviewRender) {
		if (!WechatRender.instance) {
			WechatRender.instance = new WechatRender(plugin, previewRender);
		}
		return this.instance;
	}
	addExtension(extension: WeWriteMarkedExtension) {
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
	async parse(md: string) {
		const { data, content } = matter(md);
		await Promise.all(this.extensions.map(ext => ext.prepare()));
		return await this.marked.parse(content);
	}
	public async postprocess(html: string): Promise<HTMLElement> {
		const dom = sanitizeHTMLToDom(html);
		const wrapper = document.createElement('div');
		wrapper.appendChild(dom);

		for (let ext of this.extensions) {
			await ext.postprocess(wrapper);
		}
		// Return DOM element directly
		return this.removeEmptyListItems(wrapper);
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
		view: Component
	): Promise<HTMLElement> {
		const content = await this.plugin.app.vault.adapter.read(path);
		const hash = this.simpleHash(content);

		// 1. Check Cache
		if (this.contentCache.has(path)) {
			const cached = this.contentCache.get(path);
			if (cached && cached.hash === hash) {
				console.debug(`[WechatRender] Cache HIT for ${path}`);
				// Skip Obsidian Render & Marked Parse
				return await this.postprocess(cached.html);
			}
		}

		console.debug(`[WechatRender] Cache MISS for ${path} (or first run)`);

		// [Fixed] Initialize ObsidianMarkdownRenderer to create previewEl
		// This is required for extensions (Excalidraw, Table, RemixIcon) that need to query the DOM
		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app as any);

		// Create a hidden temporary container
		const tempContainer = createDiv();
		tempContainer.style.position = 'absolute';
		tempContainer.style.left = '-9999px';
		tempContainer.style.top = '-9999px';
		tempContainer.style.width = '1200px';
		tempContainer.style.height = '2000px';
		tempContainer.addClasses(['markdown-preview-view', 'markdown-rendered', 'node-insert-event']);
		document.body.appendChild(tempContainer);


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

				// Pattern check to see if we should wait for specific elements
				const needsExcalidraw = /!\[\[.*?\.excalidraw.*?\]\]/i.test(content);
				const needsMermaid = /```\s*mermaid/i.test(content);

				if (needsExcalidraw || needsMermaid) {
					console.debug(`[WechatRender] Waiting for dynamic elements (Excalidraw: ${needsExcalidraw}, Mermaid: ${needsMermaid})`);
					while (attempts < maxAttempts && !elementsFound) {
						attempts++;

						const excalidrawFound = tempContainer.querySelector('.excalidraw') ||
							tempContainer.querySelector('.excalidraw-svg');
						const mermaidFound = tempContainer.querySelector('.mermaid');

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

		// Clean up temp container at the very end
		if (tempContainer.parentNode) {
			tempContainer.parentNode.removeChild(tempContainer);
		}

		return domElement;

	}

}

function renderListItem(parser: RendererThis["parser"], token: Tokens.ListItem) {
	const body = token.tokens ? parser.parse(token.tokens) : (token.text || '');
	return `<li><section>${body}</section></li>`;
}
