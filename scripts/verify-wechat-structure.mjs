#!/usr/bin/env node
/**
 * 微信《公众平台编辑器插件开发规范》发布前验证
 *
 * 流程：
 *   1. 跑固定基准文章的全管线导出测试 → temp/fixture-export.html
 *   2. 官方 CLI（github.com/wechatjs/verify-article-structure-spec）检测规范的 10 条可执行规则
 *      （line-height / width / pre / opacity / caret-color / height / text-align / font-family / animate-begin）
 *   3. 补充静态检查官方 CLI 未覆盖的条款：
 *      2.1 嵌套层级（同标签+同样式+单子节点 ≤10 层）、2.2 span 内禁含块级元素、
 *      4.1.2 文字背景渐变、4.5.2 !important、标签白名单、CSS 属性白名单
 *
 * 官方 CLI 仓库未发布到 npm（@tencent/verify-article-structure 404），
 * 首次运行克隆到 .cache/verify-article-structure-spec 并在其 cli/ 目录安装依赖；
 * 检测到系统 Chrome 时跳过 Puppeteer 的 Chromium 下载（约 170MB）。
 *
 * 退出码：0 通过 / 1 存在违规 / 2 环境异常
 * 环境变量：VERIFY_ARTICLE_CLI_DIR 覆盖官方 CLI 仓库位置
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXPORT_PATH = join(ROOT, 'temp', 'fixture-export.html');
const PIPELINE_TEST = 'src/__tests__/pipeline/wechat-structure-export.test.ts';
const CLI_REPO_URL = 'https://github.com/wechatjs/verify-article-structure-spec.git';
const CLI_REPO_DIR = process.env.VERIFY_ARTICLE_CLI_DIR || join(ROOT, '.cache', 'verify-article-structure-spec');

const run = (cmd, opts = {}) => {
	const res = spawnSync(cmd, { shell: true, encoding: 'utf-8', ...opts });
	if (res.status !== 0) {
		console.error(res.stdout || '');
		console.error(res.stderr || '');
		console.error(`✗ 命令失败 (exit ${res.status}): ${cmd}`);
		process.exit(2);
	}
	return res.stdout;
};

/** 系统无 var() 引用与 !important 的简化 DOM：仅解析结构（标签+style），够用于 2.1/2.2 */
const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link']);
const BLOCK_TAGS = new Set(['section', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
	'blockquote', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'pre', 'form', 'fieldset', 'address']);
const WECHAT_TAG_WHITELIST = new Set(['section', 'p', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'a', 'img',
	'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'hr', 'br', 'code', 'sup', 'sub', 'figure', 'figcaption', 'mp-common-profile']);
const SUPPORTED_CSS_PROPS = new Set(('align-content align-items align-self animation background background-color '
	+ 'background-image background-position background-size border border-bottom border-bottom-color border-bottom-style '
	+ 'border-bottom-width border-collapse border-color border-left border-left-color border-left-style border-left-width '
	+ 'border-radius border-right border-right-color border-right-style border-right-width border-style border-top '
	+ 'border-top-color border-top-style border-top-width border-width bottom box-shadow box-sizing clear color caret-color '
	+ 'column-count column-gap display flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float fill '
	+ 'font font-family font-size font-stretch font-style font-variant font-weight height justify-content left letter-spacing '
	+ 'line-height line-break list-style list-style-image list-style-type margin margin-bottom margin-left margin-right '
	+ 'margin-top max-height max-width min-height min-width object-fit opacity outline-color overflow overflow-x overflow-y '
	+ 'overflow-wrap padding padding-bottom padding-left padding-right padding-top pointer-events position right stroke '
	+ 'tab-size text-align text-decoration text-decoration-color text-decoration-line text-decoration-style text-indent '
	+ 'text-justify text-orientation text-overflow text-rendering text-shadow text-size-adjust text-transform top touch-action '
	+ 'transform transform-origin transition user-select vertical-align white-space width will-change word-break word-spacing '
	+ 'word-wrap z-index').split(/\s+/));

function parseStructure(html) {
	const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
	const stack = [];
	const roots = [];
	const all = [];
	let m;
	while ((m = tagRe.exec(html)) !== null) {
		const [full, tag, attrs] = m;
		if (full.startsWith('</')) {
			for (let i = stack.length - 1; i >= 0; i--) {
				if (stack[i].tag === tag) { stack.length = i; break; }
			}
			continue;
		}
		if (full.endsWith('/>') || VOID_TAGS.has(tag)) continue;
		const styleM = attrs.match(/style="([^"]*)"/);
		const node = { tag, style: styleM ? styleM[1] : '', children: [], parent: stack[stack.length - 1] || null };
		(node.parent ? node.parent.children : roots).push(node);
		all.push(node);
		stack.push(node);
	}
	return all;
}

/** 补充条款静态检查（CLI 未覆盖部分） */
function supplementaryChecks(html) {
	const violations = [];
	const nodes = parseStructure(html);

	// 2.1 同标签+同样式+单子节点连续嵌套 ≤ 10 层
	let maxChain = 0;
	for (const n of nodes) {
		let cur = n, chain = 1;
		while (cur.children.length === 1 && cur.children[0].tag === cur.tag && cur.children[0].style === cur.style) {
			cur = cur.children[0]; chain++;
		}
		maxChain = Math.max(maxChain, chain);
	}
	if (maxChain > 10) violations.push(`2.1 嵌套层级: 最长同标签同样式单子链 ${maxChain} 层 (>10)`);

	// 2.2 span 内禁含块级元素
	for (const n of nodes) {
		if (n.tag === 'span' && n.children.some(c => BLOCK_TAGS.has(c.tag))) {
			violations.push(`2.2 span 内含块级元素: <span style="${n.style.slice(0, 60)}"> → <${n.children.find(c => BLOCK_TAGS.has(c.tag)).tag}>`);
		}
	}

	// 标签白名单
	for (const n of nodes) {
		if (!WECHAT_TAG_WHITELIST.has(n.tag)) violations.push(`标签白名单外: <${n.tag}>`);
	}

	// CSS 属性白名单 + 4.1.2 渐变 + 4.5.2 !important + 1.3 无单位行高 + 1.6 start/end
	const styleBodies = html.matchAll(/style="([^"]*)"/g);
	const badProps = new Set();
	for (const [, body] of styleBodies) {
		if (body.includes('!important')) violations.push('4.5.2 style 中使用 !important');
		if (/gradient/i.test(body)) violations.push('4.1.2 文字背景渐变残留');
		if (/text-align:\s*(start|end)/.test(body)) violations.push('1.6 text-align: start/end');
		for (const decl of body.split(';')) {
			const i = decl.indexOf(':');
			if (i < 0) continue;
			const prop = decl.slice(0, i).trim().toLowerCase();
			if (prop && !SUPPORTED_CSS_PROPS.has(prop)) badProps.add(prop);
		}
	}
	for (const p of badProps) violations.push(`疑似不支持 CSS 属性: ${p}`);
	if (/line-height:\s*[\d.]+\s*(;|")/.test(html)) violations.push('1.3 残留无单位 line-height');

	return { violations, stats: { nodes: nodes.length, maxNestingChain: maxChain } };
}

function detectChrome() {
	const candidates = process.platform === 'win32'
		? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
			'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
			join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')]
		: process.platform === 'darwin'
			? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
			: [];
	for (const p of candidates) if (p && existsSync(p)) return p;
	if (process.platform === 'linux') {
		for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium']) {
			try {
				const res = spawnSync(`which ${bin}`, { shell: true, encoding: 'utf-8' });
				if (res.status === 0) return res.stdout.trim();
			} catch { /* ignore */ }
		}
	}
	return null;
}

// ---------- 1. 生成导出 ----------
console.log('[1/3] 运行基准文章导出测试…');
run(`npx vitest run ${PIPELINE_TEST}`, { cwd: ROOT });
if (!existsSync(EXPORT_PATH)) {
	console.error(`✗ 未生成导出产物: ${EXPORT_PATH}`);
	process.exit(2);
}
const exportHtml = readFileSync(EXPORT_PATH, 'utf-8');
console.log(`    导出完成: ${EXPORT_PATH} (${exportHtml.length} chars)`);

// ---------- 2. 官方 CLI ----------
console.log('[2/3] 官方 CLI 检测（首次运行需克隆仓库并安装依赖）…');
if (!existsSync(CLI_REPO_DIR)) {
	mkdirSync(join(ROOT, '.cache'), { recursive: true });
	console.log(`    克隆 ${CLI_REPO_URL} → ${CLI_REPO_DIR}`);
	run(`git clone --depth 1 ${CLI_REPO_URL} "${CLI_REPO_DIR}"`);
}
const cliDir = join(CLI_REPO_DIR, 'cli');
if (!existsSync(cliDir)) {
	console.error(`✗ CLI 目录不存在: ${cliDir}（仓库结构变化？）`);
	process.exit(2);
}
const chromePath = detectChrome();
const cliEnv = { ...process.env };
if (chromePath) {
	cliEnv.PUPPETEER_EXECUTABLE_PATH = chromePath;
	cliEnv.PUPPETEER_SKIP_DOWNLOAD = '1';
	console.log(`    使用系统 Chrome: ${chromePath}`);
} else {
	console.log('    未检测到系统 Chrome，Puppeteer 将下载自带 Chromium（约 170MB）');
}
if (!existsSync(join(cliDir, 'node_modules'))) {
	console.log('    安装 CLI 依赖…');
	run('npm install --no-audit --no-fund', { cwd: cliDir, env: cliEnv });
}
// 官方 CLI 约定退出码：0 通过 / 1 存在违规 / 2 异常 —— 0 和 1 都属正常执行，需解析 JSON 输出
const cliRes = spawnSync(`npx tsx src/index.ts "${EXPORT_PATH}" --json`, {
	cwd: cliDir, env: cliEnv, shell: true, encoding: 'utf-8',
});
if (cliRes.status !== 0 && cliRes.status !== 1) {
	console.error(cliRes.stdout || '');
	console.error(cliRes.stderr || '');
	console.error(`✗ 官方 CLI 异常退出 (exit ${cliRes.status})`);
	process.exit(2);
}
const cliRaw = cliRes.stdout || '';
const jsonStart = cliRaw.indexOf('{');
const jsonEnd = cliRaw.lastIndexOf('}');
const report = JSON.parse(cliRaw.slice(jsonStart, jsonEnd + 1));

// ---------- 3. 补充条款 ----------
console.log('[3/3] 补充条款静态检查…');
const supp = supplementaryChecks(exportHtml);
console.log(`    解析 ${supp.stats.nodes} 个节点，最长嵌套链 ${supp.stats.maxNestingChain} 层`);

// ---------- 汇总 ----------
const allViolations = [...report.violations, ...supp.violations];
console.log('\n========== 微信内容结构规范验证 ==========');
if (allViolations.length === 0) {
	console.log('✓ 全部通过（官方 CLI 10 条规则 + 补充条款）');
	process.exit(0);
}
console.log(`✗ 发现 ${allViolations.length} 项违规：`);
for (const v of allViolations) {
	console.log(`  ⚠ ${typeof v === 'string' ? v : `${v.rule || ''} ${v.message || JSON.stringify(v)}`}`);
}
process.exit(1);
