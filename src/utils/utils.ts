import { requestUrl } from "obsidian";
import { SafeHTML } from "./sanitize-html";
import Logger from "./logger";


export function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function areObjectsEqual(obj1: unknown, obj2: unknown): boolean {
    if (obj1 === obj2) return true;

    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false;
    }

    const record1 = obj1 as Record<string, unknown>;
    const record2 = obj2 as Record<string, unknown>;
    const keys1 = Object.keys(record1);
    const keys2 = Object.keys(record2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key) || !areObjectsEqual(record1[key], record2[key])) {
            return false;
        }
    }

    return true;
}

export async function fetchImageBlob(url: string): Promise<Blob> {
    if (url.startsWith('data:')) {
        return dataUrlToBlob(url);
    }

    if (url.startsWith('app://') || url.startsWith('file://') || url.startsWith('blob:')) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Local fetch failed: ${res.status}`);
        return await res.blob();
    }

    const response = await requestUrl({
        url: url,
        method: 'GET'
    });
    return new Blob([response.arrayBuffer], { type: response.headers['content-type'] });
}

function dataUrlToBlob(dataUrl: string): Blob {
    const [header, data] = dataUrl.split(',');
    const match = header.match(/data:(.*?);base64/);
    const mime = match ? match[1] : 'application/octet-stream';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
}

export function serializeElement(element: Element, preserveXmlns = false): string {
    if (preserveXmlns) return element.outerHTML;
    // WeChat API doesn't like XML namespaces (xmlns)
    return element.outerHTML.replace(/\s?xmlns="[^"]*"/g, "");
}

export function serializeChildren(element: Element): string {
    return (element as HTMLElement).innerHTML.replace(/\s?xmlns="[^"]*"/g, "") || "";
}

export function replaceDivWithSection(root: HTMLElement): HTMLElement {
    const divs = Array.from(root.querySelectorAll('div'));
    // 从后往前遍历，避免 replaceWith 后索引失效
    for (let i = divs.length - 1; i >= 0; i--) {
        const div = divs[i];
        const section = document.createElement('section');
        Array.from(div.attributes).forEach(attr => section.setAttribute(attr.name, attr.value));
        while (div.firstChild) {
            section.appendChild(div.firstChild);
        }
        div.replaceWith(section);
    }

    if (root.tagName.toLowerCase() === 'div') {
        const section = document.createElement('section');
        Array.from(root.attributes).forEach(attr => section.setAttribute(attr.name, attr.value));
        while (root.firstChild) {
            section.appendChild(root.firstChild);
        }
        if (root.parentNode) {
            root.replaceWith(section);
        }
        return section;
    }

    return root;
}

export function removeThinkTags(content: string): string {
    // 使用正则表达式匹配 <think> 和 </think> 标签及其内容，并替换为空字符串
    const regex = /<think>[\s\S]*<\/think>/g;
    return content.replace(regex, "");
}

/**
 * 使用 juice 将 <style> 标签中的 CSS 规则内联到对应元素的 style 属性上。
 * 这是 CssMerger 的安全网，处理 CssMerger 无法内联的 CSS（如 :nth-child 伪类）。
 * 必须在 cleanHtmlForWechat() 之前调用，因为该函数会删除 <style> 标签。
 */
export async function inlineCssWithJuice(root: HTMLElement): Promise<void> {
    const html = root.outerHTML;
    if (!html || html.trim().length === 0) {
        return;
    }
    try {
        const { default: juice } = await import("juice");
        const inlined = juice(html, {
            inlinePseudoElements: true,
            preserveImportant: false, // [Fix] Don't preserve !important — WeChat strips it, causing priority inversion
            preservePseudos: false,
            preserveFontFaces: false,
            preserveKeyFrames: false,
            preserveMediaQueries: false,
            resolveCSSVariables: false, // CssMerger already resolves CSS variables
            removeStyleTags: true,
        });

        const parent = root.parentNode;
        if (parent) {
            // 记录 root 在父节点中的位置，用于精确查找替换后的节点
            const rootIndex = Array.from(parent.childNodes).indexOf(root);

            // 设置 outerHTML，这会替换 root 节点
            root.outerHTML = inlined;

            // juice 通常返回一个与原 root 对应的元素节点
            // 通过位置索引精确定位，避免启发式猜测
            const newElementNodes = Array.from(parent.childNodes).filter(
                n => n.nodeType === Node.ELEMENT_NODE
            );

            let newRoot: HTMLElement | null = null;

            if (newElementNodes.length === 1) {
                newRoot = newElementNodes[0] as HTMLElement;
            } else if (newElementNodes.length > 1) {
                // 多个元素节点：juice 处理后通常仍只有一个根元素
                // 通过标签名+位置索引匹配
                const rootTagName = root.tagName.toLowerCase();
                const candidates = newElementNodes.filter(
                    n => (n as HTMLElement).tagName.toLowerCase() === rootTagName
                );
                if (candidates.length === 1) {
                    newRoot = candidates[0] as HTMLElement;
                } else if (candidates.length > 1 && rootIndex >= 0) {
                    // 多个同名标签：尝试按原始位置索引定位
                    // juice 替换后新节点大致在原位置
                    const newChildNodes = Array.from(parent.childNodes);
                    const newRootByIndex = newChildNodes[rootIndex] as HTMLElement | undefined;
                    if (newRootByIndex && newRootByIndex.nodeType === Node.ELEMENT_NODE) {
                        newRoot = newRootByIndex;
                    } else {
                        newRoot = candidates[0] as HTMLElement;
                        Logger.warn("Utils", `Position-based lookup failed, using first <${rootTagName}> match`);
                    }
                } else {
                    newRoot = newElementNodes[0] as HTMLElement;
                    Logger.warn("Utils", `No matching <${rootTagName}> found, using first element`);
                }
            }

            if (newRoot) {
                // 将新节点的内容复制回原 root，保持引用有效
                root.innerHTML = newRoot.innerHTML;
                for (let i = 0; i < newRoot.attributes.length; i++) {
                    const attr = newRoot.attributes[i];
                    root.setAttribute(attr.name, attr.value);
                }
            } else {
                Logger.warn("Utils", "No element node found after juice processing");
            }
        } else {
            // 孤立节点（无 parentNode）无法设置 outerHTML，改用 innerHTML 替换子节点
            const temp = document.createElement('div');
            temp.innerHTML = inlined;
            const newRoot = temp.firstElementChild as HTMLElement | null;
            if (newRoot) {
                // 复制新根节点的属性到原 root
                for (let i = 0; i < newRoot.attributes.length; i++) {
                    const attr = newRoot.attributes[i];
                    root.setAttribute(attr.name, attr.value);
                }
                root.innerHTML = newRoot.innerHTML;
            }
        }
    } catch (e) {
        Logger.warn("Utils", "juice CSS inlining failed, falling back to original HTML:", e);
    }
}

/**
 * [微信兼容] 导出前规范化 <table>：
 * - 解除预览滚动容器（Obsidian 的 .table-container / 本插件 wrapTables 的 .smart-mp-table-container），
 *   导出为宽度铺满、可折行的普通表格，避免移动端横向溢出与 width 检测误报
 * - 强制 width:100%、允许折行、合并边框，保证任何主题来源的表格在微信编辑器中都呈现干净网格
 */
function normalizeTableForWechat(table: HTMLTableElement): void {
    // 1. 解除滚动容器包裹（可能两层：Obsidian .table-container 外层 + 插件 .smart-mp-table-container 内层）
    let parent = table.parentElement;
    while (parent && parent.tagName === 'DIV' && (parent.getAttribute('class') || '').includes('table-container')) {
        const container = parent;
        parent = container.parentElement;
        container.replaceWith(table);
    }

    // 2. 表级样式：宽度铺满、允许折行、合并边框（去除 max-content / nowrap 溢出隐患）
    table.setAttribute('style', overrideStyleDeclarations(table.getAttribute('style') || '', {
        'width': '100%',
        'white-space': 'normal',
        'border-collapse': 'collapse',
        'border-spacing': '0',
    }));

    // 3. 单元格兜底：无 padding 时补默认内边距（主题通常不给 td 设 padding，导出后会显得拥挤）
    table.querySelectorAll('th, td').forEach(cell => {
        const style = cell.getAttribute('style') || '';
        if (!/(?:^|;)\s*padding/.test(style)) {
            cell.setAttribute('style', `${style ? style.replace(/;\s*$/, '') + '; ' : ''}padding: 8px 12px;`);
        }
    });
}

/** 在现有 style 上覆盖指定声明（先移除同名声明再追加，避免重复声明堆积） */
function overrideStyleDeclarations(style: string, overrides: Record<string, string>): string {
    for (const [prop, value] of Object.entries(overrides)) {
        // 删除该属性的全部既有声明（juice 内联后可能有多条），统一在末尾追加一条
        style = style.replace(new RegExp(`(^|;)\\s*${prop}\\s*:\\s*[^;]*;?`, 'gi'), '$1');
        style = `${style.replace(/\s*(;\s*)+$/, '')}; ${prop}: ${value}`;
    }
    return style.replace(/^(;\s*)+/, '').replace(/\s*;\s*$/, '');
}

export function cleanHtmlForWechat(root: HTMLElement): HTMLElement {
    const restrictedTags = [
        'script', 'style', 'noscript', 'object', 'embed',
        'button', 'input', 'textarea', 'select', 'form',
        'canvas', 'svg', 'audio', 'video:not(.video_iframe)',
        'header', 'footer', 'nav', 'aside', 'iframe',
        'mjx-assistive-mml'
    ];

    // [Step 1] 移除受限标签和隐藏元素（合并两次遍历）
    root.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        const tagName = htmlEl.tagName.toLowerCase();

        // 移除受限标签
        if (restrictedTags.some(tag => tagName === tag || tagName.startsWith(tag + ':'))) {
            el.remove();
            return;
        }

        // 移除隐藏元素
        if (htmlEl.style?.display === 'none' || htmlEl.hasAttribute('hidden')) {
            el.remove();
        }
    });

    // [Step 2] 标签转换（必须在 safeTags 过滤之前）
    // <figure> → <section>，<figcaption> → <span>
    root.querySelectorAll('figure').forEach(figure => {
        const section = document.createElement('section');
        for (let i = 0; i < figure.attributes.length; i++) {
            const attr = figure.attributes[i];
            section.setAttribute(attr.name, attr.value);
        }
        while (figure.firstChild) {
            section.appendChild(figure.firstChild);
        }
        figure.replaceWith(section);
    });
    root.querySelectorAll('figcaption').forEach(figcaption => {
        const span = document.createElement('span');
        for (let i = 0; i < figcaption.attributes.length; i++) {
            const attr = figcaption.attributes[i];
            span.setAttribute(attr.name, attr.value);
        }
        while (figcaption.firstChild) {
            span.appendChild(figcaption.firstChild);
        }
        figcaption.replaceWith(span);
    });

    // <pre> → <section>（微信结构检测 #2.8：pre 内容不自动换行，移动端长代码行横向溢出）
    // pre-wrap 保留代码换行且允许折行；break-all 防止长 token（URL/长标识符）撑破容器
    root.querySelectorAll('pre').forEach(pre => {
        const section = document.createElement('section');
        for (let i = 0; i < pre.attributes.length; i++) {
            const attr = pre.attributes[i];
            section.setAttribute(attr.name, attr.value);
        }
        while (pre.firstChild) {
            section.appendChild(pre.firstChild);
        }
        const style = section.getAttribute('style') || '';
        section.setAttribute(
            'style',
            `${style ? style.replace(/;\s*$/, '') + '; ' : ''}white-space: pre-wrap; word-break: break-all;`
        );
        pre.replaceWith(section);
    });

    // [Step 3] 清理根元素属性和锚点
    cleanAttributes(root);
    cleanAnchorHref(root);

    // [Step 4] 表格导出规范化：微信编辑器支持 <table> 结构（内容结构检测规范 #1.4.2 即针对表格列宽）
    // 需去除移动端溢出隐患（max-content/nowrap）并解除预览用的滚动容器包裹
    root.querySelectorAll('table').forEach((table) => {
        normalizeTableForWechat(table as HTMLTableElement);
    });

    // [Step 5] 移除不安全标签、清理属性、清理自定义 data 属性（合并为一次遍历）
    const safeTags = [
        'p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'span',
        'strong', 'em', 'b', 'i', 'u', 'del', 'ins', 'sub', 'sup',
        'br', 'hr', 'img', 'a',
        'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ];

    root.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        const tagName = htmlEl.tagName.toLowerCase();

        // 移除不安全标签
        if (!safeTags.includes(tagName) && !tagName.startsWith('mp-')) {
            Logger.warn("Utils", `Removing unsupported tag: ${tagName}`);
            while (htmlEl.firstChild) {
                htmlEl.parentNode?.insertBefore(htmlEl.firstChild, htmlEl);
            }
            htmlEl.remove();
            return;
        }

        // 清理属性
        cleanAttributes(htmlEl);

        // 移除自定义 data 属性
        if (htmlEl.hasAttribute('data-smart-mp-pseudo-before')) {
            htmlEl.removeAttribute('data-smart-mp-pseudo-before');
        }
        if (htmlEl.hasAttribute('data-smart-mp-pseudo-after')) {
            htmlEl.removeAttribute('data-smart-mp-pseudo-after');
        }
    });

    // [Step 6] 清理注释
    cleanComments(root);

    // 记录原始长度用于 fail-safe 检查
    const originalLength = root.innerHTML.length;

    // [Step 7] 清理图片和空元素（合并为一次遍历）
    const elements = Array.from(root.querySelectorAll('*'));
    elements.forEach(el => {
        const htmlEl = el as HTMLElement;
        const tagName = htmlEl.tagName.toLowerCase();

        // 清理无效图片
        if (tagName === 'img') {
            const src = htmlEl.getAttribute('src');
            if (!src || (!src.startsWith('http') && !src.startsWith('data:image/'))) {
                Logger.warn("Utils", `Removing <img> without valid src: ${src || '(empty)'}`);
                const alt = htmlEl.getAttribute('alt') || '';
                if (alt) {
                    const span = document.createElement('span');
                    span.style.color = '#999';
                    span.style.fontSize = '12px';
                    span.textContent = `[图片: ${alt}]`;
                    htmlEl.replaceWith(span);
                } else {
                    htmlEl.remove();
                }
            }
            return;
        }

        // 清理空元素
        if (['span', 'section', 'p', 'div'].includes(tagName)) {
            const style = htmlEl.getAttribute('style') || '';
            const hasVisibleStyle = style.includes('background') || style.includes('border') || (style.includes('width') && style.includes('height'));
            const hasText = htmlEl.textContent?.trim().length! > 0;
            const hasMedia = htmlEl.querySelector('img, hr') !== null;
            const hasWeChatTags = htmlEl.innerHTML.includes('<mp-');

            if (!hasText && !hasMedia && !hasWeChatTags && !hasVisibleStyle) {
                htmlEl.remove();
            }
        }
    });

    // [Step 8] 替换 div 为 section
    const result = replaceDivWithSection(root);

    // [Step 9] CSS 过滤（最终清理）+ 降级替代
    let cssFilterCount = 0;
    result.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        const style = htmlEl.getAttribute('style');
        if (style) {
            let filtered = filterWechatUnsupportedCssProps(style);
            filtered = cleanStyleValues(filtered);

            // [Fix] 降级替代：为被移除的关键属性提供微信兼容的替代值
            const tagName = htmlEl.tagName.toLowerCase();
            const originalProps = new Set(style.toLowerCase().split(';').map(d => {
                const idx = d.indexOf(':');
                return idx >= 0 ? d.substring(0, idx).trim() : '';
            }).filter(Boolean));

            // display: flex → display: block (for section/div containers that used flex for layout)
            if (originalProps.has('display') && !filtered.includes('display:') &&
                ['section', 'div', 'p'].includes(tagName)) {
                filtered = `display: block; ${filtered}`;
            }

            if (filtered !== style) {
                cssFilterCount++;
                Logger.debug("Utils", `[CSS Filter] <${tagName}> style cleaned`);
            }
            if (filtered.trim()) {
                htmlEl.setAttribute('style', filtered.trim());
            } else {
                htmlEl.removeAttribute('style');
            }
        }
    });

    Logger.debug("Utils", `[CSS Filter] Total elements filtered: ${cssFilterCount}`);

    // [Step 9.5] 块级元素裸文本包 <span>（微信结构检测"行高实测"兜底采集器只测含直接文本的块级标签）
    // 根因：混排段落（文本 + strong/em/code/a 等内联子元素）中，Range.getClientRects()
    // 对同一行内的每个内联片段各返回一个 rect，检测器把 rect 数当行数 → 平均行高被拉低 → 误报
    // "行高小于字体大小（实测）"。把直接文本包进 <span> 后，块级元素无直接文本节点，
    // 兜底采集器直接跳过；检测器主路径测量的叶子元素（单文本片段）天然通过。
    // <span> 无样式不改变渲染，微信编辑器自身也按此结构输出。
    wrapDirectTextInBlocks(result);

    // [Step 10] line-height 归一化（微信结构检测 line-height-overlapping）
    // 为每个含文本元素写入显式 px 行高（≥ 字号），消除 unitless/var() 触发的叠字误报
    normalizeLineHeightForWechat(result);

    // Fail-safe: if content is completely gone but originally wasn't empty, restore something
    if (result.innerHTML.trim().length === 0 && originalLength > 0) {
        Logger.warn("Utils", "Content over-cleaned! Restoring backup.");
        SafeHTML.setSafeHTML(result, '<section><p>（内容可能包含不支持的格式，已重置）</p></section>');
    }
    return result;
}

/**
 * 把块级元素的直接文本节点包进 <span>（见 cleanHtmlForWechat Step 9.5 注释）。
 * 仅处理微信检测器兜底采集器会测量的块级标签（collectLineHeightFallback blockTags
 * 及其近亲）；纯空白文本段不包（检测器 trim 后忽略，保持 DOM 最小改动）。
 */
function wrapDirectTextInBlocks(root: HTMLElement): void {
    const BLOCK_TAGS = new Set([
        'p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'li', 'td', 'th', 'a', 'blockquote', 'dd', 'dt', 'caption',
    ]);

    root.querySelectorAll('*').forEach(el => {
        if (!BLOCK_TAGS.has(el.tagName.toLowerCase())) return;

        // 把连续的文本子节点合并为一段，非空白段整体包进一个 <span>
        let run: Text[] = [];
        const flush = () => {
            if (run.length === 0) return;
            const combined = run.map(t => t.textContent).join('');
            if (combined.trim().length > 0) {
                const span = document.createElement('span');
                el.insertBefore(span, run[0]);
                for (const t of run) span.appendChild(t);
            }
            run = [];
        };
        // 快照：childNodes 是动态集合，包 span 的过程中节点会被移走
        Array.from(el.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                run.push(node as Text);
            } else {
                flush();
            }
        });
        flush();
    });
}

function cleanComments(root: HTMLElement): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const comments: Comment[] = [];
    let node: Comment | null;
    while ((node = walker.nextNode() as Comment | null)) {
        comments.push(node);
    }
    comments.forEach(c => c.remove());
}

function cleanAttributes(el: HTMLElement): void {
    const attrs = Array.from(el.attributes);
    const whitelist = ['style', 'src', 'href', 'alt', 'width', 'height', 'colspan', 'rowspan', 'border', 'cellspacing', 'cellpadding', 'valign', 'align', 'dir'];

    attrs.forEach(attr => {
        const attrName = attr.name.toLowerCase();

        // 微信官方 width 检测读取 img 的 data-w（原始像素宽）以减少误报，予以保留
        const isImgDataW = attrName === 'data-w' && el.tagName.toLowerCase() === 'img';

        // 1. Remove obvious risky attributes (including all data- attributes, WeChat doesn't support them)
        if (!isImgDataW && (attrName.startsWith('data-') || attrName === 'class' || attrName === 'id' || attrName.startsWith('on'))) {
            el.removeAttribute(attr.name);
            return;
        }

        // 2. Filter logic based on whitelist
        if (!isImgDataW && !whitelist.includes(attrName)) {
            el.removeAttribute(attr.name);
            return;
        }

        // 3. [Security] XSS protection for URL attributes
        if ((attrName === 'href' || attrName === 'src')) {
            const value = attr.value.trim().toLowerCase();
            // Block scripting, data-non-image, and local file protocols (app/file)
            if (
                value.startsWith('javascript:') ||
                value.startsWith('vbscript:') ||
                value.startsWith('file:') ||
                value.startsWith('app:') ||
                (value.startsWith('data:') && !value.startsWith('data:image/'))
            ) {
                Logger.warn("Utils", `Removed unsafe/local protocol in ${attrName}: ${value.substring(0, 50)}...`);
                el.removeAttribute(attr.name);
            }
        }
    });
}

/**
 * [Fix 45166] 将 <a> 标签中不合法的 href 转换为微信兼容格式
 * 微信 API 要求 <a href="..."> 必须是合法的 http/https URL
 * Obsidian 的 wikilink 和 tag 会产生 href="双链"、href="#tag" 等非法值
 */
function cleanAnchorHref(root: HTMLElement): void {
    root.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || '';
        // 保留合法的 http/https 链接
        if (href.startsWith('http://') || href.startsWith('https://')) {
            return;
        }
        // 其他所有 href 值（wikilink、tag、fragment、相对路径等）都移除 href
        // 将 <a> 转为 <span>，保留内联样式和内容
        const span = document.createElement('span');
        for (let i = 0; i < a.attributes.length; i++) {
            const attr = a.attributes[i];
            if (attr.name !== 'href') {
                span.setAttribute(attr.name, attr.value);
            }
        }
        while (a.firstChild) {
            span.appendChild(a.firstChild);
        }
        a.replaceWith(span);
    });
}

/**
 * [Fix 45166] 将 CSS 中的 rgb()/rgba() 颜色值转为 hex 格式
 * 微信 API 对 rgb() 格式支持不佳，转为 #rrggbb 更安全
 */
function convertRgbToHex(cssValue: string): string {
    return cssValue.replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+))?\s*\)/gi,
        (_, r: string, g: string, b: string, a: string | undefined) => {
            const hex = (n: number) => n.toString(16).padStart(2, '0');
            const ri = parseInt(r), gi = parseInt(g), bi = parseInt(b);
            if (a !== undefined && a.trim() !== '') {
                // Blend with white background (WeChat articles have white bg)
                const alpha = parseFloat(a);
                const blended = (val: number) => Math.round(val * alpha + 255 * (1 - alpha));
                return `#${hex(blended(ri))}${hex(blended(gi))}${hex(blended(bi))}`;
            }
            return `#${hex(ri)}${hex(gi)}${hex(bi)}`;
        }
    );
}

/**
 * [Fix 45166] 清理 style 属性中的微信不兼容值
 * - rgb()/rgba() → hex
 * - transparent → 移除声明
 */
function cleanStyleValues(style: string): string {
    let result = convertRgbToHex(style);
    // 移除 background-color: transparent
    result = result.replace(/background-color:\s*transparent;?/gi, '');
    // 移除 border-*-color: transparent
    result = result.replace(/border-[\w-]*-color:\s*transparent;?/gi, '');
    result = result.replace(/border-color:\s*transparent;?/gi, '');
    return result;
}

/**
 * [微信结构检测] 从 style 字符串中取指定属性的声明值（多条时取最后一条生效）
 */
function getLastDeclaration(style: string, prop: string): string | null {
    let value: string | null = null;
    for (const decl of style.split(';')) {
        const idx = decl.indexOf(':');
        if (idx === -1) continue;
        if (decl.substring(0, idx).trim().toLowerCase() === prop) {
            value = decl.substring(idx + 1).trim();
        }
    }
    return value;
}

/**
 * [微信结构检测] 解析 font-size 值为 px（解析失败返回 null）
 * 支持 px / em / rem / pt / %；em 与 % 相对父级字号
 */
function parseFontSizeToPx(value: string, parentPx: number): number | null {
    const m = value.trim().toLowerCase().match(/^([\d.]+)\s*(px|em|rem|pt|%)?$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (isNaN(n) || n <= 0) return null;
    switch (m[2]) {
        case 'em': return parentPx * n;
        case '%': return parentPx * n / 100;
        case 'rem': return 16 * n;
        case 'pt': return n * 4 / 3;
        default: return n; // px 或无单位
    }
}

/**
 * [微信结构检测] 解析 line-height 值为 px 与倍数
 * 无单位值（如 1.5）按倍数 ×字号 换算，且倍数随子元素字号继续生效；
 * normal / inherit / var() / 非法值返回 { px: null, ratio: null }
 */
function parseLineHeight(value: string, fontPx: number): { px: number | null; ratio: number | null } {
    const v = value.trim().toLowerCase();
    if (!v || v === 'normal' || v === 'inherit' || v.includes('var(')) return { px: null, ratio: null };
    const m = v.match(/^([\d.]+)\s*(px|em|rem|pt|%)?$/);
    if (!m) return { px: null, ratio: null };
    const n = parseFloat(m[1]);
    if (isNaN(n) || n < 0) return { px: null, ratio: null };
    switch (m[2]) {
        case 'px': return { px: n, ratio: null };
        case 'em': return { px: fontPx * n, ratio: null };
        case '%': return { px: fontPx * n / 100, ratio: null };
        case 'rem': return { px: 16 * n, ratio: null };
        case 'pt': return { px: n * 4 / 3, ratio: null };
        default: return { px: fontPx * n, ratio: n };
    }
}

/**
 * [微信规范 4.1.2] 从渐变值中提取第一个色标作为纯色降级
 * linear-gradient(to right, #ffeb3b, #f66) → #ffeb3b
 */
function extractFirstColor(value: string): string | null {
    const m = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i);
    return m ? m[0] : null;
}

/**
 * [Fix 45166] 过滤微信不支持的 CSS 属性
 * 微信 API 对 inline style 有严格限制，不支持的属性会导致 45166 错误
 */
export function filterWechatUnsupportedCssProps(style: string): string {
    const unsupportedProps = [
        // 布局相关
        'position',
        'top', 'right', 'bottom', 'left', 'z-index',
        'float', 'clear',
        // 变换/动画
        'transform', 'transform-origin', 'transform-style',
        'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
        'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
        'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state',
        // Flex/Grid 布局（display 本身放行：block/inline-block 是基础值，
        // 官方属性表与 doocs/md 均支持，代码块行号列依赖 display:inline-block；
        // flex/grid 值在下方单独过滤，微信端兼容性差）
        'flex', 'flex-flow', 'flex-wrap', 'flex-direction',
        'flex-shrink', 'flex-grow', 'flex-basis',
        'justify-content', 'justify-items', 'justify-self',
        'align-items', 'align-content', 'align-self',
        'place-items', 'place-content', 'place-self',
        'order',
        'gap', 'row-gap', 'column-gap',
        'grid', 'grid-template', 'grid-area', 'grid-column', 'grid-row',
        // 尺寸限制（min-width 放行：代码块行号列右对齐依赖 min-width，
        // 官方属性表支持；max/min-height 无导出需求，保守过滤）
        'max-width', 'min-height', 'max-height',
        // 阴影
        'box-shadow', 'text-shadow',
        // background 复合属性（保留 background-color）
        'background-image', 'background-repeat', 'background-size',
        'background-attachment', 'background-origin', 'background-clip',
        'background-blend-mode', 'background-position',
        // 文本控制
        // [微信结构检测] white-space/word-break/overflow-wrap/word-wrap 保留：
        // pre→section 转换需要 white-space:pre-wrap 保持代码换行；
        // doocs/md 等主流编辑器长期向草稿箱发送这些内联值，不会触发 45166
        'text-overflow',
        // 个别 border-radius
        'border-top-left-radius', 'border-top-right-radius',
        'border-bottom-left-radius', 'border-bottom-right-radius',
        // outline
        'outline', 'outline-color', 'outline-style', 'outline-width', 'outline-offset',
        // text-decoration 子属性
        'text-decoration-style', 'text-decoration-thickness',
        'text-decoration-color', 'text-decoration-skip',
        'text-underline-offset', 'text-underline-position',
        // 其他交互/视觉
        'visibility', 'opacity', 'mix-blend-mode', 'isolation',
        'cursor', 'pointer-events', 'user-select', 'resize',
        'content', 'clip', 'clip-path', 'filter',
        'mask', 'mask-image', 'mask-size', 'mask-repeat', 'mask-position',
        'backface-visibility', 'perspective', 'will-change',
        'contain', 'aspect-ratio', 'all',
        // 计数器
        'counter-increment', 'counter-reset',
        // 表格相关：border-collapse/border-spacing 放行（doocs/md 先例 + 微信编辑器自带表格即合并边框），
        // 保留 table-layout/empty-cells/caption-side 过滤（罕见且易触发 45166）
        'table-layout',
        'empty-cells', 'caption-side',
        // 其他
        'tab-size', 'hyphens',
    ];

    // [微信结构检测] line-height 换算用的字号（优先取同 style 的 font-size，缺省 16px）
    const fontSizePx = parseFontSizeToPx(getLastDeclaration(style, 'font-size') ?? '', 16) ?? 16;

    const declarations = style.split(';');
    const filtered: string[] = [];
    for (const decl of declarations) {
        const trimmed = decl.trim();
        if (!trimmed) continue;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) { filtered.push(trimmed); continue; }

        const propName = trimmed.substring(0, colonIdx).trim().toLowerCase();
        const rawValue = trimmed.substring(colonIdx + 1).trim();
        const propValue = rawValue.toLowerCase();

        // 过滤 display: flex / grid
        if (propName === 'display' && /flex|grid/.test(propValue)) {
            continue;
        }

        // 过滤 position 属性
        if (propName === 'position') {
            continue;
        }

        // 过滤 overflow / overflow-x / overflow-y: hidden/scroll/auto
        if (/^overflow(-[xy])?$/.test(propName) && /hidden|scroll|auto/.test(propValue)) {
            continue;
        }

        // [微信结构检测 line-height-overlapping] 行高归一化为显式 px：
        // 无单位值（如 1.5）被微信按 px 解析 → "行高小于字体大小"误报；
        // var()/空值等不可解析值 → "继承的 line-height: 0" 兜底检测 → 直接删除
        // （导出管线中 normalizeLineHeightForWechat 会随后写入精确值，此处为字符串级兜底）
        if (propName === 'line-height') {
            const px = parseLineHeight(rawValue, fontSizePx).px;
            if (px === null) continue;
            filtered.push(`line-height: ${Math.round(px * 10) / 10}px`);
            continue;
        }

        // [微信规范 4.1.2 darkmode-no-gradient] 渐变降级：
        // background 类属性提取第一个色标为纯色；其余属性的渐变值整条丢弃
        // 覆盖 linear/radial/conic/repeating-gradient 及旧语法 -webkit-gradient(
        if (/(?:-webkit-)?gradient\s*\(/.test(propValue)) {
            if (propName === 'background' || propName === 'background-color') {
                const solid = extractFirstColor(rawValue);
                if (solid) {
                    filtered.push(`${propName}: ${solid}`);
                    continue;
                }
            }
            continue;
        }

        // 过滤 background 简写中包含 url 的值
        // background: #f5f5f5 url(...) → 移除
        if (propName === 'background' && /url\s*\(/.test(propValue)) {
            continue;
        }

        // 过滤 border-color: transparent
        if (propName === 'border-color' && propValue.includes('transparent')) {
            continue;
        }

        // 过滤 border-*-color: transparent（子属性）
        if (/^border-(top|bottom|left|right)-color$/.test(propName) && propValue.includes('transparent')) {
            continue;
        }

        // 过滤 height: auto
        if (propName === 'height' && propValue === 'auto') {
            continue;
        }

        // 过滤 font-family 的无效值（如 #333 是颜色不是字体）
        if (propName === 'font-family' && /^#[0-9a-f]{3,8}$/i.test(propValue)) {
            continue;
        }

        // 移除 !important（微信不支持），但不跳过后续的黑名单检查
        // 注意：不能直接保留，否则 display:block !important 等会逃过过滤

        // 过滤不支持的属性名
        if (unsupportedProps.some(p => propName === p || propName.startsWith(p + '-'))) {
            continue;
        }

        // 过滤 -webkit- 前缀属性（保留安全的）
        if (propName.startsWith('-webkit-') && ![
            '-webkit-font-smoothing',
            '-webkit-tap-highlight-color',
            '-webkit-text-fill-color',
        ].includes(propName)) {
            continue;
        }

        filtered.push(trimmed);
    }

    // 移除所有 !important 标记
    const cleaned = filtered.map(decl => {
        return decl.replace(/!important\s*/gi, '').trim();
    }).filter(decl => decl.trim() !== '');

    return cleaned.join(';');
}

/**
 * [Fix 45166] 字符串级终极 CSS 过滤——在 HTML 字符串上做正则清理
 * 作为 DOM 方式的安全网，确保所有不支持的 CSS 属性被移除
 * 复用 filterWechatUnsupportedCssProps 的逻辑，避免维护两份代码
 */
export function stripUnsupportedCssFromHtml(html: string): string {
    return html.replace(/ style="([^"]*)"/g, (match, styleContent: string) => {
        // 复用 filterWechatUnsupportedCssProps 进行过滤
        const filtered = filterWechatUnsupportedCssProps(styleContent);
        if (!filtered) {
            return ''; // 移除空 style 属性
        }
        return ` style="${filtered}"`;
    }).replace(/ style=""/g, ''); // 移除空 style=""
}

/**
 * [微信结构检测] 将行高归一化为显式 px 值（导出管线专用）
 *
 * 微信内容结构检测（line-height-overlapping）按 px 解析行高：
 * - 无单位数值（如 1.5）被当作 1.5px < 字号 → "行高小于字体大小（实测）"
 * - var()/空值等不可解析值 → 兜底检测按 line-height: 0 处理 → "文字叠字"
 *
 * 自顶向下遍历（继承感知），为每个含文本的元素写入 line-height: <px>px，
 * 并保证行高 ≥ 字体大小（微信规范要求）。预览不受影响（预览用标准 CSS）。
 */
const LINE_HEIGHT_SKIP_TAGS = new Set(['img', 'br', 'hr', 'video', 'audio', 'source', 'canvas', 'svg', 'path']);

export function normalizeLineHeightForWechat(root: HTMLElement): void {
    const DEFAULT_FONT_PX = 16;
    const FALLBACK_RATIO = 1.5;

    // 将 style 字符串中的 line-height 声明（可能多条）替换为唯一的 px 值
    const withLineHeight = (style: string, px: number): string => {
        const decls = style.split(';')
            .map(d => d.trim())
            .filter(d => {
                const idx = d.indexOf(':');
                if (idx === -1) return true;
                return d.substring(0, idx).trim().toLowerCase() !== 'line-height';
            })
            .filter(Boolean);
        decls.push(`line-height: ${px}px`);
        return decls.join('; ');
    };

    const walk = (el: HTMLElement, parentFontPx: number, parentRatio: number | null, parentLhPx: number | null): void => {
        if (LINE_HEIGHT_SKIP_TAGS.has(el.tagName.toLowerCase())) return;

        const style = el.getAttribute('style') || '';
        let fontPx = parentFontPx;
        let ownLhPx: number | null = null;
        let ownRatio: number | null = null;

        if (style) {
            const fontSizeDecl = getLastDeclaration(style, 'font-size');
            if (fontSizeDecl !== null) {
                fontPx = parseFontSizeToPx(fontSizeDecl, parentFontPx) ?? parentFontPx;
            }
            const lhDecl = getLastDeclaration(style, 'line-height');
            if (lhDecl !== null) {
                const parsed = parseLineHeight(lhDecl, fontPx);
                ownLhPx = parsed.px;
                ownRatio = parsed.ratio;
            }
        }

        // 本元素生效行高：自身显式值 > 继承倍数 × 字号 > 继承 px > 兜底 1.5 × 字号
        let lhPx = ownLhPx;
        if (lhPx === null) {
            if (parentRatio !== null) lhPx = parentRatio * fontPx;
            else if (parentLhPx !== null) lhPx = parentLhPx;
            else lhPx = FALLBACK_RATIO * fontPx;
        }

        // 微信规范：行高不得小于字体大小（否则判定文字重叠）
        if (lhPx < fontPx) lhPx = fontPx;

        // 无单位倍数沿子树继续按各自字号换算；显式 px 按像素继承
        const childRatio = ownRatio !== null ? ownRatio : parentRatio;
        const childLhPx = childRatio !== null ? null : lhPx;

        // 仅含文本的元素需要显式行高（容器/媒体元素无文字不会触发检测）
        if ((el.textContent || '').trim().length > 0) {
            const rounded = Math.round(lhPx * 10) / 10;
            el.setAttribute('style', withLineHeight(style, rounded));
        }

        for (const child of Array.from(el.children)) {
            walk(child as HTMLElement, fontPx, childRatio, childLhPx);
        }
    };

    walk(root, DEFAULT_FONT_PX, null, null);
}

/**
 * [微信结构检测] 清理 inline style 中残留的 CSS var() 引用
 *
 * juice 以 resolveCSSVariables:false 内联 <style> 标签规则时会重新引入 var()
 * （CssMerger 在应用期解析的值被未解析版本覆盖），微信无法解析——
 * line-height 的 var() 会触发"继承的 line-height: 0"兜底检测。
 * 因此在 juice 之后必须再执行一次清理。
 */
// 注意：fallback 捕获组需正确处理嵌套括号（如 rgba(7,193,96,0.05)）
// 旧正则 (...|[^)])*? 存在回溯缺陷，会把 "var(--m, 10px)" 的 fallback 捕获成 "x" 等垃圾值
const CSS_VAR_REF_REGEX = /var\(\s*--([\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))+?))?\s*\)/g;
const SEMANTIC_VAR_MAP: Record<string, string> = {
    'smart-mp-primary': '#2c3e50',
    'smart-mp-text': '#333',
    'article-text': '#333',
    'article-heading': '#2c3e50',
};

export function stripCssVarReferences(root: HTMLElement): void {
    root.querySelectorAll('[style]').forEach((el) => {
        const style = el.getAttribute('style') || '';
        if (!style.includes('var(--')) return;
        const cleaned = style
            .replace(CSS_VAR_REF_REGEX, (_match, varName: string, fallback: string | undefined) => {
                // 1. 语义变量使用预设映射
                if (SEMANTIC_VAR_MAP[varName]) return SEMANTIC_VAR_MAP[varName];
                // 2. 有 fallback 值则提取（如 var(--code-radius, 6px) → 6px）
                if (fallback !== undefined && fallback.trim()) return fallback.trim();
                // 3. 无法解析 → 置空，稍后统一清理空声明
                return '';
            })
            // 清理被置空的声明（如 "line-height: ;"）并合并连续分号
            .replace(/(^|;)\s*[-\w]+\s*:\s*(?=;|$)/gi, '$1')
            .replace(/(?:\s*;)+\s*/g, '; ')
            .replace(/^;\s*/, '')
            .replace(/;\s*$/, '')
            .trim();
        if (cleaned) {
            el.setAttribute('style', cleaned);
        } else {
            el.removeAttribute('style');
        }
    });
}

