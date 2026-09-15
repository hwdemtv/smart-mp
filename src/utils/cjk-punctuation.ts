/**
 * CJK Punctuation Normalization
 * Ported from obsidian-wechat-converter/services/chinese-punctuation.js
 *
 * Converts ASCII punctuation to Chinese punctuation in CJK context,
 * while protecting URLs, emails, file paths, version numbers, CLI flags, etc.
 */

const CJK_CHAR_PATTERN = /[\p{sc=Han}]/u;
const CJK_CONTEXT_PATTERN = /[\p{sc=Han}""''（）《》「」『』【】]/u;

const INLINE_PUNCTUATION_MAP: Record<string, string> = {
    ',': '，',
    ':': '：',
    ';': '；',
    '!': '！',
    '?': '？',
};

const SKIP_TAGS = new Set([
    'CODE',
    'PRE',
    'SCRIPT',
    'STYLE',
    'TEXTAREA',
    'SVG',
]);

export interface CjkPunctuationOptions {
    enabled: boolean;
}

interface ProtectedSegmentStore {
    protect(value: string): string;
    restore(text: string): string;
}

function createProtectedSegmentStore(): ProtectedSegmentStore {
    const values: string[] = [];

    return {
        protect(value: string): string {
            const token = `SMP_PUNC_${values.length}`;
            values.push(String(value || ''));
            return token;
        },
        restore(text: string): string {
            let output = String(text || '');
            let previous: string | null = null;

            while (output !== previous) {
                previous = output;
                output = output.replace(/SMP_PUNC_(\d+)/gu, (_match, index: string) => {
                    const resolved = values[Number(index)];
                    return resolved === undefined ? _match : resolved;
                });
            }

            return output;
        },
    };
}

function protectByPattern(
    text: string,
    pattern: RegExp,
    shouldProtect: (match: string, ...args: any[]) => boolean,
    store: ProtectedSegmentStore
): string {
    return String(text || '').replace(pattern, (match, ...args) => {
        if (!shouldProtect(match, ...args)) {
            return match;
        }
        return store.protect(match);
    });
}

function protectUrlSegments(text: string, store: ProtectedSegmentStore): string {
    return String(text || '').replace(/\b(?:https?:\/\/|mailto:|www\.)[^\s<>"'）】」』]+/giu, (match) => {
        const trimmed = match.match(/^(.*?)([,:;!?]+)?$/u);
        const core = trimmed?.[1] || match;
        const trailing = trimmed?.[2] || '';
        return `${store.protect(core)}${trailing}`;
    });
}

function protectTokenWithTrailingPunctuation(
    text: string,
    pattern: RegExp,
    store: ProtectedSegmentStore
): string {
    return String(text || '').replace(pattern, (match) => {
        const trimmed = match.match(/^(.*?)([,:;!?]+)?$/u);
        const core = trimmed?.[1] || match;
        const trailing = trimmed?.[2] || '';
        return `${store.protect(core)}${trailing}`;
    });
}

function looksLikeFunctionSyntax(segment: string): boolean {
    const value = String(segment || '').trim();
    if (!value) return false;
    if (/[\p{sc=Han}]/u.test(value)) return false;
    if (!/[$A-Za-z_][\w$.]*\s*\(/u.test(value)) return false;
    return true;
}

function protectFunctionSegments(text: string, store: ProtectedSegmentStore): string {
    return protectByPattern(
        text,
        /\b[$A-Za-z_][\w$.]*\s*\((?:[^()\n]|\([^()\n]*\))*\)/gu,
        (match) => looksLikeFunctionSyntax(match),
        store,
    );
}

function protectEmailSegments(text: string, store: ProtectedSegmentStore): string {
    return protectTokenWithTrailingPunctuation(
        text,
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?:\b|$)[,:;!?]?/giu,
        store,
    );
}

function protectVersionSegments(text: string, store: ProtectedSegmentStore): string {
    return protectTokenWithTrailingPunctuation(
        text,
        /\b(?:v)?\d+\.\d+(?:\.\d+){0,3}(?:-[A-Za-z0-9.-]+)?\b[,:;!?]?/gu,
        store,
    );
}

function protectPathSegments(text: string, store: ProtectedSegmentStore): string {
    let output = protectTokenWithTrailingPunctuation(
        text,
        /(?:^|[\s(（\[【])((?:\.{0,2}\/|\/|~\/)[^\s"'<>|，。！？；：)）\]】]+)[,:;!?]?/gu,
        store,
    );

    output = output.replace(/(^|[\s(（\[【])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_-]+)?)([,:;!?]?)/gu, (_match, prefix, token, trailing) => {
        return `${prefix}${store.protect(token)}${trailing || ''}`;
    });

    output = output.replace(/(^|[\s(（\[【])([A-Za-z0-9_.-]+\.(?:md|txt|pdf|docx?|xlsx?|pptx?|csv|json|ya?ml|xml|html?|css|scss|js|jsx|ts|tsx|py|sh|bash|zsh|java|c|cc|cpp|go|rs|swift|kt|sql))(?:[,:;!?]?)/giu, (_match, prefix, token) => {
        const trailing = _match.slice(prefix.length + token.length);
        return `${prefix}${store.protect(token)}${trailing}`;
    });

    return output;
}

function protectWindowsPathSegments(text: string, store: ProtectedSegmentStore): string {
    return protectTokenWithTrailingPunctuation(
        text,
        /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n\s]+\\)*[^\\/:*?"<>|\r\n\s]+[,:;!?]?/gu,
        store,
    );
}

function protectDateTimeSegments(text: string, store: ProtectedSegmentStore): string {
    let output = protectTokenWithTrailingPunctuation(
        text,
        /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?[,:;!?]?/gu,
        store,
    );

    output = protectTokenWithTrailingPunctuation(
        output,
        /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM|am|pm))?[,:;!?]?/gu,
        store,
    );

    return output;
}

function protectCliSegments(text: string, store: ProtectedSegmentStore): string {
    let output = text.replace(/(^|[\s(（\[【])(-{1,2}[A-Za-z0-9][\w-]*)(?=$|[\s,.:;!?，。！？；：)）\]】])/gu, (_match, prefix, token) => {
        return `${prefix}${store.protect(token)}`;
    });

    output = output.replace(/(^|[\s(（\[【])([A-Za-z][\w-]*:[A-Za-z0-9][\w:.-]*)(?=$|[\s,.;!?，。！？；：)）\]】])/gu, (_match, prefix, token) => {
        return `${prefix}${store.protect(token)}`;
    });

    return output;
}

function protectEnvAssignmentSegments(text: string, store: ProtectedSegmentStore): string {
    return protectTokenWithTrailingPunctuation(
        text,
        /\b[A-Z_][A-Z0-9_]*=(?:"[^"\n]*"|'[^'\n]*'|[^\s,;!?，。！？；：]+)[,:;!?]?/gu,
        store,
    );
}

function protectEllipsisSegments(text: string, store: ProtectedSegmentStore): string {
    return String(text || '').replace(/\.{3,}/gu, (match) => store.protect(match));
}

function isTechnicalParentheticalContent(content: string): boolean {
    const value = String(content || '').trim();
    if (!value) return false;
    if (/[\p{sc=Han}]/u.test(value)) return false;

    if (/^[A-Za-z][A-Za-z0-9_.-]*$/u.test(value)) return true;
    if (/^[A-Za-z]\d*$/u.test(value)) return true;
    if (/[+\-*/=<>^%&|~]/u.test(value)) return true;
    if (/^[A-Za-z0-9_.]+\s*,\s*[A-Za-z0-9_.]+(?:\s*,\s*[A-Za-z0-9_.]+)*$/u.test(value)) return true;
    if (/^[A-Za-z_][\w.]*\s*(?:,\s*[A-Za-z_][\w.]*)+$/u.test(value)) return true;
    if (/^[A-Za-z_][\w.]*\s*(?:=\s*[^,\s()]+)(?:\s*,\s*[A-Za-z_][\w.]*\s*=\s*[^,\s()]+)+$/u.test(value)) return true;

    return false;
}

function protectTechnicalParentheticalSegments(text: string, store: ProtectedSegmentStore): string {
    return String(text || '').replace(/\(([^()\n]+)\)/gu, (_match, content: string) => {
        return isTechnicalParentheticalContent(content) ? store.protect(_match) : _match;
    });
}

function isCjkChar(char: string): boolean {
    return !!char && CJK_CHAR_PATTERN.test(char);
}

function isCjkContextChar(char: string): boolean {
    return !!char && CJK_CONTEXT_PATTERN.test(char);
}

function findPrevNonSpace(text: string, index: number): string {
    for (let i = index; i >= 0; i -= 1) {
        if (text.charAt(i) === '') {
            const startIndex = text.lastIndexOf('', i);
            if (startIndex !== -1) {
                i = startIndex;
                continue;
            }
        }
        const char = text.charAt(i);
        if (!/\s/u.test(char)) return char;
    }
    return '';
}

function findNextNonSpace(text: string, index: number): string {
    for (let i = index; i < text.length; i += 1) {
        if (text.charAt(i) === '') {
            const endIndex = text.indexOf('', i);
            if (endIndex !== -1) {
                i = endIndex;
                continue;
            }
        }
        const char = text.charAt(i);
        if (!/\s/u.test(char)) return char;
    }
    return '';
}

function hasCjkContext(text: string, index: number): boolean {
    const prev = findPrevNonSpace(text, index - 1);
    const next = findNextNonSpace(text, index + 1);
    return isCjkContextChar(prev) || isCjkContextChar(next);
}

function normalizeQuotedText(text: string, quoteChar: string, openQuote: string, closeQuote: string): string {
    const pattern = quoteChar === '"'
        ? /"([^"\n]*?)"/gu
        : /'([^'\n]*?)'/gu;

    return text.replace(pattern, (match, inner: string, offset: number, fullText: string) => {
        const prev = findPrevNonSpace(fullText, offset - 1);
        const next = findNextNonSpace(fullText, offset + match.length);
        if (!(isCjkContextChar(prev) || isCjkContextChar(next) || /[\p{sc=Han}]/u.test(inner))) {
            return match;
        }
        return `${openQuote}${inner}${closeQuote}`;
    });
}

function normalizePeriods(text: string): string {
    return text.replace(/\./gu, (match, offset: number, fullText: string) => {
        const prev = findPrevNonSpace(fullText, offset - 1);
        const next = findNextNonSpace(fullText, offset + 1);
        if (/\d/u.test(prev) && /\d/u.test(next)) return match;
        return isCjkContextChar(prev) ? '。' : match;
    });
}

function normalizeParentheses(text: string): string {
    let output = text.replace(/([\p{sc=Han}])\(([^()\n]+?)\)/gu, '$1（$2）');
    output = output.replace(/(?<=[\p{sc=Han}""''])\(([^()\n]+?)\)/gu, '（$1）');
    output = output.replace(/\(([^()\n]+?)\)(?=[\p{sc=Han}])/gu, '（$1）');
    return output;
}

/**
 * Normalize ASCII punctuation to Chinese punctuation in CJK context.
 * Protects URLs, emails, paths, version numbers, CLI flags, etc.
 */
export function normalizeTextForChinesePunctuation(text: string): string {
    let output = String(text || '');
    if (!output || !/[\p{sc=Han}]/u.test(output)) return output;

    const protectedSegments = createProtectedSegmentStore();
    output = protectEllipsisSegments(output, protectedSegments);
    output = protectUrlSegments(output, protectedSegments);
    output = protectEmailSegments(output, protectedSegments);
    output = protectVersionSegments(output, protectedSegments);
    output = protectPathSegments(output, protectedSegments);
    output = protectWindowsPathSegments(output, protectedSegments);
    output = protectDateTimeSegments(output, protectedSegments);
    output = protectCliSegments(output, protectedSegments);
    output = protectEnvAssignmentSegments(output, protectedSegments);
    output = protectTechnicalParentheticalSegments(output, protectedSegments);
    output = protectFunctionSegments(output, protectedSegments);

    output = normalizeQuotedText(output, '"', '“', '”');
    output = normalizeQuotedText(output, "'", '‘', '’');
    output = normalizeParentheses(output);
    output = normalizePeriods(output);

    output = output.replace(/[,:;!?]/gu, (match, offset: number, fullText: string) => {
        if (!hasCjkContext(fullText, offset)) return match;
        return INLINE_PUNCTUATION_MAP[match] || match;
    });

    return protectedSegments.restore(output);
}

function shouldSkipTextNode(node: Node): boolean {
    if (!node || !node.parentElement) return true;
    let current: Element | null = node.parentElement;
    while (current) {
        if (SKIP_TAGS.has(current.tagName)) return true;
        current = current.parentElement;
    }
    return false;
}

/**
 * Normalize punctuation in rendered DOM (TreeWalker-based).
 * Skips CODE, PRE, SCRIPT, STYLE, TEXTAREA, SVG tags.
 */
export function normalizeRenderedDomPunctuation(root: Node, options: CjkPunctuationOptions = { enabled: false }): void {
    if (!root || options.enabled !== true) return;
    const documentRef = root.ownerDocument;
    const nodeFilter = documentRef?.defaultView?.NodeFilter;
    if (!documentRef || !nodeFilter) return;

    const walker = documentRef.createTreeWalker(
        root,
        nodeFilter.SHOW_TEXT,
        {
            acceptNode(node: Node): number {
                if (!node || !node.nodeValue || !node.nodeValue.trim()) {
                    return nodeFilter.FILTER_REJECT;
                }
                return shouldSkipTextNode(node)
                    ? nodeFilter.FILTER_REJECT
                    : nodeFilter.FILTER_ACCEPT;
            },
        },
    );

    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
        textNodes.push(current as Text);
        current = walker.nextNode();
    }

    for (const node of textNodes) {
        node.nodeValue = normalizeTextForChinesePunctuation(node.nodeValue || '');
    }
}
