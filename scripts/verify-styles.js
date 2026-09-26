/**
 * styles.css 完整性校验
 *
 * 背景：build-styles.js 从 src/assets 重新生成 styles.css，曾因遗漏
 * plugin-ui.css 静默丢失 219 个插件 UI 类（界面损坏、标题隐藏开关失效）。
 * 此脚本在 CI 中校验产物包含插件 UI 与文章样式两部分的关键类。
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf-8');

// 每部分抽样的关键类
const REQUIRED_SELECTORS = [
	// 插件 UI（plugin-ui.css 来源）
	'.smart-mp-article-header',
	'.smart-mp-header-hidden',
	'.smart-mp-assistant-title',
	'.smart-mp-setting-no-border',
	'.smart-mp-preview-container',
	'.smart-mp-material-panel-container',
	'.smart-mp-diff-modal',
	'.proof-underline',
	'.spinner-dot',
	'.is-mobile-view',
	'.smart-mp-license-status',
	'.smart-mp-title-modal',
	// 文章默认样式（default-styles 来源）
	'.smart-mp-caption',
	'.smart-mp-footnotes',
	'.smart-mp-references',
	'.smart-mp-embedded-stats',
];

const missing = REQUIRED_SELECTORS.filter((sel) => !css.includes(sel));

if (missing.length > 0) {
	console.error('❌ styles.css 缺少关键选择器（插件 UI 样式可能未拼入构建）:');
	missing.forEach((s) => console.error('   - ' + s));
	console.error('\n检查 build-styles.js 是否包含 plugin-ui.css，以及文件是否存在于 src/assets/。');
	process.exit(1);
}

console.log(`✅ styles.css 完整性校验通过（${(css.length / 1024).toFixed(1)} KB，${REQUIRED_SELECTORS.length} 个关键选择器全部存在）`);
