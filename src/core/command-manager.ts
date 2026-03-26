import { Editor, Menu, MenuItem, Notice, TFile } from "obsidian";
import { $t } from "src/lang/i18n";
import type SmartMPPlugin from "../main";
import { Logger } from "../utils/logger";
import { ErrorHandler } from "../utils/error-handler";
import { SynonymsModal } from "../modals/synonyms-modal";
import { MarkdownView } from "obsidian";
import { proofreadText } from "../utils/proofread";
import { PreviewPanel, VIEW_TYPE_SMART_MP_PREVIEW } from "../views/previewer";

/**
 * CommandManager 负责插件所有命令和右键菜单的注册与管理
 */
export class CommandManager {
	private plugin: SmartMPPlugin;

	constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
	}

	/**
	 * 注册所有内置命令
	 */
	public registerCommands() {
		// 1. 打开预览面板
		this.plugin.addCommand({
			id: "open-previewer",
			name: $t("main.open-previewer"),
			callback: () => {
				void this.plugin.activateView();
			},
		});

		// 2. 打开素材视图
		this.plugin.addCommand({
			id: "open-material-view",
			name: $t("main.open-material-view"),
			callback: () => {
				void this.plugin.activateMaterialView();
			},
		});

		// 3. 切换滚动同步
		this.plugin.addCommand({
			id: "toggle-scroll-sync",
			name: $t("main.toggle-scroll-sync"),
			callback: () => {
				const leaf = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_MP_PREVIEW)[0];
				if (leaf && leaf.view instanceof PreviewPanel) {
					const previewView = leaf.view;
					if (previewView.scrollSyncButton) {
						previewView.toggleScrollSync(previewView.scrollSyncButton);
					}
				} else {
					this.plugin.settings.scrollSync = !this.plugin.settings.scrollSync;
					new Notice(this.plugin.settings.scrollSync ? $t("scroll-sync.enabled") : $t("scroll-sync.disabled"));
					void this.plugin.saveSettings();
				}
			},
		});

		// 4. AI 助手命令
		this.registerAICommands();
	}

	/**
	 * 注册 AI 增强相关命令
	 */
	private registerAICommands() {
		this.plugin.addCommand({
			id: "mp-polish",
			name: $t("commands.polish"),
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice($t("notice.main.select-text-to-polish") ?? "请先选中要润色的文本");
					return;
				}
				await this.plugin.polishContentWithStreaming(editor, content);
			},
		});

		this.plugin.addCommand({
			id: "mp-translate-to-english",
			name: $t("commands.translate-en"),
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice($t("notice.main.select-text-to-translate") ?? "请先选中要翻译的文本");
					return;
				}
				await this.plugin.translateWithStreaming(editor, content, "Chinese", "English");
			},
		});

		this.plugin.addCommand({
			id: "mp-translate-to-chinese",
			name: $t("commands.translate-zh"),
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice($t("notice.main.select-text-to-translate") ?? "请先选中要翻译的文本");
					return;
				}
				await this.plugin.translateWithStreaming(editor, content, "English", "Chinese");
			},
		});

		this.plugin.addCommand({
			id: "mp-mermaid",
			name: $t("commands.mermaid"),
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice($t("notice.main.select-text-to-convert") ?? "请先选中要转换的文本");
					return;
				}
				const res = await this.plugin.generateMermaid(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});

		this.plugin.addCommand({
			id: "mp-latex",
			name: $t("commands.latex"),
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice($t("notice.main.select-text-to-convert") ?? "请先选中要转换的文本");
					return;
				}
				let res = await this.plugin.generateLaTex(content);
				if (res) {
					res = res.replace(/\\begin{document}/g, "").replace(/\\end{document}/g, "").replace(/\\\\/g, "\\");
					this.showInsertModeMenu(editor, content, res);
				}
			},
		});

		this.plugin.addCommand({
			id: "mp-summary",
			name: $t("commands.summary"),
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection();
				if (!content) {
					new Notice($t("notice.main.select-text-to-summarize") ?? "请先选中要生成摘要的文本");
					return;
				}
				const res = await this.plugin.generateSummary(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});

		this.plugin.addCommand({
			id: "mp-headline",
			name: $t("commands.headline"),
			editorCallback: async (editor: Editor) => {
				const content = editor.getSelection() || editor.getValue();
				if (!content || content.length < 50) {
					new Notice($t("notice.main.article-content-too-short") ?? "文章内容太少，无法生成标题");
					return;
				}
				const res = await this.plugin.generateHeadline(content);
				if (res) this.showInsertModeMenu(editor, content, res);
			},
		});
	}

	/**
	 * 注册编辑器右键菜单
	 */
	public addEditorMenu() {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("editor-menu", (menu, editor) => {
				// 使用内部接口安全访问编辑器关联文件
				interface InternalEditor extends Editor {
					editorComponent?: {
						file?: TFile;
					};
				}
				let file: TFile | null | undefined = (editor as InternalEditor).editorComponent?.file;
				file = file instanceof TFile ? file : this.plugin.app.workspace.getActiveFile();

				if (!file) return;

				menu.addItem((item) => {
					item.setTitle($t("main.smart-mp-ai")).setIcon("sparkles");
					const subMenu = item.setSubmenu();

					if (editor.somethingSelected()) {
						this.renderAssistantSubmenu(subMenu, editor);
					} else {
						this.renderEmptySelectionSubmenu(subMenu, file);
					}
				});
			})
		);
	}

	/**
	 * 渲染辅助功能子菜单 (有选中文字时)
	 */
	private renderAssistantSubmenu(subMenu: Menu, editor: Editor) {
		if (!this.plugin.settings.customAssistantList) return;

		this.plugin.settings.customAssistantList.forEach((assistant) => {
			if (assistant.enabled === false) return;

			// 排除已移动到悬浮工具栏的项目
			if (["polish", "proofread", "synonyms", "translate"].includes(assistant.id)) {
				return;
			}

			subMenu.addItem((subItem: MenuItem) => {
				let icon = "bot";
				let action = () => void this.processCustomAssistant(assistant, editor);

				switch (assistant.id) {
					case "polish":
						icon = "sun";
						action = () => {
							void (async () => {
								const content = editor.getSelection();
								const res = await this.plugin.polishContent(content);
								if (res) this.showInsertModeMenu(editor, content, res);
							})();
						};
						break;
					case "synonyms":
						icon = "book-a";
						action = () => {
							void (async () => {
								const content = editor.getSelection();
								const res = await this.plugin.getSynonyms(content);
								if (res) editor.replaceSelection(res, content);
							})();
						};
						break;
					case "summary":
						icon = "file-text";
						break;
					case "proofread":
						icon = "clipboard-check";
						action = () => {
							void (async () => {
								const content = editor.getValue();
								const result = await this.plugin.proofContent(content);
								if (result) {
									const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
									if (activeView) {
										proofreadText(editor, activeView, result as any);
									}
								}
							})();
						};
						break;
					case "text-to-image":
						icon = "image-plus";
						action = () => void this.plugin.generateImage(editor);
						break;
				}

				subItem.setTitle(assistant.name).setIcon(icon).onClick(action);
			});
		});
	}

	/**
	 * 渲染空选中时的子菜单
	 */
	private renderEmptySelectionSubmenu(subMenu: Menu, file: TFile) {
		subMenu.addItem((subItem) => {
			subItem
				.setTitle($t("main.polish"))
				.setIcon("user-pen")
				.onClick(() => {
					void (async () => {
						const content = await this.plugin.app.vault.read(file);
						const polished = await this.plugin.polishContent(content);
						if (polished) {
							await this.plugin.app.vault.modify(file, polished);
						}
					})();
				});
		});
	}

	/**
	 * 执行自定义助手逻辑
	 */
	public async processCustomAssistant(assistant: any, editor: Editor) {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return;
		}
		const content = editor.getSelection();
		if (!content) {
			new Notice($t("notice.main.select-text-first") ?? "请先选中要处理的文本");
			return;
		}

		this.plugin.showSpinner(assistant.name + "...");
		try {
			const result = await this.plugin.aiClient.generateCustom(
				assistant.prompt,
				content,
				assistant.providerId,
				assistant.modelId
			);
			if (result) {
				this.showInsertModeMenu(editor, content, result);
			}
		} catch (error) {
			Logger.error("AI", "自定义助手执行失败", error);
			new Notice(($t("notice.main.assistant-failed") ?? "执行助手失败: {0}").replace("{0}", assistant.name));
		} finally {
			this.plugin.hideSpinner();
		}
	}

	/**
	 * 显示插入模式选择菜单
	 */
	public showInsertModeMenu(editor: Editor, originalContent: string, result: string) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle($t("commands.insert-mode.replace"))
				.setIcon("replace")
				.onClick(() => {
					editor.replaceSelection(result);
				});
		});

		menu.addItem((item) => {
			item.setTitle($t("commands.insert-mode.append"))
				.setIcon("plus")
				.onClick(() => {
					editor.replaceSelection(originalContent + "\n\n" + result);
				});
		});

		menu.addItem((item) => {
			item.setTitle($t("commands.insert-mode.prepend"))
				.setIcon("arrow-up")
				.onClick(() => {
					editor.replaceSelection(result + "\n\n" + originalContent);
				});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle($t("commands.insert-mode.copy"))
				.setIcon("copy")
				.onClick(() => {
					navigator.clipboard.writeText(result);
					new Notice($t("notice.main.copied-to-clipboard") ?? "已复制到剪贴板");
				});
		});

		menu.showAtPosition({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 50 });
		new Notice($t("notice.main.select-insert-mode") ?? "请选择插入方式", 2000);
	}
}
