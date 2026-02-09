
import { Notice, Setting } from "obsidian";
import { SettingSection } from "./setting-section";
import { $t } from "src/lang/i18n";

export class SecuritySection extends SettingSection {
    render(): void {
        this.createSecuritySettings(this.container);
    }

    private createSecuritySettings(container: HTMLElement) {
        const frame = this.createCollapsibleFrame("🛡️ 高级设置 (Advanced Settings)");

        new Setting(frame)
            .setName($t("settings.enable-strict-security-mode") ?? "启用严格安全模式")
            .setDesc($t("settings.enable-strict-security-mode-desc") ?? "开启后将对 HTML 进行严格白名单过滤，防止 XSS 攻击。如果 Excalidraw 或 SVG 显示异常，请尝试关闭此选项。 (Default: ON)")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.enableStrictSecurityMode ?? true)
                    .onChange(async (value) => {
                        this.plugin.settings.enableStrictSecurityMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(frame)
            .setName($t("settings.use-center-token-server"))
            .setDesc(($t("settings.if-your-device-cannot-get-static-pubic-i") || "") + " (功能已暂时关闭，请待自建服务器后开启)")
            .addToggle((toggle) => {
                toggle
                    .setValue(false) // Force false in UI
                    .setDisabled(true) // Disable interaction
                    .onChange((value) => {
                        this.plugin.settings.useCenterToken = value;
                        void this.plugin.saveSettings();
                    });
            });
    }
}
