
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
            .setDesc($t("settings.center-token-server-desc") || "使用反代服务器获取微信 access_token，无需配置 IP 白名单。适用于无法获取静态公网 IP 的设备。")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.useCenterToken ?? false)
                    .onChange(async (value) => {
                        const isPro = await this.plugin.authService.isProActive();
                        if (value && !isPro) {
                            new Notice($t("settings.pro-feature-alert") || "这是 Pro 专属功能。请激活 Pro 版以使用中心令牌服务器。");
                            toggle.setValue(false);
                            return;
                        }

                        this.plugin.settings.useCenterToken = value;
                        await this.plugin.saveSettings();

                        // 清除缓存的中心令牌
                        if (!value) {
                            const { WechatClient } = await import("src/wechat-api/wechat-client");
                            WechatClient.getInstance(this.plugin).clearCenterTokenCache();
                        }

                        new Notice(value
                            ? $t("wechat-api.center-token-enabled")
                            : $t("wechat-api.center-token-disabled")
                        );
                    });
            });
    }
}
