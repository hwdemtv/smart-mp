"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthStorage = exports.HwAuthClient = void 0;
var client_1 = require("./client");
Object.defineProperty(exports, "HwAuthClient", { enumerable: true, get: function () { return client_1.HwAuthClient; } });
var storage_1 = require("./storage");
Object.defineProperty(exports, "AuthStorage", { enumerable: true, get: function () { return storage_1.AuthStorage; } });
//# sourceMappingURL=index.js.map