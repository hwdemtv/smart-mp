
import { App, Modal, Setting, TextComponent, TextAreaComponent, ButtonComponent, Notice } from "obsidian";
import { $t } from "src/lang/i18n";

export class TitleSuggestModal extends Modal {
    private titles: string[];
    private currentTitle: string;
    private onSubmit: (title: string) => void;
    private onSave?: (titles: string[]) => void;
    private editArea: TextAreaComponent;

    constructor(app: App, titles: string[], currentTitle: string, onSubmit: (title: string) => void, onSave?: (titles: string[]) => void) {
        super(app);
        this.titles = titles;
        this.currentTitle = currentTitle;
        this.onSubmit = onSubmit;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("smart-mp-title-modal");

        contentEl.createEl("h2", { text: $t("views.article-header.ai-title-recommendation") ?? "AI 推荐标题" });
        contentEl.createEl("p", { text: $t("views.article-header.click-to-use") ?? "点击下方标题可直接填入编辑框" });

        // Container for candidate titles
        const listContainer = contentEl.createDiv({ cls: "smart-mp-title-list" });
        listContainer.style.maxHeight = "300px";
        listContainer.style.overflowY = "auto";
        listContainer.style.marginBottom = "20px";
        listContainer.style.border = "1px solid var(--background-modifier-border)";
        listContainer.style.borderRadius = "4px";
        listContainer.style.padding = "10px";

        this.titles.forEach((title) => {
            const item = listContainer.createDiv({ cls: "smart-mp-title-item" });
            item.style.padding = "8px";
            item.style.borderBottom = "1px solid var(--background-modifier-border-hover)";
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.gap = "10px";

            // Title Text - Selectable
            const textSpan = item.createSpan({ text: title });
            textSpan.style.flex = "1";
            textSpan.style.userSelect = "text"; // Allow selection
            textSpan.style.cursor = "text";

            // Action Container
            const actionDiv = item.createDiv({ cls: "smart-mp-title-actions" });

            // Use Button
            const useBtn = new ButtonComponent(actionDiv)
                .setIcon("arrow-down-circle")
                .setTooltip($t("views.article-header.click-to-use") ?? "填入")
                .onClick(() => {
                    this.currentTitle = title;
                    this.editArea.setValue(title);
                });
            useBtn.buttonEl.style.height = "24px";
            useBtn.buttonEl.style.boxShadow = "none";
            useBtn.buttonEl.style.background = "transparent";

            item.addEventListener("mouseenter", () => {
                item.style.backgroundColor = "var(--background-secondary)";
            });
            item.addEventListener("mouseleave", () => {
                item.style.backgroundColor = "transparent";
            });
        });

        contentEl.createEl("h3", { text: $t("views.article-header.edit-title") ?? "编辑最终标题:" });

        // Edit Area
        this.editArea = new TextAreaComponent(contentEl)
            .setValue(this.currentTitle)
            .setPlaceholder("在此处编辑最终标题...")
            .onChange((value) => {
                this.currentTitle = value;
            });

        this.editArea.inputEl.style.width = "100%";
        this.editArea.inputEl.style.height = "80px";
        this.editArea.inputEl.style.marginBottom = "20px";

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: "smart-mp-modal-buttons" });
        buttonContainer.style.display = "flex";
        buttonContainer.style.justifyContent = "flex-end";
        buttonContainer.style.gap = "10px";

        // Save Button
        if (this.onSave) {
            const onSave = this.onSave;
            new ButtonComponent(buttonContainer)
                .setButtonText($t("views.article-header.save-candidates") ?? "保存所有标题到笔记")
                .setIcon("save")
                .setTooltip($t("views.article-header.save-candidates") ?? "保存所有标题到笔记")
                .onClick(() => {
                    onSave(this.titles);
                    this.close();
                });
        }

        new ButtonComponent(buttonContainer)
            .setButtonText($t("settings.cancel") ?? "取消")
            .onClick(() => {
                this.close();
            });

        new ButtonComponent(buttonContainer)
            .setButtonText($t("settings.confirm") ?? "确认")
            .setCta()
            .onClick(() => {
                this.onSubmit(this.currentTitle);
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
