/**
 * tab for setting
 */

import {
	App,
	DropdownComponent,
	Notice,
	PluginSettingTab,
	Setting,
	setIcon,
} from "obsidian";
import SmartMPPlugin from "src/main";
import { ThemeManager } from "src/theme/theme-manager";
import { $t } from "src/lang/i18n";
import { FolderSuggest } from "src/utils/folder-suggest";
import { WECHAT_MP_WEB_PAGE } from "./mp-web-images";
import {
	AITaskAccountInfo,
	WeChatAccountInfo,
	SmartMPSetting,
} from "./smart-mp-setting";
import { LLMProvider, LLMProviderType } from "./llm-types";
import { PreviewPanel } from "../views/previewer";

import { CryptoHelper } from "../utils/crypto-helper";
import { ThemeCloneModal } from "../modals/theme-clone-modal";
import Logger from "src/utils/logger";

interface FileSystemFileHandle {
	createWritable(): Promise<FileSystemWritableFileStream>;
	getFile(): Promise<File>;
	queryPermission(options: {
		mode: "read" | "readwrite";
	}): Promise<"granted" | "denied">;
}

interface FileSystemDirectoryHandle {
	getFileHandle(
		name: string,
		options?: { create?: boolean }
	): Promise<FileSystemFileHandle>;
	queryPermission(options: {
		mode: "read" | "readwrite";
	}): Promise<"granted" | "denied">;
}

declare global {
	interface Window {
		showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
		showSaveFilePicker(
			options?: SaveFilePickerOptions
		): Promise<FileSystemFileHandle>;
	}
}

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: FilePickerAcceptType[];
}

interface FilePickerAcceptType {
	description: string;
	accept: Record<string, string[]>;
}

export class SmartMPSettingTab extends PluginSettingTab {
	private plugin: SmartMPPlugin;
	// appIdEl: Setting;
	// appSecretEl: Setting;
	mpAccountContainer: HTMLElement;
	aiChatAccountContainer: HTMLElement;
	aiDrawAccountContainer: HTMLElement;
	mpAccountDropdown: DropdownComponent;
	aiChatAccountDropdown: DropdownComponent;
	aiDrawAccountDropdown: DropdownComponent;
	constructor(app: App, plugin: SmartMPPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	activeTab: 'general' | 'llm' = 'general';
	private expandedSections: Set<string> = new Set();
	private expandedModelSections: Set<string> = new Set();
	private initialAssistantPrompts: Record<string, string> = {};
	private isFirstDisplay = true;

	private async checkProStatus(): Promise<boolean> {
		return await this.plugin.authService.isProActive();
	}

	display(): void {
		const { containerEl } = this;

		if (this.isFirstDisplay) {
			this.initialAssistantPrompts = {};
			this.plugin.settings.customAssistantList?.forEach(a => {
				this.initialAssistantPrompts[a.id] = a.prompt;
			});
			this.expandedSections.add("🔐 授权管理 (License)");
			this.isFirstDisplay = false;
		}

		containerEl.empty();

		// Tab Navigation
		const navContainer = containerEl.createDiv({ cls: 'smart-mp-settings-nav' });

		const generalTab = navContainer.createEl('div', { text: $t("render.general-tab"), cls: 'smart-mp-nav-tab' });
		generalTab.toggleClass('is-active', this.activeTab === 'general');

		generalTab.onClickEvent(() => {
			this.activeTab = 'general';
			this.display();
		});

		const llmTab = navContainer.createEl('div', { text: $t("render.llm-tab"), cls: 'smart-mp-nav-tab' });
		llmTab.toggleClass('is-active', this.activeTab === 'llm');

		llmTab.onClickEvent(() => {
			this.activeTab = 'llm';
			this.display();
		});

		// Render Content
		if (this.activeTab === 'general') {
			this.createLicenseSettings(containerEl); // License/Pro
			this.createWeChatSettings(containerEl); // Account
			this.createGeneralSettings(containerEl); // General
			this.creatCSSStyleSetting(containerEl); // Appearance
			this.createSecuritySettings(containerEl); // Advanced
		} else {
			this.createAiChatSettings(containerEl);
			this.createAiDrawSettings(containerEl);
			this.createCustomPromptSettings(containerEl);
		}
	}
	async exportSettings() {
		try {
			const settingData = JSON.stringify(this.plugin.settings, null, 2);
			const blob = new Blob([settingData], { type: "application/json" });

			// Use File System Access API for better control
			const fileHandle = await window.showSaveFilePicker({
				suggestedName: `smart-mp-settings-${new Date()
					.toISOString()
					.slice(0, 10)}.json`,
				types: [
					{
						description: "JSON 文件",
						accept: { "application/json": [".json"] },
					},
				],
			});

			// User selected a file location
			const writable = await fileHandle.createWritable();
			await writable.write(blob);
			await writable.close();

			new Notice($t("settings.settings-exported"));
			return true;
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				// User canceled the save dialog
				return false;
			}
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice($t("settings.settings-exporting-failed") + errorMessage);
			Logger.error("SettingTab", "Operation failed", error);
			return false;
		}
	}

	importSettings() {
		try {
			// Create file input
			const input = document.createElement("input");
			input.type = "file";
			input.accept = ".json";

			input.onchange = (e) => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) return;

				const reader = new FileReader();
				reader.onload = (loadEvent) => {
					(() => {
						try {
							const content = loadEvent.target?.result as string;
							let importedData: SmartMPSetting;

							// Validate JSON structure
							try {
								importedData = JSON.parse(content);
							} catch (parseError) {
								new Notice($t("settings.invalid-json-file"));
								return;
							}

							// Validate account data structure
							const { mpAccounts, css_styles_folder } = importedData;
							if (
								mpAccounts === undefined ||
								css_styles_folder === undefined
							) {
								new Notice(
									$t("settings.invalid-wewerite-settings-file")
								);
								return;
							}
							this.plugin.settings = importedData;
							// save it
							void this.plugin.saveSettings();
							this.updateMPAccountOptions();
							this.display();
							new Notice(
								$t("settings.settings-imported-successfully")
							);
						} catch (error) {
							const errorMessage =
								error instanceof Error
									? error.message
									: String(error);
							new Notice(
								$t("settings.settings-imported-failed") +
								errorMessage
							);
							Logger.error("SettingTab", "Settings import failed", error);
						}
					})();
				};

				reader.readAsText(file);
			};

			input.click();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice($t("settings.settings-imported-error") + errorMessage);
			Logger.error("SettingTab", "Operation failed", error);
		}
	}

	creatCSSStyleSetting(container: HTMLElement) {
		const frame = this.createCollapsibleFrame(container, "🎨 外观与排版 (Appearance & Layout)");

		// new Setting(frame).setName($t("settings.custom-themes")).setHeading();

		new Setting(frame)
			.setName($t("settings.custom-themes-folder"))
			.setDesc($t("settings.the-folder-where-your-custom-themes"))
			.addSearch((cb) => {
				new FolderSuggest(this.app, cb.inputEl);
				cb.setPlaceholder($t("settings.themes-folder-path"))
					.setValue(this.plugin.settings.css_styles_folder)
					.onChange((new_folder) => {
						this.plugin.settings.css_styles_folder = new_folder;
						void this.plugin.saveThemeFolderDebounce();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("download")
					.setTooltip(
						$t("views.theme-manager.download-predefined-custom-themes")
					)
					.onClick(() => {
						void ThemeManager.getInstance(
							this.plugin
						).downloadThemes();
					});
			});
		new Setting(frame)
			.setName($t("settings.clone-theme-from-url") || "从链接克隆主题")
			.setDesc($t("settings.clone-theme-desc") || "提取微信文章样式生成新主题 (Beta)")
			.addButton((button) => {
				button
					.setButtonText($t("settings.clone-theme-btn") || "开始克隆")
					.setIcon("copy")
					.onClick(async () => {
						new ThemeCloneModal(this.app, this.plugin).open();
					});
			});





		new Setting(frame)
			.setName($t("settings.show-image-captions"))
			.setDesc($t("settings.show-image-captions-desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showImageCaptions || false)
					.onChange(async (value) => {
						this.plugin.settings.showImageCaptions = value;
						await this.plugin.saveSettings();

						// Rebuild debounce for active previewer
						const leaves = this.app.workspace.getLeavesOfType("smart-mp-article-preview");
						for (const leaf of leaves) {
							if (leaf.view instanceof PreviewPanel) {
								(leaf.view as any).renderDraft();
							}
						}
					});
			});

		new Setting(frame)
			.setName($t("settings.hr-title") || "分割线样式")
			.setDesc($t("settings.hr-desc") || "选择预览中分割线的显示方式")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("native", $t("settings.hr-style.native") || "🎨 主题/原生 (推荐)")
					.addOption("dots", $t("settings.hr-style.dots") || "· · · (点状)")
					.addOption("lines", $t("settings.hr-style.lines") || "— — — (线状)")
					.addOption("stars", $t("settings.hr-style.stars") || "* * * (星状)")
					.addOption("custom", $t("settings.hr-style.custom") || "自定义文本")
					.addOption("none", $t("settings.hr-style.none") || "隐藏")
					.setValue(this.plugin.settings.hrStyle || "native")
					.onChange(async (value) => {
						this.plugin.settings.hrStyle = value;
						await this.plugin.saveSettings();

						// Fast refresh: only update HR elements, no full re-render
						Logger.debug("SettingTab", "HR style changed to: " + value);
						setTimeout(() => {
							const leaves = this.app.workspace.getLeavesOfType("smart-mp-article-preview");
							Logger.debug("SettingTab", "Found preview leaves: " + leaves.length);
							for (const leaf of leaves) {
								Logger.debug("SettingTab", "Leaf view type: " + leaf.view.getViewType());
								if (leaf.view.getViewType() === "smart-mp-article-preview") {
									Logger.debug("SettingTab", "Calling refreshHRStyle() - fast update");
									// Use fast refresh instead of full renderDraft
									(leaf.view as any).refreshHRStyle();
								}
							}
						}, 0);

						this.display(); // 刷新以显示/隐藏自定义文本框
					});
			});

		if (this.plugin.settings.hrStyle === "custom") {
			new Setting(frame)
				.setName($t("settings.custom-hr-text") || "自定义分割线文本")
				.addText((text) =>
					text
						.setValue(this.plugin.settings.customHrText || "")
						.onChange(async (value) => {
							this.plugin.settings.customHrText = value;
							await this.plugin.saveSettings();

							// Fast refresh: only update HR elements
							Logger.debug("SettingTab", "Custom HR text changed to: " + value);
							setTimeout(() => {
								const leaves = this.app.workspace.getLeavesOfType("smart-mp-article-preview");
								Logger.debug("SettingTab", "Found preview leaves: " + leaves.length);
								for (const leaf of leaves) {
									if (leaf.view.getViewType() === "smart-mp-article-preview") {
										Logger.debug("SettingTab", "Calling refreshHRStyle() for custom text");
										(leaf.view as any).refreshHRStyle();
									}
								}
							}, 0);
						})
				);
		}

	}

	createSecuritySettings(container: HTMLElement) {
		const frame = this.createCollapsibleFrame(container, "🛡️ 高级设置 (Advanced Settings)");

		new Setting(frame)
			.setName($t("settings.enable-strict-security-mode") ?? "启用严格安全模式")
			.setDesc($t("settings.enable-strict-security-mode-desc") ?? "开启后将对 HTML 进行严格白名单过滤，防止 XSS 攻击。如果 Excalidraw 或 SVG 显示异常，请尝试关闭此选项。 (Default: ON)")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableStrictSecurityMode ?? true)
					.onChange(async (value) => {
						this.plugin.settings.enableStrictSecurityMode = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(frame)
			.setName($t("settings.use-center-token-server"))
			.setDesc($t("settings.center-token-server-desc") || "使用反代服务器获取微信 access_token，无需配置 IP 白名单。")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.useCenterToken ?? false)
					.onChange(async (value) => {
						this.plugin.settings.useCenterToken = value;
						await this.plugin.saveSettings();

						// 清除缓存的中心令牌
						if (!value) {
							const { WechatClient } = await import("src/wechat-api/wechat-client");
							WechatClient.getInstance(this.plugin).clearCenterTokenCache();
						}

						new Notice(value
							? $t("wechat-api.center-token-enabled")
							: $t("wechat-api.center-token-disabled")
						);
					});
			});
	}

	newMPAccountInfo() {
		let n = 0;
		let newName = $t("settings.new-account");
		while (true) {
			const account = this.plugin.settings.mpAccounts.find(
				(account: WeChatAccountInfo) => account.accountName === newName
			);
			if (account === undefined || account === null) {
				break;
			}
			n += 1;
			newName = $t("settings.new-account") + "-" + n;
		}

		const newAccount = {
			accountName: newName,
			appId: "",
			appSecret: "",
		};
		this.plugin.settings.mpAccounts.push(newAccount);
		// this.mpAccountDropdown.addOption(newName, newName);
		this.mpAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings.mpAccounts.forEach((account) => {
			this.mpAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.plugin.settings.selectedMPAccount = newAccount.accountName;
		this.mpAccountDropdown.setValue(newName);

		this.updateMPAccountSettings(newName, this.mpAccountContainer);
	}
	updateMPAccountSettings(
		accountName: string | undefined,
		container: HTMLElement
	) {
		if (accountName === undefined) {
			return;
		}
		const account = this.plugin.getMPAccountByName(accountName);
		if (account === undefined) {
			return;
		}
		container.empty();

		//account Name
		new Setting(container)
			.setName($t("settings.account-name"))
			.setDesc($t("settings.account-name-for-your-wechat-official"))
			.setClass("smart-mp-setting-input")
			.addText((text) =>
				text.setValue(account.accountName).onChange((value) => {
					account.accountName = value;
					this.plugin.settings.selectedMPAccount = value;
					void this.plugin.saveSettings();
					this.updateMPAccountOptions();
				})
			);
		//addId
		new Setting(container)
			.setName($t("settings.app-id"))
			.setDesc($t("settings.appid-for-your-wechat-official-account"))
			.setClass("smart-mp-setting-input")
			.addText((text) =>
				text.setValue(account.appId).onChange((value) => {
					account.appId = value;
					void this.plugin.saveSettings();
				})
			);

		//addSecret
		new Setting(container)
			.setName($t("settings.app-secret"))
			.setDesc($t("settings.app-secret-for-your-wechat-official"))
			.setClass("smart-mp-setting-input")
			.addText((text) => {
				text.setPlaceholder("请输入 AppSecret")
					.setValue(account.appSecret)
					.onChange(async (value) => {
						account.appSecret = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});
		// refresh token
		new Setting(container)
			.setName($t("settings.test-connection"))
			.setDesc($t("settings.check-if-your-account-setting-is-correct"))
			.addExtraButton((button) => {
				button
					.setTooltip($t("settings.click-to-connect-wechat-server"))
					.setIcon("plug-zap");
				button.onClick(() => {
					void (async () => {
						const success = await this.plugin.TestAccessToken(
							account.accountName
						);
						if (success) {
							new Notice(
								$t(
									"settings.successfully-connected-to-wechat-server"
								)
							);
						} else {
							new Notice(
								$t("settings.failed-to-connect-to-wechat-server")
							); // 添加错误提示
						}
					})();
				});
			});

		// delete this account
		new Setting(container)
			.setName($t("settings.delete-account"))
			.setDesc($t("settings.be-carefull-delete-account"))
			.setClass("danger-extra-button")
			.addExtraButton((button) => {
				button
					.setTooltip($t("settings.delete-account"))
					.setIcon("trash-2");
				button.onClick(() => {
					const accountToDelete =
						this.plugin.settings.selectedMPAccount;
					this.plugin.settings.mpAccounts =
						this.plugin.settings.mpAccounts.filter(
							(account) => account.accountName !== accountToDelete
						);
					const account = this.plugin.settings.mpAccounts[0];

					if (account !== undefined) {
						this.plugin.settings.selectedMPAccount =
							account.accountName;
						this.updateMPAccountOptions();
						this.updateMPAccountSettings(
							account.accountName,
							this.mpAccountContainer
						);
					} else {
						this.newMPAccountInfo();
					}
					void this.plugin.saveSettings();
				});
			});
	}
	updateMPAccountOptions() {
		this.mpAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings.mpAccounts.forEach((account) => {
			this.mpAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.mpAccountDropdown.setValue(
			this.plugin.settings.selectedMPAccount ?? ""
		);
	}

	createAiChatSettings(container: HTMLElement) {
		const frame = this.createCollapsibleFrame(container, $t("settings.text-llm"));

		// 1. Global Selection (Default Provider & Model)
		new Setting(frame)
			.setName($t("settings.llm-provider.default-provider"))
			.addDropdown(dropdown => {
				const providers = this.plugin.settings.llmProviders || [];
				providers.forEach(p => dropdown.addOption(p.id, p.name));
				dropdown.setValue(this.plugin.settings.selectedLLMProviderId || "")
					.onChange(async val => {
						this.plugin.settings.selectedLLMProviderId = val;
						// Auto-select first model of the new provider
						const p = providers.find(p => p.id === val);
						if (p && p.models.length > 0) {
							this.plugin.settings.selectedLLMModelId = p.models[0].id;
						} else {
							this.plugin.settings.selectedLLMModelId = "";
						}
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(frame)
			.setName($t("settings.llm-provider.default-model"))
			.addDropdown(dropdown => {
				const providers = this.plugin.settings.llmProviders || [];
				const currentProvider = providers.find(p => p.id === this.plugin.settings.selectedLLMProviderId);
				if (currentProvider) {
					currentProvider.models.forEach(m => dropdown.addOption(m.id, m.name));
					dropdown.setValue(this.plugin.settings.selectedLLMModelId || "")
						.onChange(async val => {
							this.plugin.settings.selectedLLMModelId = val;
							await this.plugin.saveSettings();
						});
				}
			});

		// 2. Add Provider Dropdown
		const providerHeader = new Setting(frame)
			.setName($t("settings.llm-provider.manage-providers"))
			.setHeading();

		// Add provider dropdown
		providerHeader.addDropdown(dropdown => {
			dropdown.addOption("", "➕ " + ($t("settings.llm-provider.add-provider") || "添加服务商"));
			dropdown.addOption("deepseek", "🐋 DeepSeek");
			dropdown.addOption("openai", "🤖 OpenAI");
			dropdown.addOption("ollama", "🦙 Ollama");
			dropdown.addOption("glm", "🔮 智谱 AI (GLM)");
			dropdown.addOption("siliconflow", "💎 硅基流动");
			dropdown.addOption("qwen", "☁️ 通义千问");
			dropdown.addOption("moonshot", "🌙 月之暗面");
			dropdown.addOption("gemini", "✨ Google Gemini");
			dropdown.addOption("custom", "⚙️ " + ($t("settings.llm-provider.add-custom")?.replace("+ ", "") || "自定义"));
			dropdown.setValue("");
			dropdown.onChange(val => {
				if (val) {
					this.createProviderFromPreset(val as "deepseek" | "openai" | "ollama" | "glm" | "siliconflow" | "qwen" | "moonshot" | "gemini" | "custom");
					dropdown.setValue(""); // Reset dropdown
					this.display();
				}
			});
		});

		// 3. Provider List
		this.renderProviderList(frame);
	}

	renderProviderList(container: HTMLElement) {
		const providers = this.plugin.settings.llmProviders || [];
		providers.forEach((provider, index) => {
			const wrapper = container.createDiv({ cls: 'smart-mp-provider-wrapper smart-mp-account-wrapper' });

			// Collapsible Header
			const headerEl = wrapper.createDiv({ cls: 'smart-mp-provider-header smart-mp-account-header' });

			// Left side: chevron + icon + name + model count
			const leftSide = headerEl.createDiv({ cls: 'smart-mp-provider-header-left smart-mp-account-left' });

			const chevron = leftSide.createSpan({ cls: 'smart-mp-chevron smart-mp-account-chevron' });
			chevron.textContent = '▶';

			// Provider type icon
			const iconSpan = leftSide.createSpan({ cls: 'smart-mp-provider-icon smart-mp-account-icon' });
			switch (provider.type) {
				case LLMProviderType.DeepSeek:
					iconSpan.textContent = '🐋';
					iconSpan.title = 'DeepSeek';
					break;
				case LLMProviderType.OpenAI:
					iconSpan.textContent = '🤖';
					iconSpan.title = 'OpenAI';
					break;
				case LLMProviderType.Ollama:
					iconSpan.textContent = '🦙';
					iconSpan.title = 'Ollama';
					break;
				case LLMProviderType.GLM:
					iconSpan.textContent = '🔮';
					iconSpan.title = '智谱 AI';
					break;
				case LLMProviderType.SiliconFlow:
					iconSpan.textContent = '💎';
					iconSpan.title = '硅基流动';
					break;
				case LLMProviderType.Qwen:
					iconSpan.textContent = '☁️';
					iconSpan.title = '通义千问';
					break;
				case LLMProviderType.Moonshot:
					iconSpan.textContent = '🌙';
					iconSpan.title = '月之暗面';
					break;
				case LLMProviderType.Gemini:
					iconSpan.textContent = '✨';
					iconSpan.title = 'Google Gemini';
					break;
				default:
					iconSpan.textContent = '⚙️';
					iconSpan.title = 'Custom';
			}

			const nameSpan = leftSide.createSpan({ text: provider.name, cls: 'smart-mp-account-name' });

			const countSpan = leftSide.createSpan({ text: `(${provider.models.length} Models)`, cls: 'smart-mp-account-count' });

			// Right side: buttons (sorting, duplicate, delete)
			const rightSide = headerEl.createDiv({ cls: 'smart-mp-provider-header-right smart-mp-account-right' });

			// Move Up button
			if (index > 0) {
				const upBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
				setIcon(upBtn, "arrow-up");
				upBtn.title = $t("settings.assistant.move-up");
				upBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					const list = this.plugin.settings.llmProviders!;
					[list[index - 1], list[index]] = [list[index], list[index - 1]];
					await this.plugin.saveSettings();
					this.display();
				});
			}

			// Move Down button
			if (index < providers.length - 1) {
				const downBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
				setIcon(downBtn, "arrow-down");
				downBtn.title = $t("settings.assistant.move-down");
				downBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					const list = this.plugin.settings.llmProviders!;
					[list[index + 1], list[index]] = [list[index], list[index + 1]];
					await this.plugin.saveSettings();
					this.display();
				});
			}

			// Duplicate button
			const dupBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
			setIcon(dupBtn, "copy");
			dupBtn.title = $t("settings.llm-provider.duplicate") || 'Duplicate';
			dupBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const newProvider: LLMProvider = {
					...provider,
					id: crypto.randomUUID(),
					name: provider.name + ' (Copy)',
					models: provider.models.map(m => ({ ...m }))
				};
				this.plugin.settings.llmProviders?.push(newProvider);
				this.expandedSections.add(newProvider.id);
				await this.plugin.saveSettings();
				this.display();
			});

			// Delete button
			const deleteBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
			setIcon(deleteBtn, "trash-2");
			deleteBtn.title = $t("settings.llm-provider.delete-confirm") || 'Delete Provider';
			deleteBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				const confirmMsg = $t("settings.llm-provider.delete-confirm") || `确定要删除 ${provider.name} 吗？`;
				const confirm = window.confirm(confirmMsg.replace("{{name}}", provider.name));
				if (confirm) {
					const wasSelected = this.plugin.settings.selectedLLMProviderId === provider.id;
					this.plugin.settings.llmProviders = this.plugin.settings.llmProviders?.filter(p => p.id !== provider.id);
					if (wasSelected) {
						if (this.plugin.settings.llmProviders && this.plugin.settings.llmProviders.length > 0) {
							this.plugin.settings.selectedLLMProviderId = this.plugin.settings.llmProviders[0].id;
							this.plugin.settings.selectedLLMModelId = this.plugin.settings.llmProviders[0].models[0]?.id || "";
						} else {
							this.plugin.settings.selectedLLMProviderId = "";
							this.plugin.settings.selectedLLMModelId = "";
						}
					}
					await this.plugin.saveSettings();
					this.display();
				}
			});

			// Details section (collapsible)
			const detailsEl = wrapper.createDiv({ cls: 'smart-mp-provider-details smart-mp-account-details' });

			// Check if this provider should be expanded (e.g., newly added)
			const shouldExpand = this.expandedSections.has(provider.id);
			if (!shouldExpand) {
				detailsEl.addClass('smart-mp-hidden');
			}
			if (shouldExpand) {
				chevron.addClass('smart-mp-rotate-90');
			}

			// Toggle collapse on header click
			headerEl.addEventListener('click', () => {
				const isCollapsed = detailsEl.hasClass('smart-mp-hidden');
				detailsEl.toggleClass('smart-mp-hidden', !isCollapsed);
				chevron.toggleClass('smart-mp-rotate-90', isCollapsed);
				// Track expanded state
				if (isCollapsed) {
					this.expandedSections.add(provider.id);
				} else {
					this.expandedSections.delete(provider.id);
				}
			});

			// Render details content
			this.renderProviderDetails(provider, detailsEl);
		});
	}

	renderProviderDetails(provider: LLMProvider, container: HTMLElement) {
		const unnamedProvider = $t("settings.llm-provider.unnamed-provider") || "Unnamed Provider";

		// Name
		new Setting(container)
			.setName($t("settings.llm-provider.provider-name"))
			.addText(text => {
				text.setValue(provider.name)
					.setPlaceholder(unnamedProvider)
					.onChange(async v => {
						provider.name = v || unnamedProvider;
						await this.plugin.saveSettings();
					});
				// Update header on blur
				text.inputEl.addEventListener('blur', () => {
					if (!provider.name || provider.name.trim() === '') {
						provider.name = unnamedProvider;
						text.setValue(provider.name);
						void this.plugin.saveSettings();
					}
					this.display();
				});
			});

		// Base URL
		new Setting(container)
			.setName($t("settings.llm-provider.base-url"))
			.addText(text => text.setValue(provider.baseUrl).setPlaceholder("https://api.openai.com/v1").onChange(async v => {
				provider.baseUrl = v;
				await this.plugin.saveSettings();
			}));

		// API Key with Test button
		const apiKeySetting = new Setting(container)
			.setName($t("settings.llm-provider.api-key"))
			.addText(text => {
				text.setPlaceholder("sk-...")
					.setValue(provider.apiKey)
					.onChange(async v => {
						provider.apiKey = v;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		// Test Connection button
		apiKeySetting.addButton(btn => btn
			.setButtonText("🔗 Test")
			.setTooltip("Test API connection")
			.onClick(async () => {
				if (!provider.baseUrl) {
					new Notice($t("notice.settings.base-url-required") ?? "❌ Base URL is required");
					return;
				}
				btn.setButtonText("⏳...");
				btn.setDisabled(true);
				try {
					const OpenAI = (await import("openai")).default;
					const openai = new OpenAI({
						baseURL: provider.baseUrl,
						apiKey: provider.apiKey || "dummy",
						dangerouslyAllowBrowser: true,
					});
					const models = await openai.models.list();
					new Notice(`✅ 连接成功！发现 ${models.data.length} 个模型`);
				} catch (error) {
					const err = error as Error;
					Logger.error("SettingTab", "API Test failed:", err);
					new Notice(`❌ 连接失败: ${err.message || err}`);
				} finally {
					btn.setButtonText("🔗 Test");
					btn.setDisabled(false);
				}
			}));

		// System Prompt
		new Setting(container)
			.setName($t("settings.llm-provider.system-prompt"))
			.setDesc($t("settings.llm-provider.system-prompt-desc"))
			.setClass("smart-mp-setting-textarea")
			.addTextArea(text => text
				.setPlaceholder("You are a helpful assistant...")
				.setValue(provider.systemPrompt || "")
				.onChange(async v => {
					provider.systemPrompt = v;
					await this.plugin.saveSettings();
				}));

		// Models Section (Collapsible)
		const modelsWrapper = container.createDiv({ cls: 'smart-mp-models-wrapper' });

		// Models Header (clickable to collapse)
		const modelsHeader = modelsWrapper.createDiv({ cls: 'smart-mp-models-header' });

		const modelsChevron = modelsHeader.createSpan({ cls: 'smart-mp-chevron smart-mp-account-chevron' });
		modelsChevron.textContent = '▶';

		const modelsTitle = modelsHeader.createSpan({ text: $t("settings.llm-provider.models"), cls: 'smart-mp-models-title' });

		const modelsCount = modelsHeader.createSpan({ text: `(${provider.models.length})`, cls: 'smart-mp-account-count' });

		// Add Model button
		const addModelBtn = modelsHeader.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost smart-mp-btn-auto-left' });
		setIcon(addModelBtn, "plus");
		addModelBtn.title = 'Add Model';
		addModelBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			provider.models.push({
				id: "new-model",
				name: "New Model",
				enabled: true,
				type: 'chat'
			});
			await this.plugin.saveSettings();
			this.expandedModelSections.add(provider.id);
			this.display();
		});

		// Fetch Models button
		const fetchModelsBtn = modelsHeader.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost smart-mp-btn-ml-4' });
		setIcon(fetchModelsBtn, "refresh-cw");
		fetchModelsBtn.title = $t("settings.llm-provider.fetch-models") || 'Fetch Models from API';
		fetchModelsBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			if (!provider.baseUrl) {
				new Notice($t("notice.settings.base-url-required") ?? "❌ Base URL is required");
				return;
			}
			setIcon(fetchModelsBtn, "hourglass");
			fetchModelsBtn.style.pointerEvents = 'none';
			try {
				const OpenAI = (await import("openai")).default;
				const openai = new OpenAI({
					baseURL: provider.baseUrl,
					apiKey: provider.apiKey || "dummy",
					dangerouslyAllowBrowser: true,
				});
				const response = await openai.models.list();
				const existingIds = new Set(provider.models.map(m => m.id));
				let addedCount = 0;
				for (const model of response.data) {
					if (!existingIds.has(model.id)) {
						provider.models.push({
							id: model.id,
							name: model.id,
							enabled: true,
							type: 'chat'
						});
						addedCount++;
					}
				}
				await this.plugin.saveSettings();
				new Notice(`✅ 获取成功！新增 ${addedCount} 个模型`);
				// Auto-expand models list
				this.expandedModelSections.add(provider.id);
				this.display();
			} catch (error) {
				const err = error as Error;
				Logger.error("SettingTab", "Fetch models failed:", err);
				new Notice(`❌ 获取失败: ${err.message || err}`);
			} finally {
				setIcon(fetchModelsBtn, "refresh-cw");
				fetchModelsBtn.style.pointerEvents = 'auto';
			}
		});

		// Models List (collapsible content)
		const modelsListEl = modelsWrapper.createDiv({ cls: 'smart-mp-models-list' });

		// Check expanded state
		const isModelsExpanded = this.expandedModelSections.has(provider.id);
		if (!isModelsExpanded) {
			modelsListEl.addClass('smart-mp-hidden');
		}
		if (isModelsExpanded) {
			modelsChevron.addClass('smart-mp-rotate-90');
		}

		// Toggle collapse on header click
		modelsHeader.addEventListener('click', () => {
			const isCollapsed = modelsListEl.hasClass('smart-mp-hidden');
			modelsListEl.toggleClass('smart-mp-hidden', !isCollapsed);
			modelsChevron.toggleClass('smart-mp-rotate-90', isCollapsed);

			if (isCollapsed) {
				this.expandedModelSections.add(provider.id);
			} else {
				this.expandedModelSections.delete(provider.id);
			}
		});

		// Models List Header (only if models exist)
		if (provider.models.length > 0) {
			const headerEl = modelsListEl.createDiv({ cls: 'smart-mp-model-header' });

			const idHeader = headerEl.createSpan({ text: $t("settings.llm-provider.model-id-header") || "Model ID", cls: 'smart-mp-model-header-col' });

			const nameHeader = headerEl.createSpan({ text: $t("settings.llm-provider.model-name-header") || "Display Name", cls: 'smart-mp-model-header-col' });

			// Spacer for controls (Toggle + Delete)
			const spacer = headerEl.createSpan({ cls: 'smart-mp-model-header-spacer' });
		}

		// Models List Items
		provider.models.forEach((model, idx) => {
			const modelSetting = new Setting(modelsListEl)
				.setClass("smart-mp-model-item");

			// Remove unused info element to maximize space
			modelSetting.infoEl.remove();

			modelSetting.addText(text => {
				text.setPlaceholder($t("settings.llm-provider.model-id-placeholder"))
					.setValue(model.id)
					.setDisabled(false)
					.onChange(async v => {
						model.id = v;
						await this.plugin.saveSettings();
					});
			});

			modelSetting.addText(text => {
				text.setPlaceholder($t("settings.llm-provider.model-name-placeholder"))
					.setValue(model.name)
					.onChange(async v => {
						model.name = v;
						await this.plugin.saveSettings();
					});
			});

			modelSetting.addToggle(toggle => toggle.setTooltip("Enable/Disable").setValue(model.enabled).onChange(async v => {
				model.enabled = v;
				await this.plugin.saveSettings();
			}));

			modelSetting.addExtraButton(btn => btn.setIcon("trash-2").onClick(async () => {
				const wasSelected = this.plugin.settings.selectedLLMModelId === model.id;
				provider.models.splice(idx, 1);

				// If we deleted the selected model, switch to the first available one or clear it
				if (wasSelected) {
					if (provider.models.length > 0) {
						this.plugin.settings.selectedLLMModelId = provider.models[0].id;
					} else {
						this.plugin.settings.selectedLLMModelId = "";
					}
				}

				await this.plugin.saveSettings();
				this.display();
			}));
		});
	}

	createNewProvider() {
		if (!this.plugin.settings.llmProviders) this.plugin.settings.llmProviders = [];
		this.plugin.settings.llmProviders.push({
			id: crypto.randomUUID(),
			type: LLMProviderType.Custom,
			name: "Custom Provider (自定义)",
			baseUrl: "",
			apiKey: "",
			models: [{ id: 'gpt-3.5-turbo', name: 'GPT-3.5', enabled: true, type: 'chat' }],
			enabled: true
		});
		void this.plugin.saveSettings();
	}

	createProviderFromPreset(preset: "deepseek" | "openai" | "ollama" | "glm" | "siliconflow" | "qwen" | "moonshot" | "gemini" | "custom") {
		if (!this.plugin.settings.llmProviders) this.plugin.settings.llmProviders = [];

		let provider: LLMProvider;

		if (preset === "deepseek") {
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.DeepSeek,
				name: "DeepSeek",
				baseUrl: "https://api.deepseek.com/v1",
				apiKey: "",
				models: [
					{ id: 'deepseek-chat', name: 'DeepSeek Chat', enabled: true, type: 'chat' },
					{ id: 'deepseek-coder', name: 'DeepSeek Coder', enabled: true, type: 'chat' },
					{ id: 'deepseek-reasoner', name: 'DeepSeek R1', enabled: true, type: 'chat' }
				],
				enabled: true
			};
		} else if (preset === "openai") {
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.OpenAI,
				name: "OpenAI",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "",
				models: [
					{ id: 'gpt-4o', name: 'GPT-4o', enabled: true, type: 'chat' },
					{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', enabled: true, type: 'chat' },
					{ id: 'gpt-4-turbo', name: 'GPT-4 Turbo', enabled: true, type: 'chat' }
				],
				enabled: true
			};
		} else if (preset === "ollama") {
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.Ollama,
				name: "Ollama (Local)",
				baseUrl: "http://localhost:11434/v1",
				apiKey: "",
				models: [
					{ id: 'llama3.2', name: 'Llama 3.2', enabled: true, type: 'chat' },
					{ id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B', enabled: true, type: 'chat' },
					{ id: 'qwen2.5:7b', name: 'Qwen 2.5 7B', enabled: true, type: 'chat' }
				],
				enabled: true
			};
		} else if (preset === "glm") {
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.GLM,
				name: "智谱 AI (GLM)",
				baseUrl: "https://open.bigmodel.cn/api/paas/v4",
				apiKey: "",
				models: [
					{ id: 'glm-4-plus', name: 'GLM-4 Plus', enabled: true, type: 'chat' },
					{ id: 'glm-4-flash', name: 'GLM-4 Flash', enabled: true, type: 'chat' },
					{ id: 'glm-4v-plus', name: 'GLM-4V Plus (视觉)', enabled: true, type: 'chat' }
				],
				enabled: true
			};
		} else if (preset === "siliconflow") {
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.SiliconFlow,
				name: "硅基流动 (SiliconFlow)",
				baseUrl: "https://api.siliconflow.cn/v1",
				apiKey: "",
				models: [
					{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', enabled: true, type: 'chat' },
					{ id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen2.5 72B', enabled: true, type: 'chat' },
					{ id: 'Pro/deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', enabled: true, type: 'chat' }
				],
				enabled: true
			};
		} else if (preset === "qwen") {
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.Qwen,
				name: "通义千问 (Qwen)",
				baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
				apiKey: "",
				models: [
					{ id: 'qwen-max', name: 'Qwen Max', enabled: true, type: 'chat' },
					{ id: 'qwen-plus', name: 'Qwen Plus', enabled: true, type: 'chat' },
					{ id: 'qwen-turbo', name: 'Qwen Turbo', enabled: true, type: 'chat' }
				],
				enabled: true
			};
		} else if (preset === "moonshot") {
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.Moonshot,
				name: "月之暗面 (Moonshot)",
				baseUrl: "https://api.moonshot.cn/v1",
				apiKey: "",
				models: [
					{ id: 'moonshot-v1-8k', name: 'Moonshot 8K', enabled: true, type: 'chat' },
					{ id: 'moonshot-v1-32k', name: 'Moonshot 32K', enabled: true, type: 'chat' },
					{ id: 'moonshot-v1-128k', name: 'Moonshot 128K', enabled: true, type: 'chat' }
				],
				enabled: true
			};
		} else if (preset === "gemini") {
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.Gemini,
				name: "Google Gemini",
				baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
				apiKey: "",
				models: [
					{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', enabled: true, type: 'chat' },
					{ id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', enabled: true, type: 'chat' },
					{ id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', enabled: true, type: 'chat' }
				],
				enabled: true
			};
		} else {
			// Custom
			provider = {
				id: crypto.randomUUID(),
				type: LLMProviderType.Custom,
				name: "Custom Provider (自定义)",
				baseUrl: "",
				apiKey: "",
				models: [{ id: 'model-id', name: 'Model Name', enabled: true, type: 'chat' }],
				enabled: true
			};
		}

		this.plugin.settings.llmProviders.push(provider);
		// Auto-expand the newly added provider
		this.expandedSections.add(provider.id);
		void this.plugin.saveSettings();
	}

	updateAIDrawOptions() {
		this.aiDrawAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings.drawAccounts.forEach((account) => {
			this.aiDrawAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.aiDrawAccountDropdown.setValue(
			this.plugin.settings.selectedDrawAccount ?? ""
		);
	}



	// 新增 createAiDrawAccount 方法
	newAiDrawAccount() {
		let n = this.plugin.settings.drawAccounts.length + 1;
		let newName = $t("settings.new-draw-llm-account");
		while (true) {
			const account = this.plugin.settings.drawAccounts.find(
				(account: AITaskAccountInfo) => account.accountName === newName
			);
			if (account === undefined || account === null) {
				break;
			}
			n += 1;
			newName = $t("settings.new-draw-llm-account") + "-" + n;
		}
		const newAccount = {
			accountName: newName,
			baseUrl: "",
			apiKey: "",
			taskUrl: "",
			model: "",
		};
		// Add to settings but don't save yet
		this.plugin.settings.drawAccounts.push(newAccount);
		// this.aiDrawAccountDropdown.addOption(newName, newName);
		this.aiDrawAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings.drawAccounts.forEach((account) => {
			this.aiDrawAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.aiDrawAccountDropdown.setValue(newName);
		this.plugin.settings.selectedDrawAccount = newAccount.accountName;
		this.updateAiDrawSettings(newName, this.aiDrawAccountContainer);
	}

	createAiDrawSettings(container: HTMLElement) {
		const frame = this.createCollapsibleFrame(container, $t("settings.image-llm"));
		// new Setting(frame).setName($t("settings.image-llm")).setHeading();

		const selectAIDrawSetting = new Setting(frame)
			.setName($t("settings.select-account"))
			.setDesc($t("settings.choose-the-llm-account-to-modify"));

		this.aiDrawAccountContainer = frame.createDiv({
			cls: "smart-mp-account-info-content",
		});

		selectAIDrawSetting.addDropdown((dropdown) => {
			this.aiDrawAccountDropdown = dropdown;
			dropdown.selectEl.empty();
			this.plugin.settings.drawAccounts.forEach((account) => {
				dropdown.addOption(
					account.accountName,
					account.accountName
				);
			});
			dropdown
				.setValue(this.plugin.settings.selectedDrawAccount || "")
				.onChange((value) => {
					this.plugin.settings.selectedDrawAccount = value;
					this.updateAiDrawSettings(
						value,
						this.aiDrawAccountContainer
					);
					void this.plugin.saveSettings();
				});
		})
			.addExtraButton((button) => {
				button
					.setIcon("plus")
					.setTooltip($t("settings.create-new-draw-llm-account"))
					.onClick(() => {
						this.newAiDrawAccount();
					});
			});
		this.updateAiDrawSettings(
			this.plugin.settings.selectedDrawAccount,
			this.aiDrawAccountContainer
		);

	}

	// 新增 updateAiDrawSettings 方法
	updateAiDrawSettings(
		accountName: string | undefined,
		container: HTMLElement
	) {
		const account = this.plugin.getDrawAIAccount(accountName);
		if (account === undefined) {
			this.newAiDrawAccount();
			return;
		}
		container.empty();

		new Setting(container)
			.setName($t("settings.account-name"))
			.addText((text) =>
				text.setValue(account.accountName).onChange((value) => {
					value = value.trim();
					if (value.trim() !== account.accountName) {
						account.accountName = value.trim();
						this.plugin.settings.selectedDrawAccount = value;
						void this.plugin.saveSettings();
						this.updateAIDrawOptions();
					}
				})
			);

		new Setting(container)
			.setName($t("settings.llm-access-base-url"))
			.addText((text) =>
				text.setValue(account.baseUrl).onChange((value) => {
					if (value.trim() !== account.baseUrl) {
						account.baseUrl = value;
						void this.plugin.saveSettings();
					}
				})
			);
		new Setting(container)
			.setName($t("settings.llm-task-url"))
			.addText((text) =>
				text.setValue(account.taskUrl).onChange((value) => {
					if (value.trim() !== account.taskUrl) {
						account.taskUrl = value;
						void this.plugin.saveSettings();
					}
				})
			);

		new Setting(container)
			.setName($t("settings.llm-access-api-key"))
			.addText((text) =>
				text.setValue(account.apiKey).onChange((value) => {
					if (value.trim() !== account.apiKey) {
						account.apiKey = value;
						void this.plugin.saveSettings();
					}
				})
			);

		new Setting(container)
			.setName($t("settings.llm-model-to-be-used"))
			.addText((text) =>
				text.setValue(account.model).onChange((value) => {
					if (value.trim() !== account.model) {
						account.model = value;
						void this.plugin.saveSettings();
					}
				})
			);

		new Setting(container)
			.setName($t("settings.llm-system-prompt"))
			.setDesc($t("settings.llm-system-prompt-desc"))
			.setClass("smart-mp-setting-textarea")
			.addTextArea((text) =>
				text
					.setPlaceholder("你是一个优秀的绘图提示词专家...")
					.setValue(account.systemPrompt || "")
					.onChange((value) => {
						account.systemPrompt = value;
						void this.plugin.saveSettings();
					})
			);

		new Setting(container)
			.setName($t("settings.delete-account"))
			.setClass("danger-extra-button")
			.addExtraButton((button) => {
				button.setIcon("trash-2").onClick(() => {
					const accountToDelete =
						this.plugin.settings.selectedDrawAccount;
					this.plugin.settings.drawAccounts =
						this.plugin.settings.drawAccounts.filter(
							(a) => a.accountName !== accountToDelete
						);
					const account = this.plugin.settings.drawAccounts[0];
					void this.plugin.saveSettings();
					if (account !== undefined) {
						this.plugin.settings.selectedDrawAccount =
							account.accountName;
						this.updateAIDrawOptions();
						this.updateAiDrawSettings(
							account.accountName,
							this.aiDrawAccountContainer
						);
						void this.plugin.saveSettings();
					} else {
						this.newAiDrawAccount();
					}
				});
			});
	}

	private ensureDefaultAssistants() {
		if (!this.plugin.settings.customAssistantList) {
			this.plugin.settings.customAssistantList = [];
		}

		const defaults = [
			{ id: "polish", name: $t("settings.assistant.polish") },
			{ id: "proofread", name: $t("settings.assistant.proofread") },
			{ id: "synonyms", name: $t("settings.assistant.synonyms") },
			{ id: "translate", name: $t("settings.assistant.translate") },
			{ id: "mermaid", name: $t("settings.assistant.mermaid") },
			{ id: "latex", name: $t("settings.assistant.latex") },
			{ id: "summary", name: $t("settings.assistant.summary") },
			{ id: "text-to-image", name: $t("main.text-to-image") },
		];

		defaults.forEach((def) => {
			const exists = this.plugin.settings.customAssistantList?.some(a => a.id === def.id);
			if (!exists) {
				this.plugin.settings.customAssistantList?.push({
					id: def.id,
					name: def.name,
					prompt: this.plugin.settings.customPrompts?.[def.id] || "",
					enabled: true,
					isDefault: true
				});
			}
		});
	}

	createCustomPromptSettings(container: HTMLElement) {
		this.ensureDefaultAssistants();
		const frame = this.createCollapsibleFrame(container, $t("settings.assistant-prompts-customization"), false);

		const header = new Setting(frame)
			.setName($t("settings.custom-instruction-templates"))
			.setDesc($t("settings.custom-prompt-desc"))
			.setHeading();

		header.addButton((button) => {
			button
				.setButtonText($t("settings.restore-defaults"))
				.setWarning()
				.onClick(() => {
					// 弹出确认对话框
					if (confirm($t("settings.confirm-restore-defaults"))) {
						this.plugin.settings.customPrompts = {};
						// Also reset default prompts in the list
						this.plugin.settings.customAssistantList?.forEach(a => {
							if (a.isDefault) {
								a.prompt = "";
							}
						});
						void this.plugin.saveSettings();
						this.display();
					}
				});
		});

		this.createDynamicAssistantSettings(frame);
	}

	createDynamicAssistantSettings(container: HTMLElement) {
		const managementFrame = this.createCollapsibleFrame(container, $t("settings.assistant.dynamic-assistants"), true, 'ww-sub-sections');

		const header = new Setting(managementFrame)
			.setHeading();

		header.addButton((button) => {
			button
				.setButtonText($t("settings.assistant.add-assistant"))
				.setCta()
				.onClick(() => {
					if (!this.plugin.settings.customAssistantList) {
						this.plugin.settings.customAssistantList = [];
					}
					this.plugin.settings.customAssistantList.push({
						id: Date.now().toString(),
						name: "New Assistant",
						prompt: "指令模板，使用 {{content}} 代表原文",
						enabled: true,
					});
					void this.plugin.saveSettings();
					this.display();
				});
		});

		header.addButton((button) => {
			button
				.setButtonText("一键添加公众号模板")
				.setTooltip("添加标题优化、开头钩子、互动结尾助手")
				.onClick(() => {
					if (!this.plugin.settings.customAssistantList) {
						this.plugin.settings.customAssistantList = [];
					}

					const templates = [
						{
							id: "mp_title_" + Date.now(),
							name: "公众号标题优化",
							prompt: "你是一位10w+爆款公众号文章的资深标题策划师，深谙读者心理和传播规律。\n\n## 标题技法\n1. **悬念法**：引发好奇心，让人想一探究竟\n2. **数字法**：具体数字增加可信度和吸引力\n3. **痛点法**：直击读者痛点，引发共鸣\n4. **利益法**：明确告知读者能获得什么\n5. **对比法**：前后对比，突出变化效果\n6. **故事法**：用故事元素增加代入感\n\n## 微信规范（必须遵守）\n- 字数：15-28个汉字为佳，不超过32个汉字\n- 前15字必须包含核心吸引点（避免被折叠）\n- 禁止：虚假夸大、低俗诱导、敏感政治内容\n\n## 输出要求\n- 生成5-8个风格各异的标题\n- 每行一个，纯文本，无序号无符号\n- 不要出现'标题'二字\n\n## 优秀示例\n- 月薪5000到月薪5万，我只用了这3招\n- 35岁被裁员后，我才明白这个残酷真相\n- 读完这10本书，我的认知彻底被颠覆了\n\n请为以下内容生成爆款标题：\n\n{{content}}",
							enabled: true
						},
						{
							id: "mp_hook_" + Date.now(),
							name: "公众号开头钩子",
							prompt: "你是一位资深公众号编辑，擅长撰写吸引眼球的开头钩子（Hook）。\n\n## 开头钩子类型\n1. **痛点提问**：直击读者痛点的疑问句\n2. **惊人数据**：用数据制造冲击力\n3. **故事开场**：用故事引发代入感\n4. **权威引用**：引用名人名言或研究\n5. **反转观点**：颠覆常识的观点\n6. **紧迫性**：制造时间紧迫感\n\n## 输出要求\n- 生成3个不同的开头钩子\n- 每个钩子不超过50字\n- 直接输出，不添加序号\n- 语言生动有力，有冲击力\n\n请为以下内容生成开头钩子：\n\n{{content}}",
							enabled: true
						},
						{
							id: "mp_end_" + Date.now(),
							name: "公众号互动结尾",
							prompt: "你是一位擅长提升用户互动的公众号编辑，请为文章撰写引导互动的结尾。\n\n## 互动结尾类型\n1. **提问互动**：提出与文章相关的问题\n2. **行动召唤**：引导读者采取行动\n3. **福利诱导**：承诺福利引导关注/点赞\n4. **话题讨论**：发起话题讨论\n5. **个人故事**：邀请读者分享经历\n\n## 输出要求\n- 生成3个互动结尾\n- 每个结尾包含明确的行动指引\n- 语气亲切自然，像朋友对话\n- 直接输出，不添加序号\n\n请为以下内容生成互动结尾：\n\n{{content}}",
							enabled: true
						}
					];

					// Check for duplicates by name
					let addedCount = 0;
					templates.forEach(tpl => {
						const exists = this.plugin.settings.customAssistantList?.some(a => a.name === tpl.name);
						if (!exists) {
							this.plugin.settings.customAssistantList?.push(tpl);
							addedCount++;
						}
					});

					if (addedCount > 0) {
						void this.plugin.saveSettings();
						this.display();
						new Notice(`成功添加 ${addedCount} 个公众号助手模板`);
					} else {
						new Notice($t("notice.settings.template-exists") ?? "模板已存在，无需重复添加");
					}
				});
		});

		if (this.plugin.settings.customAssistantList) {
			this.plugin.settings.customAssistantList.forEach((assistant, index) => {
				const assistantDetails = managementFrame.createEl("details", { cls: "smart-mp-custom-assistant-item smart-mp-setting-frame" });

				assistantDetails.setAttribute('name', 'ww-assistant-group');
				if (this.expandedSections.has(assistant.id)) {
					assistantDetails.setAttribute('open', '');
				}
				assistantDetails.ontoggle = () => {
					if (assistantDetails.open) {
						this.expandedSections.add(assistant.id);
					} else {
						this.expandedSections.delete(assistant.id);
					}
				};

				const summary = assistantDetails.createEl("summary");

				const titleSpan = summary.createEl("span", { text: assistant.name, cls: 'smart-mp-assistant-title' });
				if (assistant.enabled === false) {
					titleSpan.addClass('is-disabled');
				}

				const controls = summary.createDiv({ cls: 'smart-mp-assistant-controls' });

				// Stop propagation so clicking buttons doesn't toggle details
				controls.onClickEvent((e) => e.stopPropagation());

				// Enable Toggle
				const toggle = new Setting(controls)
					.setClass('smart-mp-setting-no-border')
					.addToggle((t) => t
						.setValue(assistant.enabled !== false)
						.setTooltip($t("settings.assistant.enable-assistant"))
						.onChange(async (val) => {
							assistant.enabled = val;
							titleSpan.toggleClass('is-disabled', !val);
							await this.plugin.saveSettings();
						})
					);
				toggle.infoEl.remove();

				// Sorting buttons
				new Setting(controls)
					.setClass('smart-mp-setting-borderless')
					.addExtraButton(b => {
						b.setIcon("arrow-up")
							.setTooltip($t("settings.assistant.move-up"))
							.onClick(() => {
								const list = this.plugin.settings.customAssistantList!;
								[list[index - 1], list[index]] = [list[index], list[index - 1]];
								void this.plugin.saveSettings();
								this.display();
							});
						if (index === 0) b.extraSettingsEl.style.visibility = "hidden";
					});

				new Setting(controls)
					.setClass('smart-mp-setting-borderless')
					.addExtraButton(b => {
						b.setIcon("arrow-down")
							.setTooltip($t("settings.assistant.move-down"))
							.onClick(() => {
								const list = this.plugin.settings.customAssistantList!;
								[list[index + 1], list[index]] = [list[index], list[index + 1]];
								void this.plugin.saveSettings();
								this.display();
							});
						if (index === (this.plugin.settings.customAssistantList?.length || 0) - 1) b.extraSettingsEl.style.visibility = "hidden";
					});

				// Delete Button
				new Setting(controls)
					.setClass('smart-mp-setting-borderless')
					.addExtraButton(b => b
						.setIcon("trash-2")
						.setTooltip($t("settings.assistant.delete-assistant"))
						.onClick(() => {
							this.plugin.settings.customAssistantList?.splice(index, 1);
							void this.plugin.saveSettings();
							this.display();
						})
					);

				// Content
				const content = assistantDetails.createDiv({ cls: 'smart-mp-assistant-content' });

				new Setting(content)
					.setName($t("settings.assistant.assistant-name"))
					.setDesc($t("settings.assistant.assistant-name-desc"))
					.addText((text) =>
						text.setValue(assistant.name).onChange((value) => {
							assistant.name = value;
							titleSpan.setText(value);
							void this.plugin.saveSettings();
						})
					);

				new Setting(content)
					.setName($t("settings.assistant.assistant-prompt"))
					.setDesc($t("settings.assistant.assistant-prompt-desc"))
					.setClass("smart-mp-setting-textarea")
					.addTextArea((text) =>
						text
							.setValue(assistant.prompt)
							.onChange((value) => {
								assistant.prompt = value;
								if (assistant.isDefault) {
									if (!this.plugin.settings.customPrompts) this.plugin.settings.customPrompts = {};
									this.plugin.settings.customPrompts[assistant.id] = value;
								}
								void this.plugin.saveSettings();
							})
					);

				// Per-Assistant Model Selection
				const modelSectionHeader = new Setting(content)
					.setName($t("settings.llm-provider.default-provider") + " / " + $t("settings.llm-provider.default-model"))
					.setDesc($t("settings.ai-chat-section.model-select-desc"));

				const providers = this.plugin.settings.llmProviders || [];

				// Provider dropdown
				modelSectionHeader.addDropdown(dropdown => {
					dropdown.addOption("", "-- 使用全局默认 --");
					providers.forEach(p => dropdown.addOption(p.id, p.name));
					dropdown.setValue(assistant.providerId || "");
					dropdown.onChange(async (val) => {
						assistant.providerId = val || undefined;
						// Auto-select first model of new provider
						if (val) {
							const selectedProvider = providers.find(p => p.id === val);
							if (selectedProvider && selectedProvider.models.length > 0) {
								assistant.modelId = selectedProvider.models[0].id;
							} else {
								assistant.modelId = undefined;
							}
						} else {
							assistant.modelId = undefined;
						}
						await this.plugin.saveSettings();
						this.display();
					});
				});

				// Model dropdown (only if custom provider is selected)
				if (assistant.providerId) {
					const selectedProvider = providers.find(p => p.id === assistant.providerId);
					if (selectedProvider) {
						modelSectionHeader.addDropdown(dropdown => {
							selectedProvider.models.forEach(m => dropdown.addOption(m.id, m.name));
							dropdown.setValue(assistant.modelId || "");
							dropdown.onChange(async (val) => {
								assistant.modelId = val || undefined;
								await this.plugin.saveSettings();
							});
						});
					}
				}

				// Restore Button
				new Setting(content)
					.addButton((button) => {
						const label = assistant.isDefault ? $t("settings.assistant.restore-default") : $t("settings.assistant.restore-last");
						button.setButtonText(label)
							.onClick(async () => {
								if (assistant.isDefault) {
									assistant.prompt = "";
									if (this.plugin.settings.customPrompts) {
										delete this.plugin.settings.customPrompts[assistant.id];
									}
								} else {
									assistant.prompt = this.initialAssistantPrompts[assistant.id] || "";
								}
								await this.plugin.saveSettings();
								this.display();
							});
					});
			});
		}
	}

	private addPromptSetting(container: HTMLElement, name: string, key: string, placeholder: string) {
		new Setting(container)
			.setName(name)
			.setClass("smart-mp-setting-textarea")
			.addTextArea((text) =>
				text
					.setPlaceholder(placeholder)
					.setValue(this.plugin.settings.customPrompts?.[key] || "")
					.onChange((value) => {
						if (!this.plugin.settings.customPrompts) {
							this.plugin.settings.customPrompts = {};
						}
						this.plugin.settings.customPrompts[key] = value.trim();
						void this.plugin.saveSettings();
					})
			);
	}

	createCollapsibleFrame(container: HTMLElement, title: string, isOpen: boolean = false, groupName: string = 'ww-main-sections'): HTMLElement {
		const details = container.createEl('details', { cls: "smart-mp-setting-frame" });
		if (groupName) details.setAttribute('name', groupName);
		if (isOpen || this.expandedSections.has(title)) {
			details.setAttribute('open', '');
		}

		details.ontoggle = () => {
			if (details.open) {
				this.expandedSections.add(title);
			} else {
				this.expandedSections.delete(title);
			}
		};

		const summary = details.createEl('summary', { cls: 'smart-mp-frame-summary' });
		summary.setText(title);

		// Container for the content
		const content = details.createDiv();
		return content;
	}

	createGeneralSettings(container: HTMLElement) {
		const frame = this.createCollapsibleFrame(container, "⚙️ 通用与交互 (General & Interaction)");

		new Setting(frame)
			.setName($t("settings.general-section.enable-floating-toolbar"))
			.setDesc($t("settings.general-section.enable-floating-toolbar-desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableFloatingToolbar ?? true)
					.onChange(async (value) => {
						this.plugin.settings.enableFloatingToolbar = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(frame)
			.setName($t("settings.real-time-render"))
			.setDesc($t("settings.enable-real-time-rendering"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.realTimeRender)
					.onChange((value) => {
						this.plugin.settings.realTimeRender = value;
						void this.plugin.saveSettings();
					});
			});

		new Setting(frame)
			.setName($t("settings.real-time-render-delay"))
			.setDesc($t("settings.real-time-render-delay-desc"))
			.addSlider((slider) => {
				slider
					.setLimits(300, 2000, 100)
					.setValue(this.plugin.settings.realTimeRenderDelay || 500)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.realTimeRenderDelay = value;
						await this.plugin.saveSettings();

						// Rebuild debounce for active previewer
						const leaves = this.app.workspace.getLeavesOfType("smart-mp-article-preview");
						for (const leaf of leaves) {
							if (leaf.view instanceof PreviewPanel) {
								(leaf.view as any).rebuildDebounce();
							}
						}
					});
			});

		// ============== 滚动同步增强设置 ==============
		new Setting(frame)
			.setName($t("settings.scroll-sync-section.sync-mode"))
			.setDesc($t("settings.scroll-sync-section.sync-mode-desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("precise", $t("settings.scroll-sync-section.sync-mode-options.precise"))
					.addOption("proportional", $t("settings.scroll-sync-section.sync-mode-options.proportional"))
					.setValue(this.plugin.settings.scrollSyncMode || "precise")
					.onChange(async (value: "precise" | "proportional") => {
						this.plugin.settings.scrollSyncMode = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(frame)
			.setName($t("settings.scroll-sync-section.precision"))
			.setDesc($t("settings.scroll-sync-section.precision-desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("precise", "🎯 精确模式 (2px)")
					.addOption("balanced", "⚖️ 平衡模式 (5px) [推荐]")
					.addOption("performance", "🚀 性能模式 (15px)")
					.setValue(this.plugin.settings.scrollSyncPrecision || "balanced")
					.onChange(async (value: 'precise' | 'balanced' | 'performance') => {
						this.plugin.settings.scrollSyncPrecision = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(frame)
			.setName($t("settings.scroll-sync-section.highlight-style"))
			.setDesc($t("settings.scroll-sync-section.highlight-style-desc"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("gold", "🌟 金色 (螺旋金)")
					.addOption("blue", "💙 蓝色")
					.addOption("green", "💚 绿色")
					.addOption("purple", "💜 紫色")
					.addOption("minimal", "🌙 极简 (透明)")
					.setValue(this.plugin.settings.scrollHighlightPreset || "gold")
					.onChange(async (value: 'gold' | 'blue' | 'green' | 'purple' | 'minimal') => {
						this.plugin.settings.scrollHighlightPreset = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(frame)
			.setName($t("settings.scroll-sync-section.line-level-sync"))
			.setDesc($t("settings.scroll-sync-section.line-level-sync-desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableCodeBlockLineMapping ?? false)
					.onChange(async (value) => {
						this.plugin.settings.enableCodeBlockLineMapping = value;
						await this.plugin.saveSettings();
					});
			});
	}

	createLicenseSettings(container: HTMLElement) {
		const frame = this.createCollapsibleFrame(container, "🔐 授权管理 (License)");

		// Status Banner
		const statusBanner = frame.createDiv({ cls: 'smart-mp-license-status smart-mp-license-banner' });

		const updateBanner = async () => {
			const isPro = await this.checkProStatus();
			statusBanner.empty();
			statusBanner.removeClass('is-pro', 'is-free');

			if (isPro) {
				statusBanner.addClass('is-pro');

				const badge = statusBanner.createSpan({ cls: 'smart-mp-license-badge is-pro' });
				badge.textContent = '✓ Pro 已激活';

				const info = statusBanner.createSpan({ cls: 'smart-mp-license-info' });
				info.textContent = '已解锁全部功能，支持中心令牌中转服务';
			} else {
				statusBanner.addClass('is-free');

				const badge = statusBanner.createSpan({ cls: 'smart-mp-license-badge is-free' });
				badge.textContent = '免费版';

				const info = statusBanner.createSpan({ cls: 'smart-mp-license-info' });
				info.textContent = '微信 API 功能受限（需配置 IP 白名单）';
			}
		};

		// 异步获取并渲染状态
		void updateBanner();

		// Current Device Info
		new Setting(frame)
			.setName($t("settings.license.current-device"))
			.setDesc($t("settings.license.current-device-desc"))
			.addText(text => {
				text.inputEl.style.width = "200px";
				text.setDisabled(true).setValue(this.plugin.authService.getDeviceId());
			})
			.addButton((btn) => {
				btn.setButtonText("解除绑定")
					.setWarning()
					.onClick(async () => {
						const isPro = await this.checkProStatus();
						if (!isPro) {
							new Notice($t("notice.auth.not-bound") ?? "当前设备并未绑定激活码");
							return;
						}
						const unbinded = await this.plugin.authService.unbindDevice();
						if (unbinded) {
							this.display(); // 刷新 UI
						}
					});
			});

		// Activation Input
		let isPasswordVisible = false;
		// 为了实现边打边隐藏，我们需要一个真实的激活码缓冲区
		let realPassword = this.plugin.settings.proPassword || "";

		const passwordSetting = new Setting(frame)
			.setName($t("settings.license.activation-code"))
			.setDesc($t("settings.license.activation-code-desc"))
			.addText((text) => {
				text.inputEl.addClass('smart-mp-input-w200');
				// 强制类型为 text，因为我们将手动控制掩码
				text.inputEl.type = "text";

				// 初始渲染
				if (realPassword) {
					text.setValue("•".repeat(realPassword.length));
				} else {
					text.setPlaceholder("请输入激活码");
				}

				// 使用原生 input 事件以便我们精准获取光标并拦截
				let maskTimeout: number | null = null;
				text.inputEl.addEventListener('input', (e) => {
					const inputEl = e.target as HTMLInputElement;
					const value = inputEl.value;
					const cursorPosition = inputEl.selectionStart || 0;

					if (isPasswordVisible) {
						// 明文模式下直接保存
						realPassword = value;
						this.plugin.settings.proPassword = realPassword;
						return;
					}

					// 重新推算真实的 password
					// 假设用户只在末尾追加，或者在中间输入、删除。
					// 简单起见，我们对 input 框中所有非 "•" 的字符当作新输入的明文字符。
					let newRealPassword = "";
					let newDisplayedValue = "";

					let realIndex = 0;
					// 双指针：遍历当前显示的 value，并与之前的 realPassword 做对照
					for (let i = 0; i < value.length; i++) {
						const char = value[i];
						if (char === "•") {
							// 这是一个未被修改的老字符
							if (realIndex < realPassword.length) {
								newRealPassword += realPassword[realIndex];
								newDisplayedValue += "•";
								realIndex++;
							}
						} else {
							// 这是一个新输入的明文字符
							newRealPassword += char;
							newDisplayedValue += char; // 暂时保持明文
						}
					}

					realPassword = newRealPassword;
					this.plugin.settings.proPassword = realPassword;
					inputEl.value = newDisplayedValue;

					// 恢复光标位置
					inputEl.setSelectionRange(cursorPosition, cursorPosition);

					// 设置一个定时器，在一段时间后把刚刚的明文字符也变成圆点
					if (maskTimeout) window.clearTimeout(maskTimeout);
					maskTimeout = window.setTimeout(() => {
						if (!isPasswordVisible) {
							const currentCursor = inputEl.selectionStart;
							inputEl.value = "•".repeat(realPassword.length);
							if (currentCursor !== null) {
								inputEl.setSelectionRange(currentCursor, currentCursor);
							}
						}
					}, 800); // 800ms 后变为掩码
				});

				// 在输入框右侧附加“小眼睛”图标
				const eyeIcon = document.createElement('span');
				eyeIcon.addClass('smart-mp-eye-icon');
				eyeIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
				eyeIcon.style.cursor = 'pointer';
				eyeIcon.style.marginLeft = '8px';
				eyeIcon.style.opacity = '0.5';
				eyeIcon.onclick = () => {
					isPasswordVisible = !isPasswordVisible;
					if (isPasswordVisible) {
						text.inputEl.value = realPassword; // 恢复明文
						eyeIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.579 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;
						eyeIcon.style.opacity = '1';
					} else {
						text.inputEl.value = "•".repeat(realPassword.length); // 恢复掩码
						eyeIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
						eyeIcon.style.opacity = '0.5';
					}
				};
				text.inputEl.insertAdjacentElement('afterend', eyeIcon);
			})
			.addButton((btn) => {
				btn.setButtonText("联网验证")
					.setCta()
					.onClick(async () => {
						btn.setButtonText("验证中...");
						btn.setDisabled(true);
						const password = this.plugin.settings.proPassword;
						if (!password) {
							new Notice($t("notice.settings.license-key-required") ?? "⚠️ 激活码不能为空");
							btn.setButtonText("联网验证").setDisabled(false);
							return;
						}
						const isVerified = await this.plugin.authService.verifyLicense(password);
						if (isVerified) {
							this.display(); // Refresh to show new status
						} else {
							btn.setButtonText("联网验证").setDisabled(false);
						}
					});
			});

		// Pro Benefits Info
		const benefitsEl = frame.createDiv({ cls: 'smart-mp-benefits' });
		benefitsEl.innerHTML = `
			<div style="font-weight: 600; margin-bottom: 8px;">SmartMP Pro 权益 (¥69 永久买断)：</div>
			<div style="color: var(--text-muted); line-height: 1.8;">
				✨ <b>中心令牌服务器</b>：无需公网 IP 即可同步<br>
				🛠️ <b>优先支持</b>：一对一解决使用问题<br>
				📦 <b>永久更新</b>：包含所有未来本地新功能<br>
				🎁 <b>多端漫游</b>：支持最多3台个人设备自动漫游验证
			</div>
			<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--background-modifier-border); color: var(--text-accent);">
			<a href="https://github.com/hwdemtv/smart-mp#pro-features" style="text-decoration: none;">
				🎫 获取激活码 / Get Activation Code
			</a>
		</div>
	`;
	}
	createWeChatSettings(container: HTMLElement) {
		// Use collapsible frame
		const mpFrame = this.createCollapsibleFrame(container, "📱 账号配置 (Account Configuration)");

		// Remove the old heading since it's now in the summary
		// new Setting(mpFrame).setName($t("settings.wechat-account")).setHeading();

		// mpFrame.createEl("hr");

		const ip = new Setting(mpFrame)
			.setName(
				$t("settings.public-ip-address") +
				": " +
				// this.plugin.settings.ipAddress
				$t("settings.fetching")
			)
			.setHeading()
			.setDesc($t("settings.you-should-add-this-ip-to-ip-whitelist-o"));

		void this.plugin
			.updateIpAddress()
			.then((ipAddress) => {
				Logger.debug("SettingTab", "ipAddress: " + ipAddress);
				ip.setName(
					$t("settings.public-ip-address") + ": " + ipAddress
				);
			})
			.catch(() => {
				ip.setName(
					$t("settings.public-ip-address") +
					": " +
					$t("settings.no-ip-address")
				);
			});

		ip.addExtraButton((button) => {
			button
				.setIcon("clipboard-copy")
				.setTooltip($t("settings.copy-ip-to-clipboard"))
				.onClick(() => {
					void (async () => {
						await navigator.clipboard.writeText(
							this.plugin.settings.ipAddress ?? ""
						);
						new Notice($t("settings.ip-copied-to-clipboard"));
					})();
				});
		});

		// Removed Advanced Settings from here

		// mpFrame.createEl("hr");

		new Setting(mpFrame).setName($t("settings.account-info")).setHeading();

		const div = mpFrame.createDiv({
			cls: "smart-mp-web-image elevated-shadow",
		});
		const link = div.createEl("a", {
			cls: "smart-mp-web-image-link",
			href: "https://developers.weixin.qq.com/platform",
		});
		const img = link.createEl("img", { cls: "smart-mp-web-image-img" });
		img.src = WECHAT_MP_WEB_PAGE;
		img.alt = "smart-mp-web-page";
		// div.innerHTML = `<a href="https://developers.weixin.qq.com/platform"><img src="${WECHAT_MP_WEB_PAGE}" alt="smart-mp-web-page"></a> </p>`

		const selectAccountSetting = new Setting(mpFrame)
			.setName($t("settings.select-account"))
			.setHeading()
			.setDesc($t("settings.choose-the-account-to-modify"));

		const frame = mpFrame.createDiv({ cls: "smart-mp-account-info-div" });
		const title = frame.createEl("div", {
			cls: "smart-mp-account-info-title",
			text: $t("settings.account.info"),
		});

		// new Setting(mpFrame).setName($t("settings.draft-previewer-wechat-id"));
		new Setting(mpFrame)
			.setName($t("settings.draft-previewer-wechat-id"))
			.setDesc($t("settings.draft-only-visible-for-the-wechat-user-o"))
			.addText((text) =>
				text
					.setValue(this.plugin.settings.previewer_wxname || "")
					.onChange((value) => {
						this.plugin.settings.previewer_wxname = value;
						void this.plugin.saveSettings();
					})
			);

		this.mpAccountContainer = frame.createDiv({
			cls: "smart-mp-account-info-content",
		});

		selectAccountSetting
			.addDropdown((dropdown) => {
				dropdown.selectEl.empty();
				this.mpAccountDropdown = dropdown;
				if (this.plugin.settings.mpAccounts.length == 0) {
					this.newMPAccountInfo();
				} else {
					this.plugin.settings.mpAccounts.forEach((account) => {
						dropdown.addOption(
							account.accountName,
							account.accountName
						);
					});
				}
				dropdown
					.setValue(
						this.plugin.settings.selectedMPAccount ??
						$t("settings.select-account")
					)
					.onChange((value) => {
						this.plugin.settings.selectedMPAccount = value;
						this.updateMPAccountSettings(
							this.plugin.settings.selectedMPAccount,
							this.mpAccountContainer
						);
						void this.plugin.saveSettings();
						this.plugin.messageService.sendMessage(
							"wechat-account-changed",
							value
						);
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("plus")
					.setTooltip($t("settings.create-new-account"))
					.onClick(() => {
						this.newMPAccountInfo();
					});
			});
		this.updateMPAccountSettings(
			this.mpAccountDropdown.getValue(),
			this.mpAccountContainer
		);

		new Setting(mpFrame)
			.setName($t("settings.import-export-smart-mp-account"))
			.setHeading()
			.setDesc($t("settings.import-or-export-your-account-info-for-b"))
			.setClass("smart-mp-import-export-config")
			.addExtraButton((button) => {
				button
					.setIcon("upload")
					.setTooltip($t("settings.import-account-info"))
					.onClick(() => {
						this.importSettings();
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon("download")
					.setTooltip($t("settings.export-account-info"))
					.onClick(() => {
						void this.exportSettings();
					});
			});
	}
}
