import { Notice } from "obsidian";
import { HwAuthClient } from "hw-auth-client";
import { $t } from "../lang/i18n";
import SmartMPPlugin from "../main";
import Logger from "../utils/logger";

/**
 * 认证服务 - 使用 hw-auth-client 实现多插件共享认证
 */
export class AuthService {
    private plugin: SmartMPPlugin;
    private authClient: HwAuthClient;

    // 多域名容灾：依次尝试，任一成功即返回
    private readonly AUTH_API_URLS = [
        "https://km.hwdemtv.com/api/v1/auth",
        "https://kami.hwdemtv.com/api/v1/auth",
        "https://hw-license-center.hwdemtv.workers.dev/api/v1/auth",
    ];

    constructor(plugin: SmartMPPlugin) {
        this.plugin = plugin;

        // 创建 hw-auth-client 实例
        this.authClient = new HwAuthClient({
            productId: 'smartmp',
            apiUrls: this.AUTH_API_URLS,
            app: plugin.app,
            storagePath: '.obsidian/hw-auth.json'
        });
    }

    /**
     * 初始化认证客户端
     */
    public async init(): Promise<void> {
        await this.authClient.init();

        // 尝试静默激活（检查其他插件的共享认证）
        const activated = await this.authClient.silentActivate();
        if (activated) {
            Logger.debug("AuthService", "Silent activation successful");
        }
    }

    /**
     * 获取设备 ID
     */
    public getDeviceId(): string {
        return this.authClient.getDeviceId();
    }

    /**
     * 验证激活码
     */
    public async verifyLicense(licenseKey: string): Promise<boolean> {
        try {
            const success = await this.authClient.activate(licenseKey);

            if (success) {
                // 保存到本地设置（兼容旧逻辑）
                this.plugin.settings.proToken = this.authClient.getToken() ?? undefined;
                this.plugin.settings.proPassword = licenseKey;

                // 获取产品信息
                const activation = this.authClient.getActivation();
                if (activation) {
                    this.plugin.settings.proProducts = activation.products.map(p => ({
                        product_id: p.productId,
                        status: p.status,
                        expires_at: p.expiresAt ?? null
                    }));
                }

                await this.plugin.saveSettings();

                // 检查到期提醒
                this.checkExpirationReminder();

                new Notice($t("notice.auth.activation-success") ?? "✅ 激活成功");
                return true;
            } else {
                new Notice($t("notice.auth.activation-failed") ?? "❌ 激活失败，请检查激活码是否正确");
                return false;
            }
        } catch (error) {
            Logger.error("AuthService", "鉴权服务请求失败:", error);
            new Notice($t("notice.auth.activation-network-error") ?? "❌ 无法连接到验证服务器，请检查网络");
            return false;
        }
    }

    /**
     * 判断当前是否拥有指定产品的有效订阅
     */
    public hasProduct(productId: string): boolean {
        return this.authClient.hasProduct(productId);
    }

    /**
     * 检查并提示即将到期的订阅 (提前 7 天以内)
     */
    public checkExpirationReminder() {
        const result = this.authClient.checkExpirationReminder();
        if (result && result.isExpiring) {
            new Notice(
                `⚠️ 您的互为卡密订阅将在 ${result.daysLeft} 天后到期，请及时续费！`,
                10000
            );
        }
    }

    /**
     * 检查当前本地是否已经激活 Pro
     */
    public async isProActive(): Promise<boolean> {
        return await this.authClient.isActivated();
    }

    /**
     * 主动解绑当前设备
     */
    public async unbindDevice(): Promise<boolean> {
        if (!this.plugin.settings.proPassword) {
            new Notice($t("notice.auth.not-bound") ?? "没有找到当前激活信息");
            return false;
        }

        try {
            const success = await this.authClient.unbind();

            if (success) {
                this.plugin.settings.proToken = undefined;
                this.plugin.settings.proPassword = "";
                this.plugin.settings.proProducts = [];
                await this.plugin.saveSettings();

                new Notice($t("notice.auth.unbind-success") ?? "✅ 解绑成功");
                return true;
            } else {
                new Notice($t("notice.auth.unbind-failed") ?? "❌ 解绑失败");
                return false;
            }
        } catch (error) {
            Logger.error("AuthService", "解绑请求失败:", error);
            new Notice($t("notice.auth.unbind-network-error") ?? "❌ 无法连接到服务器进行解绑");
            return false;
        }
    }

    /**
     * 静默检查（后台刷新 Token）
     */
    public async silentCheck(): Promise<boolean> {
        const result = await this.authClient.silentCheck();
        return result !== null;
    }
}
