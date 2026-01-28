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
import { Component, debounce, sanitizeHTMLToDom } from "obsidian";
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
				return `<${type}${startatt} class="list-paddingleft-1">${body}</${type}>`;
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
		// this.addExtension(new ListItem(this.plugin, this.previewRender, this.marked))
	}
	async parse(md: string) {
		const { data, content } = matter(md);
		for (const extension of this.extensions) {
			await extension.prepare();
		}
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
		// [Fixed] Initialize ObsidianMarkdownRenderer to create previewEl
		// This is required for extensions (Excalidraw, Table, RemixIcon) that need to query the DOM
		const renderer = ObsidianMarkdownRenderer.getInstance(this.plugin.app as any);

		if (!renderer.previewEl) {
			console.debug(`[WechatRender] Initializing ObsidianMarkdownRenderer for ${path}`);

			// Create a hidden temporary container
			const tempContainer = createDiv();
			tempContainer.style.display = 'none';
			document.body.appendChild(tempContainer);

			try {
				// Render to temp container to initialize previewEl and markdownBody
				await renderer.render(path, tempContainer, view);

				// Enhanced waiting mechanism: check if elements actually appeared
				let attempts = 0;
				const maxAttempts = 15;
				let elementsFound = false;

				// Pattern check to see if we should wait for specific elements
				const content = await this.plugin.app.vault.adapter.read(path);
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

						await new Promise(resolve => setTimeout(resolve, 300));
					}
					if (!elementsFound) {
						console.warn(`[WechatRender] Timeout waiting for dynamic elements after ${attempts} attempts`);
					}
				} else {
					// Check for callouts or just wait a tiny bit
					await new Promise(resolve => setTimeout(resolve, 200));
				}

				console.debug(`[WechatRender] ObsidianMarkdownRenderer initialized, previewEl exists:`, !!renderer.previewEl);
			} catch (error) {
				console.error(`[WechatRender] Failed to initialize ObsidianMarkdownRenderer:`, error);
			} finally {
				// Clean up temp container
				if (tempContainer.parentNode) {
					tempContainer.parentNode.removeChild(tempContainer);
				}
			}
		}

		// Directly read file content and parse with marked for performance
		const md = await this.plugin.app.vault.adapter.read(path);
		// Reset extension states before parsing
		let htmlString = await this.parse(md);
		const domElement = await this.postprocess(htmlString);
		return domElement;
	}
}

function renderListItem(parser: RendererThis["parser"], token: Tokens.ListItem) {
	const body = token.tokens ? parser.parse(token.tokens) : (token.text || '');
	return `<li><section>${body}</section></li>`;
}

function serializeChildren(wrapper: HTMLElement): string {
	const serializer = new XMLSerializer();
	return Array.from(wrapper.childNodes)
		.map((node) => serializer.serializeToString(node))
		.join('');
}
