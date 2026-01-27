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
    return element.outerHTML;
}

export function serializeChildren(element: Element): string {
    return (element as HTMLElement).innerHTML || "";
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
    // 1. Remove all data- attributes, class, and id from the root itself
    cleanAttributes(root);

    // 2. Remove restricted tags
    const restrictedTags = ['script', 'style', 'noscript', 'iframe:not(.video_iframe)', 'object', 'embed'];
    restrictedTags.forEach(tag => {
        root.querySelectorAll(tag).forEach(el => el.remove());
    });

    // 3. Remove all attributes from all descendants except whitelisted ones
    const allDescendants = root.querySelectorAll('*');
    allDescendants.forEach(el => {
        cleanAttributes(el as HTMLElement);
    });
}

function cleanAttributes(el: HTMLElement): void {
    const attrs = el.attributes;
    const toRemove: string[] = [];
    const whitelist = ['style', 'src', 'href', 'alt', 'width', 'height', 'colspan', 'rowspan', 'border', 'cellspacing', 'cellpadding'];

    for (let i = 0; i < attrs.length; i++) {
        const attrName = attrs[i].name.toLowerCase();
        if (attrName.startsWith('data-') || attrName === 'class' || attrName === 'id' || !whitelist.includes(attrName)) {
            // Keep some specific WeChat classes if needed, but for now, strip all for safety
            toRemove.push(attrs[i].name);
        }
    }

    toRemove.forEach(attr => el.removeAttribute(attr));
}
