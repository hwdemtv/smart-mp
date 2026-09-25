/**
 * @vitest-environment jsdom
 *
 * 表格导出回归测试：微信编辑器支持 <table> 结构（内容结构检测规范 #1.4.2 即针对表格列宽），
 * 导出必须保留真表格（thead/tbody/tr/th/td），而不是卡片化 section；
 * 同时需解除滚动容器包裹、铺满宽度、允许折行，避免移动端横向溢出。
 */
import { describe, it, expect } from 'vitest';

import { applyWechatCompatStyles } from '../../views/previewer';
import {
    inlineCssWithJuice,
    cleanHtmlForWechat,
    serializeChildren,
    stripUnsupportedCssFromHtml,
    stripCssVarReferences,
} from '../../utils/utils';
import { CSSMerger } from '../../theme/CssMerger';
import { getPresetCSS } from '../../theme/presets';

describe('微信表格导出', () => {
    it('完整导出管线输出真表格（含 Obsidian .table-container 包裹场景）', async () => {
        const section = document.createElement('section');
        section.className = 'smart-mp-article-content smart-mp';
        section.style.fontSize = '15px';
        section.innerHTML = `
<p>表格前的段落。</p>
<div class="table-container"><div class="smart-mp-table-container"><table><thead><tr><th>对比项</th><th>方案 A</th><th>方案 B</th></tr></thead><tbody><tr><td>上手门槛</td><td>较低，对话即可</td><td>极低，中文直说</td></tr><tr><td>出图速度</td><td>快</td><td>更快</td></tr></tbody></table></div></div>
<p>表格后的段落。</p>`;

        // previewer 的 wrapTables 复刻（生产管线中表格渲染后包一层滚动容器）
        section.querySelectorAll('table').forEach((table) => {
            if (table.parentElement?.classList.contains('smart-mp-table-container')) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'smart-mp-table-container';
            table.parentElement?.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });

        const merger = new CSSMerger();
        await merger.init(getPresetCSS('default'));
        merger.applyStyleToElement(section);

        const articleDiv = document.createElement('div');
        articleDiv.appendChild(section);
        const finalArticleEl = articleDiv.cloneNode(true) as HTMLElement;

        applyWechatCompatStyles(finalArticleEl);
        await inlineCssWithJuice(finalArticleEl);
        stripCssVarReferences(finalArticleEl);

        const cleanedArticleEl = cleanHtmlForWechat(finalArticleEl);
        const html = serializeChildren(cleanedArticleEl);
        const finalHtml = stripUnsupportedCssFromHtml(html);

        // —— 真表格结构保留 ——
        expect(finalHtml).toContain('<table');
        expect(finalHtml).toContain('<thead');
        expect(finalHtml).toContain('<tbody');
        expect(finalHtml).toContain('<th');
        expect(finalHtml).toContain('<td');
        expect(finalHtml).toContain('对比项');
        // 表格标签未被转换/卡片化
        expect(finalHtml).not.toContain('smart-mp-table-card');

        // —— 滚动容器解除（table-container / smart-mp-table-container 均剥离）——
        expect(finalHtml).not.toContain('table-container');

        // —— 表级样式：宽度铺满、合并边框、允许折行（无移动端溢出隐患）——
        const tableTag = finalHtml.match(/<table[^>]*>/)?.[0] || '';
        expect(tableTag).toMatch(/width:\s*100%/);
        expect(tableTag).toMatch(/border-collapse:\s*collapse/);
        expect(tableTag).toMatch(/border-spacing:\s*0/);
        expect(tableTag).not.toMatch(/white-space:\s*nowrap/);
        expect(finalHtml).not.toContain('max-content');

        // —— overrideStyleDeclarations 不得产生重复声明 ——
        for (const prop of ['width', 'border-collapse', 'border-spacing', 'white-space']) {
            const count = tableTag.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:`, 'gi'))?.length || 0;
            expect(count, `table 上 ${prop} 声明应恰好一条`).toBe(1);
        }

        // —— 单元格：有内边距、可折行（注意区分 th/td 与 thead）——
        const cellTag = finalHtml.match(/<t[dh]\s[^>]*>/)?.[0] || '';
        expect(cellTag).toMatch(/padding:\s*8px 12px/);
        expect(cellTag).toMatch(/word-break:\s*break-word/);
        expect(cellTag).not.toMatch(/white-space:\s*nowrap/);

        // —— 微信兼容性兜底：每个含文本元素有显式 px 行高且 ≥ 字号 ——
        expect(finalHtml).not.toMatch(/line-height:\s*[\d.]+\s*(;|")/);
        expect(finalHtml).not.toMatch(/line-height:\s*var\(/);
        expect(finalHtml).not.toContain('!important');
    }, 30000);
});
