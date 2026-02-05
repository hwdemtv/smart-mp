import { requestUrl, Notice } from "obsidian";
import * as cheerio from "cheerio";
import { THEME_VARIABLES } from "./variables";
import { $t } from "../lang/i18n";

export class ThemeExtractor {

    /**
     * 从 URL 提取主题样式 CSS
     * @param url 微信文章链接
     */
    async extractFromUrl(url: string): Promise<string> {
        try {
            const html = await this.fetchHtml(url);
            const $ = cheerio.load(html);

            // 提取关键颜色
            const primaryColor = this.extractPrimaryColor($);
            const backgroundColor = this.extractBackgroundColor($);

            // 提取排版样式
            const h1Style = this.extractElementStyle($, '#js_content h1, #activity-name');
            const h2Style = this.extractElementStyle($, '#js_content h2');
            const pStyle = this.extractElementStyle($, '#js_content p');
            const blockquoteStyle = this.extractElementStyle($, '#js_content blockquote');

            // 构造 CSS
            const css = this.generateCss({
                primaryColor,
                backgroundColor,
                h1Style,
                h2Style,
                pStyle,
                blockquoteStyle
            });

            return css;
        } catch (error) {
            console.error("Theme extraction failed:", error);
            throw new Error($t("settings.extraction-failed-invalid-url") || "无法从该链接提取主题，请检查链接是否有效。");
        }
    }

    private async fetchHtml(url: string): Promise<string> {
        // 使用 Obsidian 的 requestUrl 绕过 CORS
        const response = await requestUrl({ url });
        if (response.status !== 200) {
            throw new Error(`Failed to fetch URL: ${response.status}`);
        }
        return response.text;
    }

    private extractPrimaryColor($: cheerio.CheerioAPI): string {
        const colorCounts: Record<string, number> = {};

        // 扫描带有颜色的 strong 标签
        $('#js_content strong[style*="color"]').each((i, el) => {
            const style = $(el).attr('style') || '';
            const colorMatch = style.match(/color:\s*([^;]+)/i);
            if (colorMatch && colorMatch[1]) {
                const color = colorMatch[1].trim();
                // 排除黑白灰
                if (!this.isGrayscale(color)) {
                    colorCounts[color] = (colorCounts[color] || 0) + 1;
                }
            }
        });

        // 扫描 section 边框颜色
        $('#js_content section[style*="border"]').each((i, el) => {
            const style = $(el).attr('style') || '';
            const colorMatch = style.match(/border.*:\s*[^;]*\s+(#[0-9a-f]{3,6}|rgb\([^)]+\))/i);
            if (colorMatch && colorMatch[1]) {
                const color = colorMatch[1].trim();
                if (!this.isGrayscale(color)) {
                    colorCounts[color] = (colorCounts[color] || 0) + 2; // 权重更高
                }
            }
        });

        // 找出现频率最高的颜色
        let maxCount = 0;
        let primary = THEME_VARIABLES.colors.primary; // 默认回退

        for (const [color, count] of Object.entries(colorCounts)) {
            if (count > maxCount) {
                maxCount = count;
                primary = color;
            }
        }

        return primary;
    }

    private extractBackgroundColor($: cheerio.CheerioAPI): string {
        // 尝试获取背景色，如果没找到则默认
        // 微信文章通常背景色在 body 或 page_wrapper，但 CSS 往往是内联的或外部的
        // 这里做一个简单的启发式: 检查是否全文有深色背景模式
        const bodyBg = $('body').css('background-color');
        if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') return bodyBg;

        return THEME_VARIABLES.colors.background.paper;
    }

    private extractElementStyle($: cheerio.CheerioAPI, selector: string): any {
        // 找到第一个匹配的元素
        const el = $(selector).first();
        if (el.length === 0) return {};

        // Cheerio 只能解析内联 style 属性，无法获取计算样式
        // 微信文章大多使用内联样式，所以这里尝试解析 style 属性
        const styleStr = el.attr('style') || '';
        const styles: Record<string, string> = {};

        styleStr.split(';').forEach(pair => {
            const [key, value] = pair.split(':');
            if (key && value) {
                styles[key.trim().toLowerCase()] = value.trim();
            }
        });

        return styles;
    }

    private isGrayscale(color: string): boolean {
        // 简单判断: rgb(x, x, x) 或 #333333
        if (color.startsWith('#')) {
            if (color.length === 4) { // #333
                return color[1] === color[2] && color[2] === color[3];
            }
            if (color.length === 7) { // #333333
                return color[1] === color[2] && color[3] === color[4] && color[5] === color[6] && color[1] === color[3] && color[3] === color[5];
            }
        }
        if (color.startsWith('rgb')) {
            const parts = color.match(/\d+/g);
            if (parts && parts.length >= 3) {
                const [r, g, b] = parts.map(Number);
                // 允许一定容差
                return Math.abs(r - g) < 10 && Math.abs(g - b) < 10;
            }
        }
        // 颜色名称
        return ['black', 'white', 'gray', 'grey'].includes(color.toLowerCase());
    }

    private generateCss(data: any): string {
        const { primaryColor, h2Style, h1Style } = data;

        // 构建 CSS 变量覆盖
        let css = ':root {\n';
        css += `    --colors-primary: ${primaryColor};\n`;
        // 如果有探测到其他颜色变量可以继续添加
        css += '}\n\n';

        css += '/* Extracted Theme Styles */\n\n';

        // H1
        css += '.smart-mp-article h1 {\n';
        if (h1Style['font-size']) css += `    font-size: ${h1Style['font-size']};\n`;
        if (h1Style['color']) css += `    color: ${h1Style['color']};\n`;
        // 强制居中判断 (简单启发)
        if (h1Style['text-align']) css += `    text-align: ${h1Style['text-align']};\n`;
        css += '}\n\n';

        // H2 (通常是小标题)
        css += '.smart-mp-article h2 {\n';
        // 重点：尝试还原 H2 的装饰效果
        // 微信编辑器常见样式：左边框、下边框、背景色
        if (h2Style['border-left']) css += `    border-left: ${h2Style['border-left']};\n`;
        if (h2Style['border-bottom']) css += `    border-bottom: ${h2Style['border-bottom']};\n`;
        if (h2Style['background-color']) css += `    background-color: ${h2Style['background-color']};\n`;
        if (h2Style['color']) {
            css += `    color: ${h2Style['color']};\n`;
        } else {
            // 如果没检测到特定颜色，使用主色
            css += `    color: var(--colors-primary);\n`;
        }

        // H2 通用美化
        css += `    margin-top: 1.2em;\n`;
        css += `    margin-bottom: 0.8em;\n`;
        css += '}\n\n';

        // Blockquote
        if (data.blockquoteStyle && Object.keys(data.blockquoteStyle).length > 0) {
            css += '.smart-mp-article blockquote {\n';
            if (data.blockquoteStyle['background-color']) css += `    background-color: ${data.blockquoteStyle['background-color']};\n`;
            if (data.blockquoteStyle['border-left']) css += `    border-left: ${data.blockquoteStyle['border-left']};\n`;
            css += '}\n\n';
        }

        return css;
    }
}
