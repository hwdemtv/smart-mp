import { sanitizeHTMLToDom } from "obsidian";
import Logger from "./logger";

const ALLOWED_TAGS = new Set([
    "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "text", "defs", "marker", "style", "use", "image", "foreignobject", "clippath", "textpath", "tspan", "lineargradient", "radialgradient", "stop", "pattern", "mask", "symbol", // SVG & Excalidraw
    "math", "maction", "maligngroup", "malignmark", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mlongdiv", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mscarries", "mscarry", "msgroup", "msline", "mspace", "msqrt", "msrow", "mstack", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", // MathML
    "div", "span", "p", "br", "hr", "strong", "em", "b", "i", "u", "s", "strike", "del", "code", "pre", "blockquote", "mark", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "th", "td", "img", "a", "section", "article", "aside", "header", "footer", "nav", "details", "summary", "figure", "figcaption", "audio", "video", "source", "track", // Standard HTML - iframe removed, mark added
    "mjx-container", "mjx-assistive-mml" // MathJax
]);

const ALLOWED_ATTRS = new Set([
    "class", "style", "id", "width", "height", "viewbox", "fill", "stroke", "d", "xmlns", "xmlns:xlink", "version", "baseprofile", // SVG/Global (lowercased)
    "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", // SVG Positioning
    "src", "href", "target", "rel", "alt", "title", "poster", "controls", "loop", "muted", "autoplay", "preload", "type", // Media/Links
    "rowspan", "colspan", "role", "aria-label", "aria-hidden", "data-type", "align", "valign", // Table/A11y
    "open", // details
    "transform", "opacity", "fill-opacity", "stroke-opacity", "stroke-width", "stroke-linecap", "stroke-linejoin", "font-family", "font-size", "text-anchor", "dominant-baseline", // SVG presentation
    "marker-end", "marker-start", "marker-mid", "mask", "clip-path", "vector-effect", "preserveaspectratio", "gradienttransform", "gradientunits", "spreadmethod", "stop-color", "stop-opacity", "offset", "patternunits", "patterntransform", // Advanced SVG
    "xlink:href", "focusable" // MathJax / SVG Links
]);

const PROTOCOL_ATTRS = new Set(["href", "src", "cite", "action", "formaction"]);
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "weixin:", "data:", "app:", "file:"]); // Added app: and file: for local images

/**
 * Safe data URI MIME types (images only, no scripts/HTML)
 */
const SAFE_DATA_MIME_TYPES = [
    /^image\/png/i,
    /^image\/jpeg/i,
    /^image\/jpg/i,
    /^image\/gif/i,
    /^image\/webp/i,
    /^image\/svg\+xml/i,
    /^image\/bmp/i,
    /^image\/ico/i,
    /^image\/x-icon/i,
    /^audio\//i,
    /^video\//i,
];

/**
 * Dangerous CSS patterns that could be used for XSS attacks
 */
const DANGEROUS_CSS_PATTERNS = [
    /expression\s*\(/i,           // IE expression()
    /behavior\s*:/i,              // IE behavior
    /-moz-binding\s*:/i,          // Firefox XBL binding
    /javascript\s*:/i,            // javascript: in CSS
    /vbscript\s*:/i,              // vbscript: in CSS
    /url\s*\(\s*['"]?\s*javascript:/i, // javascript: in url()
    /url\s*\(\s*['"]?\s*data:\s*text\/html/i, // data: HTML in url()
];

/**
 * Dangerous HTML attributes that can execute JavaScript
 */
const DANGEROUS_ATTR_PATTERNS = [
    /^on/i,                       // Event handlers: onclick, onerror, onload, etc.
    /^formaction/i,               // formaction can execute JS
    /^xlink:href$/i,              // xlink:href can be used for JS execution (handled separately)
];

/**
 * Check if a CSS style value contains dangerous patterns
 */
function isCSSDangerous(cssValue: string): boolean {
    if (!cssValue) return false;

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_CSS_PATTERNS) {
        if (pattern.test(cssValue)) {
            return true;
        }
    }

    // Check for unbalanced parentheses which could indicate injection
    const openParens = (cssValue.match(/\(/g) || []).length;
    const closeParens = (cssValue.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
        return true;
    }

    return false;
}

/**
 * Sanitize CSS style string by removing dangerous patterns
 */
function sanitizeCSS(cssValue: string): string {
    if (!cssValue) return '';

    // If dangerous, return empty
    if (isCSSDangerous(cssValue)) {
        Logger.warn("SanitizeHTML", "Blocked dangerous CSS:", cssValue.substring(0, 100));
        return '';
    }

    return cssValue;
}

/**
 * Check if an attribute name is potentially dangerous
 */
function isAttrDangerous(attrName: string): boolean {
    const lowerName = attrName.toLowerCase();

    // Block all event handlers (on*)
    if (lowerName.startsWith('on')) {
        return true;
    }

    // Block specific dangerous attributes
    for (const pattern of DANGEROUS_ATTR_PATTERNS) {
        if (pattern.test(lowerName)) {
            return true;
        }
    }

    return false;
}

/**
 * Check if a data: URL has a safe MIME type
 */
function isDataURISafe(dataUri: string): boolean {
    if (!dataUri.toLowerCase().startsWith('data:')) {
        return true; // Not a data URI, allow
    }

    // Extract MIME type from data URI
    // Format: data:[<mediatype>][;base64],<data>
    const match = dataUri.match(/^data:([^;,]+)/i);
    if (!match) {
        return false; // No MIME type specified, block
    }

    const mimeType = match[1].trim();

    // Check against safe MIME types
    for (const pattern of SAFE_DATA_MIME_TYPES) {
        if (pattern.test(mimeType)) {
            return true;
        }
    }

    // Block text/html, application/javascript, etc.
    Logger.warn("SanitizeHTML", "Blocked unsafe data URI MIME type:", mimeType);
    return false;
}

/**
 * Utility for safely handling HTML content.
 */
export class HTMLSanitizer {
    /**
     * Sanitizes HTML string using a whitelist approach.
     * @param html The raw HTML string.
     * @returns A DocumentFragment containing sanitized DOM.
     */
    static sanitize(html: string): DocumentFragment {
        const parser = new DOMParser();
        // Use standard text/html parsing
        const doc = parser.parseFromString(html, "text/html");
        const fragment = document.createDocumentFragment();

        Array.from(doc.body.childNodes).forEach(node => {
            const clean = this.cleanNode(node);
            if (clean) {
                fragment.appendChild(clean);
            }
        });

        return fragment;
    }

    private static cleanNode(node: ChildNode): Node | null {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.cloneNode(true);
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            const tagName = element.tagName.toLowerCase();

            if (!ALLOWED_TAGS.has(tagName)) {
                // Strip invalid tags but keep allowlisted children? 
                // Decision: For security, if it's not in whitelist, ignore it. 
                // But structure tags like 'center' or 'font' might obscure content.
                // Let's implement strip-but-keep-children for unknown tags if they are not dangerous (like script/style).
                if (["script", "iframe", "object", "embed", "link", "meta", "style"].includes(tagName) && tagName !== "style") { // style allowed in SVG/MathML context usually, handled by ALLOWED_TAGS
                    return null;
                }
                // Actually, strict whitelist is safer: drop the tag, drop the children? 
                // Or unwrap? Unwrap is friendlier.
                // But for now, let's keep it simple: Invalid Tag = Drop.
                return null;
            }

            const cleanEl = document.createElementNS(element.namespaceURI || "http://www.w3.org/1999/xhtml", tagName);

            // Copy attributes
            Array.from(element.attributes).forEach(attr => {
                const attrName = attr.name.toLowerCase();

                // Security check: Block dangerous attributes (event handlers, etc.)
                if (isAttrDangerous(attrName)) {
                    return; // Skip dangerous attributes
                }

                if (ALLOWED_ATTRS.has(attrName) || attrName.startsWith("data-") || attrName.startsWith("aria-")) {
                    let attrValue = attr.value;

                    // Security check: Sanitize style attribute
                    if (attrName === 'style') {
                        attrValue = sanitizeCSS(attrValue);
                        if (!attrValue) {
                            return; // Skip if style was dangerous and sanitized to empty
                        }
                    }

                    // Protocol check
                    if (PROTOCOL_ATTRS.has(attrName)) {
                        try {
                            // Check data: URI safety first
                            if (attrValue.toLowerCase().startsWith('data:') && !isDataURISafe(attrValue)) {
                                return; // Block unsafe data URI
                            }

                            // Relative URLs are fine, absolute need check
                            const url = new URL(attrValue, "http://dummy.com");
                            if (attrValue.includes(":") && !ALLOWED_PROTOCOLS.has(url.protocol)) {
                                return; // Block javascript: etc.
                            }
                        } catch (e) {
                            // Invalid URL, maybe ignore or allow if relative
                        }
                    }

                    if (attrName.includes(':')) {
                        const [prefix, localName] = attrName.split(':');
                        if (prefix === 'xlink') {
                            cleanEl.setAttributeNS('http://www.w3.org/1999/xlink', localName, attrValue);
                        } else if (prefix === 'xml') {
                            cleanEl.setAttributeNS('http://www.w3.org/XML/1998/namespace', localName, attrValue);
                        } else if (prefix === 'xmlns') {
                            cleanEl.setAttributeNS('http://www.w3.org/2000/xmlns/', localName, attrValue);
                        } else {
                            cleanEl.setAttribute(attr.name, attrValue);
                        }
                    } else {
                        cleanEl.setAttribute(attr.name, attrValue);
                    }
                }
            });

            // Recurse children
            Array.from(element.childNodes).forEach(child => {
                const cleanChild = this.cleanNode(child);
                if (cleanChild) {
                    cleanEl.appendChild(cleanChild);
                }
            });

            return cleanEl;
        }

        return null;
    }
}

export class SafeHTML {
    /**
     * Safely creates a DocumentFragment from an HTML string.
     * @param html HTML string
     * @param strict If true, uses whitelist sanitizer. If false, uses raw parsing (Escape Hatch).
     */
    static htmlToFragment(html: string, strict: boolean = true): DocumentFragment {
        // Enforce strict sanitization, ignoring 'strict' parameter to prevent bypass
        return HTMLSanitizer.sanitize(html);
    }

    static setSafeHTML(element: HTMLElement, html: string, append: boolean = false, strict: boolean = true): void {
        const fragment = this.htmlToFragment(html, strict);
        if (!append) {
            element.empty();
        }
        element.appendChild(fragment);
    }
}
