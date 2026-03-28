
import { Notice, Setting } from "obsidian";
import { SettingSection } from "./setting-section";
import { CryptoHelper } from "src/utils/crypto-helper";
import { $t } from "src/lang/i18n";

export class LicenseSection extends SettingSection {
    render(): void {
        const container = this.container;
        this.createLicenseSettings(container);

        // 注册监听器，当后台认证初始化完成时刷新 UI
        this.plugin.messageService.registerListener("auth-initialized", () => {
            const banner = container.querySelector('.smart-mp-license-status') as HTMLElement;
            if (banner) {
                this.updateStatusBanner(banner);
            }
            // 同时更新设备 ID 显示
            const deviceIdInput = container.querySelector('.smart-mp-license-input-device') as HTMLInputElement;
            if (deviceIdInput) {
                deviceIdInput.value = this.plugin.authService.getDeviceId();
            }
        });
    }

    private async checkProStatus(): Promise<boolean> {
        return await this.plugin.authService.isProActive();
    }

    private createLicenseSettings(container: HTMLElement) {
        const frame = this.createCollapsibleFrame("🔐 授权管理 (License)", true);

        // Status Banner
        const statusBanner = frame.createDiv({ cls: 'smart-mp-license-status' });

        this.updateStatusBanner(statusBanner);

        // Current Device Info
        new Setting(frame)
            .setName($t("settings.license.current-device"))
            .setDesc($t("settings.license.current-device-desc"))
            .addText(text => {
                text.inputEl.addClass("smart-mp-license-input-device");
                text.inputEl.style.width = "200px";
                text.setDisabled(true).setValue(this.plugin.authService.getDeviceId());
            })
            .addButton((btn) => {
                btn.setButtonText("解除绑定")
                    .setWarning()
                    .onClick(async () => {
                        const isPro = await this.checkProStatus();
                        if (!isPro) {
                            new Notice($t("notice.auth.not-bound") ?? "当前设备并未绑定激活码");
                            return;
                        }
                        const unbinded = await this.plugin.authService.unbindDevice();
                        if (unbinded) {
                            this.updateStatusBanner(statusBanner); // Refresh banner
                        }
                    });
            });

        // Activation Input
        let isPasswordVisible = false;
        let realPassword = this.plugin.settings.proPassword || "";

        new Setting(frame)
            .setName($t("settings.license.activation-code"))
            .setDesc($t("settings.license.activation-code-desc"))
            .addText((text) => {
                text.inputEl.addClass("smart-mp-license-input");

                text.inputEl.type = "text";

                if (realPassword) {
                    text.setValue("•".repeat(realPassword.length));
                } else {
                    text.setPlaceholder("请输入激活码");
                }

                let maskTimeout: number | null = null;
                text.inputEl.addEventListener('input', (e) => {
                    const inputEl = e.target as HTMLInputElement;
                    const value = inputEl.value;
                    const cursorPosition = inputEl.selectionStart || 0;

                    if (isPasswordVisible) {
                        realPassword = value;
                        this.plugin.settings.proPassword = realPassword;
                        return;
                    }

                    let newRealPassword = "";
                    let newDisplayedValue = "";
                    let realIndex = 0;

                    for (let i = 0; i < value.length; i++) {
                        const char = value[i];
                        if (char === "•") {
                            if (realIndex < realPassword.length) {
                                newRealPassword += realPassword[realIndex];
                                newDisplayedValue += "•";
                                realIndex++;
                            }
                        } else {
                            newRealPassword += char;
                            newDisplayedValue += char;
                        }
                    }

                    realPassword = newRealPassword;
                    this.plugin.settings.proPassword = realPassword;
                    inputEl.value = newDisplayedValue;
                    inputEl.setSelectionRange(cursorPosition, cursorPosition);

                    if (maskTimeout) window.clearTimeout(maskTimeout);
                    maskTimeout = window.setTimeout(() => {
                        if (!isPasswordVisible) {
                            const currentCursor = inputEl.selectionStart;
                            inputEl.value = "•".repeat(realPassword.length);
                            if (currentCursor !== null) {
                                inputEl.setSelectionRange(currentCursor, currentCursor);
                            }
                        }
                    }, 800);
                });

                const eyeIcon = document.createElement('span');
                eyeIcon.addClass('smart-mp-eye-icon');
                eyeIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
                eyeIcon.style.cursor = 'pointer';
                eyeIcon.style.marginLeft = '8px';
                eyeIcon.style.opacity = '0.5';
                eyeIcon.onclick = () => {
                    isPasswordVisible = !isPasswordVisible;
                    if (isPasswordVisible) {
                        text.inputEl.value = realPassword; // 恢复明文
                        eyeIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.579 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;
                        eyeIcon.style.opacity = '1';
                    } else {
                        text.inputEl.value = "•".repeat(realPassword.length); // 恢复掩码
                        eyeIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
                        eyeIcon.style.opacity = '0.5';
                    }
                };
                text.inputEl.insertAdjacentElement('afterend', eyeIcon);
            })
            .addButton((btn) => {
                btn.setButtonText("联网验证")
                    .setCta()
                    .onClick(async () => {
                        btn.setButtonText("验证中...");
                        btn.setDisabled(true);
                        const password = this.plugin.settings.proPassword;
                        if (!password) {
                            new Notice($t("notice.settings.license-key-required") ?? "⚠️ 激活码不能为空");
                            btn.setButtonText("联网验证").setDisabled(false);
                            return;
                        }
                        const isVerified = await this.plugin.authService.verifyLicense(password);
                        if (isVerified) {
                            this.updateStatusBanner(statusBanner);
                        } else {
                            btn.setButtonText("联网验证").setDisabled(false);
                        }
                    });
            });

        // Pro Benefits Info
        const benefitsEl = frame.createDiv({ cls: 'smart-mp-license-benefits' });
        benefitsEl.innerHTML = `
			<div class="smart-mp-license-benefits-title">SmartMP Pro 权益 (¥69 永久买断)：</div>
			<div class="smart-mp-license-benefits-list">
				✨ <b>中心令牌服务器</b>：无需公网 IP 即可同步<br>
				🛠️ <b>优先支持</b>：一对一解决使用问题<br>
				📦 <b>永久更新</b>：包含所有未来本地新功能<br>
				🎁 <b>多端漫游</b>：支持最多3台个人设备自动漫游验证
			</div>
			<div class="smart-mp-license-benefits-footer">
			<a href="https://github.com/hwdemtv/smart-mp#pro-features">
				🎫 获取激活码 / Get Activation Code
			</a>
		</div>
	`;
    }

    private async updateStatusBanner(container: HTMLElement) {
        container.empty();
        container.removeClass('is-pro', 'is-free');

        const isPro = await this.checkProStatus();

        if (isPro) {
            container.addClass('is-pro');

            const badge = container.createSpan({ cls: 'smart-mp-license-badge is-pro' });
            badge.textContent = '✓ Pro 已激活';

            const info = container.createSpan({ cls: 'smart-mp-license-info' });
            info.textContent = '已解锁全部功能，支持中心令牌中转';
        } else {
            container.addClass('is-free');

            const badge = container.createSpan({ cls: 'smart-mp-license-badge is-free' });
            badge.textContent = '免费版';

            const info = container.createSpan({ cls: 'smart-mp-license-info' });
            info.textContent = '免费版支持基础功能，专业版支持中心令牌中转';
        }
    }
}
