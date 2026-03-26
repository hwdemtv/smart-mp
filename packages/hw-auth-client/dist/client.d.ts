/**
 * hw-auth-client 核心实现
 * 支持多插件共享认证状态
 */
import { HwAuthClientConfig, Activation } from './types';
export declare class HwAuthClient {
    private config;
    private storage;
    private deviceId;
    private cachedActivation;
    constructor(config: HwAuthClientConfig);
    /**
     * 初始化客户端 (获取设备指纹)
     */
    init(): Promise<void>;
    /**
     * 生成设备指纹
     */
    private generateDeviceId;
    /**
     * 获取设备名称
     */
    private getDeviceName;
    /**
     * 获取设备 ID
     */
    getDeviceId(): string;
    /**
     * 激活许可证
     */
    activate(licenseKey: string): Promise<boolean>;
    /**
     * 检查是否已激活
     */
    isActivated(): Promise<boolean>;
    /**
     * 检查是否拥有指定产品权限
     */
    hasProduct(productId: string): boolean;
    /**
     * 获取 Token
     */
    getToken(): string | null;
    /**
     * 获取激活信息
     */
    getActivation(): Activation | null;
    /**
     * 静默检查 (刷新 Token)
     * 用于后台静默验证，不触发新设备绑定
     */
    silentCheck(): Promise<Activation | null>;
    /**
     * 解绑设备
     */
    unbind(): Promise<boolean>;
    /**
     * 多域名容灾请求
     */
    private requestWithFallback;
    /**
     * 检查到期提醒 (提前 7 天)
     */
    checkExpirationReminder(): {
        isExpiring: boolean;
        daysLeft: number;
    } | null;
    /**
     * 静默感知并激活
     * 检查是否有其他插件已激活，自动共享激活状态
     */
    silentActivate(): Promise<boolean>;
}
//# sourceMappingURL=client.d.ts.map