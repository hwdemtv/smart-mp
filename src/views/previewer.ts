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
import SmartMPPlugin from "src/main";
import { PreviewRender } from "src/render/marked-extensions/extension";
import {
	uploadCanvas,
	uploadSVGs,
	uploadURLImage,
	uploadURLVideo,
	convertAssetsToDataURLs
} from "src/render/post-render";
import { serializeChildren, cleanHtmlForWechat, inlineCssWithJuice, stripUnsupportedCssFromHtml, stripCssVarReferences, filterWechatUnsupportedCssProps } from "src/utils/utils";
import { WechatRender } from "src/render/wechat-render";
import { ObsidianMarkdownRenderer } from "src/render/markdown-render";
import { ResourceManager } from "../assets/resource-manager";
import { WechatClient } from "../wechat-api/wechat-client";
import { MPArticleHeader } from "./mp-article-header";
import { ThemeManager } from "../theme/theme-manager";
import { ThemeSelector } from "../theme/theme-selector";
import { setSyncLineEffect } from "../render/scroll-sync-extension";
import { SmartMPWebViewModal } from "./webview";
import {
	SyncPrecisionController,
	SYNC_PRECISION_PRESETS,
	SyncPrecisionPreset
} from "../utils/scroll-sync-config";
import { LocalDraftItem, LocalDraftManager } from "../assets/draft-manager";
import { ArticleStats } from "../utils/article-stats";
import Logger from "src/utils/logger";

export const VIEW_TYPE_SMART_MP_PREVIEW = "smart-mp-article-preview";
export interface ElectronWindow extends Window {
	WEBVIEW_SERVER_URL: string;
}

/**
 * Apply WeChat-compatible inline styles and DOM fixes before CSS inlining.
 * Handles cases that juice or CssMerger cannot address:
 * 1. <img> width/height attributes → inline style (WeChat ignores bare attributes)
 * 2. Nested lists outside <li> (WeChat breaks nested lists inside <li>)
 * 3. Mermaid SVG <tspan> color fix (WeChat overrides stroke colors)
 * 4. AntV dominant-baseline → dy conversion (WeChat strips dominant-baseline)
 * 5. Residual CSS var() cleanup
 */
// 导出供测试复现导出管线使用（微信兼容预处理，processArticleForExport 的第一步）
export function applyWechatCompatStyles(root: HTMLElement): void {
	// 1. Convert img width/height attributes to inline styles
	root.querySelectorAll('img').forEach((img) => {
		const width = img.getAttribute('width');
		const height = img.getAttribute('height');
		if (width && /^\d+$/.test(width)) {
			img.removeAttribute('width');
			img.style.width = `${width}px`;
			// 微信官方 width 检测建议：标注原始像素宽，减少"居中不一致/宽度差异"误报
			img.setAttribute('data-w', width);
		}
		if (height && /^\d+$/.test(height)) {
			img.removeAttribute('height');
			img.style.height = `${height}px`;
		}
	});

	// 2. Fix nested lists: move li > ul/ol after the parent <li>
	root.querySelectorAll('li > ul, li > ol').forEach((nestedList) => {
		nestedList.parentElement?.insertAdjacentElement('afterend', nestedList);
	});

	// 3. Mermaid SVG tspan color fix — force text color visible in WeChat
	root.querySelectorAll('tspan').forEach((tspan) => {
		tspan.setAttribute('style', 'fill: #333333 !important; color: #333333 !important; stroke: none !important;');
	});

	// 4. AntV infographic: convert dominant-baseline to dy offset
	const baselineToDy: Record<string, string> = {
		'alphabetic': '',
		'central': '0.35em',
		'middle': '0.35em',
		'hanging': '-0.55em',
		'ideographic': '0.18em',
		'text-before-edge': '-0.85em',
		'text-after-edge': '0.15em',
	};
	root.querySelectorAll('text[dominant-baseline]').forEach((text) => {
		const baseline = text.getAttribute('dominant-baseline');
		if (baseline && baselineToDy[baseline] !== undefined) {
			text.removeAttribute('dominant-baseline');
			if (baselineToDy[baseline]) {
				text.setAttribute('dy', baselineToDy[baseline]);
			}
		}
	});

	// 5. Clean residual CSS var() references in inline styles
	// 共享实现位于 utils.stripCssVarReferences（juice 之后会再次调用，见 processArticleForExport）
	stripCssVarReferences(root);

	// 6. Ensure <code> elements have visible inline styles
	// Obsidian renders inline code with class-based styles (e.g., .inline-code) from global CSS.
	// juice cannot inline global CSS, so we add default inline styles to <code> without them.
	root.querySelectorAll('code').forEach((code) => {
		const style = code.getAttribute('style') || '';
		if (!style.includes('background-color')) {
			code.style.backgroundColor = '#f6f8fa';
		}
		if (!style.includes('color')) {
			code.style.color = '#24292e';
		}
		if (!style.includes('padding')) {
			code.style.padding = '.2em .4em';
		}
		if (!style.includes('border-radius')) {
			code.style.borderRadius = '4px';
		}
		if (!style.includes('font-family')) {
			code.style.fontFamily = 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace';
		}
		if (!style.includes('font-size')) {
			code.style.fontSize = '.85em';
		}
	});
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
	private plugin: SmartMPPlugin;
	private themeSelector: ThemeSelector;
	private debouncedRender = debounce(() => {
		if (this.plugin.settings.realTimeRender) {
			void this.renderDraft();
		}
	}, 200);
	private debouncedUpdate = debounce(() => {
		if (this.plugin.settings.realTimeRender) {
			void this.renderDraft();
		}
	}, 200);

	/**
	 * 根据文档大小自适应调整防抖延迟
	 * 大文档使用更长的延迟，减少渲染频率
	 */
	rebuildDebounce() {
		// 基础延迟
		const baseDelay = this.plugin.settings.realTimeRenderDelay || 200;
		// 自适应延迟：根据当前文档长度动态调整
		const adaptiveDelay = this.calculateAdaptiveDelay(baseDelay);

		this.debouncedRender = debounce(() => {
			if (this.plugin.settings.realTimeRender) {
				void this.renderDraft();
			}
		}, adaptiveDelay);
		this.debouncedUpdate = debounce(() => {
			if (this.plugin.settings.realTimeRender) {
				void this.renderDraft();
			}
		}, adaptiveDelay);
	}

	/**
	 * 计算自适应渲染延迟
	 * 小文档 (< 5KB): 基础延迟
	 * 中等文档 (5KB - 20KB): 基础延迟 * 2
	 * 大文档 (> 20KB): 基础延迟 * 3
	 */
	private calculateAdaptiveDelay(baseDelay: number): number {
		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView) return baseDelay;

		const content = mdView.editor.getValue();
		const contentLength = content.length;

		if (contentLength < 5000) {
			return baseDelay; // 小文档：快速响应
		} else if (contentLength < 20000) {
			return baseDelay * 2; // 中等文档：平衡响应
		} else {
			return Math.min(baseDelay * 3, 1000); // 大文档：最大 1000ms
		}
	}

	private debouncedCustomThemeChange = debounce((theme: string) => {
		void this.applyCustomThemeChange(theme);
	}, 2000);

	private draftHeader: MPArticleHeader;
	private isHeaderHidden: boolean = true;
	private lastRenderedContent: string = "";
	private lastRenderTaskId: number = 0;
	articleProperties: Map<string, string> = new Map();
	editorView: EditorView | null = null;
	lastLeaf: WorkspaceLeaf | undefined;
	renderDiv!: HTMLElement;
	elementMap: Map<string, HTMLElement | string> = new Map();
	containerDiv: HTMLElement;
	mpModal: SmartMPWebViewModal;
	isActive: boolean = false;
	isMobileView: boolean = false;
	renderPreviewer!: HTMLElement;
	private editorScrollListener: ((event: Event) => void) | null = null;
	/** 当前绑定滚动监听的编辑器 scrollDOM（移除时必须用同一元素引用） */
	private boundEditorScrollDom: HTMLElement | null = null;
	/** messageService 监听器的注销函数，视图关闭时清理，防止旧实例继续响应消息 */
	private messageDisposers: (() => void)[] = [];
	public scrollSyncButton: ExtraButtonComponent | null = null;
	private articleStats: HTMLElement;
	private currentArticleStats = { totalWords: 0, readingTime: 0 };

	// Scroll sync properties
	private scrollRAF: number | null = null;
	private precisionController: SyncPrecisionController;
	private lastHighlightedEl: HTMLElement | null = null;

	// Cached scroll anchors for performance optimization
	private cachedAnchors: Array<{ line: number; top: number }> = [];
	private anchorsCacheValid: boolean = false;
	private resizeObserver: ResizeObserver | null = null;

	getViewType(): string {
		return VIEW_TYPE_SMART_MP_PREVIEW;
	}
	getDisplayText(): string {
		return $t("views.previewer.smart-mp-previewer");
	}
	getIcon() {
		return "smart-mp-logo";
	}
	constructor(leaf: WorkspaceLeaf, plugin: SmartMPPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.wechatClient = WechatClient.getInstance(this.plugin);
		this.themeSelector = new ThemeSelector(plugin);
		this.rebuildDebounce();
		// 初始化同步精度控制器
		this.precisionController = SyncPrecisionController.fromPreset(
			(this.plugin.settings.scrollSyncPrecision as SyncPrecisionPreset) || 'balanced'
		);
	}

	toggleMobileView(button: ExtraButtonComponent) {
		this.isMobileView = !this.isMobileView;
		if (this.isMobileView) {
			this.renderDiv.addClass("is-mobile-view");
			button.setTooltip($t("scroll-sync.switch-to-desktop"));
			button.setIcon("monitor");
		} else {
			this.renderDiv.removeClass("is-mobile-view");
			button.setTooltip($t("scroll-sync.switch-to-mobile"));
			button.setIcon("tablet-smartphone");
		}
	}

	toggleScrollSync(button: ExtraButtonComponent) {
		this.plugin.settings.scrollSync = !this.plugin.settings.scrollSync;
		this.refreshScrollSyncButton();
		new Notice(this.plugin.settings.scrollSync ? $t("scroll-sync.enabled") : $t("scroll-sync.disabled"));
		void this.plugin.saveSettings();
	}

	private async applyCustomThemeChange(theme: string) {
		this.getArticleProperties();
		this.articleProperties.set("custom_theme", theme);
		await this.setArticleProperties();
		// Fast refresh: only update theme styles, no full re-render
		await this.refreshTheme();
	}

	// Refresh theme without re-rendering the entire preview
	private async refreshTheme() {
		const root = this.articleDiv.firstElementChild as HTMLElement | null;
		if (root) {
			await ThemeManager.getInstance(this.plugin).applyTheme(root);
			// [微信兼容预览] 主题热切换后同样过滤，保持与渲染路径一致
			this.applyWeChatCompatPreview(root);
		}
	}

	/**
	 * [新增] 微信兼容预览：在预览 DOM 上直接过滤微信不支持的 CSS 属性。
	 * 让预览显示"微信会保留的子集"而非"浏览器能渲染的全部"，
	 * 消除"预览正常、发出去排版散掉"的断层（与导出管线
	 * stripUnsupportedCssFromHtml 使用同一过滤逻辑 filterWechatUnsupportedCssProps）。
	 */
	private applyWeChatCompatPreview(root: HTMLElement): void {
		if (this.plugin.settings.wechatCompatPreview === false) return;
		let stripped = 0;
		const process = (el: HTMLElement) => {
			const style = el.getAttribute('style');
			if (!style) return;
			const filtered = filterWechatUnsupportedCssProps(style);
			if (filtered !== style) stripped++;
			if (filtered) el.setAttribute('style', filtered);
			else el.removeAttribute('style');
		};
		process(root);
		root.querySelectorAll<HTMLElement>('[style]').forEach(process);
		if (stripped > 0) {
			Logger.debug("Previewer", `[微信兼容预览] 剥离了 ${stripped} 个元素上微信不支持的样式属性`);
		}
	}

	onOpen(): Promise<void> {
		this.buildUI();
		this.startListen();

		this.themeSelector.startWatchThemes();
		this.messageDisposers.push(
			this.plugin.messageService.registerListener(
				"custom-theme-changed",
				(theme: string) => {
					// Instant theme preview - no debounce for immediate feedback
					if (!this.isViewActive()) return; // 已关闭/隐藏的旧实例不得写当前文件
					void this.applyCustomThemeChange(theme);
				}
			)
		);
		this.messageDisposers.push(
			this.plugin.messageService.registerListener(
				"theme-reloaded",
				() => {
					Logger.debug("Previewer", "Hot reload triggered");
					void this.renderDraft();
				}
			)
		);
		this.plugin.messageService.sendMessage("active-file-changed", null);
		void this.loadComponents();
		// Force initial render
		setTimeout(() => {
			void this.renderDraft();
		}, 500);
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
			cls: "smart-mp-previewer-container",
		});

		// Compact Toolbar Container
		const toolbar = mainDiv.createDiv({ cls: "smart-mp-previewer-toolbar" });

		// Theme Selector (Dropdown)
		const themeSetting = new Setting(toolbar)
			.addDropdown((dropdown: DropdownComponent) => {
				void this.themeSelector.dropdown(dropdown);
			})
			.setClass("smart-mp-toolbar-item");

		// Utility Buttons
		toolbar.createDiv({ cls: "smart-mp-toolbar-spacer" });

		const buttonsDiv = toolbar.createDiv({ cls: "smart-mp-toolbar-buttons" });

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
						void this.copyArticleToClipboard();
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
			.addExtraButton((button) => {
				// 字数统计开关按钮
				const updateIcon = () => {
					const isOn = this.plugin.settings.embedArticleStats;
					button.setIcon(isOn ? "file-text" : "file-x");
					button.setTooltip(isOn ? "字数统计: 开启" : "字数统计: 关闭");
				};
				updateIcon();
				button.onClick(() => {
					this.plugin.settings.embedArticleStats = !this.plugin.settings.embedArticleStats;
					updateIcon();
					void this.plugin.saveSettings();
					void this.renderDraft();
				});
			})
			.addExtraButton((button) => {
				// 文章标题区域显示/隐藏开关
				const updateHeaderToggle = () => {
					button.setIcon(this.isHeaderHidden ? "eye-off" : "eye");
					button.setTooltip(this.isHeaderHidden ? "显示文章标题" : "隐藏文章标题");
				};
				updateHeaderToggle();
				button.onClick(() => {
					this.isHeaderHidden = !this.isHeaderHidden;
					if (this.draftHeader) {
						const headerEl = this.draftHeader.getContainerEl?.();
						if (headerEl) {
							headerEl.toggleClass("smart-mp-header-hidden", this.isHeaderHidden);
						}
					}
					updateHeaderToggle();
				});
			})

		this.renderDiv = mainDiv.createDiv({ cls: "smart-mp-preview-container" });
		this.renderDiv.id = "render-div";

		this.draftHeader = new MPArticleHeader(this.plugin, this.renderDiv);

		// 默认隐藏文章标题区域
		if (this.isHeaderHidden) {
			const headerEl = this.draftHeader.getContainerEl?.();
			if (headerEl) {
				headerEl.addClass("smart-mp-header-hidden");
			}
		}

		this.renderPreviewer = this.renderDiv.createDiv({
			cls: "render-previewer",
		});
		// 使用常规 DOM 容器，避免 Shadow DOM 带来的额外开销
		this.containerDiv = this.renderPreviewer.createDiv({ cls: "smart-mp-article" });
		this.articleDiv = this.containerDiv.createDiv({ cls: "article-div" });
	}

	async processArticleForExport(progressNotice?: Notice, uploadImages: boolean = true): Promise<{ html: string; text: string } | null> {
		if (progressNotice) progressNotice.setMessage("正在准备文章内容...");
		const finalArticleEl = this.articleDiv.cloneNode(true) as HTMLElement;

		applyWechatCompatStyles(finalArticleEl);

		// [Fix] Removed duplicate ThemeManager.applyTheme() here.
		// The preview DOM (articleDiv) already has theme styles applied during rendering.
		// Cloning already preserves those inline styles, so re-applying causes:
		// 1. Redundant computation  2. data-original-style mismatch on cloned nodes
		// 3. Potential style duplication if SmartMPThemeKey is lost in clone

		if (uploadImages) {
			if (progressNotice) progressNotice.setMessage("正在上传/处理图片 (这可能需要一点时间)...");
			try {
				await uploadSVGs(finalArticleEl, this.plugin.wechatClient);
				await uploadCanvas(finalArticleEl, this.plugin.wechatClient);
				await uploadURLImage(finalArticleEl, this.plugin.wechatClient);
				await uploadURLVideo(finalArticleEl, this.plugin.wechatClient);
			} catch (e) {
				Logger.error("Previewer", "Error processing media:", e);
				new Notice($t("notice.previewer.media-processing-failed") ?? "图片/媒体处理失败，部分图片可能无法显示");
			}
		} else {
			if (progressNotice) progressNotice.setMessage("正在转换图片为 Base64 (这可能需要一点时间)...");
			try {
				await convertAssetsToDataURLs(finalArticleEl, (current, total) => {
					if (progressNotice) {
						progressNotice.setMessage(`正在转换图片为 Base64 (${current}/${total})...`);
					}
				});
			} catch (e) {
				Logger.error("Previewer", "Error converting images to Base64:", e);
				new Notice($t("notice.previewer.image-processing-failed") ?? "图片处理失败，部分图片可能无法显示");
			}
		}

		if (progressNotice) progressNotice.setMessage("正在内联 CSS 样式...");
		await inlineCssWithJuice(finalArticleEl);

		// [微信结构检测] juice 以 resolveCSSVariables:false 内联 <style> 标签规则，
		// 会把未解析的 var() 重新写回 inline style（如 line-height: var(--x)），
		// 微信无法解析会触发"继承的 line-height: 0"兜底检测，必须再次清理
		stripCssVarReferences(finalArticleEl);

		if (progressNotice) progressNotice.setMessage("正在优化 HTML 结构...");
		const cleanedArticleEl = cleanHtmlForWechat(finalArticleEl);


		const html = serializeChildren(cleanedArticleEl);
		const text = cleanedArticleEl.textContent || '';

		// [Fix 45166] 字符串级终极 CSS 过滤——确保所有不支持的属性被移除
		const finalHtml = stripUnsupportedCssFromHtml(html);

		// 开发环境验证：检查是否仍有不支持的 CSS 模式
		Logger.debug("Previewer", `Before strip: ${html.length} chars, After strip: ${finalHtml.length} chars`);

		// 快速检查关键问题模式（仅在有差异时输出详细日志）
		const criticalPatterns: [string, RegExp][] = [
			['display:flex', /display:\s*flex/gi],
			['display:grid', /display:\s*grid/gi],
			['<table>', /<table/gi],
			['!important', /!important/gi],
		];
		for (const [name, pattern] of criticalPatterns) {
			const matches = finalHtml.match(pattern);
			if (matches && matches.length > 0) {
				Logger.warn("Previewer", `Unsupported pattern "${name}" found (${matches.length}x) in final HTML — may cause 45166`);
			}
		}

		if (!finalHtml || finalHtml.trim().length === 0) {
			new Notice($t("notice.previewer.content-empty") ?? '生成的内容为空，无法发送至草稿箱。请检查文章内容。', 5000);
			return null;
		}
		return { html: finalHtml, text };
	}

	async checkCoverImage() {
		return this.draftHeader.checkCoverImage();
	}

	/** [新增] 复制文章到剪贴板（富文本，预览按钮与命令共用） */
	async copyArticleToClipboard(): Promise<void> {
		const notice = new Notice($t("notice.previewer.preparing-clipboard") ?? "正在准备剪贴板内容...", 0);
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
			notice.hide(); // ✅ Hide the progress notice on success
			new Notice(
				$t("views.previewer.article-copied-to-clipboard")
			);
		} catch (error) {
			notice.hide();
			Logger.error("Previewer", "复制到剪贴板失败:", error);
			new Notice(`复制失败: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/** [新增] 导出文章为独立 HTML 文件（复用剪贴板管线，图片 base64 内嵌） */
	async exportHtml(): Promise<void> {
		const notice = new Notice($t("notice.previewer.preparing-export") ?? "正在准备导出内容...", 0);
		try {
			const result = await this.processArticleForExport(notice, false);
			if (!result) return;

			const title = this.draftHeader?.getActiveLocalDraft()?.title
				|| this.plugin.app.workspace.getActiveFile()?.basename
				|| "article";
			const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_");
			const doc = [
				'<!DOCTYPE html>',
				'<html lang="zh-CN">',
				'<head>',
				'<meta charset="UTF-8">',
				'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
				`<title>${safeTitle}</title>`,
				'</head>',
				'<body style="max-width:768px;margin:0 auto;padding:16px;">',
				result.html,
				'</body>',
				'</html>',
			].join("\n");

			const suggestedName = `${safeTitle}.html`;
			try {
				// 优先系统保存对话框（桌面端 Chromium 支持）
				const handle = await (window as any).showSaveFilePicker({
					suggestedName,
					types: [{ description: "HTML", accept: { "text/html": [".html"] } }],
				});
				const writable = await handle.createWritable();
				await writable.write(doc);
				await writable.close();
				new Notice($t("notice.previewer.exported") ?? "导出成功", 3000);
			} catch (e) {
				if ((e as any)?.name === "AbortError") return; // 用户取消
				// 回退：写入 vault 根目录
				let path = suggestedName;
				if (await this.plugin.app.vault.adapter.exists(path)) {
					path = `${safeTitle}-${Date.now()}.html`;
				}
				await this.plugin.app.vault.adapter.write(path, doc);
				new Notice(($t("notice.previewer.exported-to-vault") ?? "已导出到仓库根目录") + `: ${path}`, 5000);
			}
		} catch (error) {
			Logger.error("Previewer", "导出失败:", error);
			new Notice(`导出失败: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			notice.hide();
		}
	}

	async sendArticleToDraftBox() {
		const notice = new Notice($t("notice.previewer.processing-article") ?? "开始处理文章...", 0);
		try {
			const result = await this.processArticleForExport(notice);
			if (!result) {
				return;
			}

			// [接线] 内容超限检测：微信图文正文约 2 万字符/1MB 上限，
			// 超限发送必然失败，提前拦截并给出分篇/复制建议
			const htmlSize = ArticleStats.estimateSize(result.html);
			const charCount = (result.text || "").length;
			if (htmlSize > ArticleStats.MAX_SIZE || charCount > 20000) {
				new Notice(
					$t("notice.previewer.content-over-limit", [String(Math.round(htmlSize / 1024)), String(charCount)])
						?? `文章超出微信限制（${Math.round(htmlSize / 1024)}KB / ${charCount} 字符，上限约 400KB / 20000 字符）。请拆分文章或使用「一键复制」。`,
					8000
				);
				return;
			}

			notice.setMessage("正在发送到草稿箱...");

			const activeDraft = this.draftHeader.getActiveLocalDraft();
			if (!activeDraft) {
				new Notice($t("notice.previewer.cannot-get-draft-info") ?? '无法获取当前草稿信息', 5000);
				return;
			}

			// [新增] 草稿更新闭环：本文章曾发送过（last_draft_id 存在）时，
			// 询问是更新原草稿还是新建，避免每次改稿在草稿箱堆积重复项
			let updateMediaId: string | undefined;
			if (activeDraft.last_draft_id) {
				updateMediaId = await this.plugin.confirm(
					$t("notice.previewer.update-draft-confirm") ?? "本文已有历史草稿。确定 = 更新该草稿；取消 = 新建草稿"
				) ? activeDraft.last_draft_id : undefined;
			}

			const coverRetry = async () => {
				// 当 thumb_media_id 失效时，重新上传封面图
				if (activeDraft.cover_image_url) {
					return await this.draftHeader.reuploadCoverImage(activeDraft);
				}
				return undefined;
			};

			let media_id: string | false | undefined;
			if (updateMediaId) {
				media_id = await this.wechatClient.updateDraft(updateMediaId, activeDraft, result.html, coverRetry);
			} else {
				media_id = await this.wechatClient.sendArticleToDraftBox(activeDraft, result.html, coverRetry);
			}

			if (!media_id) {
				new Notice($t("notice.previewer.send-draft-failed") ?? '发送草稿失败，请检查控制台错误日志', 5000);
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
				new Notice($t("notice.previewer.send-draft-success") ?? "发送到草稿箱成功！", 3000);
			}
		} catch (error) {
			Logger.error("Previewer", "发送失败:", error);
			new Notice(`发送发生异常: ${error}`, 5000);
		} finally {
			notice.hide();
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

	// REPAIRED: parseActiveMarkdown returning Promise<HTMLElement | null>
	async parseActiveMarkdown(taskId: number): Promise<HTMLElement | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			Logger.warn("Previewer", `[Task #${taskId}] parseActiveMarkdown failed: No active file.`);
			return null;
		}
		if (activeFile.extension !== "md") {
			Logger.warn("Previewer", `[Task #${taskId}] parseActiveMarkdown failed: Not a markdown file (${activeFile.extension})`);
			return null;
		}

		// Optimize: Get content from Editor directly (memory)
		let content = "";
		const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (mdView && mdView.file?.path === activeFile.path) {
			content = mdView.editor.getValue();
			Logger.info("Previewer", `[Task #${taskId}] Content read from Editor (${content.length} chars)`);
		} else {
			content = await this.plugin.app.vault.adapter.read(activeFile.path);
			Logger.info("Previewer", `[Task #${taskId}] Content read from Adapter (${content.length} chars)`);
		}

		if (content === this.lastRenderedContent && content !== "") {
			Logger.info("Previewer", `[Task #${taskId}] Render skipped: Content identical to last render.`);
			return null;
		}

		// NOTE: 竞态修复 - 不在此处更新 lastRenderedContent
		// 改为在 renderDraft 成功挂载 DOM 后再更新
		const contentToRender = content;
		this.elementMap = new Map<string, HTMLElement | string>();

		if (taskId !== this.lastRenderTaskId) {
			Logger.info("Previewer", `[Task #${taskId}] Render cancelled before wechatRender: Newer task detected.`);
			return null;
		}

		const wechatRender = WechatRender.getInstance(this.plugin);
		wechatRender.setPreviewRender(this);
		const renderedDom = await wechatRender.parseNote(
			activeFile.path,
			this.articleDiv,
			this,
			content
		);

		const articleSection = createEl("section", {
			cls: "smart-mp-article-content smart-mp",
		});
		articleSection.appendChild(renderedDom);
		// 将渲染的内容附加到 section，并返回包含内容字符串的对象
		(articleSection as any)._renderedContent = contentToRender;

		this.elementMap.clear();
		return articleSection;
	}

	async renderDraft() {
		if (!this.isViewActive()) {
			return;
		}

		const startTime = performance.now();
		// 1. Generation a new Task ID to track this specific render request
		const taskId = ++this.lastRenderTaskId;
		
		// 增加诊断信息：显示正在进行的任务 ID
		Logger.info("Previewer", `[Task #${taskId}] Starting render...`);

		try {
			const articleSection = await this.parseActiveMarkdown(taskId);

			// 2. Final Validation: If a newer task has already started/finished, abort this one
			if (taskId !== this.lastRenderTaskId) {
				Logger.info("Previewer", `[Task #${taskId}] Cancelled: Newer task #${this.lastRenderTaskId} in progress.`);
				return;
			}

			if (!articleSection) {
				Logger.warn("Previewer", `[Task #${taskId}] Aborted: parseActiveMarkdown returned null.`);
				return;
			}

			// 重新计算统计信息
			this.currentArticleStats = this.calculateStats(articleSection.textContent || "");

			// Apply layout enhancements (Off-screen)
			this.applyLayoutEnhancements(articleSection);

			// Apply Theme (Off-screen) - Sync/Await to prevent flicker
			try {
				await ThemeManager.getInstance(this.plugin).applyTheme(articleSection);
			} catch (themeError) {
				Logger.error("Previewer", `[Task #${taskId}] Theme apply failed (falling back):`, themeError);
			}

			// [微信兼容预览] 主题内联样式写入后、挂载前过滤微信不支持的 CSS（离屏无闪烁）
			this.applyWeChatCompatPreview(articleSection);

			// Update preview stats logic 
			this.updateArticleStats();

			// Finally: Swap DOM
			if (taskId !== this.lastRenderTaskId) return;

			this.articleDiv.empty();
			this.articleDiv.appendChild(articleSection);
			
			// 重置滚动位置到顶部
			this.renderDiv.scrollTop = 0;

			// 竞态修复：只有成功挂载后才更新 lastRenderedContent
			if ((articleSection as any)._renderedContent) {
				this.lastRenderedContent = (articleSection as any)._renderedContent;
			}

			// 渲染完成后设置滚动同步
			this.setupScrollSync();

			// 刷新滚动锚点缓存（性能优化：避免滚动时 Layout Thrashing）
			this.refreshScrollAnchors();
			
			const endTime = performance.now();
			Logger.info("Previewer", `[Task #${taskId}] Render finished in ${(endTime - startTime).toFixed(2)}ms`);

		} catch (error) {
			if (taskId !== this.lastRenderTaskId) return;
			
			Logger.error("Previewer", `[Task #${taskId}] Critical error:`, error);
			
			this.articleDiv.empty();
			const errorDiv = this.articleDiv.createDiv({ cls: 'smart-mp-render-error-container' });
			errorDiv.createEl('h3', { text: `⚠ 任务 #${taskId} 渲染失败`, cls: 'smart-mp-error-title' });
			errorDiv.createEl('pre', { 
				text: error instanceof Error ? `${error.message}\n${error.stack}` : String(error),
				cls: 'smart-mp-error-stack'
			});
			errorDiv.createEl('details', { text: '点击查看详细路径诊断' }).createEl('pre', {
				text: JSON.stringify({
					activeFile: this.app.workspace.getActiveFile()?.path,
					view: this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path,
					task: taskId,
					build: "2026-03-26 18:58"
				}, null, 2)
			});
		}
	}

	// Apply layout enhancements based on settings
	applyLayoutEnhancements(element: HTMLElement) {
		// First-line indent
		if (this.plugin.settings.firstLineIndent) {
			this.containerDiv.addClass("smart-mp-indent-enabled");
		} else {
			this.containerDiv.removeClass("smart-mp-indent-enabled");
		}

		// Code Theme Class
		const codeTheme = this.plugin.settings.codeTheme || "github";
		element.removeClass("smart-mp-theme-github", "smart-mp-theme-monokai", "smart-mp-theme-atom-one-dark", "smart-mp-theme-vs2015", "smart-mp-theme-default");
		element.addClass(`smart-mp-theme-${codeTheme}`);

		// Font Size
		const fontSize = this.plugin.settings.fontSize || "15px";
		this.containerDiv.style.setProperty("--smart-mp-font-size", fontSize);
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
		// if (this.plugin.settings.linkFootnotes) {
		// 	this.convertLinksToFootnotes(element);
		// }
	}

	// Process Horizontal Rules
	processHR(element: HTMLElement) {
		const hrStyle = this.plugin.settings.hrStyle || "dots";
		if (hrStyle === 'none') {
			element.querySelectorAll('hr').forEach(hr => hr.classList.add('smart-mp-hidden'));
			return;
		}

		// Determine content and class
		let content = "";
		let styleClass = "";

		if (hrStyle === "dots") {
			styleClass = "smart-mp-hr-dots";
			content = ""; // CSS handles the visual with ::before, span, ::after
		} else if (hrStyle === "lines") {
			styleClass = "smart-mp-hr-lines";
			content = ""; // CSS handles the visual
		} else if (hrStyle === "stars") {
			styleClass = "smart-mp-hr-stars";
			content = "✦"; // Middle star content
		} else if (hrStyle === "custom") {
			styleClass = "smart-mp-hr-custom";
			content = this.plugin.settings.customHrText || "· · ·";
		} else {
			// native or fallback
			content = "· · ·";
		}

		const hrs = element.querySelectorAll("hr");
		hrs.forEach((hr) => {
			const div = document.createElement("div");
			div.className = "smart-mp-hr-replacement" + (styleClass ? " " + styleClass : "");

			// For styles that use ::before, span, ::after, create span element
			if (hrStyle === "dots" || hrStyle === "lines" || hrStyle === "stars") {
				div.innerHTML = `<span>${content}</span>`;
			} else {
				div.textContent = content;
			}

			hr.replaceWith(div);
		});
	}

	// Refresh HR style without re-rendering the entire preview
	refreshHRStyle() {
		const hrStyle = this.plugin.settings.hrStyle || "dots";
		const articleEl = this.articleDiv;

		if (!articleEl) return;

		// Find all existing HR replacement elements
		const replacements = articleEl.querySelectorAll('.smart-mp-hr-replacement');

		if (replacements.length === 0) {
			Logger.debug("Previewer", "No HR replacements found");
			return;
		}

		// Handle 'none' style - hide all replacements
		if (hrStyle === 'none') {
			replacements.forEach(el => el.remove());
			return;
		}

		// Determine content and class
		let content = "";
		let styleClass = "";

		if (hrStyle === "dots") {
			styleClass = "smart-mp-hr-dots";
			content = ""; // CSS handles the visual with ::before, span, ::after
		} else if (hrStyle === "lines") {
			styleClass = "smart-mp-hr-lines";
			content = ""; // CSS handles the visual
		} else if (hrStyle === "stars") {
			styleClass = "smart-mp-hr-stars";
			content = "✦"; // Middle star content
		} else if (hrStyle === "custom") {
			styleClass = "smart-mp-hr-custom";
			content = this.plugin.settings.customHrText || "· · ·";
		} else if (hrStyle === "native") {
			// Native style - remove all style classes
			styleClass = "";
			content = "· · ·";
		} else {
			// Fallback
			content = "· · ·";
		}

		// Update all replacements
		replacements.forEach((replacement) => {
			// Update class
			replacement.className = "smart-mp-hr-replacement" + (styleClass ? " " + styleClass : "");

			// Update content
			if (hrStyle === "dots" || hrStyle === "lines" || hrStyle === "stars") {
				replacement.innerHTML = `<span>${content}</span>`;
			} else {
				replacement.textContent = content;
			}
		});

		Logger.debug("Previewer", `Updated ${replacements.length} HR elements to style: ${hrStyle}`);
	}
	// Wrap tables in a scrollable container
	wrapTables(element: HTMLElement) {
		const tables = element.querySelectorAll("table");
		tables.forEach((table) => {
			if (table.parentElement?.classList.contains("smart-mp-table-container")) {
				return;
			}
			const wrapper = document.createElement("div");
			wrapper.className = "smart-mp-table-container";
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
				img.nextElementSibling.classList.contains("smart-mp-caption")
			) {
				return;
			}

			const caption = document.createElement("span");
			caption.className = "smart-mp-caption";
			caption.textContent = altText;

			img.parentNode?.insertBefore(caption, img.nextSibling);
		});
	}

	// Embed word count and reading time at the beginning of article
	embedArticleStatsInContent(element: HTMLElement) {
		const existingStats = element.querySelector(".smart-mp-embedded-stats");
		if (existingStats) {
			existingStats.remove();
		}

		const { totalWords, readingTime } = this.currentArticleStats;

		const statsDiv = document.createElement("section");
		statsDiv.className = "smart-mp-embedded-stats";

		// 检测当前主题并应用对应样式
		const currentTheme = this.plugin.settings.custom_theme || "";
		if (currentTheme.includes("互为螺旋·金") || currentTheme.includes("互为螺旋")) {
			// 金色主题样式
			statsDiv.style.cssText = `
				text-align: center;
				font-size: 13px;
				color: #b08d55;
				padding: 12px 20px;
				margin: 0 0 24px 0;
				background: linear-gradient(135deg, rgba(252, 244, 218, 0.6) 0%, rgba(255, 251, 240, 0.8) 100%);
				border-radius: 8px;
				border: 1px solid rgba(212, 175, 55, 0.3);
				box-shadow: 0 2px 8px rgba(176, 141, 85, 0.08);
				letter-spacing: 1px;
			`;
		}

		const p = statsDiv.createEl("p", {
			text: `📖 ` + $t("views.previewer.article-stats", [String(totalWords), String(readingTime)])
		});

		// 继承父元素颜色
		if (currentTheme.includes("互为螺旋·金") || currentTheme.includes("互为螺旋")) {
			p.style.cssText = "margin: 0; color: #b08d55;";
		}

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
			footnoteRef.className = "smart-mp-footnote-ref";
			footnoteRef.textContent = `[${index}]`;
			anchor.after(footnoteRef);

			footnotes.push({ text, url: href });
			index++;
		});

		if (footnotes.length > 0) {
			const footnotesSection = document.createElement("section");
			footnotesSection.className = "smart-mp-footnotes";

			const title = document.createElement("p");
			title.className = "smart-mp-footnotes-title";
			title.textContent = "🔗 参考链接";
			footnotesSection.appendChild(title);

			footnotes.forEach((fn, i) => {
				const item = document.createElement("p");
				item.className = "smart-mp-footnote-item";

				item.createSpan({ text: `[${i + 1}] ` });
				item.createSpan({ text: fn.text });
				item.createSpan({ text: ": " });

				const url = fn.url;
				let isSafe = false;

				try {
					// 允许协议相对路径 (//example.com)
					if (url.startsWith('//')) {
						isSafe = true;
					} else {
						// 尝试解析 URL
						const urlObj = new URL(url);
						// 获取协议并移除冒号
						const protocol = urlObj.protocol.slice(0, -1).toLowerCase();
						// 允许的安全协议列表
						const ALLOWED_PROTOCOLS = ['http', 'https', 'mailto', 'obsidian'];
						if (ALLOWED_PROTOCOLS.includes(protocol)) {
							isSafe = true;
						}
					}
				} catch (e) {
					// 如果 new URL() 抛错，说明可能不是标准 URL（由于前面也没匹配 //，这里视为不安全或未知）
					// 为安全起见默认视为不安全，不生成链接
					isSafe = false;
				}

				if (isSafe) {
					const link = item.createEl("a", {
						href: url,
						text: url
					});
					link.setAttr("target", "_blank");
					link.setAttr("rel", "noopener noreferrer");
				} else {
					item.createSpan({ text: url });
				}

				footnotesSection.appendChild(item);
			});

			element.appendChild(footnotesSection);
		}
	}

	updateArticleStats() {
		if (!this.articleStats) return;

		if (this.plugin.settings.showArticleStats === false) {
			this.articleStats.addClass('smart-mp-hidden');
			return;
		} else {
			this.articleStats.removeClass('smart-mp-hidden');
		}

		const { totalWords, readingTime } = this.currentArticleStats;
		this.articleStats.setText(
			$t("views.previewer.article-stats", [
				String(totalWords),
				String(readingTime),
			])
		);
	}
	isViewActive(): boolean {
		// Check if visible in DOM
		return this.containerEl.offsetParent !== null;
	}

	startListen() {
		this.registerEvent(
			this.plugin.app.vault.on("rename", (file: TFile) => {
				this.draftHeader.onNoteRename(file);
			})
		);
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				const isOpen = this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_MP_PREVIEW).length > 0;
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
					this.setupScrollSync();
				} else {

					this.isActive = leaf.view.getViewType() === VIEW_TYPE_SMART_MP_PREVIEW
				}

			}
		});
		this.listeners.push(el);

		this.setupScrollSync();

		this.messageDisposers.push(
			this.plugin.messageService.registerListener("render-active-note", () => {
				void this.renderDraft();
			})
		);
	}


	onEditorChange(editor: Editor, info: MarkdownView) {
		void this.debouncedRender();
	}
	updateElementByID(id: string, html: string): void {
		const item = this.articleDiv.querySelector<HTMLElement>("#" + id);
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
				Logger.error("Previewer", `Error calling onload()`, error);
			}
		};
		await loadChildren(this as unknown as InternalComponent);
	}

	// ============== Scroll Sync Methods ==============

	/**
	 * 设置双向滚动同步监听器
	 */
	private isSyncing: boolean = false;
	setupScrollSync() {
		const mdView = this.getMarkdownView();
		const editor = mdView?.editor;
		if (!editor) return;

		// 访问 CodeMirror 6 内部 DOM 的类型定义
		interface CM6Editor extends Editor {
			cm?: {
				scrollDOM: HTMLElement;
			};
		}
		const editorScrollDom = (editor as CM6Editor).cm?.scrollDOM;
		const previewScrollDom = this.renderDiv;

		if (!editorScrollDom || !previewScrollDom) return;

		// 更新精度控制器配置
		const preset = (this.plugin.settings.scrollSyncPrecision as SyncPrecisionPreset) || 'balanced';
		this.precisionController = SyncPrecisionController.fromPreset(preset);

		// 1. 移除旧监听器（用绑定时记录的 DOM 引用）
		this.stopScrollListeners();

		// 2. 设置 ResizeObserver 监听窗口变化（性能优化）
		this.setupResizeObserver();

		const lockTimeout = this.precisionController.getLockTimeout();

		// 3. 编辑器 -> 预览 (带插值和阈值判断)
		this.editorScrollListener = () => {
			if (!this.plugin.settings.scrollSync || this.isSyncing) return;

			// 使用阈值判断是否触发同步
			const currentScrollTop = editorScrollDom.scrollTop;
			if (!this.precisionController.shouldTriggerSync(currentScrollTop)) return;

			if (this.scrollRAF) cancelAnimationFrame(this.scrollRAF);

			this.scrollRAF = requestAnimationFrame(() => {
				this.isSyncing = true;
				this.precisionController.updateLastScrollTop(currentScrollTop);
				this.syncEditorToPreview(editorScrollDom, editor);
				setTimeout(() => { this.isSyncing = false; }, lockTimeout);
			});
		};

		editorScrollDom.addEventListener("scroll", this.editorScrollListener);
		// [Fix] 记录实际绑定的 DOM 引用：移除监听必须用同一元素。
		// 此前 stopScrollListeners 用的是（新）传入的 DOM，切换 markdown
		// leaf 后旧编辑器上的监听器永久残留，形成幽灵同步
		this.boundEditorScrollDom = editorScrollDom;
	}

	private stopScrollListeners() {
		// [Fix] 始终从绑定时记录的 DOM 上移除
		if (this.editorScrollListener && this.boundEditorScrollDom) {
			this.boundEditorScrollDom.removeEventListener("scroll", this.editorScrollListener);
		}
		this.boundEditorScrollDom = null;
		// 清理预览侧高亮
		if (this.lastHighlightedEl) {
			this.lastHighlightedEl.classList.remove('smart-mp-sync-line-highlight');
			this.lastHighlightedEl = null;
		}
	}

	/**
	 * 同步：编辑器 -> 预览 (单向同步)
	 *
	 * 双模式支持：
	 *
	 * 🎯 精确锚点模式 (默认)：
	 * - 通过 data-source-line 锚点建立行号 <-> 物理位置映射
	 * - 在相邻锚点之间线性插值，适应非均匀高度分布
	 * - 精度 ~5px，适合文字为主的文档
	 *
	 * 🌊 平滑比例模式：
	 * - 按滚动条百分比直接映射 (借鉴 doocs/md)
	 * - 匀速连贯，无跳动感
	 * - 适合图片密集、高度分布极不均匀的文档
	 *
	 * 共同特性：
	 * - Properties 区锁定：首个内容前保持顶部
	 * - 预览侧高亮：视觉对齐反馈
	 */
	private syncEditorToPreview(scrollDom: HTMLElement, editor: any) {
		const previewEl = this.renderDiv;
		const cmView = editor.cm;
		const doc = cmView.state.doc;

		// 模式切换：平滑比例 (Proportional) vs 精确锚点 (Precise)
		const syncMode = this.plugin.settings.scrollSyncMode || 'precise';

		if (syncMode === 'proportional') {
			const sourceMax = scrollDom.scrollHeight - scrollDom.clientHeight;
			if (sourceMax <= 0) return;

			const percentage = scrollDom.scrollTop / sourceMax;
			const targetMax = previewEl.scrollHeight - previewEl.clientHeight;
			const targetScrollTop = percentage * targetMax;

			try {
				const lineBlock = cmView.lineBlockAtHeight(scrollDom.scrollTop);
				const topLine = doc.lineAt(lineBlock.from).number;
				this.updatePreviewHighlight(topLine);
				cmView.dispatch({ effects: setSyncLineEffect.of(topLine) });
			} catch(e) {}

			this.smoothScroll(previewEl, targetScrollTop);
			return;
		}

		// 精确物理坐标映射模式 (解决 YAML 属性区等高度漂移)
		const anchors = this.getScrollAnchors();
		const editorScrollTop = scrollDom.scrollTop;

		// 虚拟锚点定位：两端顶部对齐
		let prevAnchor = { editorTop: 0, previewTop: 0 };
		let nextAnchor = { editorTop: scrollDom.scrollHeight, previewTop: previewEl.scrollHeight };

		if (anchors.length > 0) {
			try {
				// 获取所有锚点在编辑器中的物理坐标
				const physicalAnchors = anchors.map(a => {
					const line = Math.min(a.line, doc.lines);
					const block = cmView.lineBlockAt(doc.line(line).from);
					return {
						previewTop: a.top,
						editorTop: block.top
					};
				});

				// 查找当前滚动位置所属的物理区间
				for (let i = 0; i < physicalAnchors.length; i++) {
					if (physicalAnchors[i].editorTop <= editorScrollTop) {
						prevAnchor = physicalAnchors[i];
					} else {
						nextAnchor = physicalAnchors[i];
						break;
					}
				}
			} catch (err) {
				Logger.warn("ScrollSync", "Physical anchor mapping failed, falling back", err);
			}
		}

		// 执行物理区间内的线性插值
		const editorRange = nextAnchor.editorTop - prevAnchor.editorTop;
		const progress = editorRange > 0 ? (editorScrollTop - prevAnchor.editorTop) / editorRange : 0;
		const targetScrollTop = prevAnchor.previewTop + progress * (nextAnchor.previewTop - prevAnchor.previewTop);

		// 更新视觉反馈 (行高亮)
		try {
			const currentLineBlock = cmView.lineBlockAtHeight(editorScrollTop);
			const currentLine = doc.lineAt(currentLineBlock.from).number;
			this.updatePreviewHighlight(currentLine);
			cmView.dispatch({ effects: setSyncLineEffect.of(currentLine) });
		} catch(e) {}

		this.smoothScroll(previewEl, targetScrollTop);
	}


	private smoothScroll(el: HTMLElement, target: number) {
		const newScrollTop = this.precisionController.calculateSmoothScroll(el.scrollTop, target);
		if (newScrollTop !== el.scrollTop) {
			el.scrollTop = newScrollTop;
		}
	}

	/**
	 * 更新预览区当前行高亮
	 * 与编辑器侧同步，提升"所见即所得"的对齐感知
	 */
	private updatePreviewHighlight(line: number) {
		// 移除旧的高亮
		if (this.lastHighlightedEl) {
			this.lastHighlightedEl.classList.remove('smart-mp-sync-line-highlight');
		}

		// 查找当前行对应的预览元素
		const targetEl = this.articleDiv.querySelector(`[data-source-line="${line}"]`) as HTMLElement | null;
		if (targetEl) {
			targetEl.classList.add('smart-mp-sync-line-highlight');
			this.lastHighlightedEl = targetEl;
		} else {
			this.lastHighlightedEl = null;
		}
	}

	/**
	 * 获取预览区所有物理锚点（带缓存）
	 * 使用 getBoundingClientRect 获取相对于滚动容器的精确位置，
	 * 并补偿顶部装饰区域（字数统计）的偏移量
	 *
	 * 性能优化：缓存锚点位置，仅在渲染后或窗口变化时重新计算
	 * [PERF] 如果缓存失效，返回空数组，避免同步 Layout Thrashing
	 */
	private getScrollAnchors(): Array<{ line: number; top: number }> {
		// 返回缓存的锚点，避免每次滚动都触发 Layout Thrashing
		if (this.anchorsCacheValid && this.cachedAnchors.length > 0) {
			return this.cachedAnchors;
		}

		// [PERF] 缓存失效时返回空数组，不进行同步计算
		// 锚点会在 refreshScrollAnchors() 中通过 requestAnimationFrame 异步计算
		return [];
	}

	/**
	 * 异步计算锚点位置
	 * [PERF] 使用 requestAnimationFrame 避免 Layout Thrashing 阻塞主线程
	 */
	private computeAnchorsAsync() {
		const container = this.renderDiv;
		if (!container) return;

		// 使用 requestAnimationFrame 在浏览器下一帧执行布局计算
		requestAnimationFrame(() => {
			const anchors: Array<{ line: number; top: number }> = [];

			try {
				// 使用 getBoundingClientRect 获取精确位置
				const containerRect = container.getBoundingClientRect();
				const elements = this.articleDiv.querySelectorAll('[data-source-line]');

				// [PERF] 批量读取，避免读写交替
				elements.forEach((el) => {
					const line = parseInt(el.getAttribute('data-source-line') || '0');
					if (line > 0) {
						const elRect = (el as HTMLElement).getBoundingClientRect();
						// 相对于容器顶部的精确位置 = 元素距视口顶部距离 - 容器距视口顶部距离 + 容器滚动距离
						const relativeTop = elRect.top - containerRect.top + container.scrollTop;
						anchors.push({ line, top: relativeTop });
					}
				});

				const sortedAnchors = anchors.sort((a, b) => a.line - b.line);

				// 缓存结果
				this.cachedAnchors = sortedAnchors;
				this.anchorsCacheValid = true;

				// 汇总日志（仅开发环境）
				Logger.debug("ScrollSync", `Anchors cached: ${sortedAnchors.length} anchors, first: line ${sortedAnchors[0]?.line}@${sortedAnchors[0]?.top}, last: line ${sortedAnchors[sortedAnchors.length - 1]?.line}@${sortedAnchors[sortedAnchors.length - 1]?.top}`);
			} catch (e) {
				Logger.warn("ScrollSync", "Failed to compute anchors", e);
			}
		});
	}

	/**
	 * 刷新滚动锚点缓存
	 * 应在渲染完成后调用，或在窗口大小变化时调用
	 * [PERF] 使用异步计算，不阻塞主线程
	 */
	private refreshScrollAnchors() {
		this.anchorsCacheValid = false;
		this.cachedAnchors = [];
		// [PERF] 异步计算锚点，避免阻塞渲染
		this.computeAnchorsAsync();
	}

	/**
	 * 设置 ResizeObserver 监听预览区大小变化
	 */
	private setupResizeObserver() {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}

		// [PERF] 使用防抖避免频繁回调
		let resizeDebounce: number | null = null;
		this.resizeObserver = new ResizeObserver(() => {
			// 取消之前的防抖
			if (resizeDebounce) {
				clearTimeout(resizeDebounce);
			}
			// 延迟 100ms 标记缓存失效，避免快速连续触发
			resizeDebounce = window.setTimeout(() => {
				this.anchorsCacheValid = false;
				resizeDebounce = null;
			}, 100);
		});

		if (this.renderDiv) {
			this.resizeObserver.observe(this.renderDiv);
		}
	}

	/**
	 * 获取当前的 MarkdownView
	 */
	getMarkdownView(): MarkdownView | null {
		const leaf = this.app.workspace.getMostRecentLeaf();
		if (leaf?.view instanceof MarkdownView) {
			return leaf.view;
		}
		return null;
	}

	/**
	 * 刷新滚动同步按钮状态
	 */
	refreshScrollSyncButton() {
		if (!this.scrollSyncButton) return;

		if (this.plugin.settings.scrollSync) {
			this.scrollSyncButton.setIcon("link");
			this.scrollSyncButton.setTooltip($t("views.previewer.scroll-sync-on") || "Scroll sync enabled");
		} else {
			this.scrollSyncButton.setIcon("unlink");
			this.scrollSyncButton.setTooltip($t("views.previewer.scroll-sync-off") || "Scroll sync disabled");
		}
	}

	/**
	 * 停止滚动同步监听
	 */
	stopListen() {
		// 清理 RAF
		if (this.scrollRAF) {
			cancelAnimationFrame(this.scrollRAF);
			this.scrollRAF = null;
		}

		// 清理 ResizeObserver
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}

		// 清理缓存
		this.cachedAnchors = [];
		this.anchorsCacheValid = false;

		// [Fix] 用绑定时记录的 DOM 引用移除滚动监听：
		// onClose 时 getMarkdownView 返回的是"当前"视图，未必是当初绑定的编辑器
		this.stopScrollListeners();
		this.editorScrollListener = null;

		// [Fix] 注销 messageService 监听器：视图关闭后旧实例仍在接收消息，
		// 会继续对当前活动文件写 frontmatter（幽灵写入）
		this.messageDisposers.forEach((d) => d());
		this.messageDisposers = [];

		// [Fix] 清理子组件注册的监听器
		this.themeSelector?.destroy();
		this.draftHeader?.destroy();

		// 清理事件引用
		this.listeners.forEach((e) => this.app.workspace.offref(e));
		this.listeners = [];
	}
}
