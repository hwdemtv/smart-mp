import { Notice, Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import { WechatClient } from "src/wechat-api/wechat-client";
import { SmartMPSettingTab } from "../setting-tab";
import { SECTION_IDS } from "../section-ids";

export function renderSecuritySection(
    tab: SmartMPSettingTab,
    container: HTMLElement
): void {
    const { plugin } = tab;
    const frame = tab.createCollapsibleFrame(
        container,
        $t("settings.sections.security"),
        false,
        'ww-main-sections',
        SECTION_IDS.security
    );

    new Setting(frame)
        .setName($t("settings.enable-strict-security-mode"))
        .setDesc($t("settings.enable-strict-security-mode-desc"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.enableStrictSecurityMode ?? true)
                .onChange(async (value) => {
                    plugin.settings.enableStrictSecurityMode = value;
                    await plugin.saveSettings();
                });
        });

    new Setting(frame)
        .setName($t("settings.use-center-token-server"))
        .setDesc($t("settings.center-token-server-desc"))
        .addToggle((toggle) => {
            toggle
                .setValue(plugin.settings.useCenterToken ?? false)
                .onChange(async (value) => {
                    plugin.settings.useCenterToken = value;
                    await plugin.saveSettings();

                    // 清除缓存的中心令牌
                    if (!value) {
                        WechatClient.getInstance(plugin).clearCenterTokenCache();
                    }

                    new Notice(value
                        ? $t("wechat-api.center-token-enabled")
                        : $t("wechat-api.center-token-disabled")
                    );
                });
        });
}
