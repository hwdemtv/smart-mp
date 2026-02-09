
import { Notice, Setting } from "obsidian";
import { SettingSection } from "./setting-section";
import { CryptoHelper } from "src/utils/crypto-helper";

export class LicenseSection extends SettingSection {
    render(): void {
        this.createLicenseSettings(this.container);
    }

    private async checkProStatus(): Promise<boolean> {
        const PRO_SECRET_HASH = "d33df98683fde354f929554ea349ed13505d9ad04aeb67ec2bed7b831e9d47df";
        const userPasswordHash = await CryptoHelper.sha256(this.plugin.settings.proPassword || "");
        return userPasswordHash === PRO_SECRET_HASH;
    }

    private createLicenseSettings(container: HTMLElement) {
        const frame = this.createCollapsibleFrame("🔐 授权管理 (License)", true);

        // Status Banner
        const statusBanner = frame.createDiv({ cls: 'smart-mp-license-status' });

        this.updateStatusBanner(statusBanner);

        // Activation Input
        new Setting(frame)
            .setName("激活码")
            .setDesc("输入激活码以解锁 Pro 功能（去除水印、优先支持等）")
            .addText((text) => {
                text.inputEl.type = "password";
                text.inputEl.addClass("smart-mp-license-input");
                text
                    .setPlaceholder("请输入激活码")
                    .setValue(this.plugin.settings.proPassword || "")
                    .onChange(async (value) => {
                        this.plugin.settings.proPassword = value;
                        await this.plugin.saveSettings();
                    });
            })
            .addButton((btn) => {
                btn.setButtonText("验证")
                    .setCta()
                    .onClick(async () => {
                        const isValid = await this.checkProStatus();
                        if (isValid) {
                            new Notice("✅ 激活成功！Pro 功能已解锁");
                        } else {
                            new Notice("❌ 激活码无效，请检查后重试");
                        }
                        // Refresh banner
                        this.updateStatusBanner(statusBanner);
                    });
            });

        // Pro Benefits Info
        const benefitsEl = frame.createDiv({ cls: 'smart-mp-license-benefits' });
        benefitsEl.innerHTML = `
			<div class="smart-mp-license-benefits-title">SmartMP Pro 权益 (¥69 永久买断)：</div>
			<div class="smart-mp-license-benefits-list">
				✨ <b>去除水印</b>：发布文章纯净无广告<br>
				🎨 <b>主题克隆</b>：一键复刻任意公众号排版<br>
				🛠️ <b>优先支持</b>：一对一解决使用问题<br>
				📦 <b>永久更新</b>：包含所有未来本地新功能<br>
				🎁 <b>云端特权</b>：未来云服务上线享折扣/赠送
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
            info.textContent = '已解锁全部功能，发布文章不含水印';
        } else {
            container.addClass('is-free');

            const badge = container.createSpan({ cls: 'smart-mp-license-badge is-free' });
            badge.textContent = '免费版';

            const info = container.createSpan({ cls: 'smart-mp-license-info' });
            info.textContent = '发布文章将包含 SmartMP 推广水印';
        }
    }
}
