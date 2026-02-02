import { App, Modal, ButtonComponent, Editor, Notice, setIcon } from "obsidian";
import * as Diff from "diff";

export class DiffModal extends Modal {
    private original: string;
    private modified: string;
    private editor: Editor;
    private onAccept: (modified: string) => void;

    constructor(app: App, editor: Editor, original: string, modified: string, onAccept?: (modified: string) => void) {
        super(app);
        this.editor = editor;
        this.original = original;
        this.modified = modified;
        this.onAccept = onAccept || ((mod) => {
            this.editor.replaceSelection(mod);
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('smart-mp-diff-modal');
        contentEl.empty();

        contentEl.createEl('h2', { text: 'AI 修改对比 (Diff View)' });

        // Split View - Side by Side comparison
        const diffContainer = contentEl.createDiv({ cls: 'diff-container' });

        // Left Pane: Original
        const leftPane = diffContainer.createDiv({ cls: 'diff-pane original-pane' });
        leftPane.createEl('h4', { text: '原始内容' });
        const leftContent = leftPane.createDiv({ cls: 'diff-content' });

        // Right Pane: Modified
        const rightPane = diffContainer.createDiv({ cls: 'diff-pane modified-pane' });
        rightPane.createEl('h4', { text: '修改建议' });
        const rightContent = rightPane.createDiv({ cls: 'diff-content' });

        // Calculate Diff (Chars for Chinese precision)
        const diff = Diff.diffChars(this.original, this.modified);

        // Render Unified Diff
        // Render Split Diff
        diff.forEach(part => {
            // Left: Show removed (red) + common. Skip added.
            if (part.removed) {
                leftContent.createEl('span', { cls: 'diff-remove', text: part.value });
            } else if (!part.added) {
                leftContent.createEl('span', { cls: 'diff-common', text: part.value });
            }

            // Right: Show added (green) + common. Skip removed.
            if (part.added) {
                rightContent.createEl('span', { cls: 'diff-add', text: part.value });
            } else if (!part.removed) {
                rightContent.createEl('span', { cls: 'diff-common', text: part.value });
            }
        });

        // Actions
        const actions = contentEl.createDiv({ cls: 'diff-actions' });

        // Confirm Replace
        new ButtonComponent(actions)
            .setButtonText('确认替换')
            .setCta()
            .onClick(() => {
                this.onAccept(this.modified);
                this.close();
            });

        // Copy Result
        new ButtonComponent(actions)
            .setButtonText('复制修改后内容')
            .onClick(async () => {
                await navigator.clipboard.writeText(this.modified);
                new Notice("已复制到剪贴板");
            });

        // Cancel
        new ButtonComponent(actions)
            .setButtonText('取消')
            .onClick(() => {
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
