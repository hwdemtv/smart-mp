import { Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";
import { ThemeManager } from "src/theme/theme-manager";
import { FolderSuggest } from "src/utils/folder-suggest";
import { ThemeCloneModal } from "src/modals/theme-clone-modal";
import { SmartMPSettingTab } from "../setting-tab";
import { SECTION_IDS } from "../section-ids";

export function renderAppearanceSection(
    tab: SmartMPSettingTab,
    container: HTMLElement
): void {
    const { plugin } = tab;
    const frame = tab.createCollapsibleFrame(
        container,
        $t("settings.sections.appearance"),
        false,
        'ww-main-sections',
        SECTION_IDS.appearance
    );

    /** 变更后重渲染所有预览 */
    const rerenderPreview = () => tab.applyToPreviewers((view) => view.renderDraft());

    new Setting(frame)
        .setName($t("settings.custom-themes-folder"))
        .setDesc($t("settings.the-folder-where-your-custom-themes"))
        .addSearch((cb) => {
            new FolderSuggest(tab.app, cb.inputEl);
            cb.setPlaceholder($t("settings.themes-folder-path"))
                .setValue(plugin.settings.css_styles_folder)
                .onChange((new_folder) => {
                    plugin.settings.css_styles_folder = new_folder;
                    void plugin.saveThemeFolderDebounce();
                });
        })
        .addExtraButton((button) => {
            button
                .setIcon("download")
                .setTooltip($t("views.theme-manager.download-predefined-custom-themes"))
                .onClick(() => {
                    void ThemeManager.getInstance(plugin).downloadThemes();
                });
        });

    new Setting(frame)
        .setName($t("settings.clone-theme-from-url"))
        .setDesc($t("settings.clone-theme-desc"))
        .addButton((button) => {
            button
                .setButtonText($t("settings.clone-theme-btn"))
                .setIcon("copy")
                .onClick(async () => {
                    new ThemeCloneModal(tab.app, plugin as SmartMPPlugin).open();
                });
        });

    new Setting(frame)
        .setName($t("settings.show-image-captions"))
        .setDesc($t("settings.show-image-captions-desc"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.showImageCaptions || false)
                .onChange(async (value) => {
                    plugin.settings.showImageCaptions = value;
                    await plugin.saveSettings();
                    rerenderPreview();
                });
        });

    // [接线] 标点规范化：cjk-punctuation.ts 实现完整但此前无任何入口
    new Setting(frame)
        .setName($t("settings.normalize-punctuation"))
        .setDesc($t("settings.normalize-punctuation-desc"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.normalizePunctuation ?? false)
                .onChange(async (value) => {
                    plugin.settings.normalizePunctuation = value;
                    await plugin.saveSettings();
                    rerenderPreview();
                });
        });

    // [接线] 微信兼容预览：预览阶段过滤微信不支持的 CSS，所见即微信所得
    new Setting(frame)
        .setName($t("settings.wechat-compat-preview"))
        .setDesc($t("settings.wechat-compat-preview-desc"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.wechatCompatPreview ?? true)
                .onChange(async (value) => {
                    plugin.settings.wechatCompatPreview = value;
                    await plugin.saveSettings();
                    rerenderPreview();
                });
        });

    // [接线] 正文字号：设置项长期存在但设置页无控件（幽灵配置）
    new Setting(frame)
        .setName($t("settings.font-size"))
        .setDesc($t("settings.font-size-desc"))
        .addDropdown((dropdown) => {
            ["14px", "15px", "16px", "17px", "18px"].forEach((size) => {
                dropdown.addOption(size, size);
            });
            dropdown
                .setValue(plugin.settings.fontSize || "15px")
                .onChange(async (value) => {
                    plugin.settings.fontSize = value;
                    await plugin.saveSettings();
                    rerenderPreview();
                });
        });

    // [接线] 首行缩进
    new Setting(frame)
        .setName($t("settings.first-line-indent"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.firstLineIndent ?? false)
                .onChange(async (value) => {
                    plugin.settings.firstLineIndent = value;
                    await plugin.saveSettings();
                    rerenderPreview();
                });
        });

    // [接线] 代码高亮主题
    new Setting(frame)
        .setName($t("settings.code-theme"))
        .addDropdown((dropdown) => {
            const themes: Array<{ value: string; label: string }> = [
                { value: "github", label: "GitHub Light" },
                { value: "github-light", label: "GitHub Light (Alt)" },
                { value: "atom-one-dark", label: "Atom One Dark" },
                { value: "dracula", label: "Dracula" },
                { value: "monokai", label: "Monokai" },
                { value: "vs2015", label: "VS 2015" },
                { value: "default", label: "Default" },
            ];
            themes.forEach((t) => dropdown.addOption(t.value, t.label));
            dropdown
                .setValue(plugin.settings.codeTheme || "github")
                .onChange(async (value) => {
                    plugin.settings.codeTheme = value as SmartMPPlugin["settings"]["codeTheme"];
                    await plugin.saveSettings();
                    rerenderPreview();
                });
        });

    // [接线] 代码块行号
    new Setting(frame)
        .setName($t("settings.code-line-number"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.codeLineNumber ?? true)
                .onChange(async (value) => {
                    plugin.settings.codeLineNumber = value;
                    await plugin.saveSettings();
                    rerenderPreview();
                });
        });

    // [接线] Mac 风格代码块头部
    new Setting(frame)
        .setName($t("settings.show-code-mac-header"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.showCodeMacHeader ?? true)
                .onChange(async (value) => {
                    plugin.settings.showCodeMacHeader = value;
                    await plugin.saveSettings();
                    rerenderPreview();
                });
        });

    new Setting(frame)
        .setName($t("settings.hr-title"))
        .setDesc($t("settings.hr-desc"))
        .addDropdown((dropdown) => {
            dropdown
                .addOption("native", $t("settings.hr-style.native"))
                .addOption("dots", $t("settings.hr-style.dots"))
                .addOption("lines", $t("settings.hr-style.lines"))
                .addOption("stars", $t("settings.hr-style.stars"))
                .addOption("custom", $t("settings.hr-style.custom"))
                .addOption("none", $t("settings.hr-style.none"))
                .setValue(plugin.settings.hrStyle || "native")
                .onChange(async (value) => {
                    plugin.settings.hrStyle = value;
                    await plugin.saveSettings();

                    // Fast refresh: only update HR elements, no full re-render
                    tab.applyToPreviewers((view) => view.refreshHRStyle());

                    tab.display(); // 刷新以显示/隐藏自定义文本框
                });
        });

    if (plugin.settings.hrStyle === "custom") {
        new Setting(frame)
            .setName($t("settings.custom-hr-text"))
            .addText((text) =>
                text
                    .setValue(plugin.settings.customHrText || "")
                    .onChange(async (value) => {
                        plugin.settings.customHrText = value;
                        await plugin.saveSettings();

                        // Fast refresh: only update HR elements
                        tab.applyToPreviewers((view) => view.refreshHRStyle());
                    })
            );
    }
}
