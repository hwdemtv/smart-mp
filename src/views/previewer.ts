/**
 * Define the right-side leaf of view as Previewer view
 */

import { EditorView } from "@codemirror/view";
import {
	Component,
	debounce,
	DropdownComponent,
	Editor,
	EventRef,
	ItemView,
	MarkdownView,
	Notice,
	sanitizeHTMLToDom,
	Setting,
	TFile,
	WorkspaceLeaf,
	ExtraButtonComponent,
	EditorPosition,
	Platform,
} from "obsidian";
import { $t } from "src/lang/i18n";
import WeWritePlugin from "src/main";
import { PreviewRender } from "src/render/marked-extensions/extension";
import {
	uploadCanvas,
	uploadSVGs,
	uploadURLImage,
	uploadURLVideo,
	convertAssetsToDataURLs
} from "src/render/post-render";
import { serializeChildren, cleanHtmlForWechat } from "src/utils/utils";
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
	currentView!: EditorView;
	observer: MutationObserver | null = null;
	private wechatClient: WechatClient;
	private plugin: WeWritePlugin;
	private themeSelector: ThemeSelector;
	private debouncedRender = debounce(() => {
		if (this.plugin.settings.realTimeRender) {
			void this.renderDraft();
		}
	}, 500);
	private debouncedUpdate = debounce(() => {
		if (this.plugin.settings.realTimeRender) {
			void this.renderDraft();
		}
	}, 500);

	rebuildDebounce() {
		const delay = this.plugin.settings.realTimeRenderDelay || 500;
		this.debouncedRender = debounce(() => {
			if (this.plugin.settings.realTimeRender) {
				void this.renderDraft();
			}
		}, delay);
		this.debouncedUpdate = debounce(() => {
			if (this.plugin.settings.realTimeRender) {
				void this.renderDraft();
			}
		}, delay);
	}

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
	containerDiv: HTMLElement;
	mpModal: WebViewModal;
	isActive: boolean = false;
	isMobileView: boolean = false;
	renderPreviewer!: HTMLElement;
	private editorScrollListener: ((event: Event) => void) | null = null;
	private scrollSyncButton: ExtraButtonComponent | null = null;
	private articleStats: HTMLElement;
	private currentArticleStats = { totalWords: 0, readingTime: 0 };

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
		this.rebuildDebounce();
	}

	toggleMobileView(button: ExtraButtonComponent) {
		this.isMobileView = !this.isMobileView;
		if (this.isMobileView) {
			this.renderDiv.addClass("is-mobile-view");
			button.setTooltip("切换为桌面视图");
			button.setIcon("monitor");
		} else {
			this.renderDiv.removeClass("is-mobile-view");
			button.setTooltip("切换为手机视图");
			button.setIcon("tablet-smartphone");
		}
	}

	toggleScrollSync(button: ExtraButtonComponent) {
		this.plugin.settings.scrollSync = !this.plugin.settings.scrollSync;
		this.refreshScrollSyncButton();
		new Notice(this.plugin.settings.scrollSync ? "滚动同步已开启" : "滚动同步已关闭");
		void this.plugin.saveSettings();
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

		this.themeSelector.startWatchThemes();
		this.plugin.messageService.registerListener(
			"custom-theme-changed",
			(theme: string) => {
				// Instant theme preview - no debounce for immediate feedback
				void this.applyCustomThemeChange(theme);
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

		// Compact Toolbar Container
		const toolbar = mainDiv.createDiv({ cls: "wewrite-previewer-toolbar" });

		// Theme Selector (Dropdown)
		const themeSetting = new Setting(toolbar)
			.addDropdown((dropdown: DropdownComponent) => {
				void this.themeSelector.dropdown(dropdown);
			})
			.setClass("wewrite-toolbar-item");

		// Utility Buttons
		toolbar.createDiv({ cls: "wewrite-toolbar-spacer" });

		const buttonsDiv = toolbar.createDiv({ cls: "wewrite-toolbar-buttons" });

		new Setting(buttonsDiv)
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
							const notice = new Notice("正在准备剪贴板内容...", 0);
							try {
								// User requested to skip image upload for clipboard copy
								const result = await this.processArticleForExport(notice, false);
								if (!result) {
									notice.hide();
									return;
								}

								// 创建剪贴板项目
								const clipboardItem = new ClipboardItem({
									'text/html': new Blob([result.html], { type: 'text/html' }),
									'text/plain': new Blob([result.text], { type: 'text/plain' }),
								});

								// 写入剪贴板
								await navigator.clipboard.write([clipboardItem]);
								new Notice(
									$t("views.previewer.article-copied-to-clipboard")
								);
							} catch (error) {
								notice.hide();
								console.error('复制到剪贴板失败:', error);
								new Notice(`复制失败: ${error instanceof Error ? error.message : String(error)}`);
							}
						})();
					});
			})
			.addExtraButton((button) => {
				this.scrollSyncButton = button;
				this.refreshScrollSyncButton();
				button.onClick(() => {
					this.toggleScrollSync(button);
				});
			})
			.addExtraButton((button) => {
				button
					.setIcon(this.isMobileView ? "monitor" : "tablet-smartphone")
					.setTooltip(this.isMobileView ? "切换为桌面视图" : "切换为手机视图")
					.onClick(() => {
						this.toggleMobileView(button);
						button.setIcon(this.isMobileView ? "monitor" : "tablet-smartphone");
						button.setTooltip(this.isMobileView ? "切换为桌面视图" : "切换为手机视图");
					});
			})
			.setClass("wewrite-toolbar-item");

		this.draftHeader = new MPArticleHeader(this.plugin, mainDiv);

		// Article Stats Display (Word Count / Reading Time)
		this.articleStats = mainDiv.createDiv({ cls: "wewrite-article-stats" });
		this.articleStats.setText("约 0 字 / 预计阅读 0 分钟");

		this.renderDiv = mainDiv.createDiv({ cls: "render-container" });
		this.renderDiv.id = "render-div";
		this.renderPreviewer = this.renderDiv.createDiv({
			cls: "render-previewer",
		})
		// 使用常规 DOM 容器，避免 Shadow DOM 带来的额外开销
		this.containerDiv = this.renderPreviewer.createDiv({ cls: "wewrite-article" });
		this.articleDiv = this.containerDiv.createDiv({ cls: "article-div" });
	}
	async processArticleForExport(progressNotice?: Notice, uploadImages: boolean = true): Promise<{ html: string; text: string } | null> {
		if (progressNotice) progressNotice.setMessage("正在准备文章内容...");
		const finalArticleEl = this.articleDiv.cloneNode(true) as HTMLElement;

		if (progressNotice) progressNotice.setMessage("正在应用排版主题...");
		const root = finalArticleEl.firstElementChild as HTMLElement | null;
		if (root) {
			await ThemeManager.getInstance(this.plugin).applyTheme(root);
		}

		if (uploadImages) {
			if (progressNotice) progressNotice.setMessage("正在上传/处理图片 (这可能需要一点时间)...");
			try {
				await uploadSVGs(finalArticleEl, this.plugin.wechatClient);
				await uploadCanvas(finalArticleEl, this.plugin.wechatClient);
				await uploadURLImage(finalArticleEl, this.plugin.wechatClient);
				await uploadURLVideo(finalArticleEl, this.plugin.wechatClient);
			} catch (e) {
				console.error("Error processing media:", e);
				new Notice("图片/媒体处理失败，部分图片可能无法显示");
			}
		} else {
			if (progressNotice) progressNotice.setMessage("正在转换图片为 Base64 (这可能需要一点时间)...");
			try {
				await convertAssetsToDataURLs(finalArticleEl);
			} catch (e) {
				console.error("Error converting images to Base64:", e);
				new Notice("图片处理失败，部分图片可能无法显示");
			}
		}

		if (progressNotice) progressNotice.setMessage("正在优化 HTML 结构...");
		const cleanedArticleEl = cleanHtmlForWechat(finalArticleEl);


		const html = serializeChildren(cleanedArticleEl);
		const text = cleanedArticleEl.textContent || '';

		if (!html || html.trim().length === 0) {
			new Notice('生成的内容为空，无法发送至草稿箱。请检查文章内容。', 5000);
			return null;
		}
		return { html, text };
	}

	async checkCoverImage() {
		return await this.draftHeader.checkCoverImage();
	}
	async sendArticleToDraftBox() {
		const notice = new Notice("开始处理文章...", 0);
		const result = await this.processArticleForExport(notice);
		if (!result) {
			notice.hide();
			return;
		}

		notice.setMessage("正在发送到草稿箱...");

		const activeDraft = this.draftHeader.getActiveLocalDraft();
		if (!activeDraft) {
			new Notice('无法获取当前草稿信息', 5000);
			return;
		}

		const media_id = await this.wechatClient.sendArticleToDraftBox(
			activeDraft,
			result.html
		);

		if (!media_id) {
			new Notice('发送草稿失败，请检查控制台错误日志', 5000);
			return;
		}

		if (media_id && this.plugin.settings.selectedMPAccount) {
			this.draftHeader.updateDraftDraftId(media_id);
			const news_item = await this.wechatClient.getDraftById(
				this.plugin.settings.selectedMPAccount,
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

		// 3. Task ID Validation: Check if this task is still the most recent one
		if (taskId !== this.lastRenderTaskId) {
			console.debug("Render cancelled: Newer task started");
			return;
		}

		// Render directly into articleDiv to preserve live DOM
		const renderedDom = await WechatRender.getInstance(this.plugin, this).parseNote(
			activeFile.path,
			this.articleDiv,
			this
		);

		// Populate articleDiv with the rendered HTML
		const articleSection = createEl("section", {
			cls: "wewrite-article-content wewrite",
		});
		articleSection.appendChild(renderedDom);

		this.articleDiv.empty();
		this.articleDiv.appendChild(articleSection);

		this.elementMap.clear();
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

		// Calculate stats from fresh rendered content (before layout enhancements)
		const textContent = element.textContent || "";
		this.currentArticleStats = this.calculateStats(textContent);

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

		// Code Theme Class
		const codeTheme = this.plugin.settings.codeTheme || "github";
		element.removeClass("wewrite-theme-github", "wewrite-theme-monokai", "wewrite-theme-atom-one-dark", "wewrite-theme-vs2015", "wewrite-theme-default");
		element.addClass(`wewrite-theme-${codeTheme}`);

		// Font Size
		const fontSize = this.plugin.settings.fontSize || "15px";
		this.containerDiv.style.setProperty("--wewrite-font-size", fontSize);
		element.style.fontSize = fontSize;

		// Wrap tables for mobile responsiveness
		this.wrapTables(element);

		// Embed article stats at the beginning
		if (this.plugin.settings.embedArticleStats) {
			this.embedArticleStatsInContent(element);
		}

		// Process Image Captions
		if (this.plugin.settings.showImageCaptions) {
			this.processImageCaptions(element);
		}

		// HR Replacement
		this.processHR(element);

		// Link footnotes conversion (should be last as it modifies links)
		if (this.plugin.settings.linkFootnotes) {
			this.convertLinksToFootnotes(element);
		}
	}

	// Process Horizontal Rules
	processHR(element: HTMLElement) {
		const hrStyle = this.plugin.settings.hrStyle || "dots";
		if (hrStyle === 'none') {
			element.querySelectorAll('hr').forEach(hr => hr.style.display = 'none');
			return;
		}

		let content = "· · ·";
		if (hrStyle === "lines") content = "— — —";
		else if (hrStyle === "stars") content = "* * *";
		else if (hrStyle === "custom") content = this.plugin.settings.customHrText || "· · ·";

		const hrs = element.querySelectorAll("hr");
		hrs.forEach((hr) => {
			const div = document.createElement("div");
			div.className = "wewrite-hr-replacement";
			div.textContent = content;
			hr.replaceWith(div);
		});
	}

	// Wrap tables in a scrollable container
	wrapTables(element: HTMLElement) {
		const tables = element.querySelectorAll("table");
		tables.forEach((table) => {
			if (table.parentElement?.classList.contains("wewrite-table-container")) {
				return;
			}
			const wrapper = document.createElement("div");
			wrapper.className = "wewrite-table-container";
			table.parentNode?.insertBefore(wrapper, table);
			wrapper.appendChild(table);
		});
	}

	// Process image captions based on Alt text
	processImageCaptions(element: HTMLElement) {
		const images = element.querySelectorAll("img");
		images.forEach((img) => {
			const altText = img.getAttribute("alt");
			if (
				!altText ||
				altText.length < 2 ||
				/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(altText) ||
				altText.startsWith("Pasted image")
			) {
				return;
			}

			if (
				img.nextElementSibling &&
				img.nextElementSibling.classList.contains("wewrite-caption")
			) {
				return;
			}

			const caption = document.createElement("span");
			caption.className = "wewrite-caption";
			caption.textContent = altText;

			img.parentNode?.insertBefore(caption, img.nextSibling);
		});
	}

	// Embed word count and reading time at the beginning of article
	embedArticleStatsInContent(element: HTMLElement) {
		const existingStats = element.querySelector(".wewrite-embedded-stats");
		if (existingStats) {
			existingStats.remove();
		}

		const { totalWords, readingTime } = this.currentArticleStats;

		const statsDiv = document.createElement("section");
		statsDiv.className = "wewrite-embedded-stats";
		statsDiv.innerHTML = `<p style="text-align: center; color: #999; font-size: 14px; margin-bottom: 1.5em;">📖 全文约 <strong>${totalWords}</strong> 字 · 预计阅读 <strong>${readingTime}</strong> 分钟</p>`;

		if (element.firstChild) {
			element.insertBefore(statsDiv, element.firstChild);
		} else {
			element.appendChild(statsDiv);
		}
	}

	calculateStats(text: string) {
		const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
		const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
		const totalWords = chineseChars + englishWords;
		const readingTime = Math.max(1, Math.ceil(totalWords / 200));
		return { totalWords, readingTime };
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

			if (!href || href.startsWith("#") || href.startsWith("obsidian://")) {
				return;
			}

			const footnoteRef = document.createElement("sup");
			footnoteRef.className = "wewrite-footnote-ref";
			footnoteRef.textContent = `[${index}]`;
			anchor.after(footnoteRef);

			footnotes.push({ text, url: href });
			index++;
		});

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

	updateArticleStats() {
		if (!this.articleStats) return;
		const { totalWords, readingTime } = this.currentArticleStats;
		this.articleStats.setText(`约 ${totalWords} 字 / 预计阅读 ${readingTime} 分钟`);
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
					// Reset content hash on file change
					this.lastRenderedContent = "";
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

		this.plugin.messageService.registerListener("render-active-note", () => {
			void this.renderDraft();
		});
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
				const headingPositions = headings.map(h => {
					try {
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
				if (currentIndex === -1) {
					nextHeadingTop = headingPositions[0] !== -1 ? headingPositions[0] : scrollDom.scrollHeight;
					currentHeadingTop = 0;
				}
				else if (currentIndex === headingPositions.length - 1) {
					nextHeadingTop = scrollDom.scrollHeight;
				}

				const range = nextHeadingTop - currentHeadingTop;
				const ratio = range > 0 ? (currentScrollTop - currentHeadingTop) / range : 0;

				// Map to Preview DOM
				const previewHeadings = previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6');

				if (previewHeadings.length === 0) {
					this.syncScrollPercentage(scrollDom, previewEl);
					return;
				}

				let startElTop = 0;
				let endElTop = previewEl.scrollHeight - previewEl.clientHeight;

				if (currentIndex === -1) {
					if (previewHeadings.length > 0) {
						endElTop = (previewHeadings[0] as HTMLElement).offsetTop;
					}
				} else if (currentIndex >= previewHeadings.length) {
					startElTop = (previewHeadings[previewHeadings.length - 1] as HTMLElement).offsetTop;
				} else {
					startElTop = (previewHeadings[currentIndex] as HTMLElement).offsetTop;
					if (currentIndex + 1 < previewHeadings.length) {
						endElTop = (previewHeadings[currentIndex + 1] as HTMLElement).offsetTop;
					} else {
						endElTop = previewEl.scrollHeight - previewEl.clientHeight;
					}
				}

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
		// Clean up the specifically attached scroll listener if it exists
		if (this.editorScrollListener && this.renderDiv) {
			// Try to remove from the current editor's scrollDom
			const editor = this.getMarkdownView()?.editor;
			// @ts-ignore
			const scrollDom = editor?.cm?.scrollDOM;
			if (scrollDom) {
				scrollDom.removeEventListener("scroll", this.editorScrollListener);
			}
		}
		this.listeners.forEach((e) => this.app.workspace.offref(e));
	}

	getMarkdownView(): MarkdownView | null {
		return this.app.workspace.getActiveViewOfType(MarkdownView);
	}

	refreshScrollSyncButton() {
		if (this.scrollSyncButton) {
			const isSync = this.plugin.settings.scrollSync ?? true;
			this.scrollSyncButton.setIcon(isSync ? "arrow-up-down" : "lock");
			this.scrollSyncButton.setTooltip(isSync ? (isSync ? "滚动同步: 开启" : "滚动同步: 关闭") : "滚动同步: 关闭");
		}
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
}
