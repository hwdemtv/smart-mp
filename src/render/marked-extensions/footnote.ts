/**
 * marked extension for footnote
 */

import { MarkedExtension } from "marked";
import { SmartMPMarkedExtension } from "./extension";
import { SafeHTML } from "../../utils/sanitize-html";

interface FootnoteToken {
    type: 'footnote';
    raw: string;
    id: string;
    text: string;
    tokens: any[];
}

interface FootnoteMarkToken {
    type: 'footnoteMark';
    raw: string;
    id: string;
    tokens: any[];
}

export class Footnote extends SmartMPMarkedExtension {
    private footnotes: Map<string, { id: string; text: string }> = new Map();
    private footnoteOrder: string[] = [];

    prepare(): Promise<void> {
        // Reset collector
        this.footnotes.clear();
        this.footnoteOrder = [];
        return Promise.resolve();
    }

    postprocess(dom: HTMLElement): Promise<HTMLElement> {
        // Render footnote list at the bottom if any footnotes were collected
        if (this.footnoteOrder.length > 0) {
            this.renderFootnoteList(dom);
        }
        return Promise.resolve(dom);
    }

    private renderFootnoteList(dom: HTMLElement) {
        // Remove existing footnote list to prevent duplication
        dom.querySelectorAll('.smart-mp-footnotes').forEach(el => el.remove());

        // Create container
        const footnotesContainer = dom.createEl('section', {
            cls: 'smart-mp-footnotes'
        });

        // Separator
        footnotesContainer.createEl('hr', { cls: 'smart-mp-footnotes-separator' });

        // Title
        const title = footnotesContainer.createEl('p', {
            cls: 'smart-mp-footnotes-title'
        });
        title.textContent = "📝 文章脚注";

        // Ordered List
        const ol = footnotesContainer.createEl('ol');

        // Render in order of appearance
        this.footnoteOrder.forEach((id, index) => {
            const footnote = this.footnotes.get(id);
            if (footnote) {
                const li = ol.createEl('li', {
                    cls: 'footnote-item',
                    attr: { id: `footnote-ref-${id}` }
                });

                // Clean text
                const cleanText = footnote.text.trim();

                // Content
                const content = li.createEl('span', { cls: 'footnote-content' });
                // Use marked to parse inline markdown (e.g. **bold**, *italic*)
                // await this.marked.parseInline() might be needed if async
                // But parseInline can be sync. Let's cast or handle promise.
                // Since we are in an async postprocess, we can await.
                const renderedText = this.marked.parseInline(cleanText);
                if (renderedText instanceof Promise) {
                    renderedText.then(html => SafeHTML.setSafeHTML(content, html));
                } else {
                    SafeHTML.setSafeHTML(content, renderedText);
                }

                // Back reference link - REMOVED as per user request (useless in WeChat)
                // const backref = li.createEl('a', {
                //     cls: 'footnote-backref',
                //     attr: { href: `#footnote-mark-${id}` }
                // });
                // backref.innerHTML = '&#8617;';
            }
        });

        // Append to DOM
        dom.appendChild(footnotesContainer);
    }

    markedExtension(): MarkedExtension {
        const self = this; // captured for closures

        return {
            walkTokens(token) {
                // Collect footnote definitions during the walk phase
                if (token.type === 'footnote') {
                    const footnoteToken = token as unknown as FootnoteToken;
                    // Only add to order if first time seen (though definitions should be unique)
                    if (!self.footnotes.has(footnoteToken.id)) {
                        // definitions
                    }
                    self.footnotes.set(footnoteToken.id, {
                        id: footnoteToken.id,
                        text: footnoteToken.text
                    });
                }
                if (token.type === 'footnoteMark') {
                    const markToken = token as unknown as FootnoteMarkToken;
                    if (!self.footnoteOrder.includes(markToken.id)) {
                        self.footnoteOrder.push(markToken.id);
                    }
                }
            },
            extensions: [
                {
                    name: 'footnote',
                    level: 'block',
                    start(src: string) {
                        const index = src.match(/\[\^([^\]]+)\]:/)?.index;
                        return index ?? undefined;
                    },
                    tokenizer(src: string, tokens: any): any {
                        // Match footnote definition: [^id]: content
                        // Include newline in match to fully consume the line
                        const rule = /^\[\^([^\]]+)\]:\s*([^\n]*(?:\n|$))/;
                        const match = rule.exec(src);
                        if (match) {
                            return {
                                type: 'footnote',
                                raw: match[0],
                                id: match[1],
                                text: match[2].trim(),
                                tokens: []
                            };
                        }
                        return undefined;
                    },
                    renderer(token: any) {
                        // Do not render definitions in-place, they are moved to bottom
                        return '';
                    }
                },
                {
                    name: 'footnoteMark',
                    level: 'inline',
                    start(src: string) {
                        const index = src.match(/\[\^([^\]]+)\]/)?.index;
                        return index ?? undefined;
                    },
                    tokenizer(src: string, tokens: any): any {
                        const rule = /^\[\^([^\]]+)\]/;
                        const match = rule.exec(src);
                        if (match) {
                            // Check if it's a definition (followed by :) - if so, don't match as inline mark
                            // BUT inline tokens are parsed after block? 
                            // If block parser consumes it, inline won't see it.
                            // If block parser didn't consume it (e.g. not at start of line), then it's a mark?
                            // Actually, [^1]: appearing in middle of text should act as text?
                            // Let's just match [^id]
                            if (src.startsWith(match[0] + ':')) {
                                return undefined;
                            }
                            return {
                                type: 'footnoteMark',
                                raw: match[0],
                                id: match[1],
                                tokens: []
                            };
                        }
                        return undefined;
                    },
                    renderer(token: any) {
                        // Render as superscript link
                        // Identify index in the collected order
                        // Note: Renderer runs after walkTokens usually? Or during?
                        // If during, self.footnoteOrder might be incomplete if we rely on it for numbering.
                        // But for simply an ID link, it's fine.
                        // The number displayed should correspond to its index in footnoteOrder.

                        // Issue: renderer might run before we have seen all marks?
                        // No, walkTokens runs before rendering in Marked v4+? 
                        // Actually walkTokens is a pre-traversal. 
                        // So self.footnoteOrder should be populated if we populated it in walkTokens.

                        const id = token.id;
                        let index = self.footnoteOrder.indexOf(id);
                        if (index === -1) {
                            // Try to find it again, maybe order wasn't populated correctly?
                            // Fallback to appending? No, that messes up order.
                            // If not found, display as is? or append?
                            // Let's append if not exists, assuming it's a valid usage.
                            self.footnoteOrder.push(id);
                            index = self.footnoteOrder.length - 1;
                        }

                        // Optimized Display Logic:
                        // If ID is simple alphanumeric (like '1', 'note'), use numeric index [1]
                        // If ID contains other characters (likely Chinese), show [ID]
                        // Wait, user logic was: /^[a-zA-Z0-9]+$/ test.
                        // Actually, standard footnotes usually always use numbers [1], [2] regardless of ID.
                        // But if user wants to see [Term], we can support it.
                        // Let's stick to standard numbering [1] for consistency unless user specifically customized.
                        // BUT user complained about `【^中文ID】`.
                        // If I use index + 1, it will be `[1]`, `[2]`.
                        // If user uses named footnotes, they might expect the name?
                        // "支持中文ID吗？[^中文ID]" -> "【中文ID】" ?
                        // Let's use the user's suggested logic to be flexible.

                        const isAlphanumeric = /^[a-zA-Z0-9]+$/.test(id);
                        const displayText = isAlphanumeric ? `【${index + 1}】` : `【${id}】`;

                        return `<sup><a href="#footnote-ref-${id}" id="footnote-mark-${id}" class="footnote-mark">${displayText}</a></sup>`;
                    }
                }
            ]
        };
    }
}
