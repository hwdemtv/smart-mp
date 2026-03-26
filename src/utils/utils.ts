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

export function cleanHtmlForWechat(root: HTMLElement): HTMLElement {
    const restrictedTags = [
        'script', 'style', 'noscript', 'object', 'embed',
        'button', 'input', 'textarea', 'select', 'form',
        'canvas', 'svg', 'audio', 'video:not(.video_iframe)',
        'header', 'footer', 'nav', 'aside'
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

    cleanAttributes(root);

    root.querySelectorAll('*').forEach(el => {
        cleanAttributes(el as HTMLElement);
    });

    // Check original length
    const originalLength = root.innerHTML.length;

    // ... cleanup logic ...
    const empties = Array.from(root.querySelectorAll('span, section, p, div'));
    empties.forEach(el => {
        const style = el.getAttribute('style') || '';
        const hasVisibleStyle = style.includes('background') || (style.includes('width') && style.includes('height'));

        // Robust content check
        const hasText = el.textContent?.trim().length! > 0;
        const hasMedia = el.querySelector('img, video, iframe, canvas, svg, hr, audio') !== null;
        const hasWeChatTags = el.innerHTML.includes('<mp-');

        if (!hasText && !hasMedia && !hasWeChatTags && !hasVisibleStyle) {
            el.remove();
        }
    });

    const result = replaceDivWithSection(root);

    // Fail-safe: if content is completely gone but originally wasn't empty, restore something
    if (result.innerHTML.trim().length === 0 && originalLength > 0) {
        Logger.warn("Utils", "Content over-cleaned! Restoring backup.");
        SafeHTML.setSafeHTML(result, '<section><p>（内容可能包含不支持的格式，已重置）</p></section>');
    }
    return result;
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
