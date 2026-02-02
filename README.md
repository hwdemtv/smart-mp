# SmartMP - Obsidian 微信公众号一站式发布工具 🚀

> **SmartMP** 是专为微信公众号创作者打造的 Obsidian 插件，完美集成了本地 Markdown 渲染、AI 智能写作辅助、素材管理与一键发布功能。让您专注于内容创作，剩下的交给我们。

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/hwdemtv/smart-mp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## ✨ 核心特性

### 🎨 极致的排版与预览 (所见即所得)
- **完美还原预览**: 内置微信公众号标准渲染引擎，Obsidian 预览即真机效果。
- **手机模拟器**: 一键切换 Mobile View (375px)，实时检查移动端阅读体验。
- **样式隔离**: 采用 Shadow DOM 技术，确保预览样式不受 Obsidian 主题干扰。
- **实时字数统计**: 预览面板底部实时显示文章字数与预计阅读时间。

### 🤖 AI 智能写作助手 (AI Copilot)
- **爆款标题推荐**: 基于全文内容，AI 技术自动推荐 5-10 个高点击率标题。
- **内容一键润色**: 选中文字即可进行 AI 润色，提升文采与可读性。
- **智能摘要生成**: 快速提炼文章核心点，生成精准的文章摘要。
- **全文智能纠错**: 自动识别错别字、不规范标点及语病。
- **多模型支持**: 已集成 DeepSeek、OpenAI、Ollama 等流行 AI 引擎。

### 🚀 一键发布 (告别手动复制)
- **无缝同步**: 点击“同步至草稿箱”，文章即刻出现在公众号后台，无需复制粘贴。
- **全自动素材管理**:
    - **本地图片**: 自动识别并上传 Obsidian 里的本地图片至微信素材库。
    - **特殊渲染**: 完美支持 **Mermaid** 流程图、**Excalidraw** 手绘图及 **LaTeX** 数学公式，自动转图上传。
    - **SVG 兼容**: 智能处理文章内的 SVG 矢量图，确保移动端显示不丢失。
- **多账号支持**: 轻松管理并切换多个公众号。

### 📝 微信原生排版增强
- **自动注脚**: 自动将文中超链接提取为文末脚注（[1], [2]...），符合公众号阅读习惯。
- **代码块美化**: 极客风 Mac 风格代码块，支持主流编程语言高亮显示。
- **图片说明 (Caption)**: 自动提取图片 Alt 文本，生成居中的灰色细字说明。
- **约字提示**: 自动在开头嵌入“约 X 字 / 预计阅读 Y 分钟”的优雅提醒。

---

## 🎨 主题模板与定制

SmartMP 提供极高的定制化自由度，每个主题模板本质上是一个包含 CSS 配置的 Markdown 文件。

### 常见内置主题
- **🌟 互为螺旋·金**: 插件主打主题，具有极高的设计感与专业质感。
- **📱 爱范儿 (ifanr)**: 模拟知名科技媒体风格，简约大气。
- **🖌️ 水墨丹青**: 极具意境，适合文学、艺术类图文。
- **🍏 NoteToMP Maple**: 独特的枫叶排版风格。
- **📦 经典集合**: 完美还原 NoteToMP、MWeb 的 30+ 款经典皮肤（如 Dracula, Nord, Vue 等）。

### 主题可定制项
您可以直接修改主题 Markdown 文件中的 CSS 来定制以下内容：
- **全局字体与颜色**: 字体族、字号（建议 15-16px）、行高（建议 1.75）、正文色、链接色等。
- **标题装饰**: 设置标题对齐方式，添加独特的侧边框、下划线或前置装饰符。
- **引用块 (`blockquote`)**: 定制背景色、圆角、阴影及装饰条样式。
- **表格 (`table`)**: 定制表头背景、表头文字、隔行变色样式。
- **代码块与 Callout**: 调整代码高亮配色及各种提示框（Tip, Warning 等）的视觉呈现。

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
