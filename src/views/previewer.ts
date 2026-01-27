/**
 * WeWrite Previewer - High Precision Version
 * 
 * Modifications by ryfineZ (2024-01-27):
 * 1. Fixed Header Layout (Sticky Header)
 * 2. Heading-Based Scroll Sync (High Precision)
 * 3. Command & Hotkey support for Scroll Sync Toggle
 */

import { EditorView } from "@codemirror/view";
import {
	Component,
	debounce,
	DropdownComponent,
	Editor,
	EditorPosition,
	EventRef,
	ExtraButtonComponent,
	ItemView,
	MarkdownView,
	MenuItem,
	Notice,
	sanitizeHTMLToDom,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { PreviewRender } from "src/render/marked-extensions/extension";
import {
	uploadCanvas,
	uploadSVGs,
	uploadURLImage,
	uploadURLVideo,
} from "src/render/post-render";
import { serializeChildren } from "src/utils/utils";
import { WechatRender } from "src/render/wechat-render";
import { ObsidianMarkdownRenderer } from "src/render/markdown-render";
import { ResourceManager } from "../assets/resource-manager";
import { WechatClient } from "../wechat-api/wechat-client";
import { MPArticleHeader } from "./mp-article-header";
import { ThemeManager } from "../theme/theme-manager";
import { ThemeSelector } from "../theme/theme-selector";
import { WebViewModal } from "./webview";

export const VIEW_TYPE_WEWRITE_PREVIEW = "wewrite-article-preview";
export interface ElectronWindow extends Window {
	WEBVIEW_SERVER_URL: string;
}

/**
 * PreviewPanel is a view component that renders and previews markdown content with WeChat integration.
 * It provides real-time rendering, theme selection, and draft management capabilities for WeChat articles.
 * 
 * Features:
 * - Real-time markdown rendering with debounced updates
 * - Theme selection and application
 * - Draft management (send to WeChat draft box, copy to clipboard)
 * - Frontmatter property handling
 * - Shadow DOM rendering container
 * 
 * The panel integrates with WeChatClient for draft operations and maintains article properties in sync with markdown frontmatter.
 */
export class PreviewPanel extends ItemView implements PreviewRender {
	markdownView: MarkdownView | null = null;
	private articleDiv: HTMLDivElement;
	private listeners: EventRef[] = [];
	private editorScrollListener: ((event: Event) => void) | null = null;
	private scrollSyncButton: ExtraButtonComponent | null = null;
	currentView: EditorView;
	observer: MutationObserver | null = null;
	private wechatClient: WechatClient;
	private plugin: WeWritePlugin;
	private themeSelector: ThemeSelector;
	private debouncedRender = debounce(() => {
		if (this.plugin.settings.realTimeRender) {
			void this.renderDraft();
		}
	}, 2000);
	private debouncedUpdate = debounce(() => {
		if (this.plugin.settings.realTimeRender) {
			void this.renderDraft();
		}
	}, 2000);
	private debouncedCustomThemeChange = debounce((theme: string) => {
		void this.applyCustomThemeChange(theme);
	}, 2000);

	private draftHeader: MPArticleHeader;
	private lastRenderedContent: string = "";
	private lastRenderTaskId: number = 0;
	articleProperties: Map<string, string> = new Map();
	editorView: EditorView | null = null;
	lastLeaf: WorkspaceLeaf | undefined;
	renderDiv!: HTMLElement;
	elementMap: Map<string, HTMLElement | string> = new Map();
	articleTitle: Setting;
	containerDiv: HTMLElement;
	mpModal: WebViewModal;
	isActive: boolean = false;
	isMobileView: boolean = false;
	articleStats: HTMLElement;
	renderPreviewer!: HTMLElement;
	getViewType(): string {
		return VIEW_TYPE_WEWRITE_PREVIEW;
	}
	getDisplayText(): string {
		return $t("views.previewer.wewrite-previewer");
	}
	getIcon() {
		return "pen-tool";
	}
	constructor(leaf: WorkspaceLeaf, plugin: WeWritePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.wechatClient = WechatClient.getInstance(this.plugin);
		this.themeSelector = new ThemeSelector(plugin);
	}

	private async applyCustomThemeChange(theme: string) {
		this.getArticleProperties();
		this.articleProperties.set("custom_theme", theme);
		await this.setArticleProperties();
		await this.renderDraft();
	}

	onOpen(): Promise<void> {
		this.buildUI();
		this.startListen();

		this.plugin.messageService.registerListener(
			"draft-title-updated",
			(title: string) => {
				this.articleTitle.setName(title);
			}
		);
		this.themeSelector.startWatchThemes();
		this.plugin.messageService.registerListener(
			"custom-theme-changed",
			(theme: string) => {
				// Instant theme preview - no debounce for immediate feedback
				void this.applyCustomThemeChange(theme);
			}
		);
		this.plugin.messageService.registerListener(
			"code-theme-changed",
			() => {
				// Instant code theme preview
				this.lastRenderedContent = ""; // Force re-render
				void this.renderDraft();
			}
		);
		this.plugin.messageService.registerListener(
			"layout-changed",
			() => {
				// Re-render on layout settings change
				this.lastRenderedContent = ""; // Force re-render
				void this.renderDraft();
			}
		);
		this.plugin.messageService.sendMessage("active-file-changed", null);
		void this.loadComponents();
		return Promise.resolve();
	}

	getArticleProperties() {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (
			activeFile?.extension === "md" ||
			activeFile?.extension === "markdown"
		) {
			const cache = this.app.metadataCache.getCache(activeFile.path);
			const frontmatter = cache?.frontmatter;
			this.articleProperties.clear();
			if (frontmatter !== undefined && frontmatter !== null) {
				Object.keys(frontmatter).forEach((key) => {
					this.articleProperties.set(key, frontmatter[key]);
				});
			}
		}
		return this.articleProperties;
	}
	async setArticleProperties() {
		const path = this.getCurrentMarkdownFile();

		if (path && this.articleProperties.size > 0) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				throw new Error(
					$t("views.previewer.file-not-found-path", [path])
				);
			}
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				this.articleProperties.forEach((value, key) => {
					frontmatter[key] = value;
				});
			});
		}

	}

	public getCurrentMarkdownFile() {
		const currentFile = this.plugin.app.workspace.getActiveFile();
		const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
		for (let leaf of leaves) {
			const markdownView = leaf.view as MarkdownView;
			if (markdownView.file?.path === currentFile?.path) {
				return markdownView.file?.path;
			}
		}
		return null;
	}
	buildUI() {
		const container = this.containerEl.children[1];
		container.empty();

		const mainDiv = container.createDiv({
			cls: "wewrite-previewer-container",
		});
		this.articleTitle = new Setting(mainDiv)
			.setName($t("views.previewer.article-title"))
			.setHeading()
			.addDropdown((dropdown: DropdownComponent) => {
				void this.themeSelector.dropdown(dropdown);
			})

			.addExtraButton((button) => {
				button
					.setIcon("refresh-cw")
					.setTooltip($t("views.previewer.render-article"))
					.onClick(() => {
						void this.renderDraft();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("send-horizontal")
					.setTooltip($t("views.previewer.send-article-to-draft-box"))
					.onClick(() => {
						void (async () => {
							if (await this.checkCoverImage()) {
								await this.sendArticleToDraftBox();
							} else {
								new Notice(
									$t("views.previewer.please-set-cover-image")
								);
							}
						})();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("clipboard-copy")
					.setTooltip($t("views.previewer.copy-article-to-clipboard"))
					.onClick(() => {
						void (async () => {
							const data = this.getArticleContent();
							await navigator.clipboard.write([
								new ClipboardItem({
									"text/html": new Blob([data], {
										type: "text/html",
									}),
								}),
							]);
							new Notice(
								$t("views.previewer.article-copied-to-clipboard")
							);
						})();
					});
			})
			.addExtraButton((button) => {
				this.scrollSyncButton = button;
				const isSync = this.plugin.settings.scrollSync ?? true;
				button
					.setIcon(isSync ? "arrow-up-down" : "lock")
					.setTooltip(isSync ? "Scroll Sync: ON" : "Scroll Sync: OFF")
					.onClick(() => {
						this.plugin.settings.scrollSync = !this.plugin.settings.scrollSync;
						this.refreshScrollSyncButton();
						new Notice(this.plugin.settings.scrollSync ? "Scroll Sync Enabled" : "Scroll Sync Disabled");
						this.plugin.saveSettings();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon(this.isMobileView ? "monitor" : "tablet-smartphone")
					.setTooltip(this.isMobileView ? "Desktop View" : "Mobile View")
					.onClick(() => {
						this.isMobileView = !this.isMobileView;
						button.setIcon(this.isMobileView ? "monitor" : "tablet-smartphone");
						button.setTooltip(this.isMobileView ? "Desktop View" : "Mobile View");
						if (this.isMobileView) {
							this.renderDiv.addClass("is-mobile-view");
						} else {
							this.renderDiv.removeClass("is-mobile-view");
						}
						new Notice(this.isMobileView ? "Mobile Preview Mode" : "Desktop View Mode");
					});
			});

		this.draftHeader = new MPArticleHeader(this.plugin, mainDiv);

		// Article Stats Display (Word Count / Reading Time)
		this.articleStats = mainDiv.createDiv({ cls: "wewrite-article-stats" });
		this.articleStats.setText("约 0 字 / 预计阅读 0 分钟");

		this.renderDiv = mainDiv.createDiv({ cls: "render-container" });
		this.renderDiv.id = "render-div";
		this.renderPreviewer = mainDiv.createDiv({
			cls: "wewrite-render-preview",
		})
		// 使用常规 DOM 容器，避免 Shadow DOM 带来的额外开销
		this.containerDiv = this.renderDiv.createDiv({ cls: "wewrite-article" });
		this.articleDiv = this.containerDiv.createDiv({ cls: "article-div" });
	}
	async checkCoverImage() {
		return await this.draftHeader.checkCoverImage();
	}
	async sendArticleToDraftBox() {
		const root = this.articleDiv.firstElementChild as HTMLElement | null;
		if (root) {
			await ThemeManager.getInstance(this.plugin).applyTheme(root);
		}
		await uploadSVGs(this.articleDiv, this.plugin.wechatClient);
		await uploadCanvas(this.articleDiv, this.plugin.wechatClient);
		await uploadURLImage(this.articleDiv, this.plugin.wechatClient);
		await uploadURLVideo(this.articleDiv, this.plugin.wechatClient);

		const media_id = await this.wechatClient.sendArticleToDraftBox(
			this.draftHeader.getActiveLocalDraft()!,
			this.getArticleContent()
		);

		if (media_id) {
			this.draftHeader.updateDraftDraftId(media_id);
			const news_item = await this.wechatClient.getDraftById(
				this.plugin.settings.selectedMPAccount!,
				media_id
			);
			if (news_item) {
				open(news_item[0].url);
				const item = {
					media_id: media_id,
					content: {
						news_item: news_item,
					},
					update_time: Date.now(),
				};
				this.plugin.messageService.sendMessage(
					"draft-item-updated",
					item
				);
			}
		}
	}
	public getArticleContent() {
		return serializeChildren(this.articleDiv);
	}
	// async getCSS() {
	// 	return await ThemeManager.getInstance(this.plugin).getCSS();
	// }

	onClose(): Promise<void> {
		// Clean up our view
		this.stopListen();
		return Promise.resolve();
	}

	async parseActiveMarkdown(taskId: number) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== "md") {
			return;
		}

		const content = await this.plugin.app.vault.adapter.read(activeFile.path);

		// 1. Content Hashing: Skip if content is exactly the same as last time
		if (content === this.lastRenderedContent) {
			console.debug("Render skipped: Content not changed");
			return;
		}

		// Update last rendered content tracking
		this.lastRenderedContent = content;

		// 2. Prepare rendering
		this.articleDiv.empty();
		this.elementMap = new Map<string, HTMLElement | string>();

		await ObsidianMarkdownRenderer.getInstance(this.plugin.app).render(
			activeFile.path,
			this.renderPreviewer,
			this
		);

		// 3. Task ID Validation: Check if this task is still the most recent one
		if (taskId !== this.lastRenderTaskId) {
			console.debug("Render cancelled: Newer task started");
			return;
		}

		let html = await WechatRender.getInstance(this.plugin, this).parseNote(
			activeFile.path,
			this.renderPreviewer,
			this
		);

		// return; //to see the render tree.
		const articleSection = createEl("section", {
			cls: "wewrite-article-content wewrite",
		});
		const dom = sanitizeHTMLToDom(html);
		articleSection.appendChild(dom);

		this.articleDiv.empty();
		this.articleDiv.appendChild(articleSection);

		for (const [id, node] of this.elementMap.entries()) {
			const item = this.articleDiv.querySelector(
				"#" + id
			) as HTMLElement;

			if (!item) {
				continue;
			}
			if (typeof node === "string") {
				const tf = ResourceManager.getInstance(
					this.plugin
				).getFileOfLink(node);
				if (tf) {
					const file = this.plugin.app.vault.getFileByPath(
						tf.path
					);
					if (file) {
						const body = await WechatRender.getInstance(
							this.plugin,
							this
						).parseNote(file.path, this.articleDiv, this);
						item.empty();
						item.appendChild(sanitizeHTMLToDom(body));
					}
				}
			} else {
				item.appendChild(node);
			}
		}
		// return this.articleDiv.innerHTML;
	}
	async renderDraft() {
		if (!this.isViewActive()) {
			return;
		}

		// 1. Generation a new Task ID to track this specific render request
		const taskId = ++this.lastRenderTaskId;

		await this.parseActiveMarkdown(taskId);

		// 2. Final Validation: If a newer task has already started/finished, abort this one
		if (taskId !== this.lastRenderTaskId) {
			return;
		}

		if (this.articleDiv === null || this.articleDiv.firstChild === null) {
			return;
		}
		const element = this.articleDiv.firstChild as HTMLElement;

		// Apply layout enhancements
		this.applyLayoutEnhancements(element);

		const apply = () => {
			// Double check connectivity and task ID before heavy theme application
			if (!element.isConnected || taskId !== this.lastRenderTaskId) return;

			void ThemeManager.getInstance(this.plugin)
				.applyTheme(element)
				.then(() => {
					this.updateArticleStats();
				})
				.catch((error) => {
					console.error("应用主题失败:", error);
				});
		};
		type WindowWithIdleCallback = Window & {
			requestIdleCallback?: (cb: () => void) => number;
		};
		const idleWindow = window as WindowWithIdleCallback;
		if (typeof idleWindow.requestIdleCallback === 'function') {
			idleWindow.requestIdleCallback(apply);
		} else {
			setTimeout(apply, 0);
		}
	}

	// Apply layout enhancements based on settings
	applyLayoutEnhancements(element: HTMLElement) {
		// First-line indent
		if (this.plugin.settings.firstLineIndent) {
			this.containerDiv.addClass("wewrite-indent-enabled");
		} else {
			this.containerDiv.removeClass("wewrite-indent-enabled");
		}

		// Link footnotes conversion
		if (this.plugin.settings.linkFootnotes) {
			this.convertLinksToFootnotes(element);
		}
	}

	// Convert hyperlinks to footnote references for WeChat compatibility
	convertLinksToFootnotes(element: HTMLElement) {
		const links = element.querySelectorAll("a[href]");
		const footnotes: { text: string; url: string }[] = [];
		let index = 1;

		links.forEach((link) => {
			const anchor = link as HTMLAnchorElement;
			const href = anchor.getAttribute("href");
			const text = anchor.textContent || "";

			// Skip internal links and anchors
			if (!href || href.startsWith("#") || href.startsWith("obsidian://")) {
				return;
			}

			// Add footnote reference
			const footnoteRef = document.createElement("sup");
			footnoteRef.className = "wewrite-footnote-ref";
			footnoteRef.textContent = `[${index}]`;
			anchor.after(footnoteRef);

			// Store footnote data
			footnotes.push({ text, url: href });
			index++;
		});

		// Add footnotes section at the end if there are any
		if (footnotes.length > 0) {
			const footnotesSection = document.createElement("section");
			footnotesSection.className = "wewrite-footnotes";

			const title = document.createElement("p");
			title.className = "wewrite-footnotes-title";
			title.textContent = "🔗 参考链接";
			footnotesSection.appendChild(title);

			footnotes.forEach((fn, i) => {
				const item = document.createElement("p");
				item.className = "wewrite-footnote-item";
				item.innerHTML = `[${i + 1}] ${fn.text}: <a href="${fn.url}">${fn.url}</a>`;
				footnotesSection.appendChild(item);
			});

			element.appendChild(footnotesSection);
		}
	}

	isViewActive(): boolean {
		return this.isActive && !this.app.workspace.rightSplit.collapsed
	}

	startListen() {
		this.registerEvent(
			this.plugin.app.vault.on("rename", (file: TFile) => {
				this.draftHeader.onNoteRename(file);
			})
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				const isOpen = this.app.workspace.getLeavesOfType(VIEW_TYPE_WEWRITE_PREVIEW).length > 0;
				this.isActive = isOpen;
			})
		);

		const ec = this.app.workspace.on(
			"editor-change",
			(editor: Editor, info: MarkdownView) => {
				this.onEditorChange(editor, info);
			}
		);
		this.listeners.push(ec);

		const el = this.app.workspace.on("active-leaf-change", (leaf) => {
			if (leaf) {
				if (leaf.view.getViewType() === "markdown") {
					this.plugin.messageService.sendMessage(
						"active-file-changed",
						null
					);
					void this.debouncedUpdate();
					// Re-bind scroll listener when active file changes
					this.registerEditorScroll();
				} else {
					this.isActive = leaf.view.getViewType() === VIEW_TYPE_WEWRITE_PREVIEW
				}
			}
		});
		this.listeners.push(el);

		this.registerEditorScroll();
	}

	registerEditorScroll() {
		const markdownView = this.getMarkdownView();
		if (!markdownView) return;
		const editor = markdownView.editor;
		// @ts-ignore
		const scrollDom = editor?.cm?.scrollDOM;

		if (scrollDom) {
			if (this.editorScrollListener) {
				scrollDom.removeEventListener("scroll", this.editorScrollListener);
			}

			this.editorScrollListener = () => {
				if (!this.plugin.settings.scrollSync) return;

				const previewEl = this.renderDiv;
				if (!previewEl) return;

				const file = this.app.workspace.getActiveFile();
				const headings = file ? this.app.metadataCache.getFileCache(file)?.headings : null;

				// Fallback to percentage if no headings
				if (!headings || headings.length === 0) {
					this.syncScrollPercentage(scrollDom, previewEl);
					return;
				}

				// CM6 Editor View
				// @ts-ignore
				const cmView = editor.cm;
				const currentScrollTop = scrollDom.scrollTop;

				// Find current section
				let currentIndex = -1;
				let currentHeadingTop = 0;
				let nextHeadingTop = scrollDom.scrollHeight;

				// Get Heading positions in Editor
				// Note: cache lines are 0-indexed, CM6 doc lines are 1-indexed
				const headingPositions = headings.map(h => {
					try {
						// Safety check for line existence
						const lineNo = h.position.start.line + 1;
						const doc = cmView.state.doc;
						if (lineNo > doc.lines) return -1;

						const pos = doc.line(lineNo).from;
						return cmView.lineBlockAt(pos).top;
					} catch (e) {
						return -1;
					}
				});

				// Find which section we are in
				for (let i = 0; i < headingPositions.length; i++) {
					const hTop = headingPositions[i];
					if (hTop === -1) continue;

					if (hTop <= currentScrollTop) {
						currentIndex = i;
						currentHeadingTop = hTop;
					} else {
						nextHeadingTop = hTop;
						break;
					}
				}

				// Calculate ratio
				// If before the first heading
				if (currentIndex === -1) {
					// From 0 to First Heading
					nextHeadingTop = headingPositions[0] !== -1 ? headingPositions[0] : scrollDom.scrollHeight;
					currentHeadingTop = 0;
				}
				// If after the last heading
				else if (currentIndex === headingPositions.length - 1) {
					nextHeadingTop = scrollDom.scrollHeight;
				}

				// Avoid division by zero
				const range = nextHeadingTop - currentHeadingTop;
				const ratio = range > 0 ? (currentScrollTop - currentHeadingTop) / range : 0;

				// Map to Preview DOM
				const previewHeadings = previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6');

				// Handle mismatch/empty preview headers
				if (previewHeadings.length === 0) {
					this.syncScrollPercentage(scrollDom, previewEl);
					return;
				}

				let startElTop = 0;
				let endElTop = previewEl.scrollHeight - previewEl.clientHeight;

				if (currentIndex === -1) {
					// Before first header
					if (previewHeadings.length > 0) {
						endElTop = (previewHeadings[0] as HTMLElement).offsetTop;
					}
				} else if (currentIndex >= previewHeadings.length) {
					// Index out of bounds (preview has fewer headers than editor?)
					// Fallback to last available header
					startElTop = (previewHeadings[previewHeadings.length - 1] as HTMLElement).offsetTop;
				} else {
					// Normal case
					startElTop = (previewHeadings[currentIndex] as HTMLElement).offsetTop;

					// Determine end element
					if (currentIndex + 1 < previewHeadings.length) {
						endElTop = (previewHeadings[currentIndex + 1] as HTMLElement).offsetTop;
					} else {
						// Last header to end of doc
						endElTop = previewEl.scrollHeight - previewEl.clientHeight;
					}
				}

				// Apply scroll
				// Using requestAnimationFrame for high performance and smoothness
				// The target position is calculated by interpolating between two heading anchors
				requestAnimationFrame(() => {
					previewEl.scrollTop = startElTop + ratio * (endElTop - startElTop);
				});
			};

			scrollDom.addEventListener("scroll", this.editorScrollListener);
		}
	}

	syncScrollPercentage(scrollDom: HTMLElement, previewEl: HTMLElement) {
		const scrollInfo = {
			top: scrollDom.scrollTop,
			height: scrollDom.scrollHeight,
			clientHeight: scrollDom.clientHeight
		};
		const percentage = scrollInfo.top / (scrollInfo.height - scrollInfo.clientHeight);
		requestAnimationFrame(() => {
			previewEl.scrollTop = percentage * (previewEl.scrollHeight - previewEl.clientHeight);
		});
	}

	stopListen() {
		const editor = this.getMarkdownView()?.editor;
		// @ts-ignore
		const scrollDom = editor?.cm?.scrollDOM;
		if (scrollDom && this.editorScrollListener) {
			scrollDom.removeEventListener("scroll", this.editorScrollListener);
		}
		this.listeners.forEach((e) => this.app.workspace.offref(e));
	}

	getMarkdownView(): MarkdownView | null {
		return this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	onEditorChange(editor: Editor, info: MarkdownView) {
		void this.debouncedRender();
	}
	updateElementByID(id: string, html: string): void {
		const item = this.articleDiv.querySelector("#" + id) as HTMLElement;
		if (!item) return;
		const doc = sanitizeHTMLToDom(html);

		item.empty();
		item.appendChild(doc);
		// if (doc.childElementCount > 0) {
		// 	for (const child of doc.children) {
		// 		item.appendChild(child.cloneNode(true));
		// 	}
		// } else {
		// 	item.innerText = $t("views.previewer.article-render-failed");
		// }
	}
	addElementByID(id: string, node: HTMLElement | string): void {
		if (typeof node === "string") {
			this.elementMap.set(id, node);
		} else {
			this.elementMap.set(id, node.cloneNode(true) as HTMLElement);
		}
	}
	private async loadComponents() {
		type InternalComponent = Component & {
			_children: Component[];
			onload: () => void | Promise<void>;
		}

		// recursively call onload() on all children, depth-first
		const loadChildren = async (
			component: Component,
			visited: Set<Component> = new Set()
		): Promise<void> => {
			if (visited.has(component)) {
				return;  // Skip if already visited
			}

			visited.add(component);

			const internalComponent = component as InternalComponent;

			if (internalComponent._children?.length) {
				for (const child of internalComponent._children) {
					await loadChildren(child, visited);
				}
			}
			try {
				// relies on the Sheet plugin (advanced-table-xt) not to be minified
				if (component?.constructor?.name === 'SheetElement') {
					await Promise.resolve(component.onload());
				}
			} catch (error) {
				console.error(`Error calling onload()`, error);
			}
		};
		await loadChildren(this as unknown as InternalComponent);
	}
	refreshScrollSyncButton() {
		if (this.scrollSyncButton) {
			const isSync = this.plugin.settings.scrollSync ?? true;
			this.scrollSyncButton.setIcon(isSync ? "arrow-up-down" : "lock");
			this.scrollSyncButton.setTooltip(isSync ? "Scroll Sync: ON" : "Scroll Sync: OFF");
		}
	}

	// Public methods for hotkey commands
	toggleMobileView() {
		if (!this.renderDiv) return; // Guard against early invocation
		this.isMobileView = !this.isMobileView;
		if (this.isMobileView) {
			this.renderDiv.addClass("is-mobile-view");
		} else {
			this.renderDiv.removeClass("is-mobile-view");
		}
		new Notice(this.isMobileView ? "Mobile Preview Mode" : "Desktop View Mode");
	}

	async copyToClipboard() {
		if (!this.articleDiv || !this.articleDiv.innerHTML) {
			new Notice("No content to copy");
			return;
		}
		const data = this.getArticleContent();
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/html": new Blob([data], { type: "text/html" }),
			}),
		]);
		new Notice($t("views.previewer.article-copied-to-clipboard"));
	}

	async sendToDraft() {
		if (await this.checkCoverImage()) {
			await this.sendArticleToDraftBox();
		} else {
			new Notice($t("views.previewer.please-set-cover-image"));
		}
	}

	updateArticleStats() {
		if (!this.articleStats) return; // Guard against early invocation
		const content = this.lastRenderedContent;
		if (!content) {
			this.articleStats.setText("约 0 字 / 预计阅读 0 分钟");
			return;
		}

		// Count Chinese characters
		const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
		// Count English words (approximate)
		const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;

		// Total "words" (Chinese chars are words, English words are counted as-is)
		const totalWords = chineseChars + englishWords;

		// Reading time: ~200 Chinese chars OR ~150 English words per minute
		// Using a blended rate of ~200 "units" per minute
		const readingTimeMinutes = Math.max(1, Math.ceil(totalWords / 200));

		this.articleStats.setText(`约 ${totalWords} 字 / 预计阅读 ${readingTimeMinutes} 分钟`);
	}
}
