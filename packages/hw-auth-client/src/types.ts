/**
 * hw-auth-client 类型定义
 * 用于多插件共享认证状态
 */

/**
 * 产品订阅状态
 */
export interface Product {
  productId: string;
  status: 'active' | 'expired';
  expiresAt?: string;
}

/**
 * 激活记录
 */
export interface Activation {
  licenseKey: string;
  token: string;
  products: Product[];
  activatedAt: string;
  expiresAt?: string;
}

/**
 * 全局认证配置
 * 存储在 .obsidian/hw-auth.json
 */
export interface GlobalAuthConfig {
  version: number;
  deviceId: string;
  activations: Record<string, Activation>;
  lastSync: string;
}

/**
 * 认证客户端配置
 */
export interface HwAuthClientConfig {
  /** 产品标识 (smartmp, feishu-sync, etc.) */
  productId: string;
  /** API 端点 (多域名容灾) */
  apiUrls: string[];
  /** Obsidian App 实例 */
  app: any;
  /** 存储路径 (默认 .obsidian/hw-auth.json) */
  storagePath?: string;
}

/**
 * 服务端验证响应
 */
export interface VerifyResponse {
  success: boolean;
  msg: string;
  token?: string;
  products?: Product[];
  server_time?: string;
  notification?: {
    id: number;
    type: string;
    title: string;
    content: string;
    action_url?: string;
    is_force: boolean;
  };
  code?: string;
}

/**
 * 解绑响应
 */
export interface UnbindResponse {
  success: boolean;
  msg: string;
  remaining_count?: number;
  code?: string;
}

/**
 * 静默检查模式
 */
export type SilentCheckMode = 'active' | 'silent';
