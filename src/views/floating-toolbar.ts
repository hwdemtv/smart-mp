import { Editor, Menu, Notice, setIcon } from "obsidian";
import SmartMPPlugin from "../main";
import { Logger } from "../utils/logger";

export class FloatingToolbar {
    private toolbarEl: HTMLElement;
    private plugin: SmartMPPlugin;
    private currentEditor: Editor | null = null;
    private visible = false;
    private hideTimer: number | null = null;

    constructor(plugin: SmartMPPlugin) {
        this.plugin = plugin;
        this.toolbarEl = createEl('div', { cls: 'smart-mp-float-toolbar' });
        document.body.appendChild(this.toolbarEl);

        // Initial hidden state
        this.hide();

    }

    public show(editor: Editor, selection: string) {
        this.currentEditor = editor;

        // Determine buttons based on selection content
        const buttons = this.getRelevantButtons(selection);
        if (buttons.length === 0) return;

        Logger.debug("FloatingToolbar", "Showing native Menu for debugging.");

        const menu = new Menu();

        buttons.forEach(btn => {
            menu.addItem(item => {
                item.setIcon(btn.icon)
                    .setTitle(btn.label || btn.tooltip)
                    .onClick(async () => {
                        try {
                            await btn.action(editor, selection);
                        } catch (err) {
                            console.error("Action failed", err);
                            new Notice("执行失败");
                        }
                    });
            });
        });

        menu.addSeparator();
        menu.addItem(item => {
            item.setIcon('more-horizontal')
                .setTitle('更多')
                .onClick(() => new Notice("更多 AI 功能敬请期待"));
        });

        const selectionRange = window.getSelection();
        if (selectionRange && selectionRange.rangeCount > 0) {
            const range = selectionRange.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            menu.showAtPosition({ x: rect.left, y: rect.bottom + 5 });
        }
    }

    public hide() {
        // Menu handles its own closing
    }

    public destroy() {
        // No cleanup needed
    }

    private getRelevantButtons(selection: string): Array<{
        id: string;
        icon: string;
        label?: string;
        tooltip: string;
        action: (editor: Editor, sel: string) => Promise<void>;
    }> {
        const buttons = [];


        // 1. Polish (Always available)
        buttons.push({
            id: 'polish',
            icon: 'sun',
            label: '润色',
            tooltip: '润色选中文本',
            action: async (editor: Editor, sel: string) => {
                await this.plugin.polishContentWithStreaming(editor, sel);
            }
        });

        // 2. Proofread
        buttons.push({
            id: 'proofread',
            icon: 'clipboard-check', // or 'check-circle'
            label: '校对',
            tooltip: '校对选中文本',
            action: async (editor: Editor, sel: string) => {
                await this.plugin.proofContentWithStreaming(editor, sel);
            }
        });

        // 3. Synonyms (Short selection)
        if (selection.length < 50) {
            buttons.push({
                id: 'synonyms',
                icon: 'book-a',
                label: '同义词',
                tooltip: '查找同义词',
                action: async (editor: Editor, sel: string) => {
                    await this.plugin.getSynonymsWithStreaming(editor, sel);
                }
            });
        }


        // 4. Translate (Short selections usually)
        if (selection.length < 1000) {
            buttons.push({
                id: 'translate',
                icon: 'languages',
                label: '翻译',
                tooltip: '翻译',
                action: async (editor: Editor, sel: string) => {
                    const hasChinese = /[\u4e00-\u9fa5]/.test(sel);
                    if (hasChinese) {
                        await this.plugin.translateWithStreaming(editor, sel, "Chinese", "English");
                    } else {
                        await this.plugin.translateWithStreaming(editor, sel, "English", "Chinese");
                    }
                }
            });
        }

        // 5. Title (If selection is short or looks like title)
        if (selection.length < 50 && !selection.includes('\n')) {
            buttons.push({
                id: 'headline',
                icon: 'heading',
                label: '标题',
                tooltip: '生成爆款标题',
                action: async (editor: Editor, sel: string) => {
                    await this.plugin.generateTitleWithStreaming(editor, sel);
                }
            });
        }

        // 6. Summary (If selection is long)
        if (selection.length > 200) {
            buttons.push({
                id: 'summary',
                icon: 'file-text',
                label: '摘要',
                tooltip: '生成摘要',
                action: async (editor: Editor, sel: string) => {
                    await this.plugin.generateSummaryWithStreaming(editor, sel);
                }
            });
        }

        return buttons;
    }

    private positionToolbar(editor: Editor) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Ensure toolbar is visible in DOM to measure size (if needed)
        // For simple positioning:
        Logger.debug("FloatingToolbar", `Positioning Toolbar. Rect: ${JSON.stringify(rect)}`);
        const top = rect.top - 40; // Approx toolbar height
        const left = rect.left;

        this.toolbarEl.style.top = `${Math.max(10, top)}px`;
        this.toolbarEl.style.left = `${Math.max(10, left)}px`;

        // Adjust if off-screen (bottom)
        if (top < 10) {
            this.toolbarEl.style.top = `${rect.bottom + 10}px`;
        }
    }
}
