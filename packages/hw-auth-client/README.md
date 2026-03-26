# hw-auth-client

多插件共享认证客户端，实现"静默感知、一触即活"的认证机制。

## 特性

- 🔐 **统一认证**: 一次激活，多插件共享
- 🔄 **静默感知**: 自动检测并共享其他插件的激活状态
- 🌐 **多域名容灾**: API 调用失败自动切换备用域名
- 💾 **全局配置**: 存储在 `.obsidian/hw-auth.json`
- 🔒 **安全**: JWT Token 验证，设备指纹绑定

## 安装

```bash
npm install hw-auth-client
```

## 使用

### 基本用法

```typescript
import { HwAuthClient } from 'hw-auth-client';

// 创建客户端
const authClient = new HwAuthClient({
  productId: 'smartmp',  // 产品标识
  apiUrls: [
    'https://km.hwdemtv.com/api/v1/auth',
    'https://kami.hwdemtv.com/api/v1/auth'
  ],
  app: app  // Obsidian App 实例
});

// 初始化 (获取设备指纹)
await authClient.init();

// 静默激活 (检查是否已有其他插件激活)
if (await authClient.silentActivate()) {
  console.log('静默激活成功，无需用户操作');
} else {
  // 提示用户输入激活码
  const licenseKey = await promptUser();
  await authClient.activate(licenseKey);
}

// 检查激活状态
const isActivated = await authClient.isActivated();

// 检查产品权限
if (authClient.hasProduct('smartmp')) {
  // 启用 Pro 功能
}
```

### 集成到现有插件

```typescript
// 原有 AuthService 改为委托模式
export class AuthService {
  private client: HwAuthClient;

  constructor(plugin: SmartMPPlugin) {
    this.client = new HwAuthClient({
      productId: 'smartmp',
      apiUrls: AUTH_API_URLS,
      app: plugin.app
    });
  }

  async init() {
    await this.client.init();
  }

  // 保留现有 API
  async verifyLicense(licenseKey: string): Promise<boolean> {
    return this.client.activate(licenseKey);
  }

  async isProActive(): Promise<boolean> {
    return this.client.hasProduct('smartmp');
  }

  async unbindDevice(): Promise<boolean> {
    return this.client.unbind();
  }
}
```

## API

### HwAuthClient

| 方法 | 说明 |
|------|------|
| `init()` | 初始化客户端，获取设备指纹 |
| `activate(licenseKey)` | 激活许可证 |
| `isActivated()` | 检查是否已激活 |
| `hasProduct(productId)` | 检查是否拥有指定产品权限 |
| `silentActivate()` | 静默激活 (自动共享其他插件的激活状态) |
| `silentCheck()` | 静默检查并刷新 Token |
| `unbind()` | 解绑设备 |
| `getToken()` | 获取 JWT Token |
| `getDeviceId()` | 获取设备 ID |
| `checkExpirationReminder()` | 检查到期提醒 |

## 全局配置文件

位置: `.obsidian/hw-auth.json`

```json
{
  "version": 1,
  "deviceId": "xxx",
  "activations": {
    "smartmp": {
      "licenseKey": "xxx",
      "token": "jwt_token",
      "products": [{"productId": "smartmp", "status": "active"}],
      "activatedAt": "2026-03-20T00:00:00Z"
    }
  },
  "lastSync": "2026-03-20T00:00:00Z"
}
```

## License

MIT
