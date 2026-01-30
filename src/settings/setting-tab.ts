/**
 * tab for setting
 */

import {
	App,
	DropdownComponent,
	Notice,
	PluginSettingTab,
	Setting,
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
import { PreviewPanel, VIEW_TYPE_SMART_MP_PREVIEW } from "../views/previewer";

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
	private initialAssistantPrompts: Record<string, string> = {};
	private isFirstDisplay = true;

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
			this.createWeChatSettings(containerEl);
			this.creatCSSStyleSetting(containerEl);

			// Import/Export also moved here for now
			new Setting(containerEl)
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
		const frame = this.createCollapsibleFrame(container, $t("settings.custom-themes"));

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
			.addText((text) =>
				text.setValue(account.appSecret).onChange((value) => {
					account.appSecret = value;
					void this.plugin.saveSettings();
				})
			);
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
		// new Setting(frame).setName($t("settings.text-llm")).setHeading();

		const selectAiChatSetting = new Setting(frame)
			.setName($t("settings.select-account"))
			.setDesc($t("settings.choose-the-llm-account-to-modify"));

		this.aiChatAccountContainer = frame.createDiv({
			cls: "smart-mp-account-info-content",
		});

		selectAiChatSetting.addDropdown((dropdown) => {
			this.aiChatAccountDropdown = dropdown;
			dropdown.selectEl.empty();
			this.plugin.settings.chatAccounts.forEach((account) => {
				dropdown.addOption(
					account.accountName,
					account.accountName
				);
			});
			dropdown
				.setValue(this.plugin.settings.selectedChatAccount || "")
				.onChange((value) => {
					this.plugin.settings.selectedChatAccount = value;
					this.updateAIChatSettings(
						value,
						this.aiChatAccountContainer
					);
					void this.plugin.saveSettings();
				});
		})
			.addExtraButton((button) => {
				button
					.setIcon("plus")
					.setTooltip($t("settings.create-new-chat-llm-account"))
					.onClick(() => {
						this.newAIChatAccount();
					});
			});
		this.updateAIChatSettings(
			this.plugin.settings.selectedChatAccount,
			this.aiChatAccountContainer
		);
	}

	updateAIChatSettings(
		accountName: string | undefined,
		container: HTMLElement
	) {
		const account = this.plugin.getChatAIAccount(accountName);
		if (account === undefined) {
			this.newAIChatAccount();
			return;
		}
		container.empty();

		new Setting(container)
			.setName($t("settings.account-name"))
			.addText((text) =>
				text.setValue(account.accountName).onChange((value) => {
					value = value.trim();
					if (value !== account.accountName) {
						account.accountName = value;
						this.plugin.settings.selectedChatAccount = value;
						void this.plugin.saveSettings();
						this.updateAIChatOptions();
					}
				})
			);

		new Setting(container)
			.setName($t("settings.llm-access-base-url"))
			.addText((text) =>
				text.setValue(account.baseUrl).onChange((value) => {
					account.baseUrl = value;
					void this.plugin.saveSettings();
				})
			);

		new Setting(container)
			.setName($t("settings.llm-access-api-key"))
			.addText((text) =>
				text.setValue(account.apiKey).onChange((value) => {
					account.apiKey = value;
					void this.plugin.saveSettings();
				})
			);

		new Setting(container)
			.setName($t("settings.llm-model-to-be-used"))
			.addText((text) =>
				text.setValue(account.model).onChange((value) => {
					account.model = value;
					void this.plugin.saveSettings();
				})
			);

		new Setting(container)
			.setName($t("settings.llm-system-prompt"))
			.setDesc($t("settings.llm-system-prompt-desc"))
			.setClass("smart-mp-setting-textarea")
			.addTextArea((text) =>
				text
					.setPlaceholder("你是一个得力的助手...")
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
						this.plugin.settings.selectedChatAccount;
					this.plugin.settings.chatAccounts =
						this.plugin.settings.chatAccounts.filter(
							(a) => a.accountName !== accountToDelete
						);
					const account = this.plugin.settings.chatAccounts[0];
					void this.plugin.saveSettings();
					if (account !== undefined) {
						this.plugin.settings.selectedChatAccount =
							account.accountName;
						this.updateAIChatOptions();
						this.updateAIChatSettings(
							account.accountName,
							this.aiChatAccountContainer
						);
						void this.plugin.saveSettings();
					} else {
						this.newAIChatAccount();
					}
				});
			});
	}
	updateAIChatOptions() {
		this.aiChatAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings.chatAccounts.forEach((account) => {
			this.aiChatAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.aiChatAccountDropdown.setValue(
			this.plugin.settings.selectedChatAccount ?? ""
		);
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

	newAIChatAccount() {
		let n = this.plugin.settings.chatAccounts.length + 1;
		let newName = $t("settings.new-chat-llm-account");
		while (true) {
			const account = this.plugin.settings.chatAccounts.find(
				(account: AIChatAccountInfo) => account.accountName === newName
			);
			if (account === undefined || account === null) {
				break;
			}
			n += 1;
			newName = $t("settings.new-chat-llm-account") + "-" + n;
		}
		const newAccount = {
			accountName: newName,
			baseUrl: "",
			apiKey: "",
			model: "",
		};
		this.plugin.settings.chatAccounts.push(newAccount);
		// this.aiChatAccountDropdown.addOption(newName, newName);
		this.aiChatAccountDropdown.selectEl.options.length = 0;
		this.plugin.settings.chatAccounts.forEach((account) => {
			this.aiChatAccountDropdown.addOption(
				account.accountName,
				account.accountName
			);
		});
		this.aiChatAccountDropdown.setValue(newName);
		this.plugin.settings.selectedChatAccount = newAccount.accountName;
		this.updateAIChatSettings(newName, this.aiChatAccountContainer);
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

	createWeChatSettings(container: HTMLElement) {
		// Use collapsible frame
		const mpFrame = this.createCollapsibleFrame(container, $t("settings.wechat-account"));

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

		new Setting(mpFrame)
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
		new Setting(mpFrame)
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

		// mpFrame.createEl("hr");

		new Setting(mpFrame).setName($t("settings.account-info")).setHeading();

		const div = mpFrame.createDiv({
			cls: "smart-mp-web-image elevated-shadow",
		});
		const link = div.createEl("a", {
			cls: "smart-mp-web-image-link",
			href: "https://mp.weixin.qq.com/cgi-bin/frame?t=pages/developsetting/page/developsetting_frame&nav=10141",
		});
		const img = link.createEl("img", { cls: "smart-mp-web-image-img" });
		img.src = WECHAT_MP_WEB_PAGE;
		img.alt = "smart-mp-web-page";
		// div.innerHTML = `<a href="https://mp.weixin.qq.com/cgi-bin/frame?t=pages/developsetting/page/developsetting_frame&nav=10141"><img src="${WECHAT_MP_WEB_PAGE}" alt="smart-mp-web-page"></a> </p>`

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
	}
}
