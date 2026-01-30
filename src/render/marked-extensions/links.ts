/**
 * marked extension for footnote
 * 
 * 
 * 
 */

import { MarkedExtension, Tokens } from "marked";
import { SmartMPMarkedExtension } from "./extension";

export class Links extends SmartMPMarkedExtension {

    allLinks: string[] = [];
    prepare(): Promise<void> {
        this.allLinks = [];
        return Promise.resolve();
    }

    postprocess(dom: HTMLElement): Promise<HTMLElement> {
        if (!this.allLinks.length) {
            return Promise.resolve(dom);
        }
        // Remove existing foot-links to avoid duplication (defensive)
        dom.querySelectorAll('.foot-links').forEach(el => el.remove());

        const linksHtml = this.allLinks.map((href, i) => {
            return `<li>${href}&nbsp;↩</li>`;
        }).join('');

        const footLinks = dom.createEl('section', { cls: 'foot-links' });
        footLinks.createEl('hr', { cls: 'foot-links-separator' });

        const title = footLinks.createEl('p', { cls: 'smart-mp-footnotes-title' });
        title.textContent = "🔗 参考链接";

        const ol = footLinks.createEl('ol');
        ol.innerHTML = linksHtml;

        return Promise.resolve(dom);
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [{
                name: 'link',
                level: 'inline',
                renderer: (token: Tokens.Link) => {
                    let text = token.text;
                    const href = token.href;

                    if (href.startsWith('http')) {
                        // Diagnostic log to catch why it duplicates
                        console.debug(`[Links] Rendering link: "${text}" -> ${href}, current allLinks:`, this.allLinks);

                        // 1. More aggressive cleaning to handle nested <sup> or multiple passes
                        // Strip anything that looks like a marker at the end
                        text = text.replace(/<sup>\[\d+\]<\/sup>/g, '')
                            .replace(/\[\d+\]/g, '')
                            .replace(/&nbsp;↩/g, '')
                            .trim();

                        // 2. Manage unique link list
                        let index = this.allLinks.indexOf(href);
                        if (index === -1) {
                            this.allLinks.push(href);
                            index = this.allLinks.length - 1;
                        }

                        return `<a href="${href}">${text}<sup>[${index + 1}]</sup></a>`;
                    } else {
                        return `<a href="${href}">${text}</a>`;
                    }
                }
            }]
        }
    }
}
