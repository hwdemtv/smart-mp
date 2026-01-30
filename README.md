# SmartMP - Obsidian 微信公众号一站式发布工具 🚀

> **SmartMP** 是专为微信公众号创作者打造的 Obsidian 插件，完美集成了本地 Markdown 渲染、AI 智能写作辅助、素材管理与一键发布功能。让您专注于内容创作，剩下的交给我们。

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/hwdemtv/smart-mp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## ✨ 核心特性

### 📝 所见即所得 (True WYSIWYG)
- **完美还原预览**: 内置微信公众号标准渲染引擎，Obsidian 预览即真机效果。
- **手机模拟器**: 一键切换 Mobile View (375px)，实时检查移动端阅读体验。
- **样式隔离**: 采用 Shadow DOM / CSS 命名空间技术，确保预览样式不受 Obsidian 主题干扰。
- **实时字数统计**: 预览面板底部实时显示文章字数与预计阅读时间。

### 🤖 AI 智能写作助手 (AI Copilot)
- **内容润色**: 选中文字一键 AI 润色，提升文采与可读性。
- **智能摘要**: 自动生成文章摘要，精准概括核心内容。
- **标题推荐**: 基于全文内容，AI 推荐 5-10 个爆款标题供您选择。
- **全文纠错**: 智能识别错别字、标点误用与语病。

### 🎨 排版增强 (Layout Enhancement)
- **自动注脚**: 自动将文中超链接提取为文末脚注，符合公众号阅读习惯。
- **代码块美化**: Mac 风格代码块，支持多种高亮主题与语言显示。
- **图片说明**: 自动提取 Markdown 图片 `Alt` 文本，转为微信风格的居中灰色说明 (Caption)。
- **文艺分割线**: 支持多种风格的分割线样式。
- **阅读提醒**: 可选在文章开头嵌入“约 X 字 / 预计阅读 Y 分钟”的优雅提醒。

### 🚀 一键发布 (One-Click Publish)
- **无缝同步**: 无需复制粘贴，一键同步图文至微信草稿箱。
- **素材管理**: 本地图片自动上传，支持 Excalidraw / Mermaid / LaTeX 公式完美渲染。
- **多账号支持**: 支持管理多个公众号，轻松切换发布目标。

## 🛠️ 安装指南

### 方式一：社区插件市场 (TBD)
*SmartMP 正在申请上架 Obsidian 社区插件市场，敬请期待。*

### 方式二：手动安装
1. 下载最新发布的 `main.js`, `manifest.json`, `styles.css` 文件。
2. 将文件放入您的 Obsidian 仓库目录：`.obsidian/plugins/smart-mp/`。
3. 重启 Obsidian，在“第三方插件”中启用 **SmartMP**。

## ⚙️ 快速开始

1. **配置公众号**:
   - 进入插件设置 -> **公众号管理**。
   - 添加您的公众号 `AppID` 和 `AppSecret` (需在微信公众平台获取 Developer 权限)。

2. **配置 AI 服务** (可选):
   - 支持 OpenAI / DeepSeek / Ollama 等多种模型。
   - 在 **AI 设置** 中填入 API Key 与 Base URL。

3. **开始创作**:
   - 在 Obsidian 中撰写 Markdown 文章。
   - 打开右侧 **SmartMP 预览面板**，实时查看渲染效果。
   - 点击 **发布草稿**，文章即刻同步至微信后台。

## 🤝 致谢

本项目在 [note-to-mp](https://github.com/sunbooshi/note-to-mp) 与 [obsidian-wechat-public-platform](https://github.com/ai-chen2050/obsidian-wechat-public-platform) 的基础上进行开发。感谢原作者 Learner Chen 与开源社区的贡献。

特别感谢以下开源项目：
- [marked.js](https://marked.js.org/)
- [gray-matter](https://github.com/jonschlinkert/gray-matter)
- [highlight.js](https://highlightjs.org/)
- [MathJax](https://www.mathjax.org/)

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。
