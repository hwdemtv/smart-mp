import { Notice, Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import { SmartMPSettingTab } from "../setting-tab";
import { SECTION_IDS } from "../section-ids";

async function checkProStatus(plugin: SmartMPSettingTab["plugin"]): Promise<boolean> {
    return await plugin.authService.isProActive();
}

export function renderLicenseSection(
    tab: SmartMPSettingTab,
    container: HTMLElement
): void {
    const { plugin } = tab;
    const frame = tab.createCollapsibleFrame(
        container,
        $t("settings.sections.license"),
        false,
        'ww-main-sections',
        SECTION_IDS.license
    );

    // Status Banner
    const statusBanner = frame.createDiv({ cls: 'smart-mp-license-status smart-mp-license-banner' });

    const updateBanner = async () => {
        const isPro = await checkProStatus(plugin);
        statusBanner.empty();
        statusBanner.removeClass('is-pro', 'is-free');

        if (isPro) {
            statusBanner.addClass('is-pro');

            const badge = statusBanner.createSpan({ cls: 'smart-mp-license-badge is-pro' });
            badge.textContent = $t("settings.license.pro-active-badge");

            const info = statusBanner.createSpan({ cls: 'smart-mp-license-info' });
            info.textContent = $t("settings.license.pro-active-info");
        } else {
            statusBanner.addClass('is-free');

            const badge = statusBanner.createSpan({ cls: 'smart-mp-license-badge is-free' });
            badge.textContent = $t("settings.license.free-badge");

            const info = statusBanner.createSpan({ cls: 'smart-mp-license-info' });
            info.textContent = $t("settings.license.free-info");
        }
    };

    // 异步获取并渲染状态
    void updateBanner();

    // Current Device Info
    new Setting(frame)
        .setName($t("settings.license.current-device"))
        .setDesc($t("settings.license.current-device-desc"))
        .addText(text => {
            text.inputEl.style.width = "200px";
            text.setDisabled(true).setValue(plugin.authService.getDeviceId());
        })
        .addButton((btn) => {
            btn.setButtonText($t("settings.license.unbind-btn"))
                .setWarning()
                .onClick(async () => {
                    const isPro = await checkProStatus(plugin);
                    if (!isPro) {
                        new Notice($t("notice.auth.not-bound"));
                        return;
                    }
                    const unbinded = await plugin.authService.unbindDevice();
                    if (unbinded) {
                        tab.display(); // 刷新 UI
                    }
                });
        });

    // Activation Input
    // 标准 password 输入框 + 显隐切换（详见 tab 内实现说明）
    let passwordVisible = false;
    let passwordInputEl: HTMLInputElement | null = null;
    new Setting(frame)
        .setName($t("settings.license.activation-code"))
        .setDesc($t("settings.license.activation-code-desc"))
        .addText((text) => {
            passwordInputEl = text.inputEl;
            text.inputEl.addClass('smart-mp-input-w200');
            text.inputEl.type = "password";
            text.setPlaceholder($t("settings.license.activation-code-placeholder"));
            // 首次打开设置页时懒解密可能尚未触发，解密完成后回填
            void plugin.ensureDecrypted().then(() => {
                if (plugin.settings.proPassword) {
                    text.setValue(plugin.settings.proPassword);
                }
            });
            // 只更新内存；持久化在"联网验证"成功后由 verifyLicense 触发
            text.onChange((v) => {
                plugin.settings.proPassword = v;
            });
        })
        .addExtraButton((btn) => {
            btn.setIcon("eye")
                .setTooltip($t("settings.license.toggle-password-visibility"))
                .onClick(() => {
                    passwordVisible = !passwordVisible;
                    if (passwordInputEl) {
                        passwordInputEl.type = passwordVisible ? "text" : "password";
                    }
                    btn.setIcon(passwordVisible ? "eye-off" : "eye");
                });
        })
        .addButton((btn) => {
            btn.setButtonText($t("settings.license.verify-online-btn"))
                .setCta()
                .onClick(async () => {
                    btn.setButtonText($t("settings.license.verifying"));
                    btn.setDisabled(true);
                    const password = plugin.settings.proPassword;
                    if (!password) {
                        new Notice($t("notice.settings.license-key-required"));
                        btn.setButtonText($t("settings.license.verify-online-btn")).setDisabled(false);
                        return;
                    }
                    const isVerified = await plugin.authService.verifyLicense(password);
                    if (isVerified) {
                        tab.display(); // Refresh to show new status
                    } else {
                        btn.setButtonText($t("settings.license.verify-online-btn")).setDisabled(false);
                    }
                });
        });

    // Pro Benefits Info
    // [Security] 此前整块 innerHTML 注入；静态文案改用 DOM API 构建
    const benefitsEl = frame.createDiv({ cls: 'smart-mp-benefits' });
    const benefitsTitle = benefitsEl.createDiv({ text: $t("settings.license.benefits-title") });
    benefitsTitle.style.fontWeight = '600';
    benefitsTitle.style.marginBottom = '8px';

    const benefitList = benefitsEl.createDiv();
    benefitList.style.color = 'var(--text-muted)';
    benefitList.style.lineHeight = '1.8';
    for (const benefitText of [
        $t("settings.license.benefit-center-token"),
        $t("settings.license.benefit-support"),
        $t("settings.license.benefit-updates"),
        $t("settings.license.benefit-roaming"),
    ]) {
        benefitList.createEl('div', { text: benefitText });
    }

    const linkContainer = benefitsEl.createDiv();
    linkContainer.style.marginTop = '12px';
    linkContainer.style.paddingTop = '12px';
    linkContainer.style.borderTop = '1px solid var(--background-modifier-border)';
    linkContainer.style.color = 'var(--text-accent)';
    const activationLink = linkContainer.createEl('a', {
        text: $t("settings.license.get-activation-code"),
        href: "https://github.com/hwdemtv/smart-mp#pro-features",
    });
    activationLink.style.textDecoration = 'none';
}
