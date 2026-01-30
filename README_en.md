# SmartMP - All-in-One WeChat Official Account Publishing Tool for Obsidian 🚀

> **SmartMP** is an Obsidian plugin tailored for WeChat Official Account creators. It seamlessly integrates local Markdown rendering, AI writing assistance, material management, and one-click publishing. Focus on your content creation, and let us handle the rest.

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/hwdemtv/smart-mp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## ✨ Key Features

### 📝 True WYSIWYG
- **Perfect Preview**: Built-in standard WeChat Official Account rendering engine, what you see in Obsidian preview is exactly what you get on mobile.
- **Mobile Simulator**: One-click toggle for Mobile View (375px) to check mobile reading experience in real-time.
- **Style Isolation**: Uses Shadow DOM / CSS Namespace technology to ensure preview styles are not affected by Obsidian themes.
- **Real-time Word Count**: Real-time display of word count and estimated reading time at the bottom of the preview panel.

### 🤖 AI Writing Copilot
- **Content Polishing**: One-click AI polishing for selected text to improve writing style and readability.
- **Smart Summary**: Automatically generates article summaries capturing the core content.
- **Title Recommendation**: AI recommends 5-10 viral titles based on the full text for you to choose from.
- **Proofreading**: Intelligently identifies typos, misuse of punctuation, and grammatical errors.

### 🎨 Layout Enhancement
- **Auto Footnotes**: Automatically converts hyperlinks in the text into footnotes at the end of the article, conforming to WeChat reading habits.
- **Code Block Beautification**: Mac-style code blocks supporting multiple highlighting themes and language display.
- **Image Captions**: Automatically extracts Markdown image `Alt` text and converts it into WeChat-style centered gray captions.
- **Artistic Dividers**: Supports various styles of dividers.
- **Reading Progress**: Optionally embed a "~X words / Est. Y min read" tip at the beginning of the article.

### 🚀 One-Click Publish
- **Seamless Sync**: Sync text and images to WeChat Draft Box with one click, no copy-pasting required.
- **Material Management**: Automatically uploads local images, supporting perfect rendering of Excalidraw / Mermaid / LaTeX formulas.
- **Multi-Account Support**: Manage multiple Official Accounts and easily switch publishing targets.

## 🛠️ Installation Guide

### Method 1: Community Plugins (TBD)
*SmartMP is currently applying for listing in the Obsidian Community Plugins marketplace. Stay tuned.*

### Method 2: Manual Installation
1. Download the latest `main.js`, `manifest.json`, and `styles.css` files.
2. Place the files into your Obsidian vault directory: `.obsidian/plugins/smart-mp/`.
3. Restart Obsidian and enable **SmartMP** in "Community Plugins".

## ⚙️ Quick Start

1. **Configure Official Account**:
   - Go to Plugin Settings -> **Account Management**.
   - Add your Official Account `AppID` and `AppSecret` (Requires Developer permission from WeChat Official Account Platform).

2. **Configure AI Service** (Optional):
   - Supports various models like OpenAI / DeepSeek / Ollama.
   - Enter API Key and Base URL in **AI Settings**.

3. **Start Creating**:
   - Write Markdown articles in Obsidian.
   - Open the right-side **SmartMP Preview Panel** to see the rendering effect in real-time.
   - Click **Publish Draft**, and the article will be synced to WeChat backend instantly.

## 🤝 Credits

This project is developed based on [note-to-mp](https://github.com/sunbooshi/note-to-mp) and [obsidian-wechat-public-platform](https://github.com/ai-chen2050/obsidian-wechat-public-platform). Thanks to the original author Learner Chen and the open-source community for their contributions.

Special thanks to the following open-source projects:
- [marked.js](https://marked.js.org/)
- [gray-matter](https://github.com/jonschlinkert/gray-matter)
- [highlight.js](https://highlightjs.org/)
- [MathJax](https://www.mathjax.org/)

## 📄 License

This project is licensed under the [MIT License](LICENSE).
