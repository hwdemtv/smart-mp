# SmartMP 项目核心上下文

## 1. 项目概述
SmartMP 是一款专为 Obsidian 设计的微信公众号文章管理与排版增强插件。它支持多账号管理、图文素材同步、AI 辅助写作、实时预览、以及高度自定义的主题克隆与排版。

## 2. 核心架构模式 (Singleton + Service)

### 2.1 全局单例标准 (Singleton Patterns)
项目采用强约束的单例模式来管理核心资源，所有 Service 类均遵循以下规范：
- **私有构造函数**：`private constructor` 确保外部无法直接 `new` 实例。
- **工厂访问**：通过 `static getInstance(plugin: SmartMPPlugin)` 获取实例。
- **受控销毁**：在 `main.ts` 的 `onunload` 中调用 `static onPluginUnload()` 释放静态引用，确保热重载安全。

**受控单例列表：**
- `WechatClient`: 负责所有微信 API 请求、Token 刷新与 Token 中转逻辑。
- `AssetsManager`: 负责图文及媒体素材的逻辑管理。
- `AiClient`: 抽象 AI 调用层（支持 Ollama, OpenAI）。
- `ResourceManager`: 处理 Obsidian 内部视图与 DOM 查询逻辑。
- `ThemeManager`: 处理 PostCSS 主题转换与 CSS 缓存。
- `WechatRender`: 负责 Markdown 到微信兼容 HTML 的渲染引擎。

### 2.2 视图解耦
- `PreviewPanel` (UI): 通过 `WechatRender.setPreviewRender(this)` 注入上下文，而非直接实例化渲染器。
- `MessageService`: 类 EventBus 模式，用于组件间的解耦通信（如账号切换事件）。

## 3. 技术规范

### 3.1 日志系统 (Logging)
- 禁止直接使用原生 `console.*`。
- 必须导入 `src/utils/logger` 并使用 `Logger.debug/info/warn/error`。
- 敏感数据（如 Token）由 Logger 自动脱敏。

### 3.2 渲染层扩展 (Marked Extensions)
- 渲染层基于 `Marked.js`，通过继承 `SmartMPMarkedExtension` 实现自定义渲染逻辑（如 Excalidraw, 代码块）。
- 扩展组件通过 `this.plugin` 和 `this.previewRender` 获取全局上下文。

### 3.3 数据库 (IndexedDB)
- 使用 `PouchDB` + `IndexedDB` 存储设置、素材缓存及主题缓存。
- 缓存键使用 `djb2` 哈希算法优化性能。

## 4. 关键文件路径
- `src/main.ts`: 插件主入口与生命周期管理。
- `src/wechat-api/`: 微信公众号接口封装。
- `src/render/`: 核心渲染引擎与 Markdown 扩展。
- `src/services/`: 业务逻辑服务层 (Auth, IP, Account, AI Feature)。
- `src/theme/`: 主题引擎与 CSS 处理逻辑。

---
*注：本项目于 2026-03-20 完成了架构全量重构，目前处于高度解耦的 Service 驱动状态。*
