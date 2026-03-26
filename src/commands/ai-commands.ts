/**
 * AI-related commands for SmartMP plugin
 */

import { Editor, MarkdownView, Notice } from 'obsidian';
import { CommandDefinition } from './types';
import SmartMPPlugin from 'src/main';
import { $t } from 'src/lang/i18n';

/**
 * AI command definitions
 * These commands interact with AI services (LLM, image generation, etc.)
 */
export const AI_COMMANDS: CommandDefinition[] = [
    {
        id: 'mp-polish',
        name: '公众号：润色选中文本',
        category: 'ai',
        description: '润色选中的文本',
        create: (plugin: SmartMPPlugin) => ({
            id: 'mp-polish',
            name: '公众号：润色选中文本',
            editorCallback: async (editor: Editor) => {
                const content = editor.getSelection();
                if (!content) {
                    new Notice($t("notice.main.select-text-to-polish") ?? "请先选中要润色的文本");
                    return;
                }
                await plugin.polishContentWithStreaming(editor, content);
            },
        }),
    },
    {
        id: 'mp-translate-to-english',
        name: '公众号：翻译为英语',
        category: 'ai',
        description: '将选中文本翻译为英语',
        create: (plugin: SmartMPPlugin) => ({
            id: 'mp-translate-to-english',
            name: '公众号：翻译为英语',
            editorCallback: async (editor: Editor) => {
                const content = editor.getSelection();
                if (!content) {
                    new Notice($t("notice.main.select-text-to-translate") ?? "请先选中要翻译的文本");
                    return;
                }
                await plugin.translateWithStreaming(editor, content, "Chinese", "English");
            },
        }),
    },
    {
        id: 'mp-translate-to-chinese',
        name: '公众号：翻译为中文',
        category: 'ai',
        description: '将选中文本翻译为中文',
        create: (plugin: SmartMPPlugin) => ({
            id: 'mp-translate-to-chinese',
            name: '公众号：翻译为中文',
            editorCallback: async (editor: Editor) => {
                const content = editor.getSelection();
                if (!content) {
                    new Notice($t("notice.main.select-text-to-translate") ?? "请先选中要翻译的文本");
                    return;
                }
                await plugin.translateWithStreaming(editor, content, "English", "Chinese");
            },
        }),
    },
    {
        id: 'mp-mermaid',
        name: '公众号：生成 Mermaid 图表',
        category: 'ai',
        description: '从描述生成 Mermaid 图表',
        create: (plugin: SmartMPPlugin) => ({
            id: 'mp-mermaid',
            name: '公众号：生成 Mermaid 图表',
            editorCallback: async (editor: Editor) => {
                const content = editor.getSelection();
                if (!content) {
                    new Notice($t("notice.main.select-text-to-convert") ?? "请先选中要转换的文本");
                    return;
                }
                const res = await plugin.generateMermaid(content);
                if (res) plugin.showInsertModeMenu(editor, content, res);
            },
        }),
    },
    {
        id: 'mp-latex',
        name: '公众号：生成 LaTeX 公式',
        category: 'ai',
        description: '从描述生成 LaTeX 公式',
        create: (plugin: SmartMPPlugin) => ({
            id: 'mp-latex',
            name: '公众号：生成 LaTeX 公式',
            editorCallback: async (editor: Editor) => {
                const content = editor.getSelection();
                if (!content) {
                    new Notice($t("notice.main.select-text-to-convert") ?? "请先选中要转换的文本");
                    return;
                }
                let res = await plugin.generateLaTex(content);
                if (res) {
                    res = res.replace(/\\begin{document}/g, "").replace(/\\end{document}/g, "").replace(/\\\\/g, "\\");
                    plugin.showInsertModeMenu(editor, content, res);
                }
            },
        }),
    },
    {
        id: 'mp-summary',
        name: '公众号：生成文章摘要',
        category: 'ai',
        description: '生成文章摘要',
        create: (plugin: SmartMPPlugin) => ({
            id: 'mp-summary',
            name: '公众号：生成文章摘要',
            editorCallback: async (editor: Editor) => {
                const content = editor.getSelection();
                if (!content) {
                    new Notice($t("notice.main.select-text-to-summarize") ?? "请先选中要生成摘要的文本");
                    return;
                }
                const res = await plugin.generateSummary(content);
                if (res) plugin.showInsertModeMenu(editor, content, res);
            },
        }),
    },
    {
        id: 'mp-headline',
        name: '公众号：生成爆款标题',
        category: 'ai',
        description: '生成文章标题',
        create: (plugin: SmartMPPlugin) => ({
            id: 'mp-headline',
            name: '公众号：生成爆款标题',
            editorCallback: async (editor: Editor) => {
                const content = editor.getSelection() || editor.getValue();
                if (!content || content.length < 50) {
                    new Notice($t("notice.main.article-content-too-short") ?? "文章内容太少，无法生成标题");
                    return;
                }
                const res = await plugin.generateHeadline(content);
                if (res) plugin.showInsertModeMenu(editor, content, res);
            },
        }),
    },
];

/**
 * Register AI commands to the registry
 */
export function registerAICommands(plugin: SmartMPPlugin): void {
    const { CommandRegistry } = require('./types');
    CommandRegistry.getInstance(plugin).registerAll(AI_COMMANDS);
}
