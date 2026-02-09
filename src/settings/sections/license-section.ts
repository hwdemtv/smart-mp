
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
        // 初始状态为未知，异步检查后更新

        const frame = this.createCollapsibleFrame("🔐 授权管理 (License)", true);

        // Status Banner
        const statusBanner = frame.createDiv({ cls: 'smart-mp-license-status' });
        statusBanner.style.padding = '12px 16px';
        statusBanner.style.borderRadius = '8px';
        statusBanner.style.marginBottom = '16px';
        statusBanner.style.display = 'flex';
        statusBanner.style.alignItems = 'center';
        statusBanner.style.gap = '12px';

        this.updateStatusBanner(statusBanner);

        // Activation Input
        new Setting(frame)
            .setName("激活码")
            .setDesc("输入激活码以解锁 Pro 功能（去除水印、优先支持等）")
            .addText((text) => {
                text.inputEl.type = "password";
                text.inputEl.style.width = '200px';
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
        const benefitsEl = frame.createDiv();
        benefitsEl.style.marginTop = '12px';
        benefitsEl.style.padding = '12px';
        benefitsEl.style.background = 'var(--background-secondary)';
        benefitsEl.style.borderRadius = '6px';
        benefitsEl.style.fontSize = '13px';
        benefitsEl.innerHTML = `
			<div style="font-weight: 600; margin-bottom: 8px;">SmartMP Pro 权益 (¥69 永久买断)：</div>
			<div style="color: var(--text-muted); line-height: 1.8;">
				✨ <b>去除水印</b>：发布文章纯净无广告<br>
				🎨 <b>主题克隆</b>：一键复刻任意公众号排版<br>
				🛠️ <b>优先支持</b>：一对一解决使用问题<br>
				📦 <b>永久更新</b>：包含所有未来本地新功能<br>
				🎁 <b>云端特权</b>：未来云服务上线享折扣/赠送
			</div>
			<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--background-modifier-border); color: var(--text-accent);">
			<a href="https://github.com/hwdemtv/smart-mp#pro-features" style="text-decoration: none;">
				🎫 获取激活码 / Get Activation Code
			</a>
		</div>
	`;
    }

    private async updateStatusBanner(container: HTMLElement) {
        container.empty();
        const isPro = await this.checkProStatus();

        if (isPro) {
            container.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(16, 185, 129, 0.1))';
            container.style.border = '1px solid rgba(34, 197, 94, 0.3)';

            const badge = container.createSpan();
            badge.style.background = '#22c55e';
            badge.style.color = 'white';
            badge.style.padding = '4px 10px';
            badge.style.borderRadius = '12px';
            badge.style.fontSize = '12px';
            badge.style.fontWeight = '600';
            badge.textContent = '✓ Pro 已激活';

            const info = container.createSpan();
            info.style.color = 'var(--text-muted)';
            info.style.fontSize = '13px';
            info.textContent = '已解锁全部功能，发布文章不含水印';
        } else {
            container.style.background = 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(245, 158, 11, 0.1))';
            container.style.border = '1px solid rgba(251, 191, 36, 0.3)';

            const badge = container.createSpan();
            badge.style.background = '#f59e0b';
            badge.style.color = 'white';
            badge.style.padding = '4px 10px';
            badge.style.borderRadius = '12px';
            badge.style.fontSize = '12px';
            badge.style.fontWeight = '600';
            badge.textContent = '免费版';

            const info = container.createSpan();
            info.style.color = 'var(--text-muted)';
            info.style.fontSize = '13px';
            info.textContent = '发布文章将包含 SmartMP 推广水印';
        }
    }
}
