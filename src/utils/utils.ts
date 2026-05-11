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

    const keys1 = Object.keys(obj1 as Record<string, unknown>);
    const keys2 = Object.keys(obj2 as Record<string, unknown>);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        const obj1Record = obj1 as Record<string, unknown>;
        const obj2Record = obj2 as Record<string, unknown>;
        if (!keys2.includes(key) || !areObjectsEqual(obj1Record[key], obj2Record[key])) {
            return false;
        }
    }

    return true;
}

export async function fetchImageBlob(url: string, timeout = 10000): Promise<Blob> {
    if (url.startsWith('data:')) {
        return dataUrlToBlob(url);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        if (url.startsWith('app://') || url.startsWith('file://') || url.startsWith('blob:')) {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`Local fetch failed: ${res.status}`);
            return await res.blob();
        }

        const response = await requestUrl({
            url: url,
            method: 'GET'
        });
        clearTimeout(timeoutId);
        return new Blob([response.arrayBuffer], { type: response.headers['content-type'] });
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
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
    divs.reverse().forEach(div => {
        const section = document.createElement('section');
        Array.from(div.attributes).forEach(attr => section.setAttribute(attr.name, attr.value));
        while (div.firstChild) {
            section.appendChild(div.firstChild);
        }
        div.replaceWith(section);
    });

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
            preserveImportant: true,
            preservePseudos: false,
            preserveFontFaces: false,
            preserveKeyFrames: false,
            preserveMediaQueries: false,
            resolveCSSVariables: false, // CssMerger already resolves CSS variables
            removeStyleTags: true,
        });
        root.outerHTML = inlined;
    } catch (e) {
        Logger.warn("Utils", "juice CSS inlining failed, falling back to original HTML:", e);
    }
}

export function cleanHtmlForWechat(root: HTMLElement): HTMLElement {
    const restrictedTags = [
        'script', 'style', 'noscript', 'object', 'embed',
        'button', 'input', 'textarea', 'select', 'form',
        'canvas', 'svg', 'audio', 'video:not(.video_iframe)',
        'header', 'footer', 'nav', 'aside', 'iframe',
        'mjx-assistive-mml'
    ];
    restrictedTags.forEach(tag => {
        root.querySelectorAll(tag).forEach(el => el.remove());
    });

    root.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style?.display === 'none' || htmlEl.hasAttribute('hidden')) {
            el.remove();
        }
    });

    // [Fix 45166] 将微信不支持的 HTML5 标签转换为微信支持的标签
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

    cleanAttributes(root);

    const safeTags = [
        'p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'span',
        'strong', 'em', 'b', 'i', 'u', 'del', 'ins', 'sub', 'sup',
        'br', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'img', 'a'
    ];

    root.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        const tagName = htmlEl.tagName.toLowerCase();

        // Remove tags not in safe list and not starting with mp-
        if (!safeTags.includes(tagName) && !tagName.startsWith('mp-')) {
            Logger.warn("Utils", `Removing unsupported tag: ${tagName}`);
            while (htmlEl.firstChild) {
                htmlEl.parentNode?.insertBefore(htmlEl.firstChild, htmlEl);
            }
            htmlEl.remove();
            return;
        }

        cleanAttributes(htmlEl);
    });

    cleanComments(root);

    // Check original length
    const originalLength = root.innerHTML.length;

    // [Fix 45166] Remove <img> tags without valid src
    root.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src');
        if (!src || (!src.startsWith('http') && !src.startsWith('data:image/'))) {
            Logger.warn("Utils", `Removing <img> without valid src: ${src || '(empty)'}`);
            const alt = img.getAttribute('alt') || '';
            if (alt) {
                const span = document.createElement('span');
                span.style.color = '#999';
                span.style.fontSize = '12px';
                span.textContent = `[图片: ${alt}]`;
                img.replaceWith(span);
            } else {
                img.remove();
            }
        }
    });

    // ... cleanup logic ...
    const empties = Array.from(root.querySelectorAll('span, section, p, div'));
    empties.forEach(el => {
        const style = el.getAttribute('style') || '';
        const hasVisibleStyle = style.includes('background') || style.includes('border') || (style.includes('width') && style.includes('height'));

        // Robust content check
        const hasText = el.textContent?.trim().length! > 0;
        const hasMedia = el.querySelector('img, hr') !== null;
        const hasWeChatTags = el.innerHTML.includes('<mp-');

        if (!hasText && !hasMedia && !hasWeChatTags && !hasVisibleStyle) {
            el.remove();
        }
    });

    const result = replaceDivWithSection(root);

    // [Fix 45166] 二次清理：确保所有 style 属性都不包含不支持的 CSS 属性
    result.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        const style = htmlEl.getAttribute('style');
        if (style) {
            const filtered = filterWechatUnsupportedCssProps(style);
            if (filtered.trim()) {
                htmlEl.setAttribute('style', filtered.trim());
            } else {
                htmlEl.removeAttribute('style');
            }
        }
    });

    // Fail-safe: if content is completely gone but originally wasn't empty, restore something
    if (result.innerHTML.trim().length === 0 && originalLength > 0) {
        Logger.warn("Utils", "Content over-cleaned! Restoring backup.");
        SafeHTML.setSafeHTML(result, '<section><p>（内容可能包含不支持的格式，已重置）</p></section>');
    }
    return result;
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
    const whitelist = ['style', 'src', 'href', 'alt', 'width', 'height', 'colspan', 'rowspan', 'border', 'cellspacing', 'cellpadding', 'valign', 'align'];

    attrs.forEach(attr => {
        const attrName = attr.name.toLowerCase();

        // 1. Remove obvious risky attributes
        if (attrName.startsWith('data-') || attrName === 'class' || attrName === 'id' || attrName.startsWith('on')) {
            // keep internal data attributes
            if (!attrName.startsWith('data-smart-mp-')) {
                el.removeAttribute(attr.name);
                return;
            }
        }

        // 2. Filter logic based on whitelist
        if (!whitelist.includes(attrName) && !attrName.startsWith('data-smart-mp-')) {
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
        // Flex/Grid 布局
        'display',  // 仅 flex/grid 值，单独处理
        'flex', 'flex-flow', 'flex-wrap', 'flex-direction',
        'flex-shrink', 'flex-grow', 'flex-basis',
        'justify-content', 'justify-items', 'justify-self',
        'align-items', 'align-content', 'align-self',
        'place-items', 'place-content', 'place-self',
        'order',
        'gap', 'row-gap', 'column-gap',
        'grid', 'grid-template', 'grid-area', 'grid-column', 'grid-row',
        // 尺寸限制
        'min-width', 'max-width', 'min-height', 'max-height',
        // 阴影
        'box-shadow', 'text-shadow',
        // background 复合属性（保留 background-color）
        'background-image', 'background-repeat', 'background-size',
        'background-attachment', 'background-origin', 'background-clip',
        'background-blend-mode', 'background-position',
        // 文本控制
        'white-space', 'word-break', 'overflow-wrap', 'word-wrap',
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
        // 其他
        'tab-size', 'hyphens',
    ];

    const declarations = style.split(';');
    const filtered = declarations.filter(decl => {
        const trimmed = decl.trim();
        if (!trimmed) return false;

        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) return true;

        const propName = trimmed.substring(0, colonIdx).trim().toLowerCase();
        const propValue = trimmed.substring(colonIdx + 1).trim().toLowerCase();

        // 过滤 display: flex / grid
        if (propName === 'display' && /flex|grid/.test(propValue)) {
            return false;
        }

        // 过滤 position 属性
        if (propName === 'position') {
            return false;
        }

        // 过滤 overflow: hidden/scroll/auto
        if (propName === 'overflow' && /hidden|scroll|auto/.test(propValue)) {
            return false;
        }

        // 过滤 linear-gradient / radial-gradient
        if (/linear-gradient|radial-gradient|conic-gradient/.test(propValue)) {
            return false;
        }

        // 过滤 border-color: transparent
        if (propName === 'border-color' && propValue.includes('transparent')) {
            return false;
        }

        // 过滤 height: auto
        if (propName === 'height' && propValue === 'auto') {
            return false;
        }

        // 过滤 !important（微信不支持）
        if (propValue.includes('!important')) {
            // 移除 !important 但保留属性
            const cleanValue = propValue.replace(/!important\s*/g, '').trim();
            if (cleanValue) return true; // 会在后续拼接时使用清理后的值
        }

        // 过滤不支持的属性名
        if (unsupportedProps.some(p => propName === p || propName.startsWith(p + '-'))) {
            return false;
        }

        // 过滤 -webkit- 前缀属性（保留安全的）
        if (propName.startsWith('-webkit-') && ![
            '-webkit-font-smoothing',
            '-webkit-tap-highlight-color',
            '-webkit-text-fill-color',
        ].includes(propName)) {
            return false;
        }

        return true;
    });

    // 移除所有 !important 标记
    const cleaned = filtered.map(decl => {
        return decl.replace(/!important\s*/gi, '').trim();
    }).filter(decl => decl.trim() !== '');

    return cleaned.join(';');
}
