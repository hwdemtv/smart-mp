import { Editor, Menu, MenuItem, Notice, TFile } from "obsidian";
import { $t } from "src/lang/i18n";
import type SmartMPPlugin from "../main";
import { Logger } from "../utils/logger";
import { ErrorHandler } from "../utils/error-handler";
import { SynonymsModal } from "../modals/synonyms-modal";
import { MarkdownView } from "obsidian";
import { proofreadText } from "../utils/proofread";
import { PreviewPanel, VIEW_TYPE_SMART_MP_PREVIEW } from "../views/previewer";
import { normalizeTextForChinesePunctuation } from "../utils/cjk-punctuation";

/**
 * CommandManager 负责插件所有命令和右键菜单的注册与管理
 */
export class CommandManager {
	private plugin: SmartMPPlugin;

	constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
	}

	/** 获取当前打开的预览面板实例（供命令复用面板内功能） */
	private getPreviewPanel(): PreviewPanel | null {
		const leaf = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_MP_PREVIEW)[0];
		return leaf && leaf.view instanceof PreviewPanel ? leaf.view : null;
	}

	/**
	 * 注册所有内置命令
	 */
	public registerCommands() {
		// 1. 打开预览面板
		this.plugin.addCommand({
			id: "open-previewer",
			name: $t("main.open-previewer"),
			hotkeys: [{ modifiers: ["Mod", "Alt"], key: "p" }],
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

		// 5. 规范全文标点（此前 cjk-punctuation.ts 完整实现但零入口）
		this.plugin.addCommand({
			id: "normalize-punctuation",
			name: $t("commands.normalize-punctuation"),
			editorCallback: (editor: Editor) => {
				const original = editor.getValue();
				// 代码块与行内代码不参与归一化，其余部分按 CJK 语境转换
				const parts = original.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
				const normalized = parts
					.map((part, i) => (i % 2 === 1 ? part : normalizeTextForChinesePunctuation(part)))
					.join("");
				if (normalized === original) {
					new Notice($t("notice.main.no-punctuation-changes") ?? "未发现需要规范的标点");
					return;
				}
				// 全选后走 DiffModal 预览差异，确认后整体替换（不直接改文件）
				const lastLine = editor.lastLine();
				editor.setSelection({ line: 0, ch: 0 }, { line: lastLine, ch: editor.getLine(lastLine).length });
				this.plugin.showDiffModal(editor, original, normalized);
			},
		});

		// 6. 复制文章到剪贴板（复用预览面板的富文本管线）
		this.plugin.addCommand({
			id: "copy-article",
			name: $t("main.copy-article"),
			hotkeys: [{ modifiers: ["Mod", "Alt"], key: "c" }],
			callback: () => {
				const panel = this.getPreviewPanel();
				if (!panel) {
					new Notice($t("views.previewer.not-open") ?? "请先打开预览面板");
					return;
				}
				void panel.copyArticleToClipboard();
			},
		});

		// 7. 发送文章到草稿箱
		this.plugin.addCommand({
			id: "send-to-draft-box",
			name: $t("main.send-to-draft-box"),
			hotkeys: [{ modifiers: ["Mod", "Alt"], key: "s" }],
			callback: () => {
				const panel = this.getPreviewPanel();
				if (!panel) {
					new Notice($t("views.previewer.not-open") ?? "请先打开预览面板");
					return;
				}
				void panel.sendArticleToDraftBox();
			},
		});

		// 8. 导出为 HTML 文件（此前导出管线存在但无落盘出口）
		this.plugin.addCommand({
			id: "export-html",
			name: $t("main.export-html"),
			hotkeys: [{ modifiers: ["Mod", "Alt"], key: "e" }],
			callback: () => {
				const panel = this.getPreviewPanel();
				if (!panel) {
					new Notice($t("views.previewer.not-open") ?? "请先打开预览面板");
					return;
				}
				void panel.exportHtml();
			},
		});
	}

	/**
	 * 注册 AI 增强相关命令
	 */
	private registerAICommands() {
		this.plugin.addCommand({
			id: "mp-polish",
			name: $t("commands.polish"),
			hotkeys: [{ modifiers: ["Mod", "Alt"], key: "l" }],
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
		subMenu.addItem((subItem: MenuItem) => {
			subItem
				.setTitle($t("main.polish"))
				.setIcon("user-pen")
				.onClick(() => {
					void (async () => {
						// [Fix] 整篇润色此前直接 vault.modify 覆盖原文、无 diff 确认，
						// 有数据丢失风险；改走流式 Diff 弹窗，确认后才写入
						const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
						const editor = view?.editor;
						if (!editor || view?.file?.path !== file.path) {
							new Notice($t("notice.main.open-file-in-editor-first") ?? "请在编辑器中打开该文件后再润色");
							return;
						}
						const content = editor.getValue();
						const lastLine = editor.lastLine();
						editor.setSelection({ line: 0, ch: 0 }, { line: lastLine, ch: editor.getLine(lastLine).length });
						await this.plugin.polishContentWithStreaming(editor, content);
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
