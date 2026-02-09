/*
* marked extension for math:
 use mathjax to render math

  credits to Sun BooShi, author of note-to-mp plugin
  
 */

import { parseMath } from "../mathjax";
import { MarkedExtension, Token, Tokens } from "marked";
import { SmartMPMarkedExtension } from "./extension";

// 修正后的正则表达式 - 支持转义符和中文
// Inline: $...$, support escaped \$
const inlineRule = /^(\$)((?:\\.|[^$\n])+)\$/;
// Block: $$...$$, allow multiline, allow leading whitespace
const blockRule = /^\s*(\$\$)([\s\S]*?)\$\$/;

export class MathRenderer extends SmartMPMarkedExtension {

    // Simple in-memory cache for rendered math
    private static mathCache = new Map<string, string>();
    private static readonly MAX_CACHE_SIZE = 500;
    private static readonly MAX_FORMULA_SIZE = 5000;

    private generateCacheKey(text: string, inline: boolean): string {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `${inline ? 'inline' : 'block'}:${hash}`;
    }

    renderer(token: Tokens.Generic, inline: boolean, type: string = '') {
        // Skip caching for very large formulas
        if (token && token.text && token.text.length > MathRenderer.MAX_FORMULA_SIZE) {
            return this.renderMathDirect(token.text, inline, type);
        }

        const cacheKey = this.generateCacheKey(token.text, inline);
        if (MathRenderer.mathCache.has(cacheKey)) {
            return MathRenderer.mathCache.get(cacheKey)!;
        }

        const result = this.renderMathDirect(token.text, inline, type);

        // Evict oldest entries if cache is full
        if (MathRenderer.mathCache.size >= MathRenderer.MAX_CACHE_SIZE) {
            const keysToDelete = Array.from(MathRenderer.mathCache.keys()).slice(0, 100);
            keysToDelete.forEach(k => MathRenderer.mathCache.delete(k));
        }

        MathRenderer.mathCache.set(cacheKey, result);
        return result;
    }

    private renderMathDirect(text: string, inline: boolean, type: string): string {

        if (type === '') {
            type = 'InlineMath'
        }

        let result = '';
        try {
            // [Fix] Pass displayMode correctly!
            // inline=true -> displayMode=false
            // inline=false -> displayMode=true
            const svg = parseMath(text, !inline);
            if (!svg) {
                result = inline
                    ? `<span class="math-error">Math Parse Error</span>`
                    : `<div class="math-error">Math Parse Error</div>`;
            } else {
                if (inline) {
                    result = `<span class="inline-math" style="display: inline-block; vertical-align: middle;">${svg}</span>`;
                } else {
                    result = `<div class="block-math" style="display: flex; justify-content: center; margin: 1em 0; overflow-x: auto;">${svg}</div>`;
                }
            }
        } catch (e) {
            console.error('Math render error:', e);
            result = inline
                ? `<span class="math-error">Math Render Error</span>`
                : `<div class="math-error">Math Render Error</div>`;
        }

        return result;
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [
                this.inlineMath(),
                this.blockMath()
            ]
        }
    }

    inlineMath() {
        return {
            name: 'InlineMath',
            level: 'inline',
            start(src: string) {
                let index;
                let indexSrc = src;

                while (indexSrc) {
                    index = indexSrc.indexOf('$');
                    if (index === -1) {
                        return;
                    }

                    const possibleKatex = indexSrc.substring(index);
                    const match = possibleKatex.match(inlineRule);
                    if (match) {
                        return index;
                    }

                    indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '');
                }
            },
            tokenizer(src: string, tokens: Token[]) {
                const match = src.match(inlineRule);
                if (match) {
                    // match[1] is delimiter '$', match[2] is content
                    const text = match[2]?.trim();
                    if (text) {
                        return {
                            type: 'InlineMath',
                            raw: match[0],
                            text: text,
                            displayMode: false
                        };
                    }
                }
            },
            renderer: (token: Tokens.Generic) => {
                return this.renderer(token, true);
            }
        }
    }
    blockMath() {
        return {
            name: 'BlockMath',
            level: 'block',
            // [Fix] Add start function for performance and correctness
            start(src: string) {
                return src.indexOf('$$');
            },
            tokenizer(src: string) {
                const match = src.match(blockRule);
                if (match) {
                    // match[1] is delimiter '$$', match[2] is content
                    const text = match[2]?.trim();
                    if (text) {
                        return {
                            type: 'BlockMath',
                            raw: match[0],
                            text: text,
                            displayMode: true
                        };
                    }
                }
            },
            renderer: (token: Tokens.Generic) => {
                return this.renderer(token, false);
            }
        };
    }
}
