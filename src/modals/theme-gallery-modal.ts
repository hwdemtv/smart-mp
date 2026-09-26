/**
 * 主题画廊 Modal
 *
 * 以当前文章的预览 HTML 为样例，离屏批量套用各主题（CSSMerger）生成缩略卡片，
 * 支持搜索过滤、点击即应用主题。取代"纯文字下拉逐个试"的选主题体验。
 */
import { Modal, Setting, Notice } from "obsidian";
import SmartMPPlugin from "src/main";
import { ThemeManager } from "src/theme/theme-manager";
import { CSSMerger } from "src/theme/CssMerger";
import { $t } from "src/lang/i18n";
import Logger from "src/utils/logger";

interface ThemeCardInfo {
	path: string;
	name: string;
	css: string;
}

const CARD_PREVIEW_WIDTH = 220;
const CARD_PREVIEW_MAX_HEIGHT = 140;

export class ThemeGalleryModal extends Modal {
	private plugin: SmartMPPlugin;
	private sampleHtml: string;
	private onApply: (themePath: string) => void;
	private cards: ThemeCardInfo[] = [];
	private gridEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private appliedThemePath: string;

	constructor(plugin: SmartMPPlugin, sampleHtml: string, appliedThemePath: string, onApply: (themePath: string) => void) {
		super(plugin.app);
		this.plugin = plugin;
		this.sampleHtml = sampleHtml;
		this.appliedThemePath = appliedThemePath;
		this.onApply = onApply;
	}

	async onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass("smart-mp-title-modal"); // 复用既有 modal 宽度样式
		contentEl.addClass("smart-mp-theme-gallery");

		contentEl.createEl("h3", { text: $t("views.theme-gallery.title") || "主题画廊" });

		// 搜索栏
		new Setting(contentEl)
			.addText((text) => {
				this.searchInput = text.inputEl;
				text.setPlaceholder($t("views.theme-gallery.search") || "搜索主题…");
				text.inputEl.addEventListener("input", () => void this.renderCards());
			});

		this.gridEl = contentEl.createDiv({ cls: "smart-mp-theme-gallery-grid" });

		// 加载主题列表 + 生成卡片
		await this.loadThemes();
		await this.renderCards();
	}

	private async loadThemes() {
		const themes = await ThemeManager.getInstance(this.plugin).loadThemes();
		this.cards = [];
		for (const theme of themes) {
			try {
				const file = this.plugin.app.vault.getFileByPath(theme.path);
				if (!file) continue;
				const raw = await this.plugin.app.vault.read(file);
				const css = this.extractCssFromThemeFile(raw);
				if (css) this.cards.push({ path: theme.path, name: theme.name, css });
			} catch (e) {
				Logger.warn("ThemeGallery", `读取主题失败: ${theme.path}`, e);
			}
		}
	}

	/**
	 * 从主题 markdown 中提取 ```css 代码块内容（轻量版，不依赖 metadataCache——
	 * 刚创建的文件缓存未就绪时也能正确渲染）
	 */
	private extractCssFromThemeFile(raw: string): string {
		const blocks: string[] = [];
		const fence = /```[cC][Ss]{2}[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
		let m: RegExpExecArray | null;
		while ((m = fence.exec(raw)) !== null) {
			const code = m[1].trim();
			if (code) blocks.push(code);
		}
		return blocks.join("\n\n");
	}

	private async renderCards() {
		const keyword = (this.searchInput?.value || "").trim().toLowerCase();
		this.gridEl.empty();

		// "默认主题"卡片（清除自定义主题）
		this.gridEl.appendChild(this.buildCard({
			path: "",
			name: $t("views.theme-manager.default-theme") || "默认主题",
			css: "",
		}));

		const filtered = this.cards.filter(c => !keyword || c.name.toLowerCase().includes(keyword));
		for (const card of filtered) {
			this.gridEl.appendChild(await this.buildPreviewCard(card));
		}

		if (keyword && filtered.length === 0) {
			this.gridEl.createDiv({ text: $t("views.theme-gallery.no-match") || "没有匹配的主题", cls: "smart-mp-text-muted" });
		}
	}

	private buildCard(info: { path: string; name: string; css: string }): HTMLElement {
		const card = createDiv({ cls: "smart-mp-theme-card" });
		if (info.path === this.appliedThemePath) {
			card.addClass("is-active");
		}
		const label = card.createDiv({ text: info.name, cls: "smart-mp-theme-card-name" });
		label.setAttribute("title", info.name);
		card.addEventListener("click", () => this.applyTheme(info.path));
		return card;
	}

	/** 离屏渲染样例文章并套用主题，生成缩略图卡片 */
	private async buildPreviewCard(info: ThemeCardInfo): Promise<HTMLElement> {
		const card = this.buildCard(info);
		const thumb = card.createDiv({ cls: "smart-mp-theme-card-thumb" });

		// 离屏沙盒：套样式→截图→立即销毁，不污染可见 DOM
		const sandbox = createDiv();
		sandbox.style.cssText = `position:absolute;left:-99999px;top:-99999px;width:${CARD_PREVIEW_WIDTH}px;pointer-events:none;`;
		document.body.appendChild(sandbox);
		try {
			const content = sandbox.createDiv({ cls: "smart-mp-theme-card-content" });
			content.innerHTML = this.sampleHtml;

			if (info.css) {
				const merger = new CSSMerger();
				await merger.init(info.css);
				const root = content.firstElementChild as HTMLElement | null;
				if (root) merger.applyStyleToElement(root);
			}

			const { default: domtoimage } = await import("../render/dom-to-image-more");
			const dataUrl = await domtoimage.toPng(content, {
				width: CARD_PREVIEW_WIDTH,
				height: CARD_PREVIEW_MAX_HEIGHT,
				style: { transform: "scale(0.35)", transformOrigin: "top left" },
			});
			const img = thumb.createEl("img", { attr: { src: dataUrl } });
			img.alt = info.name;
		} catch (e) {
			// 缩略图生成失败不阻塞选主题：退化为纯文字卡片
			Logger.warn("ThemeGallery", `缩略图生成失败: ${info.name}`, e);
		} finally {
			sandbox.remove();
		}
		return card;
	}

	private applyTheme(themePath: string) {
		this.plugin.settings.custom_theme = themePath;
		void this.plugin.saveSettings();
		this.plugin.messageService.sendMessage("custom-theme-changed", themePath);
		new Notice(
			themePath
				? ($t("views.theme-gallery.applied") || "已应用主题") + ": " + this.getThemeName(themePath)
				: ($t("views.theme-gallery.applied-default") || "已切换为默认主题")
		);
		this.close();
	}

	private getThemeName(path: string): string {
		return this.cards.find(c => c.path === path)?.name || path;
	}

	onClose() {
		this.contentEl.empty();
	}
}
