/**
 * hw-auth-client 核心实现
 * 支持多插件共享认证状态
 */

import { HwAuthClientConfig, Activation, Product, VerifyResponse, UnbindResponse, SilentCheckMode } from './types';
import { AuthStorage } from './storage';

export class HwAuthClient {
  private config: HwAuthClientConfig;
  private storage: AuthStorage;
  private deviceId: string;
  private cachedActivation: Activation | null = null;

  constructor(config: HwAuthClientConfig) {
    this.config = config;
    this.storage = new AuthStorage(config.app, config.storagePath);
    this.deviceId = '';
  }

  /**
   * 初始化客户端 (获取设备指纹)
   */
  async init(): Promise<void> {
    // 尝试从存储获取设备 ID
    const storedDeviceId = await this.storage.getDeviceId();

    if (storedDeviceId) {
      this.deviceId = storedDeviceId;
    } else {
      // 生成新的设备 ID
      this.deviceId = await this.generateDeviceId();
      await this.storage.setDeviceId(this.deviceId);
    }

    // 尝试从缓存或存储加载激活信息
    this.cachedActivation = await this.storage.getActivation(this.config.productId);
  }

  /**
   * 生成设备指纹
   * 注意：此方法故意不阻塞主线程，使用 setTimeout 延迟执行
   */
  private async generateDeviceId(): Promise<string> {
    return new Promise((resolve) => {
      // 使用 setTimeout 确保不阻塞主线程
      setTimeout(async () => {
        try {
          // 动态导入 node-machine-id
          const { machineId } = require('node-machine-id');
          // 使用异步方法
          const id = await machineId(false);
          resolve(id);
        } catch (e) {
          console.warn('[HwAuth] Failed to get machine ID, using fallback UUID:', e);
          resolve(crypto.randomUUID());
        }
      }, 0);
    });
  }

  /**
   * 获取设备名称
   */
  private getDeviceName(): string {
    try {
      const os = require('os');
      return `${os.hostname()} (${os.platform()})`;
    } catch {
      return 'Obsidian Device';
    }
  }

  /**
   * 获取设备 ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  /**
   * 激活许可证
   */
  async activate(licenseKey: string): Promise<boolean> {
    try {
      const response = await this.requestWithFallback<VerifyResponse>('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: licenseKey,
          device_id: this.deviceId,
          device_name: this.getDeviceName()
        })
      });

      if (response.success && response.token && response.products) {
        const activation: Activation = {
          licenseKey,
          token: response.token,
          products: response.products,
          activatedAt: new Date().toISOString(),
          expiresAt: response.products.find(p =>
            (p as any).productId === this.config.productId || (p as any).product_id === this.config.productId
          )?.expiresAt || (response.products.find(p =>
            (p as any).productId === this.config.productId || (p as any).product_id === this.config.productId
          ) as any)?.expires_at
        };

        this.cachedActivation = activation;
        await this.storage.updateActivation(this.config.productId, activation);

        return true;
      }
    } catch (e) {
      console.error('[HwAuth] Activation failed:', e);
    }

    return false;
  }

  /**
   * 检查是否已激活
   */
  async isActivated(): Promise<boolean> {
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
  hasProduct(productId: string): boolean {
    if (!this.cachedActivation) return false;

    return this.cachedActivation.products.some(p =>
      ((p as any).productId === productId || (p as any).product_id === productId) &&
      p.status === 'active'
    );
  }

  /**
   * 获取 Token
   */
  getToken(): string | null {
    return this.cachedActivation?.token || null;
  }

  /**
   * 获取激活信息
   */
  getActivation(): Activation | null {
    return this.cachedActivation;
  }

  /**
   * 静默检查 (刷新 Token)
   * 用于后台静默验证，不触发新设备绑定
   */
  async silentCheck(): Promise<Activation | null> {
    try {
      // 1. 尝试刷新现有激活
      if (this.cachedActivation?.licenseKey) {
        const response = await this.requestWithFallback<VerifyResponse>('/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            license_key: this.cachedActivation.licenseKey,
            device_id: this.deviceId,
            device_name: this.getDeviceName(),
            mode: 'silent' as SilentCheckMode
          })
        });

        if (response.success && response.token && response.products) {
          const activation: Activation = {
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
    } catch (e) {
      console.warn('[HwAuth] Silent check failed:', e);
    }

    return null;
  }

  /**
   * 解绑设备
   */
  async unbind(): Promise<boolean> {
    if (!this.cachedActivation?.licenseKey) {
      return false;
    }

    try {
      const response = await this.requestWithFallback<UnbindResponse>('/unbind', {
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
    } catch (e) {
      console.error('[HwAuth] Unbind failed:', e);
    }

    return false;
  }

  /**
   * 多域名容灾请求
   */
  private async requestWithFallback<T>(path: string, options: RequestInit): Promise<T> {
    let lastError: Error | null = null;
    const timeout = 10000; // 10s timeout per attempt

    for (const baseUrl of this.config.apiUrls) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(`${baseUrl}${path}`, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(id);
        const data = await response.json() as T;
        return data;
      } catch (e) {
        clearTimeout(id);
        lastError = e as Error;
        console.warn(`[HwAuth] Failed to connect to ${baseUrl}:`, e);
      }
    }

    throw lastError || new Error('All auth servers are unreachable');
  }

  /**
   * 检查到期提醒 (提前 7 天)
   */
  checkExpirationReminder(): { isExpiring: boolean; daysLeft: number } | null {
    if (!this.cachedActivation?.products) return null;

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
  async silentActivate(): Promise<boolean> {
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
