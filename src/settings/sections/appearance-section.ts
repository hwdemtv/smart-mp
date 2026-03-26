
import { Notice, Setting } from "obsidian";
import { SettingSection } from "./setting-section";
import { $t } from "src/lang/i18n";
import { FolderSuggest } from "src/utils/folder-suggest";
import { ThemeManager } from "src/theme/theme-manager";
import { ThemeCloneModal } from "src/modals/theme-clone-modal";
import { CryptoHelper } from "src/utils/crypto-helper";
import { PreviewPanel } from "src/views/previewer";

export class AppearanceSection extends SettingSection {
    render(): void {
        this.creatCSSStyleSetting(this.container);
    }

    private async checkProStatus(): Promise<boolean> {
        return await this.plugin.authService.isProActive();
    }

    private creatCSSStyleSetting(container: HTMLElement) {
        const frame = this.createCollapsibleFrame("🎨 外观与排版 (Appearance & Layout)");

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
}
