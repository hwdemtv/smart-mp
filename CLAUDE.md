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
npm run i18n:check   # Check i18n keys
```

## Architecture

```
src/
├── main.ts           # Plugin entry (~1100 lines)
├── commands/         # Command registration
├── core/             # Plugin initialization
├── settings/         # Settings UI
├── render/           # Markdown + 14 extensions
├── theme/            # 40+ themes, CSS processing
├── wechat-api/       # WeChat API client
├── utils/            # AI client, encryption, error handling
├── lang/             # i18n (zh-cn, en-us)
└── __tests__/        # Vitest tests
```

## Key Patterns

- **Rendering**: Hybrid engine using `marked` + `ObsidianMarkdownRenderer`
- **Security**: AES-GCM encryption via Web Crypto API, strict HTML sanitization
- **i18n**: i18next with automated key scanning (`scripts/i18n-check.js`)
- **API**: Multi-server failover for WeChat API, center token proxy support

## WeChat API

- Token server: `CENTER_TOKEN_SERVERS` array with fallback
- Proxy: `wxapi.hwdemtv.com` → `api.weixin.qq.com`
- Settings: `useCenterToken` toggle in security section
