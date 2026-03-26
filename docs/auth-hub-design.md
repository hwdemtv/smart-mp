# 静默级认证枢纽设计方案

## 一、背景与目标

### 问题
- SmartMP 和其他插件（如 Feishu Sync）各自维护独立的 `AuthService`
- 用户需要在每个插件中分别激活，体验割裂
- 代码重复维护，增加维护成本

### 目标
实现"静默感知、一触即活"的认证机制：
1. 用户在任一插件激活后，Token 自动共享给其他插件
2. 无需安装额外插件
3. 保持现有 AuthService 的安全性和功能完整性

## 二、架构设计

### 2.1 全局配置文件

**位置**: `.obsidian/hw-auth.json`

```json
{
  "version": 1,
  "deviceId": "xxx",
  "activations": {
    "smartmp": {
      "licenseKey": "xxx",
      "token": "jwt_token",
      "products": ["smartmp"],
      "activatedAt": "2026-03-20T00:00:00Z",
      "expiresAt": "2027-03-20T00:00:00Z"
    }
  },
  "lastSync": "2026-03-20T00:00:00Z"
}
```

### 2.2 核心接口设计

```typescript
// 共享模块: hw-auth-client

interface AuthConfig {
  productId: string;          // 产品标识 (smartmp, feishu-sync, etc.)
  apiUrls: string[];          // 多域名容灾
  storagePath: string;        // 存储路径
}

interface Activation {
  licenseKey: string;
  token: string;
  products: Product[];
  activatedAt: string;
  expiresAt?: string;
}

interface Product {
  productId: string;
  status: 'active' | 'expired';
  expiresAt?: string;
}

interface HwAuthClient {
  // 核心方法
  activate(licenseKey: string): Promise<boolean>;
  isActivated(): Promise<boolean>;
  hasProduct(productId: string): boolean;
  getDeviceId(): string;
  unbind(): Promise<boolean>;

  // 静默感知
  silentCheck(): Promise<Activation | null>;

  // 配置管理
  getGlobalConfig(): Promise<GlobalConfig>;
  updateGlobalConfig(updates: Partial<GlobalConfig>): Promise<void>;
}
```

### 2.3 静默感知流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     插件启动流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 初始化 HwAuthClient                                          │
│       │                                                         │
│       ▼                                                         │
│  2. 读取 .obsidian/hw-auth.json                                 │
│       │                                                         │
│       ├── 文件不存在 → 等待用户手动激活                          │
│       │                                                         │
│       └── 文件存在                                               │
│            │                                                    │
│            ▼                                                    │
│  3. 检查本产品是否已激活                                          │
│       │                                                         │
│       ├── 已激活 → 验证 Token 有效性                             │
│       │         │                                               │
│       │         ├── 有效 → 静默启动，无需用户操作 ✅              │
│       │         │                                               │
│       │         └── 过期 → 调用 silentCheck() 刷新               │
│       │                    │                                    │
│       │                    ├── 刷新成功 → 静默启动 ✅             │
│       │                    │                                    │
│       │                    └── 刷新失败 → 提示重新激活            │
│       │                                                         │
│       └── 未激活但其他产品已激活                                   │
│                │                                                │
│                ▼                                                │
│         4. 检查是否有共用的 licenseKey                            │
│                │                                                │
│                ├── 有共用 licenseKey → 尝试静默激活本产品         │
│                │         │                                      │
│                │         └── 成功 → 静默启动 ✅                   │
│                │                                                │
│                └── 无共用 → 等待用户手动激活                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 三、实现方案

### 3.1 共享模块结构

```
packages/
└── hw-auth-client/
    ├── src/
    │   ├── index.ts           # 导出入口
    │   ├── client.ts          # HwAuthClient 实现
    │   ├── storage.ts         # 全局配置读写
    │   ├── crypto.ts          # 设备指纹、加密
    │   └── types.ts           # 类型定义
    ├── package.json
    └── tsconfig.json
```

### 3.2 插件集成方式

**方案 A: NPM 包发布 (推荐)**
```typescript
// SmartMP 中
import { HwAuthClient } from 'hw-auth-client';

const authClient = new HwAuthClient({
  productId: 'smartmp',
  apiUrls: [
    'https://km.hwdemtv.com/api/v1/auth',
    'https://kami.hwdemtv.com/api/v1/auth',
    'https://hw-license-center.hwdemtv.workers.dev/api/v1/auth'
  ]
});
```

**方案 B: Git Submodule (备选)**
```bash
git submodule add https://github.com/hwdem/hw-auth-client.git packages/hw-auth-client
```

### 3.3 向后兼容

现有 `AuthService` 保留作为内部实现，对外暴露 `HwAuthClient` 接口：

```typescript
// src/services/auth-service.ts
export class AuthService {
  private client: HwAuthClient;

  constructor(plugin: SmartMPPlugin) {
    this.client = new HwAuthClient({
      productId: 'smartmp',
      apiUrls: AUTH_API_URLS
    });
  }

  // 保留现有 API，内部委托给 HwAuthClient
  async verifyLicense(licenseKey: string): Promise<boolean> {
    return this.client.activate(licenseKey);
  }

  async isProActive(): Promise<boolean> {
    return this.client.hasProduct('smartmp');
  }
}
```

## 四、安全考虑

### 4.1 Token 存储
- 存储在 `.obsidian/hw-auth.json` (Obsidian 工作区目录)
- 仅本机可访问，不上传云端
- Token 为 JWT 格式，服务端签名验证

### 4.2 设备指纹
- 使用 `node-machine-id` 获取唯一设备标识
- 备用方案: 生成 UUID 并持久化

### 4.3 多域名容灾
- API 调用失败自动切换备用域名
- 不暴露敏感信息到日志

## 五、实施步骤

### Phase 1: 抽取共享模块
1. 创建 `packages/hw-auth-client` 目录结构
2. 从 `AuthService` 提取核心逻辑
3. 定义公共接口

### Phase 2: 全局配置
1. 实现 `.obsidian/hw-auth.json` 读写
2. 实现静默感知逻辑

### Phase 3: 集成验证
1. SmartMP 集成新的 `HwAuthClient`
2. 验证向后兼容性
3. 测试"一触即活"场景

### Phase 4: 文档与发布
1. 编写 API 文档
2. 发布到 NPM (可选)
3. 更新 CLAUDE.md

## 六、预期收益

| 维度 | 改进前 | 改进后 |
|------|--------|--------|
| 用户激活体验 | 每个插件独立激活 | 一次激活，多插件共享 |
| 代码维护 | 重复代码 | 单一来源 |
| 功能扩展 | 各自实现 | 统一升级 |
| 安全性 | 各自管理 | 统一标准 |

## 七、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 全局配置损坏 | 中 | 自动备份 + 恢复机制 |
| API 兼容性 | 低 | 版本控制 + 优雅降级 |
| 性能影响 | 低 | 配置文件缓存 |

## 八、时间线

- **Week 1**: 完成共享模块设计与实现
- **Week 2**: SmartMP 集成与测试
- **Week 3**: Feishu Sync 集成 (如适用)
- **Week 4**: 文档与发布
