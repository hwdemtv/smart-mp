
import { Notice, Setting } from "obsidian";
import { SettingSection } from "./setting-section";
import { $t } from "src/lang/i18n";
import { PreviewPanel } from "src/views/previewer";

export class GeneralSection extends SettingSection {
    render(): void {
        this.createGeneralSettings(this.container);
    }

    private createGeneralSettings(container: HTMLElement) {
        const frame = this.createCollapsibleFrame("⚙️ 通用与交互 (General & Interaction)", true);

        new Setting(frame)
            .setName($t("settings.general-section.enable-floating-toolbar"))
            .setDesc($t("settings.general-section.enable-floating-toolbar-desc"))
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.enableFloatingToolbar ?? true)
                    .onChange(async (value) => {
                        this.plugin.settings.enableFloatingToolbar = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(frame)
            .setName($t("settings.real-time-render"))
            .setDesc($t("settings.enable-real-time-rendering"))
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.realTimeRender)
                    .onChange((value) => {
                        this.plugin.settings.realTimeRender = value;
                        void this.plugin.saveSettings();
                    });
            });

        new Setting(frame)
            .setName($t("settings.real-time-render-delay"))
            .setDesc($t("settings.real-time-render-delay-desc"))
            .addSlider((slider) => {
                slider
                    .setLimits(300, 2000, 100)
                    .setValue(this.plugin.settings.realTimeRenderDelay || 500)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.realTimeRenderDelay = value;
                        await this.plugin.saveSettings();

                        // Rebuild debounce for active previewer
                        const leaves = this.app.workspace.getLeavesOfType("smart-mp-article-preview");
                        for (const leaf of leaves) {
                            if (leaf.view instanceof PreviewPanel) {
                                (leaf.view as any).rebuildDebounce();
                            }
                        }
                    });
            });
    }
}
