/*
* marked extension for math:
 use mathjax to render math

  credits to Sun BooShi, author of note-to-mp plugin
  
 */

import { parseMath } from "../mathjax";
import { MarkedExtension, Token, Tokens } from "marked";
import { SmartMPMarkedExtension } from "./extension";
import { Logger } from "src/utils/logger";

const inlineRule = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n$]))\1/;
const blockRule = /^(\${1,2})\n((?:\\[^]|[^\\])+?)\n\1(?:\n|$)/;

export class MathRenderer extends SmartMPMarkedExtension {

    // Simple in-memory cache for rendered math
    private static mathCache = new Map<string, string>();
    private static readonly MAX_CACHE_SIZE = 500;
    private static readonly MAX_FORMULA_SIZE = 1000;

    renderer(token: Tokens.Generic, inline: boolean, type: string = '') {
        // Skip caching for very large formulas
        if (token.text.length > MathRenderer.MAX_FORMULA_SIZE) {
            return this.renderMathDirect(token.text, inline, type);
        }

        const cacheKey = `${inline ? 'inline' : 'block'}:${token.text}`;
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
            // [Fix] Pass display mode to parseMath (false for inline, true for block)
            const svg = parseMath(text, !inline);
            if (!svg) {
                result = inline
                    ? `<span class="math-error">Math Parse Error</span>`
                    : `<div class="math-error">Math Parse Error</div>`;
            } else {
                if (inline) {
                    result = `<span class="inline-math" style="color: #333; fill: #333;">${svg}</span>`;
                } else {
                    result = `<section class="block-math" style="color: #333; fill: #333; text-align: center;">${svg}</section>`;
                }
            }
        } catch (e) {
            Logger.error('MathRenderer', 'Math render error:', e);
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

                // 
                let index;
                let indexSrc = src;

                while (indexSrc) {
                    index = indexSrc.indexOf('$');
                    if (index === -1) {
                        // no '$' in the string
                        return;
                    }

                    const possibleKatex = indexSrc.substring(index);

                    //from the index, check if match the inline rule
                    if (possibleKatex.match(inlineRule)) {
                        return index;
                    }

                    indexSrc = indexSrc.substring(index + 1).replace(/^\$+/, '');
                }
            },
            tokenizer(src: string, tokens: Token[]) {
                const match = src.match(inlineRule);
                if (match) {
                    return {
                        type: 'InlineMath',
                        raw: match[0],
                        text: match[2].trim(),
                        displayMode: match[1].length === 2
                    };
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
            tokenizer(src: string) {
                const match = src.match(blockRule);
                if (match) {
                    return {
                        type: 'BlockMath',
                        raw: match[0],
                        text: match[2].trim(),
                        displayMode: match[1].length === 2
                    };
                }
            },
            renderer: (token: Tokens.Generic) => {
                return this.renderer(token, false);
            }
        };
    }
}
