import { Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import { SmartMPSettingTab } from "../setting-tab";
import { SECTION_IDS } from "../section-ids";

export function renderGeneralSection(
    tab: SmartMPSettingTab,
    container: HTMLElement
): void {
    const { plugin } = tab;
    const frame = tab.createCollapsibleFrame(
        container,
        $t("settings.sections.general"),
        false,
        'ww-main-sections',
        SECTION_IDS.general
    );

    new Setting(frame)
        .setName($t("settings.general-section.enable-floating-toolbar"))
        .setDesc($t("settings.general-section.enable-floating-toolbar-desc"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.enableFloatingToolbar ?? true)
                .onChange(async (value) => {
                    plugin.settings.enableFloatingToolbar = value;
                    await plugin.saveSettings();
                });
        });

    new Setting(frame)
        .setName($t("settings.real-time-render"))
        .setDesc($t("settings.enable-real-time-rendering"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.realTimeRender)
                .onChange((value) => {
                    plugin.settings.realTimeRender = value;
                    void plugin.saveSettings();
                });
        });

    new Setting(frame)
        .setName($t("settings.real-time-render-delay"))
        .setDesc($t("settings.real-time-render-delay-desc"))
        .addSlider((slider) => {
            slider
                .setLimits(300, 2000, 100)
                .setValue(plugin.settings.realTimeRenderDelay || 500)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    plugin.settings.realTimeRenderDelay = value;
                    await plugin.saveSettings();

                    // Rebuild debounce for active previewer
                    tab.applyToPreviewers((view) => view.rebuildDebounce());
                });
        });

    // ============== 滚动同步增强设置 ==============
    new Setting(frame)
        .setName($t("settings.scroll-sync-section.sync-mode"))
        .setDesc($t("settings.scroll-sync-section.sync-mode-desc"))
        .addDropdown((dropdown) => {
            dropdown
                .addOption("precise", $t("settings.scroll-sync-section.sync-mode-options.precise"))
                .addOption("proportional", $t("settings.scroll-sync-section.sync-mode-options.proportional"))
                .setValue(plugin.settings.scrollSyncMode || "precise")
                .onChange(async (value: "precise" | "proportional") => {
                    plugin.settings.scrollSyncMode = value;
                    await plugin.saveSettings();
                });
        });

    new Setting(frame)
        .setName($t("settings.scroll-sync-section.precision"))
        .setDesc($t("settings.scroll-sync-section.precision-desc"))
        .addDropdown((dropdown) => {
            dropdown
                .addOption("precise", $t("settings.scroll-sync-section.precision-options.precise"))
                .addOption("balanced", $t("settings.scroll-sync-section.precision-options.balanced"))
                .addOption("performance", $t("settings.scroll-sync-section.precision-options.performance"))
                .setValue(plugin.settings.scrollSyncPrecision || "balanced")
                .onChange(async (value: 'precise' | 'balanced' | 'performance') => {
                    plugin.settings.scrollSyncPrecision = value;
                    await plugin.saveSettings();
                });
        });

    new Setting(frame)
        .setName($t("settings.scroll-sync-section.highlight-style"))
        .setDesc($t("settings.scroll-sync-section.highlight-style-desc"))
        .addDropdown((dropdown) => {
            dropdown
                .addOption("gold", $t("settings.scroll-sync-section.highlight-options.gold"))
                .addOption("blue", $t("settings.scroll-sync-section.highlight-options.blue"))
                .addOption("green", $t("settings.scroll-sync-section.highlight-options.green"))
                .addOption("purple", $t("settings.scroll-sync-section.highlight-options.purple"))
                .addOption("minimal", $t("settings.scroll-sync-section.highlight-options.minimal"))
                .setValue(plugin.settings.scrollHighlightPreset || "gold")
                .onChange(async (value: 'gold' | 'blue' | 'green' | 'purple' | 'minimal') => {
                    plugin.settings.scrollHighlightPreset = value;
                    await plugin.saveSettings();
                });
        });

    new Setting(frame)
        .setName($t("settings.scroll-sync-section.line-level-sync"))
        .setDesc($t("settings.scroll-sync-section.line-level-sync-desc"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.enableCodeBlockLineMapping ?? false)
                .onChange(async (value) => {
                    plugin.settings.enableCodeBlockLineMapping = value;
                    await plugin.saveSettings();
                });
        });
}
