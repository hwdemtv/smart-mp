import { requestUrl } from "obsidian";

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

export async function fetchImageBlob(url: string): Promise<Blob> {
    if (!url || url === "undefined" || url === "null") {
        throw new Error(`Invalid URL: ${url}`);
    }

    if (url.startsWith('data:')) {
        return dataUrlToBlob(url);
    }

    try {
        // Obsidian's requestUrl doesn't support local protocols like app:// or blob:app://
        // Standard fetch works fine for these in the renderer process
        if (url.startsWith('app://') || url.startsWith('blob:app://')) {
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            return await res.blob();
        }

        const response = await requestUrl(url);
        if (!response.arrayBuffer) {
            throw new Error(`Failed to fetch image from ${url}`);
        }
        return new Blob([response.arrayBuffer]);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Error fetching image from ${url}: ${message}`);
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

export function serializeElement(element: Element): string {
    // WeChat API doesn't like XML namespaces (xmlns)
    return element.outerHTML.replace(/\s?xmlns="[^"]*"/g, "");
}

export function serializeChildren(element: Element): string {
    return (element as HTMLElement).innerHTML.replace(/\s?xmlns="[^"]*"/g, "") || "";
}

export function replaceDivWithSection(root: HTMLElement) {
    const html = serializeElement(root)
        .replaceAll(/<div /g, "<section ")
        .replaceAll(/<\/div>/g, "</section>");
    return html;
}

export function removeThinkTags(content: string): string {
    // 使用正则表达式匹配 <think> 和 </think> 标签及其内容，并替换为空字符串
    const regex = /<think>[\s\S]*<\/think>/g;
    return content.replace(regex, "");
}

/**
 * Deeply cleans an HTMLElement to satisfy WeChat MP API's strict content rules.
 * Removes all data-* attributes, classes, ids, and restricted tags.
 */
export function cleanHtmlForWechat(root: HTMLElement): void {
    // 1. Recursive replacement of DIV with SECTION using node movement
    // Doing it this way ensures nested divs are also processed correctly
    const replaceDivs = (parent: HTMLElement) => {
        const divs = Array.from(parent.querySelectorAll('div'));
        divs.forEach(div => {
            const section = document.createElement('section');
            // Move all children to the new section (retaining references, handling nested divs)
            while (div.firstChild) {
                section.appendChild(div.firstChild);
            }
            // Copy relevant attributes if they exist
            if (div.getAttribute('style')) {
                section.setAttribute('style', div.getAttribute('style')!);
            }
            div.replaceWith(section);
        });
    };

    // Initial replacement
    replaceDivs(root);

    // 2. Remove restricted tags
    const restrictedTags = [
        'script', 'style', 'noscript', 'object', 'embed',
        'button', 'input', 'textarea', 'select', 'form',
        'canvas', 'svg', 'audio', 'video:not(.video_iframe)',
        'header', 'footer', 'nav', 'aside'
    ];
    restrictedTags.forEach(tag => {
        root.querySelectorAll(tag).forEach(el => el.remove());
    });

    // 2.1 Remove elements with display: none (like Obsidian's copy button container)
    root.querySelectorAll('*').forEach(el => {
        if ((el as HTMLElement).style?.display === 'none') {
            el.remove();
        }
    });

    // 3. Clean attributes from the root itself
    cleanAttributes(root);

    // 4. Clean attributes from all descendants
    const allDescendants = Array.from(root.querySelectorAll('*'));
    allDescendants.forEach(el => {
        cleanAttributes(el as HTMLElement);
    });

    // 5. Final pass: Remove any empty spans/sections that might trigger "invalid content"
    const empties = Array.from(root.querySelectorAll('span, section, p'));
    empties.forEach(el => {
        if (!el.textContent?.trim() && !el.querySelector('img, video, iframe, canvas')) {
            el.remove();
        }
    });
}

function cleanAttributes(el: HTMLElement): void {
    const attrs = Array.from(el.attributes);
    const whitelist = ['style', 'src', 'href', 'alt', 'width', 'height', 'colspan', 'rowspan', 'border', 'cellspacing', 'cellpadding', 'valign', 'align'];

    attrs.forEach(attr => {
        const attrName = attr.name.toLowerCase();
        // Remove data-*, class, id
        if (attrName.startsWith('data-') || attrName === 'class' || attrName === 'id' || attrName.startsWith('on')) {
            el.removeAttribute(attr.name);
            return;
        }

        // Only keep whitelisted attributes
        if (!whitelist.includes(attrName)) {
            el.removeAttribute(attr.name);
        }
    });
}
