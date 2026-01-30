/** process custom theme content */
import matter from "gray-matter";
import { CachedMetadata, Notice, TFile, TFolder, requestUrl } from "obsidian";
import postcss from "postcss";
// import { combinedCss } from "src/assets/css/template-css";
import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";
import { CSSMerger } from "./CssMerger";
import { CSSCache } from "./css-cache";
import { getPresetCSS, PresetName } from "./presets";

export type WeChatTheme = {
	name: string;
	path: string;
	content?: string;

}
export class ThemeManager {
	private cssMerger: CSSMerger | null = null;
	private cachedCssKey: string | null = null;

	async downloadThemes() {
		const baseUrlAlter = "https://raw.githubusercontent.com/ryfineZ/SmartMP/master/themes/";
		const baseUrl = "https://raw.githubusercontent.com/ryfineZ/SmartMP/master/themes/";
		const saveDir = this.plugin.settings.css_styles_folder || "/smart-mp-custom-css";

		// Create save directory if it doesn't exist
		if (!this.plugin.app.vault.getAbstractFileByPath(saveDir)) {
			await this.plugin.app.vault.createFolder(saveDir);
		}

		// Check if github is reachable, if not, use gitee
		let url = baseUrl;
		void requestUrl(`${baseUrl}themes.json`).then((response) => {
			if (response.status === 200) {
				// The URL is valid, use it
				url = baseUrl;
				console.debug(`Using GitHub URL: ${url}`);
			} else {
				// The URL is not valid, use the alternative URL
				console.debug(`status error, Using Gitee URL: ${baseUrlAlter}`);
				url = baseUrlAlter;
			}
		}).catch((error) => {
			// The URL is not valid, use the alternative URL
			console.debug(`exception, Using Gitee URL: ${baseUrlAlter}`);
			url = baseUrlAlter;
		});


		try {
			// Download themes.json
			const themesResponse = await requestUrl(`${url}themes.json`);
			if (themesResponse.status !== 200) {
				throw new Error($t('views.theme-manager.failed-to-fetch-themes-json-themesrespon', [themesResponse.text]));
			}

			const themesData = themesResponse.json;
			const themes = themesData.themes;

			// Download each theme file
			for (const theme of themes) {
				try {


					const fileResponse = await requestUrl(`${url}${theme.file}`);
					if (fileResponse.status !== 200) {
						console.warn(`Failed to download ${theme.file}: ${fileResponse.text}`);
						continue;
					}

					const fileContent = fileResponse.text;
					// Generate unique file name
					let filePath = `${saveDir}/${theme.file}`;
					let counter = 1;

					while (this.plugin.app.vault.getAbstractFileByPath(filePath)) {
						const extIndex = theme.file.lastIndexOf('.');
						const baseName = extIndex > 0 ? theme.file.slice(0, extIndex) : theme.file;
						const ext = extIndex > 0 ? theme.file.slice(extIndex) : '';
						filePath = `${saveDir}/${baseName}(${counter})${ext}`;
						counter++;
					}

					await this.plugin.app.vault.create(filePath, fileContent);
				} catch (error) {
					console.error(error);
					const message =
						error instanceof Error ? error.message : String(error);
					new Notice($t('views.theme-manager.error-downloading-theme') + message);
					continue;
				}
			}
			new Notice($t('views.theme-manager.total-themes-length-themes-downloaded', [themes.length]))
		} catch (error) {
			console.error("Error downloading themes:", error);
			new Notice($t('views.theme-manager.error-downloading-themes'));
		}
	}
	private plugin: SmartMPPlugin;
	defaultCssRoot: postcss.Root;
	themes: WeChatTheme[] = [];
	// static template_css: string = combinedCss;

	private constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;

	}
	private static instance: ThemeManager;
	static getInstance(plugin: SmartMPPlugin): ThemeManager {
		if (!ThemeManager.instance) {
			ThemeManager.instance = new ThemeManager(plugin);
		}
		return ThemeManager.instance;
	}

	public async reloadTheme() {
		this.cssMerger = null;
		this.cachedCssKey = null;
		// Also clear cache for current content? 
		// Best handled by caller (HotReloader) or here? 
		// HotReloader knows WHICH file changed. ThemeManager gets 'customCSS' which is content.
		// So clearing ThemeManager state is enough to force re-fetch and re-merge.
	}

	async loadThemes() {
		this.themes = [];
		const folder_path = this.plugin.settings.css_styles_folder;
		const folder = this.plugin.app.vault.getAbstractFileByPath(folder_path);
		if (folder instanceof TFolder) {
			this.themes = await this.getAllThemesInFolder(folder);
		}
		return this.themes;
	}
	public cleanCSS(css: string): string {
		// Remove code block markers if present
		css = css.replace(/```[cC][Ss]{2}\s*|\s*```/g, '').trim();

		// Preserve CSS variables, only strip comments
		const reg_multiple_line_comments = /\/\*[\s\S]*?\*\//g;
		const reg_single_line_comments = /\/\/.*/g;

		let cleanedCSS = css
			.replace(reg_multiple_line_comments, '')
			.replace(reg_single_line_comments, '');

		// Keep original formatting for PostCSS robustness
		return cleanedCSS.trim();
	}
	private async extractCSSblocks(path: string) {
		const result: string[] = []
		const file = this.plugin.app.vault.getFileByPath(path);
		if (!file) return '';

		const cache = this.plugin.app.metadataCache.getFileCache(file);
		if (!cache?.sections) {
			console.debug(`[ThemeManager] No sections found in cache for ${path}`);
			return '';
		}

		const content = await this.plugin.app.vault.read(file);

		for (const section of cache.sections) {
			if (section.type === "code") {
				const rawBlock = content.substring(
					section.position.start.offset,
					section.position.end.offset
				);

				// Be extremely strict: skip the first and last lines (the backticks)
				const lines = rawBlock.split('\n');
				if (lines.length > 2 && lines[0].toLowerCase().includes('```css')) {
					const codeOnly = lines.slice(1, -1).join('\n').trim();
					if (codeOnly) result.push(codeOnly);
				}
			}
		}

		const finalCss = result.join('\n\n');
		console.debug(`[ThemeManager] Extracted CSS from ${path}: blocks=${result.length}, chars=${finalCss.length}`);
		return finalCss;
	}

	public async getCSS() {
		// 1. Get Preset CSS
		const presetName = (this.plugin.settings.themePreset as PresetName) || 'default';
		const presetCSS = getPresetCSS(presetName);

		// 2. Get Custom Theme CSS
		let custom_css = ''
		if (this.plugin.settings.custom_theme !== undefined && this.plugin.settings.custom_theme) {
			custom_css = await this.extractCSSblocks(this.plugin.settings.custom_theme)
		}

		const final = `${presetCSS}\n\n/* --- Theme CSS Start --- */\n${custom_css}`;
		console.debug(`[ThemeManager] Final Combined CSS (Sample): ${final.substring(0, 50)}...${final.substring(final.length - 50)}`);
		return final;
	}
	public getShadowStleSheet() {
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(`
  /* 滚动条样式 we use shadow dom, make the preview looks better.*/
.table-container::-webkit-scrollbar {
	width: 8px;
	height: 8px;
	background-color: var(--scrollbar-bg);
}

	.table-container::-webkit-scrollbar-thumb {
	background-color: var(--scrollbar-thumb-bg);
    -webkit-border-radius: var(--radius-l);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-width: 3px 3px 3px 2px;
    min-height: 45px;
}
.table-container::-webkit-scrollbar-thumb:hover {
	background-color: var(--scrollbar-thumb-hover-bg);
}

.smart-mp-article::-webkit-scrollbar-corner{
	background: transparent;
}

.smart-mp-article pre::-webkit-scrollbar {
	width: 8px;
	height: 8px;
	background-color: var(--scrollbar-bg);
}

	.smart-mp-article pre::-webkit-scrollbar-thumb {
	background-color: var(--scrollbar-thumb-bg);
    -webkit-border-radius: var(--radius-l);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-width: 3px 3px 3px 2px;
    min-height: 45px;
}

.smart-mp-article pre::-webkit-scrollbar-thumb:hover {
	background-color: var(--scrollbar-thumb-hover-bg);
}

.smart-mp-article::-webkit-scrollbar-corner{
	background: transparent;
}
`);

		return sheet

	}
	private async getAllThemesInFolder(folder: TFolder): Promise<WeChatTheme[]> {
		const themes: WeChatTheme[] = [];

		const getAllFiles = async (folder: TFolder) => {
			const promises = folder.children.map(async (child) => {
				if (child instanceof TFile && child.extension === "md") {
					const theme = await this.getThemeProperties(child);
					if (theme) {
						themes.push(theme);
					}
				} else if (child instanceof TFolder) {
					await getAllFiles(child);
				}
			});

			await Promise.all(promises);
		};

		await getAllFiles(folder);

		return themes;
	}

	private async getThemeProperties(file: TFile): Promise<WeChatTheme | undefined> {
		const fileContent = await this.plugin.app.vault.cachedRead(file);
		const { data } = matter(fileContent); // 解析前置元数据
		if (data.theme_name === undefined || !data.theme_name.trim()) {
			// it is not a valid theme.
			return;
		}

		return {
			name: data.theme_name,
			path: file.path,
		};
	}

	public async applyTheme(htmlRoot: HTMLElement) {
		const customCss = await this.getCSS();

		// Enhanced check for CSS variables in the pulled content
		console.log(`[ThemeManager] Applying theme (Length: ${customCss.length}, Has variables: ${customCss.includes('--')})`);
		if (customCss.length > 0) {
			console.debug(`[ThemeManager] CSS Preview: ${customCss.substring(0, 50)}...`);
		}

		const cssKey = customCss;
		const cache = CSSCache.getInstance();
		const cachedState = cache.get(cssKey);

		if (!this.cssMerger || this.cachedCssKey !== cssKey) {
			this.cssMerger = new CSSMerger();

			if (cachedState) {
				// Cache Hit: Restore state instantly
				this.cssMerger.restoreState(cachedState.state);
				console.debug(`[ThemeManager] Theme Cache Hit.`);
			} else {
				// Cache Miss: Perform expensive init
				await this.cssMerger.init(customCss);
				// Cache the resulting state
				const mergerState = this.cssMerger.getState();
				cache.set(cssKey, null as any, mergerState.vars, mergerState);
				console.debug(`[ThemeManager] Theme Initialized & Cached. Variables found: ${mergerState.vars.size}`);
			}

			console.log('[ThemeManager] Active Variables Summary:',
				Array.from(this.cssMerger.vars.entries()).filter(([key]) =>
					key.includes('b08d55') || key.includes('D4AF37') || key.includes('1e1e1e') || key.includes('font') || key.includes('highlight') || key.includes('mark')
				)
			);

			// Diagnostic check for highlight rules
			const hasHighlightRules = Array.from(this.cssMerger.rules.keys()).some(s => s.includes('highlight') || s.includes('mark'));
			console.log(`[ThemeManager] Theme contains highlight/mark rules: ${hasHighlightRules}`);

			this.cachedCssKey = cssKey;
		}

		// Optimization: Skip DOM traversal if same theme already applied
		if (htmlRoot.dataset.SmartMPThemeKey === cssKey) {
			console.debug('[ThemeManager] Skipping DOM application: Theme already present on root.');
			return htmlRoot;
		}

		const node = this.cssMerger.applyStyleToElement(htmlRoot);
		node.dataset.SmartMPThemeKey = cssKey;
		return node;
	}

	onPluginUnload() {
		// Clean up caches
		CSSCache.getInstance().clear();
		CSSMerger.clearCaches();
	}
}
