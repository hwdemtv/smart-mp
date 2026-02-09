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
	AIChatAccountInfo,
	AITaskAccountInfo,
	WeChatAccountInfo,
	SmartMPSetting,
} from "./smart-mp-setting";
import { LLMProvider, LLMProviderType, LLMModel } from "./llm-types";
import { PreviewPanel, VIEW_TYPE_SMART_MP_PREVIEW } from "../views/previewer";

import { CryptoHelper } from "../utils/crypto-helper";
import { ThemeCloneModal } from "../modals/theme-clone-modal";

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
		const PRO_SECRET_HASH = "d33df98683fde354f929554ea349ed13505d9ad04aeb67ec2bed7b831e9d47df";
		const userPasswordHash = await CryptoHelper.sha256(this.plugin.settings.proPassword || "");
		return userPasswordHash === PRO_SECRET_HASH;
	}

	display(): void {
		const { containerEl } = this;

		if (this.isFirstDisplay) {
			this.initialAssistantPrompts = {};
			this.plugin.settings.customAssistantList?.forEach(a => {
				this.initialAssistantPrompts[a.id] = a.prompt;
			});
			this.isFirstDisplay = false;
		}

		containerEl.empty();

		// Tab Navigation
		const navContainer = containerEl.createDiv({ cls: 'smart-mp-settings-nav' });
		navContainer.style.display = 'flex';
		navContainer.style.marginBottom = '20px';
		navContainer.style.borderBottom = '1px solid var(--background-modifier-border)';
		navContainer.style.paddingBottom = '10px';
		navContainer.style.gap = '20px';

		const generalTab = navContainer.createEl('div', { text: $t("render.general-tab"), cls: 'smart-mp-nav-tab' });
		generalTab.style.cursor = 'pointer';
		generalTab.style.fontWeight = this.activeTab === 'general' ? 'bold' : 'normal';
		generalTab.style.color = this.activeTab === 'general' ? 'var(--text-normal)' : 'var(--text-muted)';
		generalTab.style.borderBottom = this.activeTab === 'general' ? '2px solid var(--interactive-accent)' : 'none';

		generalTab.onClickEvent(() => {
			this.activeTab = 'general';
			this.display();
		});

		const llmTab = navContainer.createEl('div', { text: $t("render.llm-tab"), cls: 'smart-mp-nav-tab' });
		llmTab.style.cursor = 'pointer';
		llmTab.style.fontWeight = this.activeTab === 'llm' ? 'bold' : 'normal';
		llmTab.style.color = this.activeTab === 'llm' ? 'var(--text-normal)' : 'var(--text-muted)';
		llmTab.style.borderBottom = this.activeTab === 'llm' ? '2px solid var(--interactive-accent)' : 'none';

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
			console.error(error);
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
							console.error(error);
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
			console.error(error);
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
						if (await this.checkProStatus()) {
							new ThemeCloneModal(this.app, this.plugin).open();
						} else {
							new Notice($t("settings.pro-feature-alert") || "这是 Pro 专属功能。请激活 Pro 版以使用主题克隆。");
						}
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
			.setDesc(($t("settings.if-your-device-cannot-get-static-pubic-i") || "") + " (功能已暂时关闭，请待自建服务器后开启)")
			.addToggle((toggle) => {
				toggle
					.setValue(false) // Force false in UI
					.setDisabled(true) // Disable interaction
					.onChange((value) => {
						this.plugin.settings.useCenterToken = value;
						void this.plugin.saveSettings();
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
			const wrapper = container.createDiv({ cls: 'smart-mp-provider-wrapper' });
			wrapper.style.border = '1px solid var(--background-modifier-border)';
			wrapper.style.marginBottom = '10px';
			wrapper.style.borderRadius = '5px';
			wrapper.style.overflow = 'hidden';

			// Collapsible Header
			const headerEl = wrapper.createDiv({ cls: 'smart-mp-provider-header' });
			headerEl.style.display = 'flex';
			headerEl.style.alignItems = 'center';
			headerEl.style.justifyContent = 'space-between';
			headerEl.style.padding = '10px';
			headerEl.style.cursor = 'pointer';
			headerEl.style.backgroundColor = 'var(--background-secondary)';

			// Left side: chevron + icon + name + model count
			const leftSide = headerEl.createDiv({ cls: 'smart-mp-provider-header-left' });
			leftSide.style.display = 'flex';
			leftSide.style.alignItems = 'center';
			leftSide.style.gap = '8px';

			const chevron = leftSide.createSpan({ cls: 'smart-mp-chevron' });
			chevron.textContent = '▶';
			chevron.style.transition = 'transform 0.2s';
			chevron.style.fontSize = '10px';

			// Provider type icon
			const iconSpan = leftSide.createSpan({ cls: 'smart-mp-provider-icon' });
			iconSpan.style.fontSize = '16px';
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

			const nameSpan = leftSide.createSpan({ text: provider.name });
			nameSpan.style.fontWeight = '500';

			const countSpan = leftSide.createSpan({ text: `(${provider.models.length} Models)` });
			countSpan.style.color = 'var(--text-muted)';
			countSpan.style.fontSize = '12px';

			// Right side: buttons (sorting, duplicate, delete)
			const rightSide = headerEl.createDiv({ cls: 'smart-mp-provider-header-right' });
			rightSide.style.display = 'flex';
			rightSide.style.gap = '4px';
			rightSide.style.alignItems = 'center';

			// Move Up button
			if (index > 0) {
				const upBtn = rightSide.createEl('button', { cls: 'clickable-icon' });
				setIcon(upBtn, "arrow-up");
				upBtn.title = $t("settings.assistant.move-up");
				upBtn.style.background = 'none';
				upBtn.style.border = 'none';
				upBtn.style.cursor = 'pointer';
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
				const downBtn = rightSide.createEl('button', { cls: 'clickable-icon' });
				setIcon(downBtn, "arrow-down");
				downBtn.title = $t("settings.assistant.move-down");
				downBtn.style.background = 'none';
				downBtn.style.border = 'none';
				downBtn.style.cursor = 'pointer';
				downBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					const list = this.plugin.settings.llmProviders!;
					[list[index + 1], list[index]] = [list[index], list[index + 1]];
					await this.plugin.saveSettings();
					this.display();
				});
			}

			// Duplicate button
			const dupBtn = rightSide.createEl('button', { cls: 'clickable-icon' });
			setIcon(dupBtn, "copy");
			dupBtn.title = $t("settings.llm-provider.duplicate") || 'Duplicate';
			dupBtn.style.background = 'none';
			dupBtn.style.border = 'none';
			dupBtn.style.cursor = 'pointer';
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
			const deleteBtn = rightSide.createEl('button', { cls: 'clickable-icon' });
			setIcon(deleteBtn, "trash-2");
			deleteBtn.title = $t("settings.llm-provider.delete-confirm") || 'Delete Provider';
			deleteBtn.style.background = 'none';
			deleteBtn.style.border = 'none';
			deleteBtn.style.cursor = 'pointer';
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
			const detailsEl = wrapper.createDiv({ cls: 'smart-mp-provider-details' });
			detailsEl.style.padding = '10px';

			// Check if this provider should be expanded (e.g., newly added)
			const shouldExpand = this.expandedSections.has(provider.id);
			detailsEl.style.display = shouldExpand ? 'block' : 'none';
			chevron.style.transform = shouldExpand ? 'rotate(90deg)' : 'rotate(0deg)';

			// Toggle collapse on header click
			headerEl.addEventListener('click', () => {
				const isCollapsed = detailsEl.style.display === 'none';
				detailsEl.style.display = isCollapsed ? 'block' : 'none';
				chevron.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
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
					new Notice("❌ Base URL is required");
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
				} catch (error: any) {
					console.error("API Test failed:", error);
					new Notice(`❌ 连接失败: ${error.message || error}`);
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
		modelsHeader.style.display = 'flex';
		modelsHeader.style.alignItems = 'center';
		modelsHeader.style.gap = '8px';
		modelsHeader.style.cursor = 'pointer';
		modelsHeader.style.padding = '5px 0';

		const modelsChevron = modelsHeader.createSpan({ cls: 'smart-mp-chevron' });
		modelsChevron.textContent = '▶';
		modelsChevron.style.transition = 'transform 0.2s';
		modelsChevron.style.fontSize = '10px';

		const modelsTitle = modelsHeader.createSpan({ text: $t("settings.llm-provider.models") });
		modelsTitle.style.fontWeight = '500';

		const modelsCount = modelsHeader.createSpan({ text: `(${provider.models.length})` });
		modelsCount.style.color = 'var(--text-muted)';
		modelsCount.style.fontSize = '12px';

		// Add Model button
		const addModelBtn = modelsHeader.createEl('button', { cls: 'clickable-icon' });
		setIcon(addModelBtn, "plus");
		addModelBtn.title = 'Add Model';
		addModelBtn.style.marginLeft = 'auto';
		addModelBtn.style.background = 'none';
		addModelBtn.style.border = 'none';
		addModelBtn.style.cursor = 'pointer';
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
		const fetchModelsBtn = modelsHeader.createEl('button', { cls: 'clickable-icon' });
		setIcon(fetchModelsBtn, "refresh-cw");
		fetchModelsBtn.title = $t("settings.llm-provider.fetch-models") || 'Fetch Models from API';
		fetchModelsBtn.style.background = 'none';
		fetchModelsBtn.style.border = 'none';
		fetchModelsBtn.style.cursor = 'pointer';
		fetchModelsBtn.style.marginLeft = '4px';
		fetchModelsBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			if (!provider.baseUrl) {
				new Notice("❌ Base URL is required");
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
			} catch (error: any) {
				console.error("Fetch models failed:", error);
				new Notice(`❌ 获取失败: ${error.message || error}`);
			} finally {
				setIcon(fetchModelsBtn, "refresh-cw");
				fetchModelsBtn.style.pointerEvents = 'auto';
			}
		});

		// Models List (collapsible content)
		const modelsListEl = modelsWrapper.createDiv({ cls: 'smart-mp-models-list' });

		// Check expanded state
		const isModelsExpanded = this.expandedModelSections.has(provider.id);
		modelsListEl.style.display = isModelsExpanded ? 'block' : 'none';
		modelsChevron.style.transform = isModelsExpanded ? 'rotate(90deg)' : 'rotate(0deg)';

		modelsListEl.style.paddingLeft = '18px';

		// Toggle collapse on header click
		modelsHeader.addEventListener('click', () => {
			const isCollapsed = modelsListEl.style.display === 'none';
			modelsListEl.style.display = isCollapsed ? 'block' : 'none';
			modelsChevron.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';

			if (isCollapsed) {
				this.expandedModelSections.add(provider.id);
			} else {
				this.expandedModelSections.delete(provider.id);
			}
		});

		// Models List Header (only if models exist)
		if (provider.models.length > 0) {
			const headerEl = modelsListEl.createDiv({ cls: 'smart-mp-model-header' });
			headerEl.style.display = 'flex';
			headerEl.style.gap = '10px';
			headerEl.style.padding = '0 0 5px 0'; // Match Setting padding roughly
			headerEl.style.color = 'var(--text-muted)';
			headerEl.style.fontSize = '12px';
			headerEl.style.fontWeight = '500';
			headerEl.style.marginTop = '10px'; // Space from provider header

			const idHeader = headerEl.createSpan({ text: $t("settings.llm-provider.model-id-header") || "Model ID" });
			idHeader.style.flex = '1';
			idHeader.style.paddingLeft = '5px'; // Align with input text visually

			const nameHeader = headerEl.createSpan({ text: $t("settings.llm-provider.model-name-header") || "Display Name" });
			nameHeader.style.flex = '1';
			nameHeader.style.paddingLeft = '5px';

			// Spacer for controls (Toggle + Delete)
			// Toggle is roughly 40px, Delete is roughly 30px, plus gaps
			const spacer = headerEl.createSpan();
			spacer.style.width = '70px';
		}

		// Models List Items
		provider.models.forEach((model, idx) => {
			const modelSetting = new Setting(modelsListEl)
				.setClass("smart-mp-model-item");

			// Remove unused info element to maximize space
			modelSetting.infoEl.remove();

			// Use full width for control element with flex layout
			modelSetting.controlEl.style.width = '100%';
			modelSetting.controlEl.style.justifyContent = 'flex-start';
			modelSetting.controlEl.style.gap = '10px';

			modelSetting.addText(text => {
				text.setPlaceholder($t("settings.llm-provider.model-id-placeholder"))
					.setValue(model.id)
					.setDisabled(false)
					.onChange(async v => {
						model.id = v;
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = '100%';
				text.inputEl.style.flex = '1';
				text.inputEl.style.minWidth = '100px';
			});

			modelSetting.addText(text => {
				text.setPlaceholder($t("settings.llm-provider.model-name-placeholder"))
					.setValue(model.name)
					.onChange(async v => {
						model.name = v;
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = '100%';
				text.inputEl.style.flex = '1';
				text.inputEl.style.minWidth = '100px';
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
						new Notice("模板已存在，无需重复添加");
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

				const titleSpan = summary.createEl("span", { text: assistant.name });
				titleSpan.style.fontWeight = "bold";
				titleSpan.style.flexGrow = "1";
				if (assistant.enabled === false) {
					titleSpan.style.textDecoration = "line-through";
					titleSpan.style.color = "var(--text-muted)";
				}

				const controls = summary.createDiv();
				controls.style.display = "flex";
				controls.style.gap = "8px";
				controls.style.alignItems = "center";

				// Stop propagation so clicking buttons doesn't toggle details
				controls.onClickEvent((e) => e.stopPropagation());

				// Enable Toggle
				const toggle = new Setting(controls)
					.addToggle((t) => t
						.setValue(assistant.enabled !== false)
						.setTooltip($t("settings.assistant.enable-assistant"))
						.onChange(async (val) => {
							assistant.enabled = val;
							if (val) {
								titleSpan.style.textDecoration = "none";
								titleSpan.style.color = "var(--text-normal)";
							} else {
								titleSpan.style.textDecoration = "line-through";
								titleSpan.style.color = "var(--text-muted)";
							}
							await this.plugin.saveSettings();
						})
					);
				toggle.infoEl.remove();
				toggle.settingEl.style.border = "none";
				toggle.settingEl.style.padding = "0";

				// Sorting buttons
				new Setting(controls)
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
					}).settingEl.style.border = "none";

				new Setting(controls)
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
					}).settingEl.style.border = "none";

				// Delete Button
				new Setting(controls)
					.addExtraButton(b => b
						.setIcon("trash-2")
						.setTooltip($t("settings.assistant.delete-assistant"))
						.onClick(() => {
							this.plugin.settings.customAssistantList?.splice(index, 1);
							void this.plugin.saveSettings();
							this.display();
						})
					).settingEl.style.border = "none";

				// Content
				const content = assistantDetails.createDiv();
				content.style.marginTop = "10px";
				content.style.borderTop = "1px solid var(--background-modifier-border)";
				content.style.paddingTop = "10px";

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
					.setDesc("选择此助手使用的服务商和模型（留空则使用全局默认）");

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

		const summary = details.createEl('summary');
		summary.style.outline = 'none';
		summary.style.fontWeight = 'bold';
		summary.style.fontSize = '1.1em'; // Slightly larger like a header
		summary.setText(title);

		// Container for the content
		const content = details.createDiv();
		return content;
	}

	createGeneralSettings(container: HTMLElement) {
		const frame = this.createCollapsibleFrame(container, "⚙️ 通用与交互 (General & Interaction)", true);

		new Setting(frame)
			.setName("启用智能浮动工具栏")
			.setDesc("选中文字自动显示 AI 助手栏")
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
	}

	createLicenseSettings(container: HTMLElement) {
		// Pro password verification using SHA-256 hash
		// 注意：PRO_SECRET_HASH 是 'smartmp2026' 的 SHA-256 哈希值，明文不存储在代码中

		// 初始状态为未知，异步检查后更新
		let isPro = false;

		const frame = this.createCollapsibleFrame(container, "🔐 授权管理 (License)", true);

		// Status Banner
		const statusBanner = frame.createDiv({ cls: 'smart-mp-license-status' });
		statusBanner.style.padding = '12px 16px';
		statusBanner.style.borderRadius = '8px';
		statusBanner.style.marginBottom = '16px';
		statusBanner.style.display = 'flex';
		statusBanner.style.alignItems = 'center';
		statusBanner.style.gap = '12px';

		if (isPro) {
			statusBanner.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1))';
			statusBanner.style.border = '1px solid rgba(34, 197, 94, 0.3)';

			const badge = statusBanner.createSpan();
			badge.style.background = '#22c55e';
			badge.style.color = 'white';
			badge.style.padding = '4px 10px';
			badge.style.borderRadius = '12px';
			badge.style.fontSize = '12px';
			badge.style.fontWeight = '600';
			badge.textContent = '✓ Pro 已激活';

			const info = statusBanner.createSpan();
			info.style.color = 'var(--text-muted)';
			info.style.fontSize = '13px';
			info.textContent = '已解锁全部功能，发布文章不含水印';
		} else {
			statusBanner.style.background = 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.1))';
			statusBanner.style.border = '1px solid rgba(251, 191, 36, 0.3)';

			const badge = statusBanner.createSpan();
			badge.style.background = '#f59e0b';
			badge.style.color = 'white';
			badge.style.padding = '4px 10px';
			badge.style.borderRadius = '12px';
			badge.style.fontSize = '12px';
			badge.style.fontWeight = '600';
			badge.textContent = '免费版';

			const info = statusBanner.createSpan();
			info.style.color = 'var(--text-muted)';
			info.style.fontSize = '13px';
			info.textContent = '发布文章将包含 SmartMP 推广水印';
		}

		// Activation Input
		new Setting(frame)
			.setName("激活码")
			.setDesc("输入激活码以解锁 Pro 功能（去除水印、优先支持等）")
			.addText((text) => {
				text.inputEl.type = "password";
				text.inputEl.style.width = '200px';
				text
					.setPlaceholder("请输入激活码")
					.setValue(this.plugin.settings.proPassword || "")
					.onChange(async (value) => {
						this.plugin.settings.proPassword = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton((btn) => {
				btn.setButtonText("验证")
					.setCta()
					.onClick(async () => {
						const isValid = await this.checkProStatus();
						if (isValid) {
							new Notice("✅ 激活成功！Pro 功能已解锁");
						} else {
							new Notice("❌ 激活码无效，请检查后重试");
						}
						this.display(); // Refresh to show new status
					});
			});

		// Pro Benefits Info
		const benefitsEl = frame.createDiv();
		benefitsEl.style.marginTop = '12px';
		benefitsEl.style.padding = '12px';
		benefitsEl.style.background = 'var(--background-secondary)';
		benefitsEl.style.borderRadius = '6px';
		benefitsEl.style.fontSize = '13px';
		benefitsEl.innerHTML = `
			<div style="font-weight: 600; margin-bottom: 8px;">SmartMP Pro 权益 (¥69 永久买断)：</div>
			<div style="color: var(--text-muted); line-height: 1.8;">
				✨ <b>去除水印</b>：发布文章纯净无广告<br>
				🎨 <b>主题克隆</b>：一键复刻任意公众号排版<br>
				🛠️ <b>优先支持</b>：一对一解决使用问题<br>
				📦 <b>永久更新</b>：包含所有未来本地新功能<br>
				🎁 <b>云端特权</b>：未来云服务上线享折扣/赠送
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
				console.debug("ipAddress: " + ipAddress);
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
