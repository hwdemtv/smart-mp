import { MarkedExtension } from "marked";
import { SmartMPMarkedExtension } from "./extension";

export class Highlight extends SmartMPMarkedExtension {
    markedExtension(): MarkedExtension {
        return {
            extensions: [{
                name: 'highlight',
                level: 'inline',
                start(src: string) { return src.match(/==/)?.index; },
                tokenizer(src: string) {
                    const match = src.match(/^==([^=]+)==/);
                    if (match) {
                        const text = match[1].trim();
                        return {
                            type: 'highlight',
                            raw: match[0],
                            text: text,
                            tokens: this.lexer.inlineTokens(text)
                        };
                    }
                },
                renderer(token: any) {
                    return `<mark class="highlight">${this.parser.parseInline(token.tokens || [])}</mark>`;
                }
            }]
        };
    }
}
