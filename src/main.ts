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
import { AssetsManager } from "./assets/assets-manager";
import { ResourceManager } from "./assets/resource-manager";
import { $t } from "./lang/i18n";
import { ConfirmModal } from "./modals/confirm-modal";
import { ImageGenerateModal } from "./modals/image-generate-modal";
import { PromptModal } from "./modals/prompt-modal";
import { SynonymsModal } from "./modals/synonyms-modal";
import { SmartMPSettingTab } from "./settings/setting-tab";
import { DeepSeekResult } from "./types/types";
import {
	getSmartMPSetting,
	saveSmartMPSetting,
	SmartMPSetting,
	initSmartMPDB
} from "./settings/smart-mp-setting";
import { initAssetsDB } from "./assets/assets-manager";
import { initDraftDB } from "./assets/draft-manager";
import { AiClient } from "./utils/ai-client";
import { MessageService } from "./utils/message-service";
import {
	proofreadPlugin,
	proofreadStateField,
	proofreadText,
} from "./utils/proofread";
import { MaterialView, VIEW_TYPE_MP_MATERIAL } from "./views/material-view";
import { PreviewPanel, VIEW_TYPE_SMART_MP_PREVIEW } from "./views/previewer";
import { WechatClient } from "./wechat-api/wechat-client";
import { Spinner } from "./views/spinner";
import { ThemeHotReloader } from "./theme/hot-reloader";
import { ThemeManager } from "./theme/theme-manager";
import { SMART_MP_ICON } from "./icons";
import { migrateSettings } from "./settings/migrate";

const DEFAULT_SETTINGS: SmartMPSetting = {
	mpAccounts: [],
	ipAddress: "",
	css_styles_folder: "smart-mp-css-styles",
	codeLineNumber: true,
	codeTheme: "github",
	showCodeMacHeader: true,
	fontSize: "15px",
	firstLineIndent: false,
	linkFootnotes: true,
	showImageCaptions: false,
	showArticleStats: false,
	embedArticleStats: false,
	hrStyle: "dots",
	customHrText: "· · ·",
	accountDataPath: "smart-mp-accounts",
	useCenterToken: false,
	chatAccounts: [],
	drawAccounts: [],
	realTimeRender: true,
	realTimeRenderDelay: 500,
	scrollSync: true,
	enableStrictSecurityMode: true,
	chatSetting: {
		temperature: 0.7,
		max_tokens: 2048,
		top_p: 1,
		frequency_penalty: 0,
		presence_penalty: 0,
	},
};

export default class SmartMPPlugin extends Plugin {
	settings: SmartMPSetting;
	wechatClient: WechatClient;
	assetsManager: AssetsManager;
	aiClient: AiClient | null = null;
	private editorChangeListener: EventRef | null = null;
	private imageGenerateModal: ImageGenerateModal | undefined;
	matierialView: MaterialView;
	messageService: MessageService;
	resourceManager = ResourceManager.getInstance(this);
	active: boolean = false;
	spinner: Spinner;
	themeHotReloader: ThemeHotReloader;

	async saveThemeFolder() {
		const config = {
			custom_theme_folder: this.settings.css_styles_folder,
		};
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
		const settingsCopy: SmartMPSetting = JSON.parse(JSON.stringify(this.settings));
		delete settingsCopy._id;
		delete settingsCopy._rev;

		// Encrypt sensitive info
		settingsCopy.mpAccounts.forEach(acc => {
			if (acc.appSecret) acc.appSecret = CryptoHelper.obfuscate(acc.appSecret, this.settings.cryptoKey || "");
		});
		settingsCopy.chatAccounts.forEach(acc => {
			if (acc.apiKey) acc.apiKey = CryptoHelper.obfuscate(acc.apiKey, this.settings.cryptoKey || "");
		});
		settingsCopy.drawAccounts.forEach(acc => {
			if (acc.apiKey) acc.apiKey = CryptoHelper.obfuscate(acc.apiKey, this.settings.cryptoKey || "");
		});

		// this.trimSettings(); // Trim only makes sense for raw input, here we are saving
		await saveSmartMPSetting(settingsCopy);
		await this.saveThemeFolder();
	}

	// proofService: ProofService;

	getCurrentEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.editor ?? null;
	}
	addEditorMenu() {
		this.messageService.registerListener(
			"image-generated",
			(url: string) => {
				if (!url) {
					return;
				}
				const editor = this.getCurrentEditor();
				if (!editor) {
					return;
				}
				if (url.startsWith("http")) {
					editor.replaceSelection(`![](${url})`);
				} else {
					editor.replaceSelection(`![[${url}]]`);
				}
			}
		);
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				// @ts-ignore: Obsidian 类型定义不完整
				let file = (editor as any).editorComponent?.file;
				file =
					file instanceof TFile
						? file
						: this.app.workspace.getActiveFile();

				if (!file) {
					return;
				}

				menu.addItem((item) => {
					item.setTitle($t("main.smart-mp-ai")).setIcon("sparkles");

					const subMenu = item.setSubmenu();

					if (editor.somethingSelected()) {
						// 1. 渲染自定义助手列表（包含已迁移的默认助手）
						if (this.settings.customAssistantList && this.settings.customAssistantList.length > 0) {
							this.settings.customAssistantList.forEach((assistant) => {
								if (assistant.enabled === false) return;

								// 特殊处理：翻译助手保留其语言选择子菜单
								if (assistant.id === "translate") {
									subMenu.addItem((subItem: MenuItem) => {
										subItem
											.setTitle(assistant.name)
											.setIcon("languages");
										const translateSubMenu = subItem.setSubmenu();
										translateSubMenu.addItem((ssi) => {
											ssi.setTitle($t("main.to-english")).onClick(async () => {
												const content = editor.getSelection();
												const res = await this.translateToEnglish(content);
												if (res) this.showInsertModeMenu(editor, content, res);
											});
										});
										translateSubMenu.addItem((ssi) => {
											ssi.setTitle($t("main.to-chinese")).onClick(async () => {
												const content = editor.getSelection();
												const res = await this.translateToChinese(content);
												if (res) this.showInsertModeMenu(editor, content, res);
											});
										});
									});
									return;
								}

								// 通用项目渲染
								subMenu.addItem((subItem: MenuItem) => {
									let icon = "bot";
									let action = () => void this.processCustomAssistant(assistant, editor);

									// 映射默认助手的图标和特定方法（以保留可能的优化/逻辑）
									switch (assistant.id) {
										case "polish":
											icon = "sun";
											action = () => {
												void (async () => {
													const content = editor.getSelection();
													const res = await this.polishContent(content);
													if (res) this.showInsertModeMenu(editor, content, res);
												})();
											};
											break;
										case "synonyms":
											icon = "book-a";
											action = () => {
												void (async () => {
													const content = editor.getSelection();
													const res = await this.getSynonyms(content);
													if (res) editor.replaceSelection(res, content);
												})();
											};
											break;
										case "mermaid":
											icon = "git-compare-arrows";
											action = () => {
												void (async () => {
													const content = editor.getSelection();
													const res = await this.generateMermaid(content);
													if (res) this.showInsertModeMenu(editor, content, res);
												})();
											};
											break;
										case "latex":
											icon = "square-radical";
											action = () => {
												void (async () => {
													const content = editor.getSelection();
													let res = await this.generateLaTex(content);
													if (res) {
														res = res.replace(/\\begin{document}/g, "").replace(/\\end{document}/g, "").replace(/\\\\/g, "\\");
														this.showInsertModeMenu(editor, content, res);
													}
												})();
											};
											break;
										case "summary":
											icon = "file-text";
											action = () => {
												void (async () => {
													const content = editor.getSelection();
													const res = await this.generateSummary(content);
													if (res) this.showInsertModeMenu(editor, content, res);
												})();
											};
											break;
										case "proofread":
											icon = "clipboard-check";
											action = () => {
												void (async () => {
													const content = editor.getValue();
													const result = await this.proofContent(content);
													if (result) {
														const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
														if (activeView) {
															proofreadText(
																editor,
																activeView,
																result as any
															);
														}
													}
												})();
											};
											break;
										case "text-to-image":
											icon = "image-plus";
											action = () => void this.generateImage(editor);
											break;
									}

									subItem.setTitle(assistant.name).setIcon(icon).onClick(action);
								});
							});
						}

					} else {
						subMenu.addItem((subItem) => {
							subItem
								.setTitle($t("main.polish"))
								.setIcon("user-pen")
								.onClick(() => {
									void (async () => {
										const content =
											await this.app.vault.read(file);
										const polished =
											await this.polishContent(content);
										if (polished) {
											await this.app.vault.modify(
												file,
												polished
											);
										}
									})();
								});
						});
						// subMenu.addItem((subItem) => {
						// 	subItem
						// 		.setTitle($t("main.proof"))
						// 		.setIcon("user-round-pen")
						// 		.onClick(async () => {
						// 			// const content = await this.app.vault.read(
						// 			// 	file
						// 			// );
						// 			const content = editor.getValue();
						// 			const proofed = await this.proofContent(
						// 				content
						// 			);

						// 			if (proofed) {
						// 				proofreadText(
						// 					editor,
						// 					this.app.workspace.getActiveViewOfType(
						// 						MarkdownView
						// 					)!,
						// 					proofed
						// 				);
						// 				// this.proofService =
						// 				// 	showProofSuggestions(
						// 				// 		editor,
						// 				// 		proofed
						// 				// 	);
						// 			}
						// 		});
						// });
					}
				});
			})
		);
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
				console.error("拉取公众号素材失败:", error);
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
			console.error("加载公众号素材失败:", error);
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

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await getSmartMPSetting()
		);

		// Run Migration
		if (migrateSettings(this.settings)) {
			await this.saveSettings();
		}

		// Check for migration to dynamic key
		if (!this.settings.cryptoKey) {
			// First time migration: Generate new key
			this.settings.cryptoKey = CryptoHelper.generateKey();
			// Decrypt using legacy key
			this.settings.mpAccounts.forEach(acc => {
				if (acc.appSecret) acc.appSecret = CryptoHelper.deobfuscateLegacy(acc.appSecret);
			});
			this.settings.chatAccounts.forEach(acc => {
				if (acc.apiKey) acc.apiKey = CryptoHelper.deobfuscateLegacy(acc.apiKey);
			});
			this.settings.drawAccounts.forEach(acc => {
				if (acc.apiKey) acc.apiKey = CryptoHelper.deobfuscateLegacy(acc.apiKey);
			});
			// Save immediately to apply new encryption
			await this.saveSettings();
		} else {
			// Decrypt sensitive info using dynamic key
			this.settings.mpAccounts.forEach(acc => {
				if (acc.appSecret) acc.appSecret = CryptoHelper.deobfuscate(acc.appSecret, this.settings.cryptoKey || "");
			});
			this.settings.chatAccounts.forEach(acc => {
				if (acc.apiKey) acc.apiKey = CryptoHelper.deobfuscate(acc.apiKey, this.settings.cryptoKey || "");
			});
			this.settings.drawAccounts.forEach(acc => {
				if (acc.apiKey) acc.apiKey = CryptoHelper.deobfuscate(acc.apiKey, this.settings.cryptoKey || "");
			});
		}

		// If migration happened (plain text found and decrypted=plain), saving will encrypted it.
		// Since we modify saveSettings to encrypt, we should trigger a save to ensure data on disk becomes encrypted eventually.
		// However, explicitly saving on every load might be aggressive. 
		// Let's rely on user action or auto-migration if we detect plain text?
		// Actually, CryptoHelper.deobfuscate returns plain text if it detects it's not encrypted.
		// So if we find any plain text that SHOULD be encrypted, we might want to trigger a save.
		// For now, let's keep it simple: It validates on load, and encrypts on next manual save.

		await this.loadThemeFolder();
	}
	async updateIpAddress(): Promise<string> {
		try {
			const ip = await getPublicIpAddress();
			if (!ip) {
				throw new Error("空的公网 IP 地址");
			}
			this.settings.ipAddress = ip;
			void this.saveSettings();
			return ip;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("获取公网 IP 地址失败:", error);
			throw new Error(`获取公网 IP 地址失败: ${message}`);
		}
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
		if (this.settings.useCenterToken) {
			return this.wechatClient.requestToken();
		} else {
			const account = this.getMPAccountByName(accountName);
			if (account === undefined) {
				new Notice($t("main.no-wechat-mp-account-selected"));
				return false;
			}
			const token = await this.wechatClient.getAccessToken(
				account.appId,
				account.appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in
				);
				return token.access_token;
			}
		}
		return false;
	}
	async refreshAccessToken(accountName: string | undefined) {
		if (this.settings.useCenterToken) {
			return this.wechatClient.requestToken();
		}
		if (accountName === undefined) {
			return false;
		}
		const account = this.getMPAccountByName(accountName);
		if (account === undefined) {
			new Notice($t("main.no-wechat-mp-account-selected"));
			return false;
		}
		const { appId, appSecret } = account;
		if (
			appId === undefined ||
			appSecret === undefined ||
			!appId ||
			!appSecret
		) {
			new Notice($t("main.please-check-you-appid-and-appsecret"));
			return false;
		}
		const {
			access_token: accessToken,
			expires_in: expiresIn,
			lastRefreshTime,
		} = account;
		if (accessToken === undefined || accessToken === "") {
			const token = await this.wechatClient.getAccessToken(
				appId,
				appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in
				);
				return token.access_token;
			}
		} else if (
			(lastRefreshTime || 0) + (expiresIn || 0) * 1000 <
			new Date().getTime()
		) {
			const token = await this.wechatClient.getAccessToken(
				appId,
				appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in
				);
				return token.access_token;
			}
		} else {
			return accessToken;
		}
		return false;
	}
	getMPAccountByName(accountName: string | undefined) {
		return this.settings.mpAccounts.find(
			(account) => account.accountName === accountName
		);
	}
	public getDrawAIAccount(accountName: string | undefined = undefined) {
		if (accountName === undefined) {
			accountName = this.settings.selectedDrawAccount;
		}
		return this.settings.drawAccounts.find(
			(account) =>
				account.accountName === this.settings.selectedDrawAccount
		);
	}
	getSelectedMPAccount() {
		return this.getMPAccountByName(this.settings.selectedMPAccount);
	}
	setAccessToken(
		accountName: string,
		accessToken: string,
		expires_in: number
	) {
		const account = this.getMPAccountByName(accountName);
		if (account === undefined) {
			return;
		}
		account.access_token = accessToken;
		account.lastRefreshTime = new Date().getTime();
		account.expires_in = expires_in;
		void this.saveSettings();
	}
	findImageMediaId(url: string) {
		return this.assetsManager.findMediaIdOfUrl("image", url);
	}

	async generateSummary(content: string): Promise<string | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.showSpinner("summarizing...");
			const result = await this.aiClient.generateSummary(content);
			this.hideSpinner();
			return result;
		} catch (error) {
			console.error("Error showing spinner:", error);
		} finally {
			this.hideSpinner();
		}
		return null;
	}

	async generateHeadline(content: string): Promise<string | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.showSpinner("正在生成爆款标题...");
			const titles = await this.aiClient.generateTitle(content);

			if (titles && titles.length > 0) {
				// 如果返回的是数组，格式化为列表
				return titles.join('\n');
			}
			return null;
		} catch (error) {
			console.error("Error generating headlines:", error);
			new Notice("生成标题失败");
		} finally {
			this.hideSpinner();
		}
		return null;
	}
	async translateToEnglish(content: string): Promise<string | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.showSpinner($t("main.translating-to-english"));
			const result = await this.aiClient.translateText(
				content,
				"Chinese",
				"English"
			);
			this.hideSpinner();
			return result;
		} catch (error) {
			console.error("Error showing spinner:", error);
		} finally {
			this.hideSpinner();
		}
		return null;
	}
	async translateToChinese(content: string): Promise<string | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.showSpinner($t("main.translating-to-chinese"));
			const result = await this.aiClient.translateText(content);
			this.hideSpinner();
			return result;
		} catch (error) {
			console.error("Error showing spinner:", error);
		} finally {
			this.hideSpinner();
		}
		return null;
	}
	async getSynonyms(content: string): Promise<string | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.showSpinner($t("main.get-synonyms"));
			const result = await this.aiClient.synonym(content);
			this.hideSpinner();
			if (result) {
				const synonyms = result.map((s) => s.replace(/^\d+\.\s*/, ""));
				const selectedWord = await new Promise<string | null>(
					(resolve) => {
						new SynonymsModal(this.app, synonyms, resolve).open();
					}
				);
				return selectedWord ? selectedWord : null;
			}
			return null;
		} catch (error) {
			console.error("Error showing spinner:", error);
		} finally {
			this.hideSpinner();
		}
		return null;
	}
	async generateMermaid(content: string): Promise<string | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.showSpinner($t("main.generating-mermaid"));
			const result = await this.aiClient.generateMermaid(content);
			if (result) {
				// 尝试提取已有的 mermaid 代码块
				const mermaidMatch = result.match(
					/```mermaid\n([\s\S]*?)\n```/
				);
				if (mermaidMatch && mermaidMatch[1]) {
					return `\n\`\`\`mermaid\n${mermaidMatch[1].trim()}\n\`\`\`\n`;
				}

				// 如果没有代码块包裹，清理结果并添加包裹
				let cleanedResult = result.trim();
				// 移除可能存在的多余反引号
				cleanedResult = cleanedResult.replace(/^```(mermaid)?/i, '').replace(/```$/i, '').trim();

				// 确保返回有代码块包裹的格式
				return `\n\`\`\`mermaid\n${cleanedResult}\n\`\`\`\n`;
			}
			return null;
		} catch (error) {
			console.error("Error generating mermaid:", error);
		} finally {
			this.hideSpinner();
		}
		return null;
	}
	async generateLaTex(content: string): Promise<string | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.showSpinner($t("main.generating-latex"));
			const result = await this.aiClient.generateLaTeX(content);
			if (result) {
				const latexMatch = result.match(/\$\$([\s\S]*?)\$\$/);
				if (latexMatch && latexMatch[0]) {
					return latexMatch[0].trim();
				}
				const codeBlockMatch = result.match(
					/```latex\n([\s\S]*?)\n```/
				);
				if (codeBlockMatch && codeBlockMatch[1]) {
					const innerLatexMatch =
						codeBlockMatch[1].match(/\$\$([\s\S]*?)\$\$/);
					if (innerLatexMatch && innerLatexMatch[0]) {
						return innerLatexMatch[0].trim();
					}
					return `$$${codeBlockMatch[1].trim()}$$`;
				}
				return result;
			}
			return null;
		} catch (error) {
			console.error("Error generating LaTeX:", error);
		} finally {
			this.hideSpinner();
		}
		return null;
	}

	async proofContent(
		content: string
	): Promise<DeepSeekResult["corrections"] | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.showSpinner($t("main.proofing"));
			const result = await this.aiClient.proofContent(content);
			if (result) {
				return result.corrections;
			}
		} catch (error) {
			console.error("Error showing spinner:", error);
		} finally {
			this.hideSpinner();
		}
		return null;
	}

	async processCustomAssistant(assistant: any, editor: Editor) {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return;
		}
		const content = editor.getSelection();
		if (!content) {
			new Notice("请先选中要处理的文本");
			return;
		}

		this.showSpinner(assistant.name + "...");
		try {
			// Pass assistant's optional providerId and modelId for per-assistant model selection
			const result = await this.aiClient.generateCustom(
				assistant.prompt,
				content,
				assistant.providerId,
				assistant.modelId
			);
			if (result) {
				// 显示插入模式选择菜单
				const menu = new Menu();

				menu.addItem((item) => {
					item.setTitle("🔄 替换选中文本")
						.setIcon("replace")
						.onClick(() => {
							editor.replaceSelection(result);
						});
				});

				menu.addItem((item) => {
					item.setTitle("➕ 追加到选中文本后")
						.setIcon("plus")
						.onClick(() => {
							editor.replaceSelection(content + "\n\n" + result);
						});
				});

				menu.addItem((item) => {
					item.setTitle("⬆️ 插入到选中文本前")
						.setIcon("arrow-up")
						.onClick(() => {
							editor.replaceSelection(result + "\n\n" + content);
						});
				});

				menu.addSeparator();

				menu.addItem((item) => {
					item.setTitle("📋 复制到剪贴板")
						.setIcon("copy")
						.onClick(() => {
							navigator.clipboard.writeText(result);
							new Notice("已复制到剪贴板");
						});
				});

				// 在屏幕中央显示菜单
				menu.showAtPosition({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 50 });
				new Notice("请选择插入方式", 2000);
			}
		} catch (error) {
			console.error("自定义助手执行失败:", error);
			new Notice("执行助手失败: " + assistant.name);
		} finally {
			this.hideSpinner();
		}
	}

	/**
	 * 显示插入模式选择菜单
	 * @param editor 编辑器实例
	 * @param originalContent 原始选中内容
	 * @param result AI 生成的结果
	 */
	private showInsertModeMenu(editor: Editor, originalContent: string, result: string) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle("🔄 替换选中文本")
				.setIcon("replace")
				.onClick(() => {
					editor.replaceSelection(result);
				});
		});

		menu.addItem((item) => {
			item.setTitle("➕ 追加到选中文本后")
				.setIcon("plus")
				.onClick(() => {
					editor.replaceSelection(originalContent + "\n\n" + result);
				});
		});

		menu.addItem((item) => {
			item.setTitle("⬆️ 插入到选中文本前")
				.setIcon("arrow-up")
				.onClick(() => {
					editor.replaceSelection(result + "\n\n" + originalContent);
				});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle("📋 复制到剪贴板")
				.setIcon("copy")
				.onClick(() => {
					navigator.clipboard.writeText(result);
					new Notice("已复制到剪贴板");
				});
		});

		// 在屏幕中央显示菜单
		menu.showAtPosition({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 50 });
		new Notice("请选择插入方式", 2000);
	}

	async polishContent(content: string): Promise<string | null> {
		if (!this.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		this.showSpinner($t("main.polishing"));
		const result = await this.aiClient.polishContent(content);
		this.hideSpinner();
		if (result) {
			return result.polished;
		}
		return null;
	}
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
							console.error("保存图片失败:", error);
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
	initDB() {
		initSmartMPDB();
		initAssetsDB();
		initDraftDB();
	}
	async onload() {
		addIcon("smart-mp-logo", SMART_MP_ICON);
		this.initDB();
		this.messageService = new MessageService();
		await this.loadSettings();
		this.wechatClient = WechatClient.getInstance(this);
		this.assetsManager = AssetsManager.getInstance(this.app, this);
		this.aiClient = AiClient.getInstance(this);

		this.registerViews();

		this.addCommand({
			id: "open-previewer",
			name: $t("main.open-previewer"),
			callback: () => {
				void this.activateView();
			},
		});
		this.addCommand({
			id: "open-material-view",
			name: $t("main.open-material-view"),
			callback: () => {
				void this.activateMaterialView();
			},
		});

		this.addCommand({
			id: "toggle-scroll-sync",
			name: $t("main.toggle-scroll-sync"),
			callback: () => {
				const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_MP_PREVIEW)[0];
				if (leaf && leaf.view instanceof PreviewPanel) {
					// Use the existing logic in PreviewPanel
					const button = (leaf.view as any).scrollSyncButton;
					leaf.view.toggleScrollSync(button);
				} else {
					// Fallback if view not open
					this.settings.scrollSync = !this.settings.scrollSync;
					new Notice(this.settings.scrollSync ? "滚动同步已开启" : "滚动同步已关闭");
					void this.saveSettings();
				}
			},
		});

		// 公众号 AI 助手命令（用户可自定义快捷键）
		this.addCommand({
			id: "mp-polish",
			name: "公众号：润色选中文本",
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice("请先选中要润色的文本");
					return;
				}
				const res = await this.polishContent(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});

		this.addCommand({
			id: "mp-translate-to-english",
			name: "公众号：翻译为英语",
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice("请先选中要翻译的文本");
					return;
				}
				const res = await this.translateToEnglish(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});

		this.addCommand({
			id: "mp-translate-to-chinese",
			name: "公众号：翻译为中文",
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice("请先选中要翻译的文本");
					return;
				}
				const res = await this.translateToChinese(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});

		this.addCommand({
			id: "mp-mermaid",
			name: "公众号：生成 Mermaid 图表",
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice("请先选中要转换的文本");
					return;
				}
				const res = await this.generateMermaid(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});

		this.addCommand({
			id: "mp-latex",
			name: "公众号：生成 LaTeX 公式",
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice("请先选中要转换的文本");
					return;
				}
				let res = await this.generateLaTex(content);
				if (res) {
					res = res.replace(/\\begin{document}/g, "").replace(/\\end{document}/g, "").replace(/\\\\/g, "\\");
					this.showInsertModeMenu(editor, content, res);
				}
			},
		});

		this.addCommand({
			id: "mp-summary",
			name: "公众号：生成文章摘要",
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice("请先选中要生成摘要的文本");
					return;
				}
				const res = await this.generateSummary(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});

		this.addCommand({
			id: "mp-headline",
			name: "公众号：生成爆款标题",
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection() || editor.getValue();
				if (!content || content.length < 50) {
					new Notice("文章内容太少，无法生成标题");
					return;
				}
				const res = await this.generateHeadline(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});

		this.addRibbonIcon("smart-mp-logo", "SmartMP", () => {
			void this.activateView();
		});

		this.addSettingTab(new SmartMPSettingTab(this.app, this));

		this.addEditorMenu();
		this.createSpinner();

		// -- proofread
		// this.registerEditorExtension([proofreadStateField, proofreadPlugin]);

		// this.addCommand({
		// 	id: "proofread-text",
		// 	name: "校对文本",
		// 	editorCallback: async (editor: Editor, view: MarkdownView) => {
		// 		await proofreadText(editor, view);
		// 	},
		// });
		this.messageService.registerListener('show-spinner', (msg: string) => {
			this.showSpinner(msg);
		})
		this.messageService.registerListener('hide-spinner', () => {
			this.hideSpinner();
		})
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
		if (this.editorChangeListener) {
			this.app.workspace.offref(this.editorChangeListener);
		}
		// this.spinnerEl.remove();
		// this.spinnerEl.remove();
		this.spinner.unload();
		if (this.themeHotReloader) this.themeHotReloader.stopWatching();

		// Clean up static instances
		ThemeManager.getInstance(this).onPluginUnload();
		WechatClient.onPluginUnload();
		AssetsManager.onPluginUnload();
		AiClient.onPluginUnload();
		ResourceManager.onPluginUnload();

		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof PreviewPanel) {
				leaf.detach();
			}
			if (leaf.view instanceof MaterialView) {
				leaf.detach();
			}
		});
		this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_MP_PREVIEW).forEach((leaf) => leaf.detach());
		this.app.workspace.getLeavesOfType(VIEW_TYPE_MP_MATERIAL).forEach((leaf) => leaf.detach());
	}




}
