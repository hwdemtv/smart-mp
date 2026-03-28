# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SmartMP** is an Obsidian plugin for writing and publishing articles to WeChat Official Accounts (微信公众号). Version: 1.5.4

## Development Commands

```bash
npm run dev          # Development mode (watch)
npm run build        # Production build
npm test             # Run tests (Vitest)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
npm run i18n:check   # Check i18n keys consistency
```

Run single test:
```bash
npx vitest run path/to/test.test.ts
```

## Architecture

```
src/
├── main.ts              # Plugin entry point, registers views, commands, events
├── commands/            # Command registration (AI, WeChat, etc.)
├── core/                # Plugin initialization, command manager
├── settings/            # Settings UI and storage (IndexedDB via PouchDB)
├── render/              # Markdown rendering engine
│   ├── wechat-render.ts # Main renderer using marked.js
│   ├── markdown-render.ts # Obsidian native renderer for complex embeds
│   ├── scroll-sync-extension.ts # CodeMirror 6 scroll sync
│   └── marked-extensions/ # 17 marked.js extensions (code, math, image, etc.)
├── theme/               # Theme system (40+ themes, CSS merging)
│   ├── theme-manager.ts # Theme loading and application
│   └── CssMerger.ts     # PostCSS-based style merging
├── wechat-api/          # WeChat API client with token management
├── utils/               # AI client, AES-GCM encryption, error handling
├── lang/                # i18n (zh-cn, en-us) via i18next
└── __tests__/           # Vitest tests
```

## Key Patterns

### Rendering Pipeline
Two-stage hybrid rendering:
1. **Simple content**: `marked.js` with 17 custom extensions (code highlighting, math, tables, footnotes, etc.)
2. **Complex embeds** (Excalidraw, Mermaid, Dataview): Falls back to `ObsidianMarkdownRenderer`
3. **Post-processing**: `ThemeManager.applyTheme()` applies CSS via `CSSMerger` (PostCSS-based inline style injection)

### Performance Considerations
- **Scroll sync**: Uses cached anchors (`cachedAnchors`) to avoid Layout Thrashing from `getBoundingClientRect()` on every scroll event. Anchors are recalculated only on render complete or window resize via `ResizeObserver`.
- **Debounced rendering**: `realTimeRenderDelay` (default 200ms) with adaptive delay based on document size.
- **CSS caching**: `CSSCache` and `CSSMerger.BASE_STATE_CACHE` cache parsed CSS rules.

### Security
- **AES-GCM 256-bit encryption** via Web Crypto API for all sensitive data (AppSecret, API keys)
- **HTML sanitization**: `SafeHTML.htmlToFragment()` with strict mode enabled by default
- **No intermediate servers**: Direct connection to WeChat API (or via `wxapi.hwdemtv.com` proxy)

### WeChat API
- Token servers: `CENTER_TOKEN_SERVERS` array with fallback (`wxapi.hwdemtv.com` → `api.weixin.qq.com`)
- Settings: `useCenterToken` toggle in security section
- Limits: 10MB images, 2MB voice, 10MB video

### i18n
- Uses i18next with keys in `src/lang/`
- Automated key scanning via `scripts/i18n-check.js`
- Use `$t('key')` or `$t('key', [arg1, arg2])` for translations

## Singleton Pattern
Many services use singleton pattern with `getInstance()` and `onPluginUnload()` cleanup:
- `WechatRender`, `ObsidianMarkdownRenderer`, `ThemeManager`, `WechatClient`, `AssetsManager`, `AiClient`, `ResourceManager`

## Theme System
Themes are Markdown files with YAML frontmatter (`theme_name`) and CSS code blocks:
```markdown
---
theme_name: "My Theme"
---
\`\`\`css
body { color: red; }
\`\`\`
```
Theme download URL: `https://raw.githubusercontent.com/hwdemtv/smart-mp/main/themes/themes.json`
