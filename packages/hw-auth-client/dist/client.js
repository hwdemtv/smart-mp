"use strict";
/**
 * hw-auth-client 核心实现
 * 支持多插件共享认证状态
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HwAuthClient = void 0;
const storage_1 = require("./storage");
class HwAuthClient {
    constructor(config) {
        this.cachedActivation = null;
        this.config = config;
        this.storage = new storage_1.AuthStorage(config.app, config.storagePath);
        this.deviceId = '';
    }
    /**
     * 初始化客户端 (获取设备指纹)
     */
    async init() {
        // 尝试从存储获取设备 ID
        const storedDeviceId = await this.storage.getDeviceId();
        if (storedDeviceId) {
            this.deviceId = storedDeviceId;
        }
        else {
            // 生成新的设备 ID
            this.deviceId = await this.generateDeviceId();
            await this.storage.setDeviceId(this.deviceId);
        }
        // 尝试从缓存或存储加载激活信息
        this.cachedActivation = await this.storage.getActivation(this.config.productId);
    }
    /**
     * 生成设备指纹
     */
    async generateDeviceId() {
        try {
            // 动态导入 node-machine-id
            const { machineIdSync } = require('node-machine-id');
            return machineIdSync(false);
        }
        catch (e) {
            console.warn('[HwAuth] Failed to get machine ID, using fallback UUID');
            return crypto.randomUUID();
        }
    }
    /**
     * 获取设备名称
     */
    getDeviceName() {
        try {
            const os = require('os');
            return `${os.hostname()} (${os.platform()})`;
        }
        catch {
            return 'Obsidian Device';
        }
    }
    /**
     * 获取设备 ID
     */
    getDeviceId() {
        return this.deviceId;
    }
    /**
     * 激活许可证
     */
    async activate(licenseKey) {
        const response = await this.requestWithFallback('/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                license_key: licenseKey,
                device_id: this.deviceId,
                device_name: this.getDeviceName()
            })
        });
        if (response.success && response.token && response.products) {
            const activation = {
                licenseKey,
                token: response.token,
                products: response.products,
                activatedAt: new Date().toISOString(),
                expiresAt: response.products.find(p => p.productId === this.config.productId || p.product_id === this.config.productId)?.expiresAt || response.products.find(p => p.productId === this.config.productId || p.product_id === this.config.productId)?.expires_at
            };
            this.cachedActivation = activation;
            await this.storage.updateActivation(this.config.productId, activation);
            return true;
        }
        return false;
    }
    /**
     * 检查是否已激活
     */
    async isActivated() {
        if (!this.cachedActivation) {
            this.cachedActivation = await this.storage.getActivation(this.config.productId);
        }
        if (!this.cachedActivation) {
            return false;
        }
        // 检查 Token 是否过期 (本地检查)
        // 注意: 这里只是快速检查，真正的验证在服务端
        return this.hasProduct(this.config.productId);
    }
    /**
     * 检查是否拥有指定产品权限
     */
    hasProduct(productId) {
        if (!this.cachedActivation)
            return false;
        return this.cachedActivation.products.some(p => (p.productId === productId || p.product_id === productId) &&
            p.status === 'active');
    }
    /**
     * 获取 Token
     */
    getToken() {
        return this.cachedActivation?.token || null;
    }
    /**
     * 获取激活信息
     */
    getActivation() {
        return this.cachedActivation;
    }
    /**
     * 静默检查 (刷新 Token)
     * 用于后台静默验证，不触发新设备绑定
     */
    async silentCheck() {
        // 1. 尝试刷新现有激活
        if (this.cachedActivation?.licenseKey) {
            const response = await this.requestWithFallback('/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    license_key: this.cachedActivation.licenseKey,
                    device_id: this.deviceId,
                    device_name: this.getDeviceName(),
                    mode: 'silent'
                })
            });
            if (response.success && response.token && response.products) {
                const activation = {
                    licenseKey: this.cachedActivation.licenseKey,
                    token: response.token,
                    products: response.products,
                    activatedAt: this.cachedActivation.activatedAt,
                    expiresAt: response.products.find(p => p.productId === this.config.productId)?.expiresAt
                };
                this.cachedActivation = activation;
                await this.storage.updateActivation(this.config.productId, activation);
                return activation;
            }
        }
        // 2. 尝试使用共用的 licenseKey 激活本产品
        const sharedKey = await this.storage.getSharedLicenseKey();
        if (sharedKey && sharedKey !== this.cachedActivation?.licenseKey) {
            console.log('[HwAuth] Attempting silent activation with shared license key');
            const success = await this.activate(sharedKey);
            if (success) {
                return this.cachedActivation;
            }
        }
        return null;
    }
    /**
     * 解绑设备
     */
    async unbind() {
        if (!this.cachedActivation?.licenseKey) {
            return false;
        }
        const response = await this.requestWithFallback('/unbind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                license_key: this.cachedActivation.licenseKey,
                device_id: this.deviceId
            })
        });
        if (response.success) {
            this.cachedActivation = null;
            await this.storage.removeActivation(this.config.productId);
            return true;
        }
        return false;
    }
    /**
     * 多域名容灾请求
     */
    async requestWithFallback(path, options) {
        let lastError = null;
        for (const baseUrl of this.config.apiUrls) {
            try {
                const response = await fetch(`${baseUrl}${path}`, options);
                const data = await response.json();
                return data;
            }
            catch (e) {
                lastError = e;
                console.warn(`[HwAuth] Failed to connect to ${baseUrl}:`, e);
            }
        }
        throw lastError || new Error('All auth servers are unreachable');
    }
    /**
     * 检查到期提醒 (提前 7 天)
     */
    checkExpirationReminder() {
        if (!this.cachedActivation?.products)
            return null;
        const now = new Date().getTime();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        for (const product of this.cachedActivation.products) {
            if (product.status === 'active' && product.expiresAt) {
                const expireTime = new Date(product.expiresAt).getTime();
                const timeLeft = expireTime - now;
                if (timeLeft > 0 && timeLeft <= SEVEN_DAYS_MS) {
                    const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));
                    return { isExpiring: true, daysLeft };
                }
            }
        }
        return null;
    }
    /**
     * 静默感知并激活
     * 检查是否有其他插件已激活，自动共享激活状态
     */
    async silentActivate() {
        // 1. 检查本产品是否已激活
        if (await this.isActivated()) {
            return true;
        }
        // 2. 检查是否有其他产品的激活记录
        const hasAny = await this.storage.hasAnyActivation();
        if (!hasAny) {
            return false;
        }
        // 3. 尝试静默激活
        const result = await this.silentCheck();
        return result !== null;
    }
}
exports.HwAuthClient = HwAuthClient;
//# sourceMappingURL=client.js.map