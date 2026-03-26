import { requestUrl, Notice } from "obsidian";
import * as cheerio from "cheerio";
import { THEME_VARIABLES } from "./variables";
import { $t } from "../lang/i18n";
import Logger from "../utils/logger";

/**
 * 全局排版参数接口
 */
interface GlobalTypography {
    lineHeight: string;
    letterSpacing: string;
    fontSize: string;
    color: string;
    textAlign: string;
}

/**
 * 卡片模式检测结果
 */
interface CardModeResult {
    isCardMode: boolean;
    cardSections: Array<{
        selector: string;
        boxShadow: string;
        borderRadius: string;
        backgroundColor: string;
    }>;
}

/**
 * 图片样式接口
 */
interface ImageStyles {
    borderRadius: string;
    boxShadow: string;
    maxWidth: string;
    margin: string;
}

/**
 * 代码块样式接口
 */
interface CodeBlockStyles {
    backgroundColor: string;
    color: string;
    borderRadius: string;
    fontFamily: string;
    fontSize: string;
    padding: string;
}

/**
 * 增强的提取数据接口
 */
interface ExtractedThemeData {
    primaryColor: string;
    backgroundColor: string;
    globalTypography: GlobalTypography;
    pagePadding: string;
    isCardMode: boolean;
    cardStyles: CardModeResult['cardSections'];
    h1Style: Record<string, string>;
    h2Style: Record<string, string>;
    pStyle: Record<string, string>;
    blockquoteStyle: Record<string, string>;
    highlightStyle: Record<string, string>;
    hrStyle: Record<string, string>;
    imageStyles: ImageStyles;
    codeBlockStyles: CodeBlockStyles;
}

export class ThemeExtractor {

    // 基准字号（用于单位转换）
    private baseFontSize = 16;

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

            // [NEW] 提取全局排版参数
            const globalTypography = this.extractGlobalTypography($);
            const pagePadding = this.extractPagePadding($);

            // [NEW] 检测卡片模式
            const cardMode = this.detectCardMode($);

            // 提取排版样式
            const h1Style = this.extractElementStyle($, '#js_content h1, #activity-name');
            const h2Style = this.extractElementStyle($, '#js_content h2');
            const pStyle = this.extractElementStyle($, '#js_content p');
            let blockquoteStyle = this.extractElementStyle($, '#js_content blockquote');
            if (Object.keys(blockquoteStyle).length === 0) {
                // 如果没有标准的 blockquote，尝试提取"伪引用样式"（带左边框的元素）
                blockquoteStyle = this.extractFakeQuoteStyle($);
            }
            const highlightStyle = this.extractHighlightStyle($);
            const hrStyle = this.extractElementStyle($, '#js_content hr');

            // [NEW] 提取图片样式
            const imageStyles = this.extractImageStyles($);

            // [NEW] 提取代码块样式
            const codeBlockStyles = this.extractCodeBlockStyles($);

            // 构造 CSS
            const css = this.generateCss({
                primaryColor,
                backgroundColor,
                globalTypography,
                pagePadding,
                isCardMode: cardMode.isCardMode,
                cardStyles: cardMode.cardSections,
                h1Style,
                h2Style,
                pStyle,
                blockquoteStyle,
                highlightStyle,
                hrStyle,
                imageStyles,
                codeBlockStyles
            });

            return css;
        } catch (error) {
            Logger.error("ThemeExtractor", "Theme extraction failed:", error);
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

    /**
     * [NEW] 提取全局排版参数
     * 从正文章段落中提取 line-height、letter-spacing、font-size 等
     */
    private extractGlobalTypography($: cheerio.CheerioAPI): GlobalTypography {
        const defaultResult: GlobalTypography = {
            lineHeight: '1.6',
            letterSpacing: '0px',
            fontSize: '16px',
            color: 'rgba(0, 0, 0, 0.85)',
            textAlign: 'justify'
        };

        // 寻找基准元素：#js_content 内第一个非空的 p 标签
        const $p = $('#js_content p').filter((i, el) => {
            const text = $(el).text().trim();
            return text.length > 10; // 至少10个字符
        }).first();

        if ($p.length === 0) {
            return defaultResult;
        }

        // 尝试从内联样式获取
        const styleStr = $p.attr('style') || '';

        // 解析样式
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

        // 提取并标准化单位
        return {
            lineHeight: styles['line-height'] || defaultResult.lineHeight,
            letterSpacing: this.normalizeUnit(styles['letter-spacing'] || defaultResult.letterSpacing),
            fontSize: this.normalizeUnit(styles['font-size'] || defaultResult.fontSize, true),
            color: styles['color'] || defaultResult.color,
            textAlign: styles['text-align'] || defaultResult.textAlign
        };
    }

    /**
     * [NEW] 提取页面内边距（边缘留白）
     */
    private extractPagePadding($: cheerio.CheerioAPI): string {
        const $content = $('#js_content');
        const styleStr = $content.attr('style') || '';

        const paddingMatch = styleStr.match(/padding:\s*([^;]+)/i);
        if (paddingMatch && paddingMatch[1]) {
            return this.normalizeUnit(paddingMatch[1].trim());
        }

        // 尝试单独匹配
        const paddingLeft = styleStr.match(/padding-left:\s*([^;]+)/i);
        const paddingRight = styleStr.match(/padding-right:\s*([^;]+)/i);

        if (paddingLeft && paddingRight) {
            return `${this.normalizeUnit(paddingLeft[1])} ${this.normalizeUnit(paddingRight[1])}`;
        }

        return THEME_VARIABLES.wechat.padding; // 默认
    }

    /**
     * [NEW] 卡片模式检测
     * 通过统计学特征判断是否为卡片主题
     */
    private detectCardMode($: cheerio.CheerioAPI): CardModeResult {
        const cardSections: CardModeResult['cardSections'] = [];
        let cardCount = 0;
        let totalSections = 0;

        $('#js_content section').each((i, el) => {
            if (i > 50) return; // 限制扫描数量

            const styleStr = $(el).attr('style') || '';
            totalSections++;

            // 检查是否是卡片：box-shadow 或 border-radius > 4px
            const hasBoxShadow = styleStr.includes('box-shadow') && !styleStr.includes('box-shadow: none');
            const borderRadiusMatch = styleStr.match(/border-radius:\s*(\d+)/i);
            const borderRadius = borderRadiusMatch ? parseInt(borderRadiusMatch[1]) : 0;

            // 检查是否有子元素（卡片通常包含多个子元素）
            const childCount = $(el).children().length;

            if ((hasBoxShadow || borderRadius > 4) && childCount >= 2) {
                cardCount++;

                // 提取卡片样式
                const bgMatch = styleStr.match(/background(-color)?:\s*([^;]+)/i);
                const shadowMatch = styleStr.match(/box-shadow:\s*([^;]+)/i);

                cardSections.push({
                    selector: `section.card-${i}`,
                    boxShadow: shadowMatch ? shadowMatch[1].trim() : 'none',
                    borderRadius: borderRadiusMatch ? borderRadiusMatch[0] : '0px',
                    backgroundColor: bgMatch ? bgMatch[2].trim() : 'transparent'
                });
            }
        });

        // 超过 30% 的 section 是卡片，则认为是卡片模式
        const isCardMode = totalSections > 0 && (cardCount / totalSections) > 0.3;

        return { isCardMode, cardSections: cardSections.slice(0, 5) }; // 最多保留5个卡片样式
    }

    /**
     * [NEW] 单位标准化
     * 将 pt、rem 等转换为 px
     */
    private normalizeUnit(value: string, isFontSize = false): string {
        if (!value) return isFontSize ? `${this.baseFontSize}px` : '0';

        // 处理 pt → px (1pt ≈ 1.33px)
        if (value.includes('pt')) {
            const numMatch = value.match(/[\d.]+/);
            if (numMatch) {
                const pt = parseFloat(numMatch[0]);
                return `${(pt * 1.33).toFixed(1)}px`;
            }
        }

        // 处理 rem → px
        if (value.includes('rem')) {
            const numMatch = value.match(/[\d.]+/);
            if (numMatch) {
                const rem = parseFloat(numMatch[0]);
                return `${(rem * this.baseFontSize).toFixed(1)}px`;
            }
        }

        // 处理 em → px (如果是字体大小用基准字号，其他用 1em = 16px)
        if (value.includes('em') && !value.includes('rem')) {
            const numMatch = value.match(/[\d.]+/);
            if (numMatch) {
                const em = parseFloat(numMatch[0]);
                const base = isFontSize ? this.baseFontSize : 16;
                return `${(em * base).toFixed(1)}px`;
            }
        }

        return value;
    }

    /**
     * [NEW] 智能降级：根据主色计算互补色
     */
    private calculateComplementaryColor(primaryColor: string): string {
        // 解析十六进制颜色
        let hex = primaryColor.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }

        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // 计算互补色 (反转 RGB)
        const compR = 255 - r;
        const compG = 255 - g;
        const compB = 255 - b;

        return `#${compR.toString(16).padStart(2, '0')}${compG.toString(16).padStart(2, '0')}${compB.toString(16).padStart(2, '0')}`;
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

    private extractElementStyle($: cheerio.CheerioAPI, selector: string): Record<string, string> {
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
                    styles[key] = this.normalizeUnit(value);
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
        let bestStyle: Record<string, string> = {};
        for (const [key, count] of Object.entries(styleCounts)) {
            if (count > maxCount) {
                maxCount = count;
                bestStyle = styleMap[key];
            }
        }
        return bestStyle;
    }

    /**
     * [NEW] 提取图片样式
     * 从文章中的图片元素提取通用样式
     */
    private extractImageStyles($: cheerio.CheerioAPI): ImageStyles {
        const defaultStyles: ImageStyles = {
            borderRadius: '4px',
            boxShadow: 'none',
            maxWidth: '100%',
            margin: '0 auto'
        };

        const styleCounts: Record<string, number> = {};
        const styleMap: Record<string, ImageStyles> = {};

        // 扫描图片元素
        $('#js_content img').each((i, el) => {
            if (i > 20) return; // 限制扫描数量

            const style = $(el).attr('style') || '';
            const props: Partial<ImageStyles> = {};

            // 提取 border-radius
            const radiusMatch = style.match(/border-radius:\s*([^;]+)/i);
            if (radiusMatch) {
                props.borderRadius = this.normalizeUnit(radiusMatch[1].trim());
            }

            // 提取 box-shadow
            const shadowMatch = style.match(/box-shadow:\s*([^;]+)/i);
            if (shadowMatch && !style.includes('box-shadow: none')) {
                props.boxShadow = shadowMatch[1].trim();
            }

            // 提取 max-width
            const widthMatch = style.match(/max-width:\s*([^;]+)/i);
            if (widthMatch) {
                props.maxWidth = this.normalizeUnit(widthMatch[1].trim());
            }

            // 提取 margin
            const marginMatch = style.match(/margin:\s*([^;]+)/i);
            if (marginMatch) {
                props.margin = marginMatch[1].trim();
            }

            // 生成 key 用于统计
            const key = JSON.stringify(props);
            if (Object.keys(props).length > 0) {
                styleCounts[key] = (styleCounts[key] || 0) + 1;
                styleMap[key] = { ...defaultStyles, ...props } as ImageStyles;
            }
        });

        // 找到最常见的样式
        let maxCount = 0;
        let bestStyles = defaultStyles;
        for (const [key, count] of Object.entries(styleCounts)) {
            if (count > maxCount) {
                maxCount = count;
                bestStyles = styleMap[key];
            }
        }

        return bestStyles;
    }

    /**
     * [NEW] 提取代码块样式
     * 从文章中的代码块元素提取样式
     */
    private extractCodeBlockStyles($: cheerio.CheerioAPI): CodeBlockStyles {
        const defaultStyles: CodeBlockStyles = {
            backgroundColor: '#f6f8fa',
            color: '#24292e',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '14px',
            padding: '16px'
        };

        // 尝试提取 pre/code 标签样式
        const codeEl = $('#js_content pre, #js_content code').first();
        if (codeEl.length === 0) {
            return defaultStyles;
        }

        const style = codeEl.attr('style') || '';
        const props: Partial<CodeBlockStyles> = {};

        // 提取背景色
        const bgMatch = style.match(/background(-color)?:\s*([^;]+)/i);
        if (bgMatch && bgMatch[2]) {
            props.backgroundColor = bgMatch[2].trim();
        }

        // 提取文字颜色
        const colorMatch = style.match(/color:\s*([^;]+)/i);
        if (colorMatch) {
            props.color = colorMatch[1].trim();
        }

        // 提取 border-radius
        const radiusMatch = style.match(/border-radius:\s*([^;]+)/i);
        if (radiusMatch) {
            props.borderRadius = this.normalizeUnit(radiusMatch[1].trim());
        }

        // 提取 font-family
        const fontFamilyMatch = style.match(/font-family:\s*([^;]+)/i);
        if (fontFamilyMatch) {
            props.fontFamily = fontFamilyMatch[1].trim();
        }

        // 提取 font-size
        const fontSizeMatch = style.match(/font-size:\s*([^;]+)/i);
        if (fontSizeMatch) {
            props.fontSize = this.normalizeUnit(fontSizeMatch[1].trim(), true);
        }

        // 提取 padding
        const paddingMatch = style.match(/padding:\s*([^;]+)/i);
        if (paddingMatch) {
            props.padding = this.normalizeUnit(paddingMatch[1].trim());
        }

        return { ...defaultStyles, ...props } as CodeBlockStyles;
    }

    private generateCss(data: ExtractedThemeData): string {
        const {
            primaryColor,
            globalTypography,
            pagePadding,
            isCardMode,
            cardStyles,
            h1Style,
            h2Style,
            hrStyle
        } = data;

        // 构建 CSS 变量覆盖
        let css = ':root {\n';
        css += `    --colors-primary: ${primaryColor};\n`;
        // [NEW] 添加提取的全局排版参数
        css += `    --typography-line-height: ${globalTypography.lineHeight};\n`;
        css += `    --typography-letter-spacing: ${globalTypography.letterSpacing};\n`;
        css += `    --typography-font-size: ${globalTypography.fontSize};\n`;
        css += `    --colors-text: ${globalTypography.color};\n`;
        css += `    --page-padding: ${pagePadding};\n`;
        css += '}\n\n';

        css += '/* Extracted Theme Styles */\n\n';

        // [NEW] 卡片模式样式
        if (isCardMode && cardStyles.length > 0) {
            css += '/* Card Mode Styles */\n';
            css += '.smart-mp section {\n';
            cardStyles.forEach((card, i) => {
                if (card.boxShadow !== 'none') {
                    css += `    box-shadow: ${card.boxShadow} !important;\n`;
                }
                if (card.borderRadius !== '0px') {
                    css += `    border-radius: ${card.borderRadius} !important;\n`;
                }
                if (card.backgroundColor !== 'transparent') {
                    css += `    background-color: ${card.backgroundColor} !important;\n`;
                }
            });
            css += '}\n\n';
        }

        // [NEW] 全局段落样式
        css += '.smart-mp p {\n';
        if (globalTypography.lineHeight !== '1.6') {
            css += `    line-height: ${globalTypography.lineHeight} !important;\n`;
        }
        if (globalTypography.letterSpacing !== '0px') {
            css += `    letter-spacing: ${globalTypography.letterSpacing} !important;\n`;
        }
        if (globalTypography.fontSize !== '16px') {
            css += `    font-size: ${globalTypography.fontSize} !important;\n`;
        }
        if (globalTypography.color !== 'rgba(0, 0, 0, 0.85)') {
            css += `    color: ${globalTypography.color} !important;\n`;
        }
        if (globalTypography.textAlign !== 'justify') {
            css += `    text-align: ${globalTypography.textAlign} !important;\n`;
        }
        css += '}\n\n';

        // [NEW] 页面容器边距
        if (pagePadding !== THEME_VARIABLES.wechat.padding) {
            css += '.smart-mp-article {\n';
            css += `    padding: ${pagePadding} !important;\n`;
            css += '}\n\n';
        }

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
        // [NEW] 标题增强属性
        if (h1Style['padding']) css += `    padding: ${h1Style['padding']};\n`;
        if (h1Style['border-radius']) css += `    border-radius: ${h1Style['border-radius']};\n`;
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
        // [NEW] H2 增强属性
        if (h2Style['padding']) css += `    padding: ${h2Style['padding']};\n`;
        if (h2Style['border-radius']) css += `    border-radius: ${h2Style['border-radius']};\n`;
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
                'border-radius', 'box-shadow', 'opacity'
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

        // [NEW] Image Styles
        if (data.imageStyles) {
            const imgStyles = data.imageStyles;
            css += '/* Image Styles */\n';
            css += '.smart-mp img {\n';
            if (imgStyles.borderRadius && imgStyles.borderRadius !== '4px') {
                css += `    border-radius: ${imgStyles.borderRadius} !important;\n`;
            }
            if (imgStyles.boxShadow && imgStyles.boxShadow !== 'none') {
                css += `    box-shadow: ${imgStyles.boxShadow} !important;\n`;
            }
            if (imgStyles.maxWidth && imgStyles.maxWidth !== '100%') {
                css += `    max-width: ${imgStyles.maxWidth} !important;\n`;
            }
            if (imgStyles.margin && imgStyles.margin !== '0 auto') {
                css += `    margin: ${imgStyles.margin} !important;\n`;
            }
            css += '}\n\n';
        }

        // [NEW] Code Block Styles
        if (data.codeBlockStyles) {
            const codeStyles = data.codeBlockStyles;
            css += '/* Code Block Styles */\n';
            css += '.smart-mp pre, .smart-mp code {\n';
            if (codeStyles.backgroundColor && codeStyles.backgroundColor !== '#f6f8fa') {
                css += `    background-color: ${codeStyles.backgroundColor} !important;\n`;
            }
            if (codeStyles.color && codeStyles.color !== '#24292e') {
                css += `    color: ${codeStyles.color} !important;\n`;
            }
            if (codeStyles.borderRadius && codeStyles.borderRadius !== '6px') {
                css += `    border-radius: ${codeStyles.borderRadius} !important;\n`;
            }
            if (codeStyles.fontFamily && codeStyles.fontFamily !== 'monospace') {
                css += `    font-family: ${codeStyles.fontFamily} !important;\n`;
            }
            if (codeStyles.fontSize && codeStyles.fontSize !== '14px') {
                css += `    font-size: ${codeStyles.fontSize} !important;\n`;
            }
            css += '}\n\n';

            // Pre-specific padding
            css += '.smart-mp pre {\n';
            if (codeStyles.padding && codeStyles.padding !== '16px') {
                css += `    padding: ${codeStyles.padding} !important;\n`;
            }
            css += '}\n\n';
        }

        return css;
    }
}
