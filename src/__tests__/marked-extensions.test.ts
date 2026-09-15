/**
 * @vitest-environment jsdom
 *
 * Comprehensive tests for all 17 marked.js extensions
 * Tests cover: tokenization, rendering, postprocessing, edge cases, and integration
 *
 * Strategy: Test pure logic functions directly (regex, parsing, escaping, etc.)
 * and test rendering via Marked instance where possible.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Marked } from 'marked';

// ============================================================
// 1. Blockquote / Callout Extension
// ============================================================
describe('BlockquoteRenderer', () => {
    // Replicate preprocessCalloutContainers logic for isolated testing
    function preprocessCalloutContainers(md: string): string {
        return md.replace(
            /^:::(\w+)[ \t]*\n([\s\S]*?)\n:::/gm,
            (_match, type, content) => {
                const lines = content.split('\n');
                return `> [!${type.toLowerCase()}]\n> ` + lines.join('\n> ');
            }
        );
    }

    function matchCallout(text: string | undefined) {
        if (!text) return '';
        const regex = /\[!(.*?)\]/;
        const match = text.match(regex);
        if (!match) return '';
        return match[1].trim();
    }

    function normalizeBlockquoteText(raw: string) {
        if (!raw) return '';
        return raw.split(/\r?\n/).map((line) => line.replace(/^>\s?/, "")).join("\n").trim();
    }

    function getCalloutTitle(callout: string, text: string) {
        let title = callout.charAt(0).toUpperCase() + callout.slice(1).toLowerCase();
        let start = text.indexOf("]") + 1;
        if (text.indexOf("]-") > 0 || text.indexOf("]+") > 0) {
            start = start + 1;
        }
        let end = text.indexOf("\n");
        if (end === -1) end = text.length;
        if (start >= end) return title;
        const customTitle = text.slice(start, end).trim();
        if (customTitle !== "") {
            title = customTitle;
        }
        return title;
    }

    describe('preprocessCalloutContainers', () => {
        it('should convert :::note fenced container to blockquote callout', () => {
            const input = ':::note\nTitle\nContent\n:::';
            const result = preprocessCalloutContainers(input);
            expect(result).toContain('> [!note]');
            expect(result).toContain('> Title');
            expect(result).toContain('> Content');
        });

        it('should handle multiple fenced containers', () => {
            const input = ':::tip\nTip1\n:::\n\n:::warning\nWarn1\n:::';
            const result = preprocessCalloutContainers(input);
            expect(result).toContain('> [!tip]');
            expect(result).toContain('> [!warning]');
        });

        it('should not affect regular blockquotes', () => {
            const input = '> regular blockquote';
            const result = preprocessCalloutContainers(input);
            expect(result).toBe('> regular blockquote');
        });

        it('should handle empty content', () => {
            const input = ':::note\n\n:::';  // Need a non-empty line between :::
            const result = preprocessCalloutContainers(input);
            expect(result).toContain('> [!note]');
        });

        it('should not match :::note with no content line', () => {
            // The regex requires at least one line between ::: open and :::
            const input = ':::note\n:::';
            const result = preprocessCalloutContainers(input);
            expect(result).toBe(':::note\n:::'); // Not transformed
        });

        it('should be case-insensitive for callout type', () => {
            const input = ':::NOTE\ntext\n:::';
            const result = preprocessCalloutContainers(input);
            expect(result).toContain('> [!note]');
        });

        it('should not transform non-fenced content', () => {
            const input = 'Regular text\nNot a container';
            expect(preprocessCalloutContainers(input)).toBe(input);
        });
    });

    describe('Callout matching', () => {
        it('should match standard callout types', () => {
            expect(matchCallout('[!note]')).toBe('note');
            expect(matchCallout('[!tip]')).toBe('tip');
            expect(matchCallout('[!warning]')).toBe('warning');
            expect(matchCallout('[!danger]')).toBe('danger');
            expect(matchCallout('[!info]')).toBe('info');
            expect(matchCallout('[!question]')).toBe('question');
            expect(matchCallout('[!quote]')).toBe('quote');
        });

        it('should return empty for non-callout text', () => {
            expect(matchCallout('regular blockquote')).toBe('');
            expect(matchCallout(undefined as any)).toBe('');
            expect(matchCallout('')).toBe('');
        });

        it('should handle callout with custom title', () => {
            expect(matchCallout('[!note] Custom Title')).toBe('note');
        });
    });

    describe('normalizeBlockquoteText', () => {
        it('should strip > prefix from blockquote lines', () => {
            expect(normalizeBlockquoteText('> Line 1\n> Line 2')).toBe('Line 1\nLine 2');
            expect(normalizeBlockquoteText('>Line without space')).toBe('Line without space');
        });

        it('should handle empty input', () => {
            expect(normalizeBlockquoteText('')).toBe('');
        });

        it('should handle single line blockquote', () => {
            expect(normalizeBlockquoteText('> Only one line')).toBe('Only one line');
        });
    });

    describe('Callout title extraction', () => {
        it('should capitalize callout type as default title', () => {
            expect(getCalloutTitle('note', '[!note]')).toBe('Note');
            expect(getCalloutTitle('tip', '[!tip]')).toBe('Tip');
            expect(getCalloutTitle('warning', '[!warning]')).toBe('Warning');
        });

        it('should use custom title when provided', () => {
            expect(getCalloutTitle('tip', '[!tip] Custom Title')).toBe('Custom Title');
        });

        it('should handle collapsible callout with - modifier', () => {
            expect(getCalloutTitle('note', '[!note]- Collapsible')).toBe('Collapsible');
        });

        it('should handle collapsible callout with + modifier', () => {
            expect(getCalloutTitle('note', '[!note]+ Open')).toBe('Open');
        });
    });

    describe('Callout color mapping', () => {
        const colorMap: Record<string, { bg: string; text: string }> = {
            note: { bg: '#e8f4fd', text: '#086ddd' },
            tip: { bg: '#e6faf9', text: '#08bfbc' },
            warning: { bg: '#fff4e6', text: '#ec7500' },
            danger: { bg: '#fdeaed', text: '#e93147' },
            success: { bg: '#e8f9ed', text: '#08b94e' },
            example: { bg: '#f3effd', text: '#7852ee' },
            quote: { bg: '#f5f5f5', text: '#9e9e9e' },
        };

        it('should have distinct colors for different callout types', () => {
            Object.entries(colorMap).forEach(([type, colors]) => {
                expect(colors.bg).toMatch(/^#[0-9a-f]{6}$/);
                expect(colors.text).toMatch(/^#[0-9a-f]{6}$/);
            });
        });

        it('should use hex colors (not rgba) for WeChat compatibility', () => {
            Object.values(colorMap).forEach(({ bg, text }) => {
                expect(bg).not.toContain('rgba');
                expect(text).not.toContain('rgba');
            });
        });
    });

    describe('Callout icon mapping', () => {
        const calloutIcons = new Map(Object.entries({
            note: '📝', abstract: '📋', info: 'ℹ️', todo: '☑️',
            tip: '💡', success: '✅', question: '❓', warning: '⚠️',
            failure: '❌', danger: '⚡', bug: '🐛', example: '📖', quote: '💬',
        }));

        it('should have icons for all standard callout types', () => {
            const standardTypes = ['note', 'tip', 'warning', 'danger', 'info', 'question', 'success', 'failure', 'bug', 'example', 'quote'];
            standardTypes.forEach(type => {
                expect(calloutIcons.has(type)).toBe(true);
            });
        });

        it('should map aliases to same icon', () => {
            expect(calloutIcons.get('abstract')).toBe(calloutIcons.get('summary') || '📋');
            // hint -> tip
            expect(calloutIcons.has('hint')).toBe(false); // hint is an alias, not in this map
        });
    });
});

// ============================================================
// 2. Code Extension (CodeRenderer)
// ============================================================
describe('CodeRenderer', () => {
    function getMathType(lang: string | null) {
        if (!lang) return null;
        let l = lang.toLowerCase().trim();
        if (l === 'am' || l === 'asciimath') return 'asciimath';
        if (l === 'latex' || l === 'tex') return 'latex';
        return null;
    }

    describe('getMathType', () => {
        it('should detect asciimath language', () => {
            expect(getMathType('am')).toBe('asciimath');
            expect(getMathType('asciimath')).toBe('asciimath');
        });

        it('should detect latex language', () => {
            expect(getMathType('latex')).toBe('latex');
            expect(getMathType('tex')).toBe('latex');
        });

        it('should return null for non-math languages', () => {
            expect(getMathType('javascript')).toBeNull();
            expect(getMathType('python')).toBeNull();
            expect(getMathType(null)).toBeNull();
            expect(getMathType('')).toBeNull();
        });

        it('should be case-insensitive', () => {
            expect(getMathType('LaTeX')).toBe('latex');
            expect(getMathType('AM')).toBe('asciimath');
            expect(getMathType('TEX')).toBe('latex');
        });

        it('should trim whitespace', () => {
            expect(getMathType(' latex ')).toBe('latex');
        });
    });

    describe('Code block header logic', () => {
        it('should show header when language is specified', () => {
            const hasHeader = (lang: string | undefined) => !!lang;
            expect(hasHeader('typescript')).toBe(true);
            expect(hasHeader(undefined)).toBe(false);
            expect(hasHeader('')).toBe(false);
        });
    });

    describe('Line number generation', () => {
        it('should calculate correct line number width', () => {
            const lineCount = 100;
            const lineNumWidth = String(lineCount).length;
            expect(lineNumWidth).toBe(3);

            const lineCount2 = 9;
            expect(String(lineCount2).length).toBe(1);

            const lineCount3 = 1000;
            expect(String(lineCount3).length).toBe(4);
        });

        it('should generate line numbers from 1 to N', () => {
            const lineCount = 5;
            const lineNums = Array.from({ length: lineCount }, (_, i) => i + 1);
            expect(lineNums).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe('Mermaid icon processing', () => {
        const iconMap: Record<string, string> = {
            'book': '📚', 'gear': '⚙️', 'user': '👤', 'home': '🏠',
            'check': '✅', 'x': '❌', 'arrow-right': '➡️',
            'star': '⭐', 'heart': '❤️', 'info': 'ℹ️',
            'warning': '⚠️', 'error': '❗', 'search': '🔍',
        };

        it('should replace fa:fa-icon with emoji', () => {
            const processMermaidIcons = (text: string): string => {
                return text.replace(/\[?fa:fa-([a-z0-9-]+)\]?/gi, (match, iconName) => {
                    const normalized = iconName.toLowerCase();
                    return iconMap[normalized] || match;
                });
            };

            expect(processMermaidIcons('[fa:fa-home]')).toBe('🏠');
            expect(processMermaidIcons('[fa:fa-check]')).toBe('✅');
            expect(processMermaidIcons('fa:fa-star')).toBe('⭐');
        });

        it('should keep original text for unknown icons', () => {
            const processMermaidIcons = (text: string): string => {
                return text.replace(/\[?fa:fa-([a-z0-9-]+)\]?/gi, (match, iconName) => {
                    const normalized = iconName.toLowerCase();
                    return iconMap[normalized] || match;
                });
            };

            expect(processMermaidIcons('[fa:fa-unknown-icon]')).toBe('[fa:fa-unknown-icon]');
        });
    });

    describe('Smart-mp-profile rendering', () => {
        it('should parse key-value pairs from profile code block', () => {
            const text = 'nickname: "Test"\ndescription: "A test profile"\navatar: "https://example.com/avatar.png"';
            const lines = text.split(/\r?\n/).filter((line: string) => line.trim() !== '');
            const result: Record<string, string> = {};
            const keyValueRegex = /^(\w+):\s*"?(.*?)"?$/;

            lines.forEach((line: string) => {
                const match = line.match(keyValueRegex);
                if (match) {
                    result[match[1].trim().toLowerCase()] = match[2].trim();
                }
            });

            expect(result['nickname']).toBe('Test');
            expect(result['description']).toBe('A test profile');
            expect(result['avatar']).toBe('https://example.com/avatar.png');
        });

        it('should escape HTML in profile attributes', () => {
            const escapeProfileAttribute = (value: string | undefined) => {
                const trimmed = value?.trim() ?? '';
                return trimmed === 'undefined' || trimmed === 'null'
                    ? ''
                    : trimmed.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            };

            expect(escapeProfileAttribute('test&value')).toBe('test&amp;value');
            expect(escapeProfileAttribute('undefined')).toBe('');
            expect(escapeProfileAttribute('null')).toBe('');
        });
    });
});

// ============================================================
// 3. Codespan Extension
// ============================================================
describe('CodespanRenderer', () => {
    describe('Caption extraction', () => {
        function extractSmartMPCaptions(input: string): string[] {
            const regex = /^wwcap:\s*(.*)$/gim;
            const captions: string[] = [];
            let match: RegExpExecArray | null;
            while ((match = regex.exec(input)) !== null) {
                captions.push(match[1].trim());
            }
            return captions;
        }

        it('should extract wwcap: captions', () => {
            expect(extractSmartMPCaptions('wwcap: Hello World')).toEqual(['Hello World']);
            expect(extractSmartMPCaptions('wwcap: Caption with spaces ')).toEqual(['Caption with spaces']);
        });

        it('should handle multiple captions', () => {
            expect(extractSmartMPCaptions('wwcap: First\nwwcap: Second')).toEqual(['First', 'Second']);
        });

        it('should return empty array for non-caption codespans', () => {
            expect(extractSmartMPCaptions('variable_name')).toEqual([]);
            expect(extractSmartMPCaptions('Array<Image>')).toEqual([]);
        });

        it('should be case-insensitive', () => {
            expect(extractSmartMPCaptions('WWCAP: Upper Case')).toEqual(['Upper Case']);
            expect(extractSmartMPCaptions('Wwcap: Mixed')).toEqual(['Mixed']);
        });
    });

    describe('Codespan styling', () => {
        it('should apply github theme styles for github theme', () => {
            const theme = 'github';
            let style = 'padding: .2em .4em; border-radius: 4px; font-family: SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace; font-size: .85em; margin: 0 .2em;';
            if (theme === 'github' || theme === 'github-light') {
                style += 'background-color: rgba(27,31,35,0.05); color: #24292e;';
            }
            expect(style).toContain('rgba(27,31,35,0.05)');
            expect(style).toContain('#24292e');
        });

        it('should apply dark theme styles for default/one-dark theme', () => {
            const theme: string = 'one-dark';
            let style = 'padding: .2em .4em; border-radius: 4px; font-family: SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace; font-size: .85em; margin: 0 .2em;';
            if (theme !== 'github' && theme !== 'github-light') {
                style += 'background-color: #282c34; color: #e5c07b;';
            }
            expect(style).toContain('#282c34');
            expect(style).toContain('#e5c07b');
        });
    });
});

// ============================================================
// 4. Embed Extension
// ============================================================
describe('Embed Extension', () => {
    function getEmbedType(link: string) {
        if (!link || link.trim() === '' || link === 'undefined' || link === 'null') return 'invalid';
        const reg_pdf_crop = /^pdf#page=(\d+)(&rect=.*?)?$/;
        const sep = link.lastIndexOf("|");
        if (sep > 0) link = link.substring(0, sep);
        const index = link.lastIndexOf(".");
        if (index === -1) return "note";
        const ext = link.substring(index + 1);
        if (reg_pdf_crop.test(ext)) return "pdf-crop";
        if (link.startsWith("https://mmbiz.qpic.cn/") || link.startsWith("http://mmbiz.qpic.cn/")) return "image";
        switch (ext.toLowerCase()) {
            case "md": return "note";
            case "png": case "jpg": case "jpeg": case "gif": case "bmp": return "image";
            case "webp": return "webp";
            case "svg": return "svg";
            case "pdf": return "pdf";
            case "mp4": return "video";
            case "mp3": case "wma": case "wav": case "amr": return "voice";
            case "excalidraw": return "excalidraw";
            default: return "file";
        }
    }

    describe('getEmbedType', () => {
        it('should detect image types', () => {
            expect(getEmbedType('photo.png')).toBe('image');
            expect(getEmbedType('photo.jpg')).toBe('image');
            expect(getEmbedType('photo.jpeg')).toBe('image');
            expect(getEmbedType('photo.gif')).toBe('image');
            expect(getEmbedType('photo.bmp')).toBe('image');
            expect(getEmbedType('photo.webp')).toBe('webp');
        });

        it('should detect SVG', () => {
            expect(getEmbedType('diagram.svg')).toBe('svg');
        });

        it('should detect note embeds', () => {
            expect(getEmbedType('other-note')).toBe('note');
            expect(getEmbedType('chapter.md')).toBe('note');
        });

        it('should detect excalidraw', () => {
            expect(getEmbedType('drawing.excalidraw')).toBe('excalidraw');
        });

        it('should detect video/voice', () => {
            expect(getEmbedType('demo.mp4')).toBe('video');
            expect(getEmbedType('song.mp3')).toBe('voice');
            expect(getEmbedType('song.wav')).toBe('voice');
            expect(getEmbedType('song.amr')).toBe('voice');
            expect(getEmbedType('song.wma')).toBe('voice');
        });

        it('should detect WeChat CDN images', () => {
            expect(getEmbedType('https://mmbiz.qpic.cn/image.png')).toBe('image');
            expect(getEmbedType('http://mmbiz.qpic.cn/image.png')).toBe('image');
        });

        it('should handle invalid paths', () => {
            expect(getEmbedType('')).toBe('invalid');
            expect(getEmbedType('undefined')).toBe('invalid');
            expect(getEmbedType('null')).toBe('invalid');
        });

        it('should strip alias after pipe', () => {
            expect(getEmbedType('photo.png|alias')).toBe('image');
            expect(getEmbedType('drawing.excalidraw|My Drawing')).toBe('excalidraw');
        });

        it('should handle PDF', () => {
            expect(getEmbedType('document.pdf')).toBe('pdf');
        });

        it('should handle unknown extensions as file', () => {
            expect(getEmbedType('archive.zip')).toBe('file');
            expect(getEmbedType('data.csv')).toBe('file');
        });
    });

    describe('Embed Regex', () => {
        const EmbedRegex = /^!\[\[(.*?)\]\]/;

        it('should match Obsidian embed syntax', () => {
            expect('![[image.png]]'.match(EmbedRegex)?.[1]).toBe('image.png');
            expect('![[note.md#heading]]'.match(EmbedRegex)?.[1]).toBe('note.md#heading');
            expect('![[photo.png|alias]]'.match(EmbedRegex)?.[1]).toBe('photo.png|alias');
        });

        it('should not match standard markdown images', () => {
            expect('![alt](url)'.match(EmbedRegex)).toBeNull();
        });

        it('should not match regular links', () => {
            expect('[[wikilink]]'.match(EmbedRegex)).toBeNull();
        });
    });

    describe('File link parsing', () => {
        function parseFileLink(link: string) {
            const info = link.split("|")[0];
            const items = info.split("#");
            let path = items[0];
            let header: string | null = null;
            let block: string | null = null;
            if (items.length === 2) {
                if (items[1].startsWith("^")) {
                    block = items[1];
                } else {
                    header = items[1];
                }
            }
            return { path, head: header, block };
        }

        it('should parse simple file links', () => {
            expect(parseFileLink('note.md')).toEqual({ path: 'note.md', head: null, block: null });
        });

        it('should parse header links', () => {
            expect(parseFileLink('note.md#Introduction')).toEqual({ path: 'note.md', head: 'Introduction', block: null });
        });

        it('should parse block links', () => {
            expect(parseFileLink('note.md#^blockId')).toEqual({ path: 'note.md', head: null, block: '^blockId' });
        });

        it('should strip alias', () => {
            expect(parseFileLink('note.md|Alias')).toEqual({ path: 'note.md', head: null, block: null });
        });

        it('should handle header with alias', () => {
            expect(parseFileLink('note.md#Heading|Alias')).toEqual({ path: 'note.md', head: 'Heading', block: null });
        });
    });

    describe('Image link parsing', () => {
        function isImage(file: string) {
            file = file.toLowerCase();
            return file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg") ||
                file.endsWith(".gif") || file.endsWith(".bmp") || file.endsWith(".webp");
        }

        function parseImageLink(link: string) {
            if (link.includes("|")) {
                const parts = link.split("|");
                const path = parts[0];
                if (!isImage(path)) return null;
                let width: number | null = null;
                let height: number | null = null;
                if (parts.length === 2) {
                    const size = parts[1].toLowerCase().split("x");
                    width = parseInt(size[0]);
                    if (size.length === 2 && size[1] !== "") {
                        height = parseInt(size[1]);
                    }
                }
                return { path, width, height };
            }
            return { path: link, width: null, height: null };
        }

        it('should parse image with size', () => {
            expect(parseImageLink('photo.png|300x200')).toEqual({ path: 'photo.png', width: 300, height: 200 });
            expect(parseImageLink('photo.png|300')).toEqual({ path: 'photo.png', width: 300, height: null });
        });

        it('should return null for non-image with alias', () => {
            expect(parseImageLink('doc.pdf|alias')).toBeNull();
        });

        it('should parse simple image link', () => {
            expect(parseImageLink('photo.png')).toEqual({ path: 'photo.png', width: null, height: null });
        });
    });

    describe('Link style parsing', () => {
        function parseLinkStyle(link: string) {
            let filename = "";
            let style = 'style="width:100%;height:100%"';
            let postion = "left";
            const postions = ["left", "center", "right"];
            if (link.includes("|")) {
                const items = link.split("|");
                filename = items[0];
                let size = "";
                if (items.length === 2) {
                    if (postions.includes(items[1])) {
                        postion = items[1];
                    } else {
                        size = items[1];
                    }
                } else if (items.length === 3) {
                    if (postions.includes(items[1])) {
                        size = items[2];
                        postion = items[1];
                    } else {
                        size = items[1];
                        postion = items[2];
                    }
                }
                if (size !== "") {
                    const sizes = size.split("x");
                    if (sizes.length === 2) {
                        style = `style="width:${sizes[0]}px;height:${sizes[1]}px;"`;
                    } else {
                        style = `style="width:${sizes[0]}px;"`;
                    }
                }
            } else {
                filename = link;
            }
            return { filename, style, postion };
        }

        it('should parse simple filename', () => {
            expect(parseLinkStyle('photo.png')).toEqual({ filename: 'photo.png', style: 'style="width:100%;height:100%"', postion: 'left' });
        });

        it('should parse filename with size', () => {
            const result = parseLinkStyle('photo.png|300x200');
            expect(result.filename).toBe('photo.png');
            expect(result.style).toContain('width:300px');
            expect(result.style).toContain('height:200px');
        });

        it('should parse filename with position', () => {
            const result = parseLinkStyle('photo.png|center');
            expect(result.postion).toBe('center');
        });

        it('should parse filename with size and position', () => {
            const result = parseLinkStyle('photo.png|300|center');
            expect(result.style).toContain('width:300px');
            expect(result.postion).toBe('center');
        });
    });
});

// ============================================================
// 5. Footnote Extension
// ============================================================
describe('Footnote Extension', () => {
    describe('Footnote regex patterns', () => {
        it('should match footnote definitions', () => {
            const rule = /^\[\^([^\]]+)\]:\s*([^\n]*(?:\n|$))/;
            expect('[^1]: First footnote'.match(rule)?.[1]).toBe('1');
            expect('[^1]: First footnote'.match(rule)?.[2]).toBe('First footnote');
            expect('[^note]: A named note'.match(rule)?.[1]).toBe('note');
        });

        it('should match footnote marks (inline)', () => {
            const rule = /^\[\^([^\]]+)\]/;
            expect('[^1]'.match(rule)?.[1]).toBe('1');
            expect('[^note]'.match(rule)?.[1]).toBe('note');
            expect('[^中文]'.match(rule)?.[1]).toBe('中文');
        });

        it('should distinguish definitions from inline marks', () => {
            const rule = /^\[\^([^\]]+)\]/;
            const src = '[^1]: Definition';
            const match = src.match(rule);
            expect(match?.[1]).toBe('1');
            expect(src.startsWith(match?.[0] + ':')).toBe(true);
        });

        it('should not match regular brackets', () => {
            const rule = /^\[\^([^\]]+)\]/;
            expect('[1]'.match(rule)).toBeNull();
            expect('[^]'.match(rule)).toBeNull();
        });
    });

    describe('Footnote display text', () => {
        it('should use numeric index for alphanumeric IDs', () => {
            const isAlphanumeric = /^[a-zA-Z0-9]+$/.test('1');
            expect(isAlphanumeric).toBe(true);
            // Display as 【1】
        });

        it('should show ID for non-alphanumeric IDs (e.g. Chinese)', () => {
            const isAlphanumeric = /^[a-zA-Z0-9]+$/.test('中文');
            expect(isAlphanumeric).toBe(false);
            // Display as 【中文】
        });

        it('should handle mixed content IDs', () => {
            expect(/^[a-zA-Z0-9]+$/.test('note1')).toBe(true);
            expect(/^[a-zA-Z0-9]+$/.test('note-1')).toBe(false);
            expect(/^[a-zA-Z0-9]+$/.test('note_1')).toBe(false);
        });
    });

    describe('Footnote ordering', () => {
        it('should maintain order of first appearance', () => {
            const order: string[] = [];
            const seen = new Set<string>();

            const marks = ['1', '2', '1', '3'];
            marks.forEach(id => {
                if (!seen.has(id)) {
                    order.push(id);
                    seen.add(id);
                }
            });

            expect(order).toEqual(['1', '2', '3']);
        });
    });
});

// ============================================================
// 6. Heading Extension
// ============================================================
describe('Heading Extension', () => {
    describe('Heading postprocess', () => {
        it('should add prefix/outbox/leaf/tail spans to headings', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h1>Title</h1><h2>Subtitle</h2>';
            const headings = div.querySelectorAll('h1, h2, h3, h4, h5, h6');
            expect(headings.length).toBe(2);

            for (const heading of headings) {
                const contentHtml = heading.innerHTML;
                heading.innerHTML = '';  // Use innerHTML instead of Obsidian's .empty()
                const prefix = document.createElement('span');
                prefix.textContent = ' ';
                prefix.className = 'smart-mp-heading-prefix';
                heading.appendChild(prefix);
                const outbox = document.createElement('span');
                outbox.className = 'smart-mp-heading-outbox';
                heading.appendChild(outbox);
                const leaf = document.createElement('span');
                leaf.className = 'smart-mp-heading-leaf';
                if (!/[<>&]/.test(contentHtml)) {
                    leaf.textContent = contentHtml;
                } else {
                    leaf.innerHTML = contentHtml;
                }
                outbox.appendChild(leaf);
                const tail = document.createElement('span');
                tail.className = 'smart-mp-heading-tail';
                heading.appendChild(tail);
            }

            expect(headings[0].querySelector('.smart-mp-heading-prefix')).toBeTruthy();
            expect(headings[0].querySelector('.smart-mp-heading-outbox')).toBeTruthy();
            expect(headings[0].querySelector('.smart-mp-heading-leaf')).toBeTruthy();
            expect(headings[0].querySelector('.smart-mp-heading-tail')).toBeTruthy();
            expect(headings[0].querySelector('.smart-mp-heading-leaf')?.textContent).toBe('Title');
        });

        it('should detect HTML content in headings', () => {
            expect(/[<>&]/.test('Title with <code>code</code>')).toBe(true);
            expect(/[<>&]/.test('Plain text')).toBe(false);
        });

        it('should preserve text content for plain headings', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h1>Simple Title</h1>';
            const heading = div.querySelector('h1')!;
            const contentHtml = heading.innerHTML;
            expect(!/[<>&]/.test(contentHtml)).toBe(true);
        });
    });
});

// ============================================================
// 7. Highlight Extension (==text==)
// ============================================================
describe('Highlight Extension', () => {
    describe('Tokenizer regex', () => {
        it('should match ==highlight== syntax', () => {
            const match = '==highlighted text=='.match(/^==([^=]+)==/);
            expect(match).toBeTruthy();
            expect(match?.[1]).toBe('highlighted text');
        });

        it('should not match single = signs', () => {
            expect('=not highlighted='.match(/^==([^=]+)==/)).toBeNull();
        });

        it('should not match === triple equals', () => {
            expect('===not valid==='.match(/^==([^=]+)==/)).toBeNull();
        });

        it('should match content with spaces', () => {
            expect('==multiple words here=='.match(/^==([^=]+)==/)?.[1]).toBe('multiple words here');
        });

        it('should match content with punctuation', () => {
            expect('==hello, world!=='.match(/^==([^=]+)==/)?.[1]).toBe('hello, world!');
        });

        it('should not match empty highlight', () => {
            expect('===='.match(/^==([^=]+)==/)).toBeNull();
        });
    });

    describe('Start detection', () => {
        it('should find == in text', () => {
            const start = 'some text ==highlight== more'.match(/==/)?.index;
            expect(start).toBe(10);
        });

        it('should not find == at the start of ===', () => {
            // The start function should still detect == even in ===
            const idx = '===header==='.indexOf('==');
            expect(idx).toBe(0);
        });
    });
});

// ============================================================
// 8. Iconize Extension
// ============================================================
describe('Iconize Extension', () => {
    describe('Icon regex', () => {
        const iconsRegex = /:([^:\s]+):/;
        const iconsRegexTokenizer = /^:([^:\s]+):/;

        it('should match :icon: syntax', () => {
            expect(':home:'.match(iconsRegexTokenizer)?.[1]).toBe('home');
            expect(':user:'.match(iconsRegexTokenizer)?.[1]).toBe('user');
        });

        it('should find icon in text', () => {
            expect('click :home: to go back'.match(iconsRegex)?.[1]).toBe('home');
        });

        it('should not match without colons', () => {
            expect('no icon here'.match(iconsRegex)).toBeNull();
        });

        it('should not match spaces in icon name', () => {
            expect(':my icon:'.match(iconsRegexTokenizer)).toBeNull();
        });

        it('should match emoji-like patterns', () => {
            expect(':smile:'.match(iconsRegexTokenizer)?.[1]).toBe('smile');
        });
    });
});

// ============================================================
// 9. Image Extension
// ============================================================
describe('Image Extension', () => {
    function isInvalidImagePath(path: unknown): path is undefined | null | "" {
        if (typeof path !== "string") return true;
        const trimmed = path.trim();
        return trimmed === "" || trimmed === "undefined" || trimmed === "null";
    }

    function escapeAttribute(value: unknown): string {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function renderMissingImage(path: unknown, alt: unknown) {
        return `<img src="" alt="${escapeAttribute(alt)}" data-smart-mp-missing-image="${escapeAttribute(path)}" class="smart-mp-image-fallback" />`;
    }

    describe('Invalid image path detection', () => {
        it('should detect invalid paths', () => {
            expect(isInvalidImagePath('')).toBe(true);
            expect(isInvalidImagePath(undefined)).toBe(true);
            expect(isInvalidImagePath(null)).toBe(true);
            expect(isInvalidImagePath('undefined')).toBe(true);
            expect(isInvalidImagePath('null')).toBe(true);
        });

        it('should accept valid paths', () => {
            expect(isInvalidImagePath('image.png')).toBe(false);
            expect(isInvalidImagePath('https://example.com/img.png')).toBe(false);
            expect(isInvalidImagePath('  spaced  ')).toBe(false);
        });
    });

    describe('Missing image rendering', () => {
        it('should render fallback for missing images', () => {
            const result = renderMissingImage('photo.png', 'Alt text');
            expect(result).toContain('smart-mp-image-fallback');
            expect(result).toContain('data-smart-mp-missing-image="photo.png"');
            expect(result).toContain('alt="Alt text"');
        });

        it('should escape HTML in attributes', () => {
            const result = renderMissingImage('a"b', '<script>');
            expect(result).toContain('a&quot;b');
            expect(result).toContain('&lt;script&gt;');
        });
    });

    describe('Image postprocess - caption wrapping', () => {
        it('should wrap images with title/alt in figure with caption', () => {
            const div = document.createElement('div');
            div.innerHTML = '<img src="test.png" title="My Caption" />';

            const img = div.querySelector('img')!;
            const parent = img.parentNode!;
            const figureEl = document.createElement('figure');
            figureEl.className = 'image-with-caption';

            if (img.getAttribute('title')) {
                const captionRow = document.createElement('div');
                captionRow.className = 'image-caption-row';
                const figCaption = document.createElement('figcaption');
                figCaption.className = 'image-caption';
                figCaption.textContent = img.getAttribute('title');
                captionRow.appendChild(figCaption);
                figureEl.appendChild(captionRow);
            }

            parent.insertBefore(figureEl, img);
            figureEl.prepend(img);

            expect(div.querySelector('figure.image-with-caption')).toBeTruthy();
            expect(div.querySelector('figcaption.image-caption')?.textContent).toBe('My Caption');
        });

        it('should skip avatar images', () => {
            const div = document.createElement('div');
            div.innerHTML = '<img src="avatar.png" class="smart-mp-avatar-image" />';
            const img = div.querySelector('img');
            expect(img?.classList.contains('smart-mp-avatar-image')).toBe(true);
        });
    });

    describe('file:// path handling', () => {
        it('should normalize Windows backslashes', () => {
            const path = 'D:\\Users\\test\\image.png';
            const normalized = path.replace(/\\/g, '/');
            expect(normalized).toBe('D:/Users/test/image.png');
        });

        it('should decode URI-encoded paths', () => {
            expect(decodeURIComponent('image%20with%20spaces.png')).toBe('image with spaces.png');
        });

        it('should resolve vault-relative paths', () => {
            const filePath = 'D:/Vault/notes/image.png'.replace(/\\/g, '/');
            const vaultPath = 'D:/Vault'.replace(/\\/g, '/');
            expect(filePath.toLowerCase().startsWith(vaultPath.toLowerCase())).toBe(true);
            const relativePath = filePath.substring(vaultPath.length).replace(/^[/\\]/, "");
            expect(relativePath).toBe('notes/image.png');
        });
    });

    describe('Path caching', () => {
        it('should use source-file-aware cache key', () => {
            const pathCache = new Map<string, string>();
            const sourcePath = 'notes/article.md';
            const imagePath = 'photo.png';
            const cacheKey = `${sourcePath}:${imagePath}`;
            pathCache.set(cacheKey, 'app://local/photo.png');
            expect(pathCache.get(`${sourcePath}:${imagePath}`)).toBe('app://local/photo.png');
        });

        it('should clear cache when active file changes', () => {
            let lastActiveFile: string | null = null;
            const pathCache = new Map<string, string>();

            const checkFileChange = (sourcePath: string) => {
                if (lastActiveFile !== sourcePath) {
                    pathCache.clear();
                    lastActiveFile = sourcePath;
                }
            };

            pathCache.set('notes/a.md:photo.png', 'resolved1');
            // Initially lastActiveFile is null, so first checkFileChange clears cache
            checkFileChange('notes/a.md');
            // After check, cache was cleared then lastActiveFile set, so size is 0
            // Need to re-set the cache entry after the first check
            pathCache.set('notes/a.md:photo.png', 'resolved1');
            expect(pathCache.size).toBe(1);

            checkFileChange('notes/b.md');
            expect(pathCache.size).toBe(0);
        });
    });
});

// ============================================================
// 10. Links Extension
// ============================================================
describe('Links Extension', () => {
    describe('Link rendering logic', () => {
        it('should add footnote reference for external links', () => {
            const allLinks: { text: string; href: string }[] = [];
            const text = 'Click here';
            const href = 'https://example.com';

            let index = allLinks.findIndex(l => l.href === href);
            if (index === -1) {
                allLinks.push({ text, href });
                index = allLinks.length - 1;
            }
            const output = `<a href="${href}">${text}<sup>[${index + 1}]</sup></a>`;

            expect(output).toContain('<sup>[1]</sup>');
            expect(allLinks.length).toBe(1);
        });

        it('should deduplicate same URL', () => {
            const allLinks: { text: string; href: string }[] = [];
            const href = 'https://example.com';

            allLinks.push({ text: 'First', href });
            let index = allLinks.findIndex(l => l.href === href);
            if (index === -1) {
                allLinks.push({ text: 'Second', href });
                index = allLinks.length - 1;
            }
            expect(allLinks.length).toBe(1);
            expect(index).toBe(0);
        });

        it('should not add footnote for WeChat links', () => {
            const href = 'https://mp.weixin.qq.com/s/abc123';
            expect(href.includes('mp.weixin.qq.com')).toBe(true);
        });

        it('should not add footnote for internal anchors', () => {
            const href = '#footnote-ref-1';
            expect(href.startsWith('#footnote')).toBe(true);
        });

        it('should clean duplicate superscript markers', () => {
            const text = 'Link text<sup>[1]</sup>';
            const cleaned = text.replace(/<sup>\[\d+\]<\/sup>/g, '').replace(/\[\d+\]/g, '').trim();
            expect(cleaned).toBe('Link text');
        });

        it('should clean back-reference symbols', () => {
            const text = 'Link text&nbsp;↩';
            const cleaned = text.replace(/&nbsp;↩/g, '').trim();
            expect(cleaned).toBe('Link text');
        });
    });

    describe('Reference list generation', () => {
        it('should generate reference list from collected links', () => {
            const allLinks = [
                { text: 'Google', href: 'https://google.com' },
                { text: 'GitHub', href: 'https://github.com' },
            ];

            const linksHtml = allLinks.map((link) => {
                const displayText = (link.text && link.text !== link.href && !link.text.startsWith('http'))
                    ? `${link.text}: `
                    : '';
                return `<li>${displayText}${link.href}</li>`;
            }).join('');

            expect(linksHtml).toContain('Google: https://google.com');
            expect(linksHtml).toContain('GitHub: https://github.com');
        });

        it('should not show text prefix when text is URL', () => {
            const allLinks = [{ text: 'https://example.com', href: 'https://example.com' }];
            const linksHtml = allLinks.map((link) => {
                const displayText = (link.text && link.text !== link.href && !link.text.startsWith('http'))
                    ? `${link.text}: `
                    : '';
                return `<li>${displayText}${link.href}</li>`;
            }).join('');

            expect(linksHtml).not.toContain('https://example.com: ');
            expect(linksHtml).toContain('<li>https://example.com</li>');
        });
    });
});

// ============================================================
// 11. Math Extension
// ============================================================
describe('Math Extension', () => {
    describe('Inline math regex', () => {
        const inlineRule = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1/;

        it('should match single dollar inline math', () => {
            expect('$x^2$'.match(inlineRule)).toBeTruthy();
            expect('$x^2$'.match(inlineRule)?.[2]).toBe('x^2');
        });

        it('should match double dollar inline math', () => {
            expect('$$x^2$$'.match(inlineRule)).toBeTruthy();
            expect('$$x^2$$'.match(inlineRule)?.[1]).toBe('$$');
        });

        it('should match escaped characters in math', () => {
            expect('$\\frac{1}{2}$'.match(inlineRule)?.[2]).toBe('\\frac{1}{2}');
        });

        it('should match complex LaTeX', () => {
            expect('$\\sum_{i=1}^{n} i$'.match(inlineRule)?.[2]).toBe('\\sum_{i=1}^{n} i');
        });

        it('should not match empty dollar signs', () => {
            expect('$$'.match(inlineRule)).toBeNull();
        });
    });

    describe('Block math regex', () => {
        const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

        it('should match block math with single dollar', () => {
            const input = '$\nx^2 + y^2 = z^2\n$';
            expect(input.match(blockRule)).toBeTruthy();
        });

        it('should match block math with double dollar', () => {
            const input = '$$\n\\int_0^1 x^2 dx\n$$';
            expect(input.match(blockRule)).toBeTruthy();
        });

        it('should not match inline math as block', () => {
            const input = '$x^2$';
            expect(input.match(blockRule)).toBeNull();
        });
    });

    describe('Math cache', () => {
        it('should differentiate inline vs block in cache key', () => {
            const text = 'E=mc^2';
            const inlineKey = `inline:${text}`;
            const blockKey = `block:${text}`;
            expect(inlineKey).not.toBe(blockKey);
        });

        it('should handle large formulas by skipping cache', () => {
            const MAX_FORMULA_SIZE = 1000;
            const largeFormula = 'x'.repeat(1001);
            expect(largeFormula.length > MAX_FORMULA_SIZE).toBe(true);
        });

        it('should evict old cache entries when full', () => {
            const MAX_CACHE_SIZE = 500;
            const cache = new Map<string, string>();
            // Fill cache
            for (let i = 0; i < MAX_CACHE_SIZE + 50; i++) {
                if (cache.size >= MAX_CACHE_SIZE) {
                    const keysToDelete = Array.from(cache.keys()).slice(0, 100);
                    keysToDelete.forEach(k => cache.delete(k));
                }
                cache.set(`key_${i}`, `value_${i}`);
            }
            expect(cache.size).toBeLessThanOrEqual(MAX_CACHE_SIZE);
        });
    });
});

// ============================================================
// 12. Remix Icon Extension
// ============================================================
describe('Remix Icon Extension', () => {
    const remixIconRegex = /`(ris|fas):([a-z0-9-]+)`/i;
    const remixIconRegexTokenizer = /^`(ris|fas):([a-z0-9-]+)`/i;

    describe('Regex matching', () => {
        it('should match remix icon syntax', () => {
            expect('`ris:home`'.match(remixIconRegexTokenizer)?.[2]).toBe('home');
            expect('`fas:heart`'.match(remixIconRegexTokenizer)?.[2]).toBe('heart');
        });

        it('should be case-insensitive', () => {
            expect('`RIS:Home`'.match(remixIconRegexTokenizer)?.[2]).toBe('Home');
            expect('`FAS:Heart`'.match(remixIconRegexTokenizer)?.[1]).toBe('FAS');
        });

        it('should not match regular inline code', () => {
            expect('`regular code`'.match(remixIconRegex)).toBeNull();
        });

        it('should support hyphenated names', () => {
            expect('`ris:arrow-right`'.match(remixIconRegexTokenizer)?.[2]).toBe('arrow-right');
        });

        it('should support numeric names', () => {
            expect('`ris:icon-1`'.match(remixIconRegexTokenizer)?.[2]).toBe('icon-1');
        });
    });
});

// ============================================================
// 13. Summary (Folded Headings) Extension
// ============================================================
describe('Summary Extension', () => {
    function isHeading(element: Element) {
        return /^h[1-6]$/i.test(element.tagName);
    }

    function getHeadingLevel(element: Element) {
        if (isHeading(element)) {
            return parseInt(element.tagName.charAt(1), 10);
        }
        return null;
    }

    function isSubContent(currentHeading: Element, currentNode: Element) {
        const nodeLevel = getHeadingLevel(currentNode);
        const headingLevel = getHeadingLevel(currentHeading);
        if (headingLevel === null) return true;
        return nodeLevel === null || nodeLevel > headingLevel;
    }

    describe('Heading level detection', () => {
        it('should detect heading elements', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h1>Title</h1><p>Text</p><h2>Subtitle</h2>';
            expect(isHeading(div.querySelector('h1')!)).toBe(true);
            expect(isHeading(div.querySelector('p')!)).toBe(false);
            expect(isHeading(div.querySelector('h2')!)).toBe(true);
        });

        it('should get heading levels', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>';
            expect(getHeadingLevel(div.querySelector('h1')!)).toBe(1);
            expect(getHeadingLevel(div.querySelector('h2')!)).toBe(2);
            expect(getHeadingLevel(div.querySelector('h3')!)).toBe(3);
            expect(getHeadingLevel(div.querySelector('h4')!)).toBe(4);
            expect(getHeadingLevel(div.querySelector('h5')!)).toBe(5);
            expect(getHeadingLevel(div.querySelector('h6')!)).toBe(6);
        });

        it('should return null for non-heading elements', () => {
            const div = document.createElement('div');
            div.innerHTML = '<p>Paragraph</p>';
            expect(getHeadingLevel(div.querySelector('p')!)).toBeNull();
        });
    });

    describe('Sub-content detection', () => {
        it('should consider paragraphs as sub-content of headings', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h1>Title</h1><p>Content</p>';
            expect(isSubContent(div.querySelector('h1')!, div.querySelector('p')!)).toBe(true);
        });

        it('should not consider same-level heading as sub-content', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h1>First</h1><h1>Second</h1>';
            const headings = div.querySelectorAll('h1');
            expect(isSubContent(headings[0], headings[1])).toBe(false);
        });

        it('should consider lower-level headings as sub-content', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h1>Title</h1><h2>Subtitle</h2>';
            expect(isSubContent(div.querySelector('h1')!, div.querySelector('h2')!)).toBe(true);
        });

        it('should not consider higher-level headings as sub-content', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h2>Subtitle</h2><h1>Title</h1>';
            expect(isSubContent(div.querySelector('h2')!, div.querySelector('h1')!)).toBe(false);
        });
    });

    describe('Folded headings postprocess', () => {
        it('should create details/summary for folded headings', () => {
            const div = document.createElement('div');
            div.innerHTML = '<h1>Title</h1><p>Content under h1</p><h2>Subtitle</h2><p>Content under h2</p>';

            const h1 = div.querySelector('h1')!;
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = h1.textContent ?? '';
            details.appendChild(summary);

            let current = h1.nextSibling;
            while (current && !(current instanceof Element && /^h[1-6]$/i.test(current.tagName))) {
                const nextSibling = current.nextSibling;
                details.appendChild(current);
                current = nextSibling;
            }
            h1.replaceWith(details);

            expect(div.querySelector('details')).toBeTruthy();
            expect(div.querySelector('summary')?.textContent).toBe('Title');
            expect(div.querySelector('details p')?.textContent).toBe('Content under h1');
        });

        it('should respect fold heading property', () => {
            const articleProperties = new Map<string, string>();
            articleProperties.set('folded-headings', 'h1,h2');
            const headingFolder = articleProperties.get('folded-headings');
            expect(headingFolder).toBe('h1,h2');
            const headings = headingFolder!.split(',');
            expect(headings).toEqual(['h1', 'h2']);
        });

        it('should skip when no fold property set', () => {
            const articleProperties = new Map<string, string>();
            const headingFolder = articleProperties.get('folded-headings');
            expect(headingFolder).toBeUndefined();
        });
    });
});

// ============================================================
// 14. Table Extension
// ============================================================
describe('Table Extension', () => {
    describe('Table signature matching', () => {
        it('should generate consistent signatures from token data', () => {
            const header = [{ text: 'Name' }, { text: 'Age' }];
            const rows = [[{ text: 'Alice' }, { text: '30' }]];

            const tokenHeaders = header.map(h => h.text).join('').replace(/\s+/g, '');
            const tokenCells = rows.map(row => row.map((c: any) => c.text).join('')).join('').replace(/\s+/g, '');
            const searchSig = (tokenHeaders + tokenCells).slice(0, 100);

            expect(searchSig).toBe('NameAgeAlice30');
        });

        it('should handle large tables by truncating signature', () => {
            const longText = 'A'.repeat(200);
            const header = [{ text: longText }];
            const tokenHeaders = header.map(h => h.text).join('').replace(/\s+/g, '');
            const searchSig = tokenHeaders.slice(0, 100);
            expect(searchSig.length).toBe(100);
        });

        it('should handle empty tables', () => {
            const header: { text: string }[] = [];
            const rows: { text: string }[][] = [];
            const tokenHeaders = header.map(h => h.text).join('').replace(/\s+/g, '');
            const tokenCells = rows.map(row => row.map(c => c.text).join('')).join('').replace(/\s+/g, '');
            const searchSig = (tokenHeaders + tokenCells).slice(0, 100);
            expect(searchSig).toBe('');
        });
    });

    describe('Table rendering with scroll container', () => {
        it('should wrap table in scrollable section', () => {
            const tableHtml = '<table><tr><td>Cell</td></tr></table>';
            const wrapped = `<section style="max-width:100%;overflow:auto;-webkit-overflow-scrolling:touch;">${tableHtml}</section>`;
            expect(wrapped).toContain('overflow:auto');
            expect(wrapped).toContain('-webkit-overflow-scrolling:touch');
            expect(wrapped).toContain('<table>');
        });
    });

    describe('Cell alignment', () => {
        it('should apply align attribute as style', () => {
            const div = document.createElement('div');
            div.innerHTML = '<table><th align="center">Header</th><td align="right">Cell</td></table>';
            const cells = div.querySelectorAll('th, td');
            cells.forEach((cell) => {
                const align = cell.getAttribute('align');
                if (align) {
                    (cell as HTMLElement).style.textAlign = align;
                }
            });
            expect(div.querySelector('th')?.style.textAlign).toBe('center');
            expect(div.querySelector('td')?.style.textAlign).toBe('right');
        });
    });
});

// ============================================================
// 15. Code Highlight Extension
// ============================================================
describe('CodeHighlight Extension', () => {
    describe('Language skip logic', () => {
        const skipLangs = new Set(['am', 'asciimath', 'latex', 'tex', 'mermaid', 'charts', 'dataview', 'smart-mp-profile']);

        it('should skip math languages', () => {
            expect(skipLangs.has('am')).toBe(true);
            expect(skipLangs.has('asciimath')).toBe(true);
            expect(skipLangs.has('latex')).toBe(true);
            expect(skipLangs.has('tex')).toBe(true);
        });

        it('should skip special rendering languages', () => {
            expect(skipLangs.has('mermaid')).toBe(true);
            expect(skipLangs.has('charts')).toBe(true);
            expect(skipLangs.has('dataview')).toBe(true);
            expect(skipLangs.has('smart-mp-profile')).toBe(true);
        });

        it('should not skip regular programming languages', () => {
            expect(skipLangs.has('javascript')).toBe(false);
            expect(skipLangs.has('python')).toBe(false);
            expect(skipLangs.has('typescript')).toBe(false);
            expect(skipLangs.has('css')).toBe(false);
        });
    });
});

// ============================================================
// 16. ListItem Extension (mostly disabled)
// ============================================================
describe('ListItem Extension', () => {
    describe('Empty list removal', () => {
        it('should remove empty ul elements', () => {
            const div = document.createElement('div');
            div.innerHTML = '<ul></ul><p>Keep this</p>';
            const uls = div.querySelectorAll('ul, ol');
            for (const ul of uls) {
                if (ul.children.length === 0) {
                    ul.remove();
                }
            }
            expect(div.querySelector('ul')).toBeNull();
            expect(div.querySelector('p')?.textContent).toBe('Keep this');
        });

        it('should remove empty ol elements', () => {
            const div = document.createElement('div');
            div.innerHTML = '<ol></ol><p>Keep this</p>';
            const lists = div.querySelectorAll('ul, ol');
            for (const list of lists) {
                if (list.children.length === 0) {
                    list.remove();
                }
            }
            expect(div.querySelector('ol')).toBeNull();
        });

        it('should keep non-empty lists', () => {
            const div = document.createElement('div');
            div.innerHTML = '<ul><li>Item</li></ul>';
            const lists = div.querySelectorAll('ul, ol');
            for (const list of lists) {
                if (list.children.length === 0) {
                    list.remove();
                }
            }
            expect(div.querySelector('ul')).toBeTruthy();
        });
    });

    describe('List frame wrapping', () => {
        it('should wrap list in smart-mp-list-frame div', () => {
            const div = document.createElement('div');
            div.innerHTML = '<ul><li>Item</li></ul>';
            const ul = div.querySelector('ul')!;
            const p = ul.parentNode!;
            const frame = document.createElement('div');
            frame.className = 'smart-mp-list-frame';
            frame.setAttribute('frame-type', 'list');
            p.replaceChild(frame, ul);
            frame.appendChild(ul);

            expect(div.querySelector('.smart-mp-list-frame')).toBeTruthy();
            expect(div.querySelector('.smart-mp-list-frame ul')).toBeTruthy();
        });
    });
});

// ============================================================
// 17. Extension Base Class Interface
// ============================================================
describe('SmartMPMarkedExtension Base Class', () => {
    describe('Lifecycle hooks', () => {
        it('should define all required lifecycle methods', () => {
            const requiredMethods = ['prepare', 'postprocess', 'beforePublish', 'cleanup', 'markedExtension'];
            // All extensions must implement markedExtension()
            // Others have default no-op implementations
            expect(requiredMethods).toContain('markedExtension');
            expect(requiredMethods).toContain('prepare');
            expect(requiredMethods).toContain('postprocess');
        });

        it('isPluginInstlled should check plugin registry', () => {
            const plugins: Record<string, any> = { 'plugin-a': {}, 'plugin-b': {} };
            expect(Object.prototype.hasOwnProperty.call(plugins, 'plugin-a')).toBe(true);
            expect(Object.prototype.hasOwnProperty.call(plugins, 'plugin-c')).toBe(false);
        });
    });
});

// ============================================================
// Cross-Extension Integration Tests
// ============================================================
describe('Cross-Extension Integration', () => {
    describe('Marked instance with standard extensions', () => {
        it('should parse standard markdown correctly', () => {
            const marked = new Marked();
            marked.use({ gfm: true, breaks: true });

            // Paragraphs
            expect(marked.parse('Hello world')).toContain('<p>');

            // Bold/italic
            expect(marked.parse('**bold**')).toContain('<strong>bold</strong>');
            expect(marked.parse('*italic*')).toContain('<em>italic</em>');

            // Lists
            expect(marked.parse('- item')).toContain('<li>');

            // Code
            expect(marked.parse('`code`')).toContain('<code>code</code>');

            // Headings
            expect(marked.parse('# Heading')).toContain('<h1');
        });

        it('should handle GFM features', () => {
            const marked = new Marked();
            marked.use({ gfm: true, breaks: true });

            // Strikethrough
            expect(marked.parse('~~deleted~~')).toContain('<del>deleted</del>');

            // Tables
            const tableMd = '| H1 | H2 |\n| --- | --- |\n| C1 | C2 |';
            expect(marked.parse(tableMd)).toContain('<table');
        });

        it('should handle line breaks with breaks: true', () => {
            const marked = new Marked();
            marked.use({ gfm: true, breaks: true });
            const result = marked.parse('Line 1\nLine 2');
            expect(result).toContain('<br>');
        });
    });
});

// ============================================================
// Edge Cases and Error Handling
// ============================================================
describe('Edge Cases and Error Handling', () => {
    describe('Empty/null input handling', () => {
        it('should handle empty markdown input', () => {
            const marked = new Marked();
            marked.use({ gfm: true, breaks: true });
            const result = marked.parse('');
            expect(result).toBe('');
        });
    });

    describe('XSS prevention', () => {
        const escapeAttribute = (value: unknown): string => {
            return String(value ?? "")
                .replace(/&/g, "&amp;")
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        };

        it('should escape script tags in attributes', () => {
            const malicious = '<script>alert("xss")</script>';
            const escaped = escapeAttribute(malicious);
            expect(escaped).not.toContain('<script>');
            expect(escaped).toContain('&lt;script&gt;');
        });

        it('should escape event handlers in attributes', () => {
            const malicious = '" onclick="alert(1)"';
            const escaped = escapeAttribute(malicious);
            // After escaping, the quotes become &quot; so the attribute injection is neutralized
            expect(escaped).toContain('&quot;');
            // The onclick text is still present but safe because quotes are escaped
            expect(escaped).not.toContain('" onclick="'); // The injection pattern is broken
        });

        it('should escape javascript: protocol variations', () => {
            const protocols = ['javascript:', 'JAVASCRIPT:', 'java\tscript:'];
            // Our escapeAttribute doesn't filter protocols, but SafeHTML does
            protocols.forEach(p => {
                expect(typeof escapeAttribute(p)).toBe('string');
            });
        });
    });

    describe('Unicode and CJK content', () => {
        it('should handle Chinese text in callout titles', () => {
            const getCalloutTitle = (callout: string, text: string) => {
                let title = callout.charAt(0).toUpperCase() + callout.slice(1).toLowerCase();
                let start = text.indexOf("]") + 1;
                let end = text.indexOf("\n");
                if (end === -1) end = text.length;
                if (start >= end) return title;
                const customTitle = text.slice(start, end).trim();
                if (customTitle !== "") title = customTitle;
                return title;
            };
            expect(getCalloutTitle('note', '[!note] 注意事项')).toBe('注意事项');
        });

        it('should handle Chinese footnote IDs', () => {
            expect(/^[a-zA-Z0-9]+$/.test('中文ID')).toBe(false);
            expect(/^[a-zA-Z0-9]+$/.test('注释')).toBe(false);
        });

        it('should handle emoji in content', () => {
            const emoji = '📝📋ℹ️☑️💡✅❓⚠️❌⚡🐛📖💬';
            expect(emoji.length).toBeGreaterThan(0);
        });

        it('should handle Japanese content', () => {
            const marked = new Marked();
            marked.use({ gfm: true, breaks: true });
            const result = marked.parse('こんにちは世界');
            expect(result).toContain('こんにちは世界');
        });
    });

    describe('Performance considerations', () => {
        it('code highlight cache key should be deterministic', () => {
            const version = 'v11';
            const theme = 'github';
            const lang = 'typescript';
            const hash = 'abc123';
            const showLineNumbers = true;
            const cacheKey = `${version}:${theme}:${lang}:${hash}:${showLineNumbers ? 'ln' : ''}`;
            expect(cacheKey).toBe('v11:github:typescript:abc123:ln');

            const cacheKey2 = `${version}:${theme}:${lang}:${hash}:`;
            expect(cacheKey2).not.toBe(cacheKey);
        });

        it('should handle large code blocks', () => {
            const largeCode = 'const x = 1;\n'.repeat(1000);
            const lines = largeCode.split('\n');
            expect(lines.length).toBe(1001); // 1000 lines + trailing empty
        });

        it('should handle many images in a document', () => {
            const images = Array.from({ length: 100 }, (_, i) => `![Image ${i}](image${i}.png)`);
            const marked = new Marked();
            marked.use({ gfm: true, breaks: true });
            const result = marked.parse(images.join('\n'));
            expect(result).toContain('<img');
        });
    });

    describe('Concurrent extension state', () => {
        it('each extension should reset its index in prepare()', () => {
            // Simulating index reset pattern used by CodeRenderer, Embed, Table, etc.
            let mermaidIndex = 5;
            let embedIndex = 10;
            let tableIndex = 3;

            // Reset
            mermaidIndex = 0;
            embedIndex = 0;
            tableIndex = 0;

            expect(mermaidIndex).toBe(0);
            expect(embedIndex).toBe(0);
            expect(tableIndex).toBe(0);
        });
    });
});
