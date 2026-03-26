/**
 * hw-auth-client
 * 多插件共享认证客户端
 *
 * 使用示例:
 * ```typescript
 * import { HwAuthClient } from 'hw-auth-client';
 *
 * const authClient = new HwAuthClient({
 *   productId: 'smartmp',
 *   apiUrls: ['https://api.example.com/auth'],
 *   app: app
 * });
 *
 * await authClient.init();
 *
 * if (await authClient.silentActivate()) {
 *   console.log('静默激活成功');
 * } else {
 *   // 提示用户手动激活
 * }
 * ```
 */
export { HwAuthClient } from './client';
export { AuthStorage } from './storage';
export type { HwAuthClientConfig, Activation, Product, GlobalAuthConfig, VerifyResponse, UnbindResponse, SilentCheckMode } from './types';
//# sourceMappingURL=index.d.ts.map