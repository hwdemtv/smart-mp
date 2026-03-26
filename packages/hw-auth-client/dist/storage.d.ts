/**
 * 全局配置存储管理
 * 读写 .obsidian/hw-auth.json
 */
import { GlobalAuthConfig, Activation } from './types';
export declare class AuthStorage {
    private app;
    private storagePath;
    constructor(app: any, storagePath?: string);
    /**
     * 读取全局配置
     */
    read(): Promise<GlobalAuthConfig | null>;
    /**
     * 写入全局配置
     */
    write(config: GlobalAuthConfig): Promise<boolean>;
    /**
     * 初始化空配置
     */
    createEmpty(deviceId: string): GlobalAuthConfig;
    /**
     * 获取指定产品的激活记录
     */
    getActivation(productId: string): Promise<Activation | null>;
    /**
     * 更新指定产品的激活记录
     */
    updateActivation(productId: string, activation: Activation): Promise<boolean>;
    /**
     * 移除指定产品的激活记录
     */
    removeActivation(productId: string): Promise<boolean>;
    /**
     * 检查是否有任一产品已激活
     */
    hasAnyActivation(): Promise<boolean>;
    /**
     * 获取共用的 licenseKey (用于静默激活)
     * 查找其他产品中状态为 active 的激活记录
     */
    getSharedLicenseKey(): Promise<string | null>;
    /**
     * 获取设备 ID
     */
    getDeviceId(): Promise<string | null>;
    /**
     * 设置设备 ID
     */
    setDeviceId(deviceId: string): Promise<boolean>;
}
//# sourceMappingURL=storage.d.ts.map