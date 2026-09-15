/**
 * @vitest-environment jsdom
 *
 * 微信"内容结构检测"回归测试
 * 覆盖三类检测警告的修复：
 * 1. line-height-overlapping（"行高小于字体大小"/"继承的 line-height: 0"）
 * 2. darkmode-no-gradient（文字背景渐变 → 纯色降级）
 * 3. width（img 的 data-w 属性保留）
 */
import { describe, it, expect } from 'vitest';

import {
    normalizeLineHeightForWechat,
    stripCssVarReferences,
    filterWechatUnsupportedCssProps,
    inlineCssWithJuice,
    cleanHtmlForWechat,
    stripUnsupportedCssFromHtml,
    serializeChildren,
} from '../../utils/utils';
import { CSSMerger } from '../../theme/CssMerger';

describe('normalizeLineHeightForWechat', () => {
    it('无单位 line-height 应换算为显式 px（1.5 × 16px = 24px）', () => {
        const p = document.createElement('p');
        p.setAttribute('style', 'font-size: 16px; line-height: 1.5');
        p.textContent = '文本';
        normalizeLineHeightForWechat(p);
        expect(p.getAttribute('style')).toContain('line-height: 24px');
    });

    it('var() 行高应被替换为兜底值（1.5 × 字号），不再残留 var()', () => {
        const p = document.createElement('p');
        p.setAttribute('style', 'font-size: 16px; line-height: var(--article-line-height)');
        p.textContent = '文本';
        normalizeLineHeightForWechat(p);
        const style = p.getAttribute('style') || '';
        expect(style).not.toContain('var(');
        expect(style).toContain('line-height: 24px');
    });

    it('px 行高小于字号时应提升到字号大小', () => {
        const p = document.createElement('p');
        p.setAttribute('style', 'font-size: 20px; line-height: 10px');
        p.textContent = '文本';
        normalizeLineHeightForWechat(p);
        expect(p.getAttribute('style')).toContain('line-height: 20px');
    });

    it('子元素应按自身字号继承无单位倍数（h1 24px 内 span 12px → 12×1.5=18px）', () => {
        const root = document.createElement('div');
        const h1 = document.createElement('h1');
        h1.setAttribute('style', 'font-size: 24px; line-height: 1.5');
        const span = document.createElement('span');
        span.setAttribute('style', 'font-size: 12px');
        span.textContent = '小字';
        h1.appendChild(span);
        root.appendChild(h1);
        normalizeLineHeightForWechat(root);
        expect(span.getAttribute('style')).toContain('line-height: 18px');
        // h1 自身 1.5 × 24 = 36
        expect(h1.getAttribute('style')).toContain('line-height: 36px');
    });

    it('em 字号应相对父级换算，rem 相对 16px 根字号', () => {
        const root = document.createElement('div');
        root.setAttribute('style', 'font-size: 20px');
        const code = document.createElement('code');
        code.setAttribute('style', 'font-size: 0.5em; line-height: 1.5'); // 0.5em = 10px → lh 15px，但不得小于字号 10px ✓
        code.textContent = 'x';
        root.appendChild(code);
        normalizeLineHeightForWechat(root);
        expect(code.getAttribute('style')).toContain('line-height: 15px');

        const rem = document.createElement('span');
        rem.setAttribute('style', 'font-size: 1rem; line-height: 1.5'); // 16px → 24px
        rem.textContent = 'x';
        normalizeLineHeightForWechat(rem);
        expect(rem.getAttribute('style')).toContain('line-height: 24px');
    });

    it('不含文本的容器不应被写入 line-height', () => {
        const div = document.createElement('div');
        div.setAttribute('style', 'border: 1px solid #eee');
        normalizeLineHeightForWechat(div);
        expect(div.getAttribute('style')).not.toContain('line-height');
    });

    it('多条 line-height 声明应合并为一条（后声明的生效）', () => {
        const p = document.createElement('p');
        p.setAttribute('style', 'line-height: 2; line-height: 1.5');
        p.textContent = '文本';
        normalizeLineHeightForWechat(p);
        const style = p.getAttribute('style') || '';
        expect(style.match(/line-height/g)?.length).toBe(1);
        expect(style).toContain('line-height: 24px'); // 1.5 × 16 默认字号
    });

    it('空 style 的文本元素也应获得显式行高', () => {
        const p = document.createElement('p');
        p.textContent = '纯文本段落';
        normalizeLineHeightForWechat(p);
        expect(p.getAttribute('style')).toBe('line-height: 24px'); // 1.5 × 16
    });
});

describe('filterWechatUnsupportedCssProps — line-height 兜底', () => {
    it('无单位行高换算为 px（使用同 style 的 font-size）', () => {
        const result = filterWechatUnsupportedCssProps('font-size: 15px; line-height: 1.8');
        expect(result).toContain('line-height: 27px');
        expect(result).toContain('font-size: 15px');
    });

    it('无 font-size 时按 16px 兜底换算', () => {
        const result = filterWechatUnsupportedCssProps('line-height: 1.5');
        expect(result).toContain('line-height: 24px');
    });

    it('var()/空值/normal 行高直接删除', () => {
        expect(filterWechatUnsupportedCssProps('line-height: var(--x)')).toBe('');
        expect(filterWechatUnsupportedCssProps('color: #333; line-height: ;')).toBe('color: #333');
        expect(filterWechatUnsupportedCssProps('line-height: normal')).toBe('');
    });

    it('已是 px 的行高保持不变', () => {
        expect(filterWechatUnsupportedCssProps('line-height: 24px')).toBe('line-height: 24px');
    });
});

describe('filterWechatUnsupportedCssProps — 渐变降级', () => {
    it('background 渐变降级为第一个色标的纯色', () => {
        const result = filterWechatUnsupportedCssProps('background: linear-gradient(to right, #ffeb3b 0%, #f66 100%)');
        expect(result).toBe('background: #ffeb3b');
    });

    it('background-image 渐变（黑名单属性）整条丢弃', () => {
        const result = filterWechatUnsupportedCssProps('background-image: linear-gradient(red, blue)');
        expect(result).toBe('');
    });

    it('旧语法 -webkit-gradient 也被过滤', () => {
        const result = filterWechatUnsupportedCssProps('background: -webkit-gradient(linear, left top, left bottom, from(#fff), to(#000))');
        expect(result).toBe('background: #fff');
    });

    it('rgba 色标可提取', () => {
        const result = filterWechatUnsupportedCssProps('background-color: linear-gradient(135deg, rgba(7,193,96,0.05), transparent)');
        expect(result).toBe('background-color: rgba(7,193,96,0.05)');
    });
});

describe('stripCssVarReferences', () => {
    it('解析 fallback 并清理空声明', () => {
        const root = document.createElement('div');
        const el = document.createElement('p');
        el.setAttribute('style', 'color: var(--text-color, #333); line-height: var(--lh); margin: 10px');
        root.appendChild(el);
        stripCssVarReferences(root);
        expect(el.getAttribute('style')).toBe('color: #333; margin: 10px');
    });

    it('语义变量使用预设映射', () => {
        const root = document.createElement('div');
        const el = document.createElement('span');
        el.setAttribute('style', 'color: var(--smart-mp-text)');
        root.appendChild(el);
        stripCssVarReferences(root);
        expect(el.getAttribute('style')).toBe('color: #333');
    });
});

describe('pre 标签转换（#2.8）与块级裸文本包裹（"实测"行高误报）', () => {
    it('pre 转换为 section，并附加 pre-wrap/break-all，样式在过滤后保留', () => {
        const div = document.createElement('div');
        const pre = document.createElement('pre');
        pre.setAttribute('style', 'background:#f6f8fa;font-size:14px;padding:12px');
        pre.textContent = 'const x = 1;\nconst y = 2;';
        div.appendChild(pre);

        const cleaned = cleanHtmlForWechat(div);
        expect(cleaned.querySelector('pre')).toBeNull();

        const section = cleaned.querySelector('section');
        expect(section).not.toBeNull();
        const style = section!.getAttribute('style') || '';
        expect(style).toContain('background:#f6f8fa');
        expect(style).toContain('white-space: pre-wrap');
        expect(style).toContain('word-break: break-all');
        expect(section!.textContent).toContain('const x = 1;');
    });

    it('white-space / word-break 不再被 CSS 过滤器剥离', () => {
        const result = filterWechatUnsupportedCssProps('white-space: pre-wrap; word-break: break-all; color: #333');
        expect(result).toContain('white-space: pre-wrap');
        expect(result).toContain('word-break: break-all');
        expect(result).toContain('color: #333');
    });

    it('块级元素的直接文本节点被包进 <span>（兜底采集器 hasDirectText=false）', () => {
        const div = document.createElement('div');
        const p = document.createElement('p');
        p.innerHTML = '其实核心思路只有一句话：<strong>让 AI 通过 MCP 建模</strong>，而且更快。';
        div.appendChild(p);

        const cleaned = cleanHtmlForWechat(div);
        const pAfter = cleaned.querySelector('p')!;

        const directText = Array.from(pAfter.childNodes).some(
            c => c.nodeType === Node.TEXT_NODE && (c.textContent || '').trim().length > 0
        );
        expect(directText, 'p 不应再有直接文本节点').toBe(false);

        // 文本完整保留（顺序不变）
        expect(pAfter.textContent).toBe('其实核心思路只有一句话：让 AI 通过 MCP 建模，而且更快。');
        // strong 前后的文本分别被包进 span
        const spans = pAfter.querySelectorAll(':scope > span');
        expect(spans.length).toBe(2);
        expect(spans[0].textContent).toBe('其实核心思路只有一句话：');
        expect(spans[1].textContent).toBe('，而且更快。');
    });

    it('纯空白文本段不被包裹（保持 DOM 最小改动）', () => {
        const div = document.createElement('div');
        const section = document.createElement('section');
        section.innerHTML = '\n  <span>text</span>\n  ';
        div.appendChild(section);

        const cleaned = cleanHtmlForWechat(div);
        // 空白段不产生额外包裹 span：直接子 span 仍只有原来的那一个（内容为 text）
        const s = cleaned.querySelector('section')!;
        const directSpans = s.querySelectorAll(':scope > span');
        expect(directSpans.length).toBe(1);
        expect(directSpans[0].textContent).toBe('text');
    });
});

describe('全管线回归（CssMerger → juice → clean → strip）', () => {
    const THEME_CSS = `
:root {
  --article-line-height: 1.75;
  --heading-line-height: 1.4;
}
.smart-mp { font-size: 16px; line-height: var(--article-line-height); }
.smart-mp p { line-height: var(--article-line-height) !important; margin: 1em 0; }
.smart-mp h1 { font-size: 24px; line-height: var(--heading-line-height); background: linear-gradient(to right, #07c160, #2c3e50); }
.smart-mp blockquote { border-left: 4px solid #07c160; line-height: var(--quote-line-height); background: linear-gradient(135deg, #f6ffed 0%, #fff 100%); }
.smart-mp ul li { line-height: 1.6; }
.smart-mp strong { font-weight: 600; }
`;

    function buildArticleDom(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'smart-mp';
        const styleTag = document.createElement('style');
        styleTag.setAttribute('data-smart-mp-custom-theme', 'true');
        styleTag.textContent = THEME_CSS;
        root.appendChild(styleTag);

        const h1 = document.createElement('h1');
        h1.textContent = '标题 Heading';
        root.appendChild(h1);

        const p1 = document.createElement('p');
        p1.innerHTML = '第一段：普通文字与<strong>加粗</strong>和<em>斜体</em>，多行文本多行文本多行文本多行文本';
        root.appendChild(p1);

        const quote = document.createElement('blockquote');
        const qp = document.createElement('p');
        qp.textContent = '引用内容引用内容引用内容引用内容';
        quote.appendChild(qp);
        root.appendChild(quote);

        const ul = document.createElement('ul');
        for (let i = 0; i < 2; i++) {
            const li = document.createElement('li');
            li.textContent = `列表项 ${i}`;
            ul.appendChild(li);
        }
        root.appendChild(ul);

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.setAttribute('style', 'display:block;background:#282c34;color:#abb2bf;font-size:14px;line-height:1.5;padding:12px;margin:0;');
        code.textContent = 'const x = 1;\nconst y = 2;';
        pre.appendChild(code);
        root.appendChild(pre);

        return root;
    }

    /** 复刻 previewer.processArticleForExport 的导出顺序（不含图片上传） */
    async function runExportPipeline(): Promise<string> {
        const merger = new CSSMerger();
        await merger.init(THEME_CSS);

        const root = buildArticleDom();
        merger.applyStyleToElement(root);

        // processArticleForExport: juice 内联 → stripCssVarReferences（新增）
        await inlineCssWithJuice(root);
        stripCssVarReferences(root);

        const cleanedEl = cleanHtmlForWechat(root);
        const html = serializeChildren(cleanedEl);
        return stripUnsupportedCssFromHtml(html);
    }

    it('最终 HTML 不含 var() 残留', async () => {
        const finalHtml = await runExportPipeline();
        expect(finalHtml).not.toContain('var(');
    });

    it('最终 HTML 不含渐变值', async () => {
        const finalHtml = await runExportPipeline();
        expect(finalHtml).not.toMatch(/gradient/i);
    });

    it('最终 HTML 的 line-height 全部为显式 px', async () => {
        const finalHtml = await runExportPipeline();
        // 不允许无单位行高（如 "line-height: 1.5" / "line-height: 1.5;" / "line-height: 1.5\""）
        expect(finalHtml).not.toMatch(/line-height:\s*[\d.]+\s*(;|")/);
        const pxMatches = finalHtml.match(/line-height:\s*[\d.]+px/g);
        expect(pxMatches).not.toBeNull();
        expect(pxMatches!.length).toBeGreaterThan(0);
    });

    it('每个含文本元素都有显式 px 行高，且 ≥ 自身字号', async () => {
        const finalHtml = await runExportPipeline();
        const container = document.createElement('div');
        container.innerHTML = finalHtml;

        const checkWalk = (el: Element, parentFontPx: number, inheritedLhPx: number) => {
            if (['img', 'br', 'hr'].includes(el.tagName.toLowerCase())) return;
            const style = el.getAttribute('style') || '';
            const fontMatch = style.match(/font-size:\s*([\d.]+)px/);
            const fontPx = fontMatch ? parseFloat(fontMatch[1]) : parentFontPx;

            if ((el.textContent || '').trim().length > 0) {
                const lhMatch = style.match(/line-height:\s*([\d.]+)px/);
                expect(lhMatch, `元素 <${el.tagName.toLowerCase()}> "${el.textContent?.slice(0, 15)}" 缺少显式 px 行高，style="${style}"`).not.toBeNull();
                const lhPx = parseFloat(lhMatch![1]);
                expect(lhPx, `元素 <${el.tagName.toLowerCase()}> 行高 ${lhPx}px 小于字号 ${fontPx}px`).toBeGreaterThanOrEqual(fontPx);
            }

            let childInheritedLh = inheritedLhPx;
            const ownLh = style.match(/line-height:\s*([\d.]+)px/);
            if (ownLh) childInheritedLh = parseFloat(ownLh[1]);
            for (const child of Array.from(el.children)) {
                checkWalk(child, fontPx, childInheritedLh);
            }
        };
        for (const child of Array.from(container.children)) {
            checkWalk(child, 16, 24);
        }
    });

    it('最终 HTML 无 pre 标签，且所有块级元素均无直接文本节点（微信兜底采集器跳过）', async () => {
        const finalHtml = await runExportPipeline();
        expect(finalHtml).not.toContain('<pre');

        const container = document.createElement('div');
        container.innerHTML = finalHtml;
        const blockTags = new Set(['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'a', 'blockquote']);
        container.querySelectorAll('*').forEach(el => {
            if (!blockTags.has(el.tagName.toLowerCase())) return;
            const hasDirectText = Array.from(el.childNodes).some(
                c => c.nodeType === Node.TEXT_NODE && (c.textContent || '').trim().length > 0
            );
            expect(hasDirectText, `元素 <${el.tagName.toLowerCase()}> "${el.textContent?.slice(0, 15)}" 残留直接文本节点`).toBe(false);
        });
    });

    it('渐变背景降级为纯色（h1 保留 #07c160 背景，而非丢失）', async () => {
        const finalHtml = await runExportPipeline();
        const container = document.createElement('div');
        container.innerHTML = finalHtml;
        const h1 = container.querySelector('h1');
        expect(h1).not.toBeNull();
        const style = h1!.getAttribute('style') || '';
        expect(style).toContain('background');
        expect(style).toContain('#07c160');
    });

    it('img 的 data-w 属性在 cleanHtmlForWechat 后保留', () => {
        const div = document.createElement('div');
        const img = document.createElement('img');
        img.setAttribute('src', 'https://mmbiz.qpic.cn/x.jpg');
        img.setAttribute('style', 'width: 600px');
        img.setAttribute('data-w', '600');
        div.appendChild(img);
        const cleaned = cleanHtmlForWechat(div);
        const imgAfter = cleaned.querySelector('img');
        expect(imgAfter?.getAttribute('data-w')).toBe('600');
        // 其他 data-* 仍然删除
        const span = document.createElement('span');
        span.setAttribute('data-smart-mp-pseudo-before', 'true');
        span.textContent = 'x';
        cleaned.appendChild(span);
        const cleaned2 = cleanHtmlForWechat(cleaned);
        expect(cleaned2.querySelector('[data-smart-mp-pseudo-before]')).toBeNull();
    });
});
