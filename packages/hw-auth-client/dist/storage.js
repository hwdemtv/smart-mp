"use strict";
/**
 * 全局配置存储管理
 * 读写 .obsidian/hw-auth.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthStorage = void 0;
const DEFAULT_STORAGE_PATH = '.obsidian/hw-auth.json';
const CURRENT_VERSION = 1;
class AuthStorage {
    constructor(app, storagePath) {
        this.app = app;
        this.storagePath = storagePath || DEFAULT_STORAGE_PATH;
    }
    /**
     * 读取全局配置
     */
    async read() {
        try {
            const exists = await this.app.vault.adapter.exists(this.storagePath);
            if (!exists) {
                return null;
            }
            const content = await this.app.vault.adapter.read(this.storagePath);
            const config = JSON.parse(content);
            // 版本兼容性检查
            if (config.version !== CURRENT_VERSION) {
                console.warn(`[HwAuth] Config version mismatch: ${config.version} vs ${CURRENT_VERSION}`);
                // 可以在这里添加迁移逻辑
            }
            return config;
        }
        catch (error) {
            console.error('[HwAuth] Failed to read config:', error);
            return null;
        }
    }
    /**
     * 写入全局配置
     */
    async write(config) {
        try {
            const content = JSON.stringify(config, null, 2);
            await this.app.vault.adapter.write(this.storagePath, content);
            return true;
        }
        catch (error) {
            console.error('[HwAuth] Failed to write config:', error);
            return false;
        }
    }
    /**
     * 初始化空配置
     */
    createEmpty(deviceId) {
        return {
            version: CURRENT_VERSION,
            deviceId,
            activations: {},
            lastSync: new Date().toISOString()
        };
    }
    /**
     * 获取指定产品的激活记录
     */
    async getActivation(productId) {
        const config = await this.read();
        if (!config)
            return null;
        return config.activations[productId] || null;
    }
    /**
     * 更新指定产品的激活记录
     */
    async updateActivation(productId, activation) {
        let config = await this.read();
        if (!config) {
            // 创建新配置 (需要 deviceId)
            config = this.createEmpty(activation.licenseKey); // 临时使用，实际应从其他来源获取
        }
        config.activations[productId] = activation;
        config.lastSync = new Date().toISOString();
        return this.write(config);
    }
    /**
     * 移除指定产品的激活记录
     */
    async removeActivation(productId) {
        const config = await this.read();
        if (!config)
            return false;
        delete config.activations[productId];
        config.lastSync = new Date().toISOString();
        return this.write(config);
    }
    /**
     * 检查是否有任一产品已激活
     */
    async hasAnyActivation() {
        const config = await this.read();
        if (!config)
            return false;
        return Object.keys(config.activations).length > 0;
    }
    /**
     * 获取共用的 licenseKey (用于静默激活)
     * 查找其他产品中状态为 active 的激活记录
     */
    async getSharedLicenseKey() {
        const config = await this.read();
        if (!config)
            return null;
        for (const [productId, activation] of Object.entries(config.activations)) {
            if (activation.products.some(p => p.status === 'active')) {
                return activation.licenseKey;
            }
        }
        return null;
    }
    /**
     * 获取设备 ID
     */
    async getDeviceId() {
        const config = await this.read();
        return config?.deviceId || null;
    }
    /**
     * 设置设备 ID
     */
    async setDeviceId(deviceId) {
        let config = await this.read();
        if (!config) {
            config = this.createEmpty(deviceId);
        }
        else {
            config.deviceId = deviceId;
        }
        return this.write(config);
    }
}
exports.AuthStorage = AuthStorage;
//# sourceMappingURL=storage.js.map