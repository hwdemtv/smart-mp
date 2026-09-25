/**
 * smart-mp plugin for Obsidian
 * author: Learner Chen.
 * latest update: 2026-01-30
 */
import {
	debounce,
	Editor,
	EventRef,
	MarkdownView,
	Menu,
	MenuItem,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
	addIcon,
} from "obsidian";
import { getPublicIpAddress } from "src/utils/ip-address";
import { CryptoHelper } from "./utils/crypto-helper";
import { Logger } from "./utils/logger";
import { ErrorHandler } from "./utils/error-handler";
import { AssetsManager } from "./assets/assets-manager";
import { ResourceManager } from "./assets/resource-manager";
import { $t } from "./lang/i18n";
import { ConfirmModal } from "./modals/confirm-modal";
import { ImageGenerateModal } from "./modals/image-generate-modal";
import { PromptModal } from "./modals/prompt-modal";
import { SynonymsModal } from "./modals/synonyms-modal";
import { SmartMPSettingTab } from "./settings/setting-tab";
import { DiffModal } from "./modals/diff-modal";
import { DeepSeekResult } from "./types/types";
import {
	getSmartMPSetting,
	saveSmartMPSetting,
	DEFAULT_SETTINGS,
	SmartMPSetting,
} from "./settings/smart-mp-setting";
import { AiClient } from "./utils/ai-client";
import { MessageService } from "./utils/message-service";
import {
	proofreadText,
} from "./utils/proofread";
import { MaterialView, VIEW_TYPE_MP_MATERIAL } from "./views/material-view";
import { PreviewPanel, VIEW_TYPE_SMART_MP_PREVIEW } from "./views/previewer";
import { FloatingToolbar } from "./views/floating-toolbar";
import { WechatClient } from "./wechat-api/wechat-client";
import { syncLineField, scrollSyncPlugin, scrollSyncStyles, initScrollSyncStyle, removeDynamicCSS } from "./render/scroll-sync-extension";
import { Spinner } from "./views/spinner";
import { ThemeHotReloader } from "./theme/hot-reloader";
import { ThemeManager } from "./theme/theme-manager";
import { WechatRender } from "src/render/wechat-render";
import { ObsidianMarkdownRenderer } from "src/render/markdown-render";
import { SMART_MP_ICON } from "./icons";
import { migrateSettings } from "src/settings/migrate";
import { AuthService } from "src/services/auth-service";
import { IPService } from "src/services/ip-service";
import { AccountService } from "src/services/account-service";
import { CommandManager } from "src/core/command-manager";
import { AIFeatureManager } from "src/services/ai-feature-manager";

export default class SmartMPPlugin extends Plugin {
	settings: SmartMPSetting;
	wechatClient: WechatClient;
	assetsManager: AssetsManager;
	aiClient: AiClient | null = null;
	private editorChangeListener: EventRef | null = null;
	private imageGenerateModal: ImageGenerateModal | undefined;
	matierialView: MaterialView;
	messageService: MessageService;
	resourceManager: ResourceManager | undefined;
	active: boolean = false;
	spinner: Spinner;
	themeHotReloader: ThemeHotReloader;
	floatingToolbar: FloatingToolbar;
	authService: AuthService;
	ipService: IPService;
	accountService: AccountService;
	commandManager: CommandManager;
	aiFeatureManager: AIFeatureManager;

	async saveThemeFolder() {
		const config = (await this.loadData()) || {};
		config.custom_theme_folder = this.settings.css_styles_folder;
		await this.saveData(config);
		this.messageService.sendMessage("custom-theme-folder-changed", null);
	}
	async loadThemeFolder() {
		const config = await this.loadData();
		if (config && config.custom_theme_folder) {
			this.settings.css_styles_folder = config.custom_theme_folder;
		}
	}
	// private spinnerEl: HTMLElement;
	// spinnerText: HTMLDivElement;
	trimSettings() {
		this.settings.mpAccounts.forEach((account) => {
			account.accountName = account.accountName.trim();
			account.appId = account.appId.trim();
			account.appSecret = account.appSecret.trim();
		});
		this.settings.chatAccounts.forEach((account) => {
			account.accountName = account.accountName.trim();
			account.baseUrl = account.baseUrl.trim();
			account.apiKey = account.apiKey.trim();
			account.model = account.model.trim();
		});
		this.settings.drawAccounts.forEach((account) => {
			account.accountName = account.accountName.trim();
			account.baseUrl = account.baseUrl.trim();
			account.taskUrl = account.taskUrl.trim();
			account.apiKey = account.apiKey.trim();
			account.model = account.model.trim();
		})
		this.settings.ipAddress = this.settings.ipAddress?.trim();
		this.settings.selectedMPAccount = this.settings.selectedMPAccount?.trim();
		this.settings.selectedChatAccount = this.settings.selectedChatAccount?.trim();
		this.settings.selectedDrawAccount = this.settings.selectedDrawAccount?.trim();
		this.settings.accountDataPath = this.settings.accountDataPath?.trim();
		this.settings.chatSetting.chatSelected = this.settings.chatSetting.chatSelected?.trim();
		this.settings.chatSetting.modelSelected = this.settings.chatSetting.modelSelected?.trim();
		this.settings.css_styles_folder = this.settings.css_styles_folder?.trim();
	}
	saveSettings: () => void = debounce(() => {
		void this.persistSettings();
	}, 3000);
	saveThemeFolderDebounce: () => void = debounce(() => {
		void this.saveThemeFolder();
	}, 3000);

	private async persistSettings(): Promise<void> {
		// [Fix] 保存前强制解密：懒解密未触发时内存中仍是密文，直接再加密
		// 会产生双重加密，之后解密得到乱码，密钥被静默永久损坏
		await this.ensureDecrypted();

		const settingsCopy: SmartMPSetting = JSON.parse(JSON.stringify(this.settings));
		delete settingsCopy._id;
		delete settingsCopy._rev;

		// Encrypt sensitive info using AES-GCM
		const key = this.settings.cryptoKey || "";
		for (const acc of settingsCopy.mpAccounts) {
			if (acc.appSecret) acc.appSecret = await CryptoHelper.encrypt(acc.appSecret, key);
		}
		for (const acc of settingsCopy.chatAccounts) {
			if (acc.apiKey) acc.apiKey = await CryptoHelper.encrypt(acc.apiKey, key);
		}
		for (const acc of settingsCopy.drawAccounts) {
			if (acc.apiKey) acc.apiKey = await CryptoHelper.encrypt(acc.apiKey, key);
		}
		// [Fix] llmProviders 此前从不加密：解密进内存后明文落盘，与旧字段策略不一致
		for (const provider of settingsCopy.llmProviders || []) {
			if (provider.apiKey) provider.apiKey = await CryptoHelper.encrypt(provider.apiKey, key);
		}
		// [Fix] proPassword/proToken 此前明文落盘，与其余敏感字段策略不一致
		if (settingsCopy.proPassword) {
			settingsCopy.proPassword = await CryptoHelper.encrypt(settingsCopy.proPassword, key);
		}
		if (settingsCopy.proToken) {
			settingsCopy.proToken = await CryptoHelper.encrypt(settingsCopy.proToken, key);
		}

		// this.trimSettings(); // Trim only makes sense for raw input, here we are saving
		await saveSmartMPSetting(this, settingsCopy);
		await this.saveThemeFolder();
	}

	/**
	 * 立即持久化（绕过 saveSettings 的 3s 防抖）。
	 * 供导入设置等一次性重要操作使用，避免防抖窗口内崩溃导致数据丢失。
	 */
	async saveSettingsNow(): Promise<void> {
		await this.persistSettings();
	}

	// proofService: ProofService;

	getCurrentEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.editor ?? null;
	}
	showLeftView() {
		void this.activateMaterialView();
	}
	pullAllWeChatMPMaterial() {
		if (this.settings.selectedMPAccount === undefined) {
			new Notice($t("main.no-wechat-mp-account-selected"));
			return;
		}
		void this.assetsManager
			.pullAllMaterial(this.settings.selectedMPAccount)
			.catch((error) => {
				Logger.error("AssetsManager", "拉取公众号素材失败", error);
			});
	}
	assetsUpdated() {
		this.messageService.sendMessage("material-updated", null);
	}
	onWeChantMPAccountChange(value: string) {
		if (value === undefined || !value) {
			return;
		}
		this.settings.selectedMPAccount = value;
		void this.assetsManager.loadMaterial(value).catch((error) => {
			Logger.error("AssetsManager", "加载公众号素材失败", error);
		});
	}

	createSpinner() {

		this.spinner = new Spinner(this.addStatusBarItem());
	}
	showSpinner(text: string = "") {
		this.spinner.showSpinner(text);

	}
	isSpinning() {
		return this.spinner.isSpinning();
	}

	hideSpinner() {
		this.spinner.hideSpinner();
	}

	private _isDecrypted = false;

	/**
	 * Ensures that sensitive settings (API keys, secrets) are decrypted.
	 * This is called lazily when a service actually needs to use these values.
	 * This avoids expensive bulk decryption during plugin startup.
	 */
	async ensureDecrypted(): Promise<void> {
		if (this._isDecrypted) return;
		
		const key = this.settings.cryptoKey;
		if (!key) {
			this._isDecrypted = true;
			return;
		}

		Logger.debug("Main", "Starting lazy decryption of settings...");
		const startTime = Date.now();

		await Promise.all([
			// MP Accounts
			...this.settings.mpAccounts.map(async (acc) => {
				if (acc.appSecret && CryptoHelper.isEncrypted(acc.appSecret)) {
					acc.appSecret = await CryptoHelper.decrypt(acc.appSecret, key);
				}
			}),
			// LLM Providers (New Architecture)
			...(this.settings.llmProviders || []).map(async (provider) => {
				if (provider.apiKey && CryptoHelper.isEncrypted(provider.apiKey)) {
					provider.apiKey = await CryptoHelper.decrypt(provider.apiKey, key);
				}
			}),
			// Legacy accounts (Compatibility)
			...this.settings.chatAccounts.map(async (acc) => {
				if (acc.apiKey && CryptoHelper.isEncrypted(acc.apiKey)) {
					acc.apiKey = await CryptoHelper.decrypt(acc.apiKey, key);
				}
			}),
			...this.settings.drawAccounts.map(async (acc) => {
				if (acc.apiKey && CryptoHelper.isEncrypted(acc.apiKey)) {
					acc.apiKey = await CryptoHelper.decrypt(acc.apiKey, key);
				}
			}),
			(async () => {
				if (this.settings.proPassword && CryptoHelper.isEncrypted(this.settings.proPassword)) {
					this.settings.proPassword = await CryptoHelper.decrypt(this.settings.proPassword, key);
				}
				if (this.settings.proToken && CryptoHelper.isEncrypted(this.settings.proToken)) {
					this.settings.proToken = await CryptoHelper.decrypt(this.settings.proToken, key);
				}
			})(),
		]);

		this._isDecrypted = true;
		Logger.debug("Main", `Lazy decryption completed in ${Date.now() - startTime}ms`);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await getSmartMPSetting(this)
		);

		// Run Migration
		if (migrateSettings(this.settings)) {
			await this.saveSettings();
		}

		// Check for migration to dynamic key
		if (!this.settings.cryptoKey) {
			// First time migration: Generate new key
			this.settings.cryptoKey = CryptoHelper.generateKey();
			// Decrypt using legacy key (synchronous for old XOR data)
			this.settings.mpAccounts.forEach(acc => {
				if (acc.appSecret) acc.appSecret = CryptoHelper.deobfuscateLegacy(acc.appSecret);
			});
			this.settings.chatAccounts.forEach(acc => {
				if (acc.apiKey) acc.apiKey = CryptoHelper.deobfuscateLegacy(acc.apiKey);
			});
			this.settings.drawAccounts.forEach(acc => {
				if (acc.apiKey) acc.apiKey = CryptoHelper.deobfuscateLegacy(acc.apiKey);
			});
			// Save immediately to apply new AES encryption
			// [Fix] 迁移后内存中已是明文，先置标记再持久化，
			// 避免 persistSettings 内的 ensureDecrypted 重复处理
			this._isDecrypted = true;
			await this.persistSettings();
		} else {
			// DO NOT DECRYPT HERE. Will be done lazily via ensureDecrypted()
			this._isDecrypted = false;
		}

		await this.loadThemeFolder();
	}
	async updateIpAddress(): Promise<string> {
		return await this.ipService.updateIpAddress();
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null | undefined = workspace
			.getLeavesOfType(VIEW_TYPE_SMART_MP_PREVIEW)
			.find((leaf) => leaf.view instanceof PreviewPanel);

		if (leaf === undefined || leaf === null) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({
				type: VIEW_TYPE_SMART_MP_PREVIEW,
				active: true,
			});
		}
		if (leaf) {
			void workspace.revealLeaf(leaf);
		}
	}
	async activateMaterialView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_MP_MATERIAL);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeftLeaf(false);
			await leaf?.setViewState({
				type: VIEW_TYPE_MP_MATERIAL,
				active: true,
			});
		}

		if (leaf) {
			void workspace.revealLeaf(leaf);
		}
	}
	getAccessToken(accountName: string) {
		const account = this.getMPAccountByName(accountName);
		if (account === undefined) {
			new Notice($t("main.no-wechat-mp-account-selected"));
			return false;
		}
		return account.access_token;
	}
	async TestAccessToken(accountName: string) {
		return await this.accountService.TestAccessToken(accountName);
	}
	async refreshAccessToken(accountName: string | undefined) {
		return await this.accountService.refreshAccessToken(accountName);
	}
	getMPAccountByName(accountName: string | undefined) {
		return this.accountService.getMPAccountByName(accountName);
	}
	public getDrawAIAccount(accountName: string | undefined = undefined) {
		return this.accountService.getDrawAIAccount(accountName);
	}
	getSelectedMPAccount() {
		return this.accountService.getSelectedMPAccount();
	}
	setAccessToken(
		accountName: string,
		accessToken: string,
		expires_in: number
	) {
		this.accountService.setAccessToken(accountName, accessToken, expires_in);
	}
	findImageMediaId(url: string) {
		return this.assetsManager.findMediaIdOfUrl("image", url);
	}

	async generateSummary(content: string) { return await this.aiFeatureManager.generateSummary(content); }
	async generateHeadline(content: string) { return await this.aiFeatureManager.generateHeadline(content); }
	async translateToEnglish(content: string) { return await this.aiFeatureManager.translateToEnglish(content); }
	async translateToChinese(content: string) { return await this.aiFeatureManager.translateToChinese(content); }
	async getSynonyms(content: string) { return await this.aiFeatureManager.getSynonyms(content); }
	async generateMermaid(content: string) { return await this.aiFeatureManager.generateMermaid(content); }
	async generateLaTex(content: string) { return await this.aiFeatureManager.generateLaTex(content); }
	async proofContent(content: string) { return await this.aiFeatureManager.proofContent(content); }
	async polishContent(content: string) { return await this.aiFeatureManager.polishContent(content); }
	async polishContentWithStreaming(editor: Editor, content: string) { return await this.aiFeatureManager.polishContentWithStreaming(editor, content); }
	async translateWithStreaming(editor: Editor, content: string, sourceLang: string, targetLang: string) { return await this.aiFeatureManager.translateWithStreaming(editor, content, sourceLang, targetLang); }
	async generateTitleWithStreaming(editor: Editor, content: string) { return await this.aiFeatureManager.generateTitleWithStreaming(editor, content); }
	async generateSummaryWithStreaming(editor: Editor, content: string) { return await this.aiFeatureManager.generateSummaryWithStreaming(editor, content); }
	async proofContentWithStreaming(editor: Editor, content: string) { return await this.aiFeatureManager.proofContentWithStreaming(editor, content); }
	async getSynonymsWithStreaming(editor: Editor, content: string) { return await this.aiFeatureManager.getSynonymsWithStreaming(editor, content); }

	generateImage(editor: Editor) {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		if (this.imageGenerateModal === undefined) {
			this.imageGenerateModal = new ImageGenerateModal(
				this,
				(url: string) => {
					//save it to local folder.
					if (url === undefined || url === null || url === "") {
						new Notice($t("main.image-generation-failed"));
					}
					void ResourceManager.getInstance(this)
						.saveImageFromUrl(url)
						.then((fullPath) => {
							this.messageService.sendMessage(
								"image-generated",
								fullPath ? fullPath : url
							);
						})
						.catch((error) => {
							Logger.error("Image", "保存图片失败", error);
						});
				}
			);
		}
		this.imageGenerateModal.prompt = editor.getSelection();
		this.imageGenerateModal.size = "1024*768";
		this.imageGenerateModal.open();
	}

	prompt(
		message: string,
		defaultValue?: string
	): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new PromptModal(
				this.app,
				message,
				defaultValue,
				resolve
			);
			modal.open();
		});
	}

	confirm(message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConfirmModal(this.app, message, resolve);
			modal.open();
		});
	}
	// DB init removed — each service uses its own lazy PouchDB singleton
	async onload() {
		const buildTime = "2026-05-12 06:03"; 
		console.log(`[SmartMP] Initializing... Build: ${buildTime}`);
		const totalStartTime = Date.now();

		addIcon("smart-mp-logo", SMART_MP_ICON);
		this.messageService = new MessageService();

		// Phase 1: Critical path - minimum work to be active
		await this.loadSettings();

		// Phase 2: UI Elements (Non-blocking)
		requestAnimationFrame(() => {
			this.registerViews();
			this.addSettingTab(new SmartMPSettingTab(this.app, this));
			this.createSpinner();
			
			// Phase 3: Commands and Menus
			setTimeout(() => {
				this.initCommands();
				Logger.info("Main", `Critical loading path completed in ${Date.now() - totalStartTime}ms`);
			}, 0);

			// Phase 4: Deferred Services (Heavy lifting)
			setTimeout(() => {
				this.initDeferredServices();
			}, 100);
		});
	}

	private initCommands(): void {
		this.commandManager = new CommandManager(this);
		this.commandManager.registerCommands();
		this.commandManager.addEditorMenu();

		this.addRibbonIcon("smart-mp-logo", "SmartMP", () => {
			void this.activateView();
		});

		// Floating Toolbar setup
		this.floatingToolbar = new FloatingToolbar(this);
		this.registerFloatingToolbarEvents();
	}

	private initDeferredServices(): void {
		Logger.debug("Main", "Initializing deferred services...");
		this.resourceManager = ResourceManager.getInstance(this);
		this.wechatClient = WechatClient.getInstance(this);
		this.assetsManager = AssetsManager.getInstance(this.app, this);
		this.aiClient = AiClient.getInstance(this);
		this.ipService = new IPService(this);
		this.accountService = new AccountService(this);
		this.aiFeatureManager = new AIFeatureManager(this);

		// Auth service (async init, non-blocking)
		this.authService = new AuthService(this);
		this.authService.init().then(() => {
			this.authService.checkExpirationReminder();
			this.messageService.sendMessage("auth-initialized", null);
		}).catch(err => {
			Logger.error("Main", "AuthService failed to initialize:", err);
		});

		// Editor extensions
		this.registerEditorExtension([syncLineField, scrollSyncPlugin, scrollSyncStyles]);
		initScrollSyncStyle(this.settings.scrollHighlightPreset as any);

		// [Fix] 接线主题热更新：ThemeHotReloader 此前只声明未实例化，
		// 'theme-reloaded' 消息永远无人发送，编辑主题 CSS 预览不会刷新
		this.themeHotReloader = new ThemeHotReloader(this);
		this.themeHotReloader.startWatching();
	}

	private registerFloatingToolbarEvents(): void {
		this.registerDomEvent(document, 'mouseup', (evt: MouseEvent) => {
			if (!this.settings.enableFloatingToolbar) return;

			const docSelection = document.getSelection();
			if (!docSelection || docSelection.toString().trim().length === 0) return;

			setTimeout(() => {
				const activeLeaf = this.app.workspace.activeLeaf;
				if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
					const editor = activeLeaf.view.editor;
					if (editor.somethingSelected()) {
						const selection = editor.getSelection();
						if (selection && selection.trim().length > 0) {
							this.floatingToolbar.show(editor, selection);
						}
					}
				}
			}, 50);
		});

		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.floatingToolbar.hide()));
		this.registerEvent(this.app.workspace.on('editor-change', () => this.floatingToolbar.hide()));

		this.messageService.registerListener('show-spinner', (msg: string) => {
			this.showSpinner(msg);
		});
		this.messageService.registerListener('hide-spinner', () => {
			this.hideSpinner();
		});
	}
	registerViewOnce(viewType: string) {
		if (this.app.workspace.getLeavesOfType(viewType).length === 0) {
			if (viewType === VIEW_TYPE_SMART_MP_PREVIEW) {

				this.registerView(viewType, (leaf) => new PreviewPanel(leaf, this))
			} else if (viewType === VIEW_TYPE_MP_MATERIAL) {
				this.registerView(viewType, (leaf) => new MaterialView(leaf, this))
			}
		}
	}
	registerViews() {
		this.registerViewOnce(VIEW_TYPE_SMART_MP_PREVIEW);
		this.registerViewOnce(VIEW_TYPE_MP_MATERIAL);
	}

	onunload() {
		this.floatingToolbar?.destroy();
		if (this.editorChangeListener) {
			this.app.workspace.offref(this.editorChangeListener);
		}
		// [Fix] spinner 在 rAF 回调中创建，插件在首帧前被禁用时可能尚未初始化，
		// 无保护会抛 TypeError 中断后续清理
		this.spinner?.unload();
		if (this.themeHotReloader) this.themeHotReloader.stopWatching();

		// [Fix] flush 防抖保存：3 秒防抖窗口内禁用插件/退出 Obsidian 会丢失未落盘的设置改动。
		// saveSmartMPSetting 内部有"未变化则跳过写入"检查，无条件落盘是安全的
		void this.persistSettings();

		// [Fix] 清理滚动同步注入到文档的动态样式
		removeDynamicCSS();

		// Clean up static instances
		ThemeManager.onPluginUnload();
		WechatClient.onPluginUnload();
		AssetsManager.onPluginUnload();
		AiClient.onPluginUnload();
		ResourceManager.onPluginUnload();
		WechatRender.onPluginUnload();
		ObsidianMarkdownRenderer.onPluginUnload();

		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof PreviewPanel) {
				leaf.detach();
			}
			if (leaf.view instanceof MaterialView) {
				leaf.detach();
			}
		});
	}




	showDiffModal(editor: Editor, original: string, modified: string) {
		new DiffModal(this.app, editor, original, modified, (result) => {
			editor.replaceSelection(result);
			new Notice($t("notice.main.ai-modification-applied") ?? "已应用 AI 修改");
		}).open();
	}

	showInsertModeMenu(editor: Editor, originalContent: string, result: string) {
		this.commandManager.showInsertModeMenu(editor, originalContent, result);
	}
}
