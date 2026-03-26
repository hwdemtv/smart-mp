import { App, Modal, ButtonComponent, Editor, TextAreaComponent } from "obsidian";
import * as Diff from "diff";
import { $t } from "src/lang/i18n";
import { Logger } from "src/utils/logger";

// 防抖函数
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
    let timeoutId: ReturnType<typeof setTimeout>;
    return ((...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    }) as T;
}

/**
 * 流式 Diff 对比对话框
 * - 支持 AI 流式输出
 * - 支持用户手动编辑
 * - 实时 Diff 对比
 * - 进度条显示
 * - 历史撤销/重做
 */
export class StreamingDiffModal extends Modal {
    private original: string;
    private currentModified: string = "";
    private editor: Editor;
    private onAccept: (modified: string) => void;
    private isStreaming: boolean = false;
    private abortController: AbortController | null = null;

    // 历史记录
    private history: string[] = [];
    private historyIndex: number = -1;
    private isUndoRedo: boolean = false;

    // 重新生成参数
    private regenerateCallback: ((onChunk: (chunk: string) => void, signal?: AbortSignal) => Promise<string>) | null = null;

    // UI Elements
    private leftContentEl!: HTMLElement;
    private rightTextArea!: TextAreaComponent;
    private statusEl!: HTMLElement;
    private progressBarFill!: HTMLElement;
    private acceptButton!: ButtonComponent;
    private stopButton!: ButtonComponent;
    private undoButton!: ButtonComponent;
    private redoButton!: ButtonComponent;
    private regenerateButton!: ButtonComponent;

    // 防抖渲染
    private debouncedRenderDiff: () => void;

    constructor(
        app: App,
        editor: Editor,
        original: string,
        onAccept?: (modified: string) => void,
        regenerateCallback?: (onChunk: (chunk: string) => void, signal?: AbortSignal) => Promise<string>
    ) {
        super(app);
        this.editor = editor;
        this.original = original;
        this.onAccept = onAccept || ((mod) => {
            this.editor.replaceSelection(mod);
        });
        this.regenerateCallback = regenerateCallback || null;

        // 创建防抖的 renderDiff
        this.debouncedRenderDiff = debounce(() => this.renderDiff(), 100);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('smart-mp-diff-modal', 'smart-mp-streaming-diff-modal');
        contentEl.empty();

        // 标题
        contentEl.createEl('h2', { text: $t('streaming-diff-modal.title') });

        // 分栏容器
        const diffContainer = contentEl.createDiv({ cls: 'diff-container' });

        // 左侧：原始内容（只读）
        const leftPane = diffContainer.createDiv({ cls: 'diff-pane original-pane' });
        leftPane.createEl('h4', { text: $t('streaming-diff-modal.original-content') });
        this.leftContentEl = leftPane.createDiv({ cls: 'diff-content' });
        this.renderOriginal();

        // 右侧：AI 修改（可编辑）
        const rightPane = diffContainer.createDiv({ cls: 'diff-pane modified-pane' });
        rightPane.createEl('h4', { text: $t('streaming-diff-modal.ai-suggestion') });

        // 编辑提示
        rightPane.createEl('small', {
            text: $t('streaming-diff-modal.edit-hint'),
            cls: 'streaming-edit-hint'
        });

        // 可编辑的文本区域
        const textAreaContainer = rightPane.createDiv({ cls: 'diff-content streaming-textarea-container' });
        this.rightTextArea = new TextAreaComponent(textAreaContainer);
        this.rightTextArea.setValue('');
        this.rightTextArea.setDisabled(true); // 生成过程中禁用编辑
        this.rightTextArea.onChange((value) => {
            this.currentModified = value;
            this.debouncedRenderDiff(); // 使用防抖版本

            // 保存历史（非撤销/重做操作时）
            if (!this.isUndoRedo) {
                this.saveToHistory();
            }
        });

        // 设置文本区域样式
        const textareaEl = this.rightTextArea.inputEl;
        textareaEl.addClass('streaming-textarea');

        // 进度条（放在底部更醒目）
        const progressBar = contentEl.createDiv({ cls: 'streaming-progress-bar' });
        this.progressBarFill = progressBar.createDiv({ cls: 'streaming-progress-fill' });

        // 状态栏
        this.statusEl = contentEl.createDiv({ cls: 'streaming-status' });
        this.statusEl.setText($t('streaming-diff-modal.generating'));
        this.isStreaming = true;

        // 操作按钮区
        const actions = contentEl.createDiv({ cls: 'diff-actions' });

        // 撤销按钮
        this.undoButton = new ButtonComponent(actions)
            .setIcon('undo')
            .setTooltip($t('streaming-diff-modal.undo'))
            .onClick(() => this.undo());
        this.undoButton.setDisabled(true);

        // 重做按钮
        this.redoButton = new ButtonComponent(actions)
            .setIcon('redo')
            .setTooltip($t('streaming-diff-modal.redo'))
            .onClick(() => this.redo());
        this.redoButton.setDisabled(true);

        // 重新生成按钮
        this.regenerateButton = new ButtonComponent(actions)
            .setIcon('rotate-ccw')
            .setTooltip($t('streaming-diff-modal.regenerate'))
            .onClick(() => this.regenerate());
        this.regenerateButton.setDisabled(true); // 初始禁用

        // 停止生成按钮
        this.stopButton = new ButtonComponent(actions)
            .setButtonText($t('streaming-diff-modal.stop'))
            .onClick(() => {
                this.stopGeneration();
            });

        // 确认替换按钮
        this.acceptButton = new ButtonComponent(actions)
            .setButtonText($t('streaming-diff-modal.confirm'))
            .setCta()
            .onClick(() => {
                this.onAccept(this.currentModified);
                this.close();
            });
        this.acceptButton.setDisabled(true); // 流式完成前禁用

        // 取消按钮
        new ButtonComponent(actions)
            .setButtonText($t('streaming-diff-modal.cancel'))
            .onClick(() => {
                this.abortController?.abort();
                this.close();
            });

        // 注册快捷键
        this.registerKeyboardShortcuts();
    }

    /**
     * 注册键盘快捷键
     */
    private registerKeyboardShortcuts() {
        this.scope.register(['Ctrl'], 'z', (e) => {
            e.preventDefault();
            this.undo();
            return false;
        });

        this.scope.register(['Ctrl'], 'y', (e) => {
            e.preventDefault();
            this.redo();
            return false;
        });

        this.scope.register(['Ctrl', 'Shift'], 'z', (e) => {
            e.preventDefault();
            this.redo();
            return false;
        });
    }

    /**
     * 获取 AbortController 用于外部控制中断
     */
    public getAbortSignal(): AbortSignal {
        this.abortController = new AbortController();
        return this.abortController.signal;
    }

    /**
     * 流式接收数据 - 追加模式
     */
    public appendChunk(chunk: string) {
        if (!this.isStreaming) return;

        this.currentModified += chunk;
        this.rightTextArea.setValue(this.currentModified);
        this.debouncedRenderDiff(); // 使用防抖版本

        // 更新进度条（预估进度，基于原始内容长度的 1.5 倍）
        const estimatedTotal = Math.max(this.original.length * 1.5, 100);
        const progress = Math.min((this.currentModified.length / estimatedTotal) * 100, 95);
        this.updateProgress(progress);

        // 更新状态
        const charCount = this.currentModified.length;
        this.statusEl.setText($t('streaming-diff-modal.generating-progress').replace('{0}', String(charCount)));

        // 自动滚动到底部
        const textareaEl = this.rightTextArea.inputEl;
        textareaEl.scrollTop = textareaEl.scrollHeight;
    }

    /**
     * 更新进度条
     */
    private updateProgress(percentage: number) {
        this.progressBarFill.style.width = `${percentage}%`;
    }

    /**
     * 流式完成
     */
    public finishStreaming() {
        this.isStreaming = false;
        this.updateProgress(100);
        this.statusEl.setText($t('streaming-diff-modal.complete').replace('{0}', String(this.currentModified.length)));
        this.statusEl.addClass('streaming-complete');
        this.acceptButton.setDisabled(false);
        this.stopButton.setDisabled(true);
        this.regenerateButton.setDisabled(!this.regenerateCallback); // 启用重新生成
        this.rightTextArea.setDisabled(false); // 启用编辑

        // 保存初始状态到历史
        this.saveToHistory();

        // 聚焦到文本区域
        this.rightTextArea.inputEl.focus();
    }

    /**
     * 流式出错
     */
    public showError(message: string) {
        this.isStreaming = false;
        this.statusEl.setText($t('streaming-diff-modal.error').replace('{0}', message));
        this.statusEl.addClass('streaming-error');
        this.stopButton.setDisabled(true);
        this.regenerateButton.setDisabled(!this.regenerateCallback); // 启用重新生成
        this.progressBarFill.addClass('streaming-progress-error');

        // 如果有部分内容，仍允许编辑和确认
        if (this.currentModified.length > 0) {
            this.acceptButton.setDisabled(false);
            this.rightTextArea.setDisabled(false);
        }
    }

    /**
     * 停止生成
     */
    private stopGeneration() {
        this.isStreaming = false;
        this.abortController?.abort();
        this.statusEl.setText($t('streaming-diff-modal.stopped').replace('{0}', String(this.currentModified.length)));
        this.stopButton.setDisabled(true);
        this.regenerateButton.setDisabled(!this.regenerateCallback); // 启用重新生成

        // 允许编辑已生成的内容
        if (this.currentModified.length > 0) {
            this.acceptButton.setDisabled(false);
            this.rightTextArea.setDisabled(false);
            this.saveToHistory();
        }
    }

    /**
     * 重新生成 - 重置状态并重新调用 AI
     */
    public async regenerate(): Promise<void> {
        if (!this.regenerateCallback) return;

        // 重置状态
        this.currentModified = "";
        this.rightTextArea.setValue("");

        // 重置历史记录
        this.history = [];
        this.historyIndex = -1;
        this.updateHistoryButtons();

        // 重置进度条
        this.updateProgress(0);
        this.progressBarFill.removeClass('streaming-progress-error');

        // 重置状态文本
        this.statusEl.setText($t('streaming-diff-modal.regenerating'));
        this.statusEl.removeClass('streaming-complete', 'streaming-error');

        // 重置按钮状态
        this.isStreaming = true;
        this.acceptButton.setDisabled(true);
        this.stopButton.setDisabled(false);
        this.regenerateButton.setDisabled(true);
        this.undoButton.setDisabled(true);
        this.redoButton.setDisabled(true);
        this.rightTextArea.setDisabled(true);

        // 清空左侧 Diff 显示
        this.renderOriginal();

        // 创建新的 AbortController
        this.abortController = new AbortController();

        try {
            // 调用 AI 重新生成
            await this.regenerateCallback(
                (chunk: string) => this.appendChunk(chunk),
                this.abortController.signal
            );
            this.finishStreaming();
        } catch (error) {
            if ((error as any).name !== 'AbortError') {
                Logger.error("StreamingDiffModal", "重新生成失败", error);
                this.showError($t('streaming-diff-modal.regenerate-failed'));
            }
        }
    }

    /**
     * 保存到历史记录
     */
    private saveToHistory() {
        // 截断未来历史（如果用户撤销后编辑）
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(this.currentModified);
        this.historyIndex++;

        // 限制历史大小
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }

        this.updateHistoryButtons();
    }

    /**
     * 撤销
     */
    private undo() {
        if (this.historyIndex > 0) {
            this.isUndoRedo = true;
            this.historyIndex--;
            this.currentModified = this.history[this.historyIndex];
            this.rightTextArea.setValue(this.currentModified);
            this.renderDiff();
            this.updateHistoryButtons();
            this.isUndoRedo = false;
        }
    }

    /**
     * 重做
     */
    private redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.isUndoRedo = true;
            this.historyIndex++;
            this.currentModified = this.history[this.historyIndex];
            this.rightTextArea.setValue(this.currentModified);
            this.renderDiff();
            this.updateHistoryButtons();
            this.isUndoRedo = false;
        }
    }

    /**
     * 更新历史按钮状态
     */
    private updateHistoryButtons() {
        this.undoButton.setDisabled(this.historyIndex <= 0);
        this.redoButton.setDisabled(this.historyIndex >= this.history.length - 1);
    }

    /**
     * 渲染原始内容（初始状态）
     */
    private renderOriginal() {
        this.leftContentEl.empty();
        this.leftContentEl.createEl('span', {
            text: this.original,
            cls: 'diff-common'
        });
    }

    /**
     * 实时渲染 Diff - 高亮显示差异
     */
    private renderDiff() {
        this.leftContentEl.empty();

        // 计算字符级 Diff
        const diff = Diff.diffChars(this.original, this.currentModified);

        // 渲染左侧（原始内容 + 删除高亮）
        diff.forEach(part => {
            if (part.removed) {
                // 被删除的内容（原文有，修改后没有）→ 红色删除线
                this.leftContentEl.createEl('span', {
                    cls: 'diff-remove',
                    text: part.value
                });
            } else if (!part.added) {
                // 共同内容（两边都有）
                this.leftContentEl.createEl('span', {
                    cls: 'diff-common',
                    text: part.value
                });
            }
            // part.added 的内容不在左侧显示（它是新增的，只在右侧显示）
        });
    }

    onClose() {
        this.abortController?.abort();
        const { contentEl } = this;
        contentEl.empty();
    }
}
