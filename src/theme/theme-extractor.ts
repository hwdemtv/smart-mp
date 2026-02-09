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
            let blockquoteStyle = this.extractElementStyle($, '#js_content blockquote');
            if (Object.keys(blockquoteStyle).length === 0) {
                // 如果没有标准的 blockquote，尝试提取“伪引用样式”（带左边框的元素）
                blockquoteStyle = this.extractFakeQuoteStyle($);
            }
            const highlightStyle = this.extractHighlightStyle($);
            const hrStyle = this.extractElementStyle($, '#js_content hr');

            // 构造 CSS
            const css = this.generateCss({
                primaryColor,
                backgroundColor,
                h1Style,
                h2Style,
                pStyle,
                blockquoteStyle,
                highlightStyle,
                hrStyle
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
        let styleStr = el.attr('style') || '';

        // [ENHANCED] 如果是标题元素(H1-H6)，尝试探测其父级容器的样式
        // 微信编辑器常将背景和装饰边框放在标题的外层 section/div 上
        const isHeading = /h[1-6]/i.test(selector);
        if (isHeading) {
            // 尝试多层父级容器,优先查找有 style 属性的
            let container = el.parent();
            let depth = 0;
            const maxDepth = 3; // 最多向上查找3层

            while (container.length > 0 && depth < maxDepth) {
                const containerStyle = container.attr('style') || '';
                if (containerStyle) {
                    // 如果父级容器有 style 属性,合并到当前样式中
                    // 优先使用父级的 background-color 和 border 相关属性
                    styleStr = containerStyle + ';' + styleStr;

                    // 如果找到了 background-color 或 border,就不再向上查找
                    if (containerStyle.includes('background') || containerStyle.includes('border')) {
                        break;
                    }
                }
                container = container.parent();
                depth++;
            }
        }

        const styles: Record<string, string> = {};

        styleStr.split(';').forEach(pair => {
            const index = pair.indexOf(':');
            if (index > -1) {
                const key = pair.substring(0, index).trim().toLowerCase();
                const value = pair.substring(index + 1).trim();
                if (key && value) {
                    styles[key] = value;
                }
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

    private extractFakeQuoteStyle($: cheerio.CheerioAPI): Record<string, string> {
        let bestStyle: Record<string, string> = {};

        // Priority: elements with border-left that look like quotes
        $('#js_content [style*="border-left"]').each((i, el) => {
            // Basic check to ensure it's not a tiny separator
            if ($(el).text().trim().length === 0) return;

            const styleStr = $(el).attr('style') || '';
            const styles: Record<string, string> = {};

            styleStr.split(';').forEach(pair => {
                const index = pair.indexOf(':');
                if (index > -1) {
                    const key = pair.substring(0, index).trim().toLowerCase();
                    const value = pair.substring(index + 1).trim();
                    if (key && value) styles[key] = value;
                }
            });

            if (styles['border-left'] || styles['border-left-width']) {
                // Found a candidate
                bestStyle = styles;
                return false; // break
            }
        });

        return bestStyle;
    }

    private extractHighlightStyle($: cheerio.CheerioAPI): Record<string, string> {
        const styleCounts: Record<string, number> = {};
        const styleMap: Record<string, Record<string, string>> = {};

        $('#js_content strong[style], #js_content span[style], #js_content mark[style]').each((i, el) => {
            const style = $(el).attr('style') || '';

            // Exclude fake quotes (prevent interference)
            if (style.includes('border-left')) return;

            let key = '';
            let props: Record<string, string> = {};

            // 1. Check for background-color
            const bgMatch = style.match(/background-color:\s*([^;]+)/i);
            if (bgMatch && bgMatch[1]) {
                const color = bgMatch[1].trim();
                if (color !== 'transparent' && color !== '#ffffff' && color !== 'rgba(0, 0, 0, 0)' && color !== 'rgb(255, 255, 255)' && !this.isGrayscale(color)) {
                    key += `bg:${color};`;
                    props['background-color'] = color;
                }
            }

            // 2. Check for gradient (background or background-image)
            const gradMatch = style.match(/(background|background-image):\s*(linear-gradient\([^;]+\))/i);
            if (gradMatch && gradMatch[2]) {
                const val = gradMatch[2].trim();
                key += `grad:${val};`;
                props['background'] = val;
            }

            if (key) {
                const colorMatch = style.match(/color:\s*([^;]+)/i);
                if (colorMatch && colorMatch[1]) {
                    props['color'] = colorMatch[1].trim();
                }

                styleCounts[key] = (styleCounts[key] || 0) + 1;
                styleMap[key] = props;
            }
        });

        // Find max frequency
        let maxCount = 0;
        let bestStyle = {};
        for (const [key, count] of Object.entries(styleCounts)) {
            if (count > maxCount) {
                maxCount = count;
                bestStyle = styleMap[key];
            }
        }
        return bestStyle;
    }

    private generateCss(data: any): string {
        const { primaryColor, h2Style, h1Style, hrStyle } = data;

        // 构建 CSS 变量覆盖
        let css = ':root {\n';
        css += `    --colors-primary: ${primaryColor};\n`;
        // 如果有探测到其他颜色变量可以继续添加
        css += '}\n\n';

        css += '/* Extracted Theme Styles */\n\n';

        // H1
        css += '.smart-mp h1 {\n';
        if (h1Style['border-left']) {
            let borderLeft = h1Style['border-left'];
            if (!borderLeft.includes('!important')) borderLeft += ' !important';
            css += `    border-left: ${borderLeft};\n`;
        }
        if (h1Style['border-bottom']) {
            let borderBottom = h1Style['border-bottom'];
            if (!borderBottom.includes('!important')) borderBottom += ' !important';
            css += `    border-bottom: ${borderBottom};\n`;
        }
        if (h1Style['background-color']) {
            let bgColor = h1Style['background-color'];
            if (!bgColor.includes('!important')) bgColor += ' !important';
            css += `    background-color: ${bgColor};\n`;
        }
        if (h1Style['background']) {
            let bg = h1Style['background'];
            if (!bg.includes('!important')) bg += ' !important';
            css += `    background: ${bg};\n`;
        }
        if (h1Style['font-size']) css += `    font-size: ${h1Style['font-size']};\n`;
        if (h1Style['color']) css += `    color: ${h1Style['color']};\n`;
        // 强制居中判断 (简单启发)
        if (h1Style['text-align']) css += `    text-align: ${h1Style['text-align']};\n`;
        css += '}\n\n';

        // H2 (通常是小标题)
        css += '.smart-mp h2 {\n';
        // 重点：尝试还原 H2 的装饰效果
        // 微信编辑器常见样式：左边框、下边框、背景色
        if (h2Style['border-left']) {
            let borderLeft = h2Style['border-left'];
            if (!borderLeft.includes('!important')) borderLeft += ' !important';
            css += `    border-left: ${borderLeft};\n`;
        }
        if (h2Style['border-bottom']) {
            let borderBottom = h2Style['border-bottom'];
            if (!borderBottom.includes('!important')) borderBottom += ' !important';
            css += `    border-bottom: ${borderBottom};\n`;
        }
        if (h2Style['background-color']) {
            let bgColor = h2Style['background-color'];
            if (!bgColor.includes('!important')) bgColor += ' !important';
            css += `    background-color: ${bgColor};\n`;
        }
        if (h2Style['background']) {
            let bg = h2Style['background'];
            if (!bg.includes('!important')) bg += ' !important';
            css += `    background: ${bg};\n`;
        }
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
            css += '.smart-mp blockquote {\n';
            const allowedProps = [
                'background-color', 'background',
                'border', 'border-left', 'border-right', 'border-top', 'border-bottom',
                'border-color', 'border-left-color', 'border-right-color', 'border-top-color', 'border-bottom-color',
                'border-width', 'border-left-width', 'border-right-width', 'border-top-width', 'border-bottom-width',
                'border-style', 'border-left-style', 'border-right-style', 'border-top-style', 'border-bottom-style',
                'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
                'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
                'color', 'font-size', 'font-style', 'font-weight',
                'border-radius'
            ];

            allowedProps.forEach(prop => {
                if (data.blockquoteStyle[prop]) {
                    let value = data.blockquoteStyle[prop];
                    // Add !important to border properties to override default styles
                    if (prop.startsWith('border') && !value.includes('!important')) {
                        value += ' !important';
                    }
                    css += `    ${prop}: ${value};\n`;
                }
            });
            css += '}\n\n';
        }

        // Highlight (Mark)
        if (data.highlightStyle && Object.keys(data.highlightStyle).length > 0) {
            css += '.smart-mp mark {\n';
            if (data.highlightStyle['background']) {
                let bg = data.highlightStyle['background'];
                if (!bg.includes('!important')) bg += ' !important';
                css += `    background: ${bg};\n`;
            }
            if (data.highlightStyle['background-color']) {
                let bgColor = data.highlightStyle['background-color'];
                if (!bgColor.includes('!important')) bgColor += ' !important';
                css += `    background-color: ${bgColor};\n`;
            }
            if (data.highlightStyle['color']) css += `    color: ${data.highlightStyle['color']};\n`;
            css += '}\n\n';
        }

        // Horizontal Rule (hr) - Enhanced with gradient effect
        css += '.smart-mp hr {\n';
        css += `    border: none !important;\n`;

        // Determine the color for the gradient
        let hrColor = primaryColor; // Default to primary color

        if (hrStyle && Object.keys(hrStyle).length > 0) {
            // If we extracted a background-color, use it for the gradient
            if (hrStyle['background-color']) {
                hrColor = hrStyle['background-color'];
            } else if (hrStyle['border-top']) {
                // Try to extract color from border-top
                const borderColorMatch = hrStyle['border-top'].match(/#[0-9a-f]{3,6}|rgb\([^)]+\)/i);
                if (borderColorMatch) {
                    hrColor = borderColorMatch[0];
                }
            } else if (hrStyle['border']) {
                // Try to extract color from border
                const borderColorMatch = hrStyle['border'].match(/#[0-9a-f]{3,6}|rgb\([^)]+\)/i);
                if (borderColorMatch) {
                    hrColor = borderColorMatch[0];
                }
            }
        }

        // Generate gradient background
        css += `    background: linear-gradient(to right, transparent, ${hrColor}, transparent) !important;\n`;
        css += `    height: 2px !important;\n`;

        // Use extracted margin if available, otherwise use default
        if (hrStyle && hrStyle['margin']) {
            css += `    margin: ${hrStyle['margin']} !important;\n`;
        } else {
            css += `    margin: 40px auto !important;\n`;
        }

        css += '}\n\n';

        return css;
    }
}
