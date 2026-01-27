/**
 * marked extension for footnote
 * 
 * 
 * 
 */

import { MarkedExtension, Tokens } from "marked";
import { WeWriteMarkedExtension } from "./extension";

export class Links extends WeWriteMarkedExtension {

    allLinks: string[] = [];
    prepare(): Promise<void> {
        this.allLinks = [];
        return Promise.resolve();
    }

    postprocess(html: string): Promise<string> {
        if (!this.allLinks.length) {
            return Promise.resolve(html);
        }
        // 去重但保持顺序
        const uniqueLinks = [...new Set(this.allLinks)];
        const links = uniqueLinks.map((href, i) => {
            return `<li>${href}&nbsp;↩</li>`;
        });
        return Promise.resolve(
            `${html}<section class="foot-links"><hr class="foot-links-separator"><ol>${links.join('')}</ol></section>`
        );
    }

    markedExtension(): MarkedExtension {
        const wikilinkRegex = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/;
        return {
            extensions: [
                {
                    name: 'link',
                    level: 'inline',
                    renderer: (token: Tokens.Link) => {
                        if (token.href.startsWith('http')) {
                            this.allLinks.push(token.href);
                            return `<a href="${token.href}">${token.text}<sup>[${this.allLinks.length}]</sup></a>`;
                        } else {
                            return `<a href="${token.href}">${token.text}</a>`;
                        }
                    }
                },
                {
                    name: 'wikilink',
                    level: 'inline',
                    start: (src: string) => src.indexOf('[['),
                    tokenizer: (src: string) => {
                        const match = wikilinkRegex.exec(src);
                        if (match) {
                            return {
                                type: 'wikilink',
                                raw: match[0],
                                href: match[1],
                                text: match[2] || match[1] // Use alias if exists, else use path
                            };
                        }
                    },
                    renderer: (token: Tokens.Generic) => {
                        // For WeChat MP, wikilinks are treated as normal text or added to foot links if they look like URLs (rare)
                        // Usually they are just internal links which WeChat doesn't support, so we render as styled text
                        return `<span class="wewrite-wikilink">${token.text}</span>`;
                    }
                }
            ]
        }
    }
}
