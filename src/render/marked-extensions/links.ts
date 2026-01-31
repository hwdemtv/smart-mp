/**
 * marked extension for links
 */

import { MarkedExtension, Tokens } from "marked";
import { SmartMPMarkedExtension } from "./extension";
import { SafeHTML } from "../../utils/sanitize-html";
import { Logger } from "../../utils/logger";

export class Links extends SmartMPMarkedExtension {

    allLinks: { text: string, href: string }[] = [];
    prepare(): Promise<void> {
        this.allLinks = [];
        return Promise.resolve();
    }

    postprocess(dom: HTMLElement): Promise<HTMLElement> {
        if (!this.allLinks.length) {
            return Promise.resolve(dom);
        }
        // Remove existing references to avoid duplication (defensive)
        dom.querySelectorAll('.smart-mp-references').forEach(el => el.remove());

        const linksHtml = this.allLinks.map((link, i) => {
            // If text implies URL or is same as href, just show href
            const displayText = (link.text && link.text !== link.href && !link.text.startsWith('http'))
                ? `${link.text}: `
                : '';
            return `<li>${displayText}${link.href}</li>`;
        }).join('');

        const referencesContainer = dom.createEl('section', { cls: 'smart-mp-references' });
        referencesContainer.createEl('hr', { cls: 'smart-mp-references-separator' });

        const title = referencesContainer.createEl('p', { cls: 'smart-mp-references-title' });
        title.textContent = "🔗 参考链接";

        const ol = referencesContainer.createEl('ol');
        SafeHTML.setSafeHTML(ol, linksHtml);

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

                    // [Conflict Fix] Skip processing if it's a footnote mark (contains footnote or ^) or internal anchor to footnote
                    if (text.includes('footnote') || text.includes('^') || href.startsWith('#footnote')) {
                        return `<a href="${href}">${text}</a>`;
                    }

                    if (href.startsWith('http')) {
                        // Diagnostic log to catch why it duplicates
                        Logger.debug('Links', `Rendering link: "${text}" -> ${href}, current allLinks: ${this.allLinks.length}`);

                        // 1. More aggressive cleaning to handle nested <sup> or multiple passes
                        // Strip anything that looks like a marker at the end
                        text = text.replace(/<sup>\[\d+\]<\/sup>/g, '')
                            .replace(/\[\d+\]/g, '')
                            .replace(/&nbsp;↩/g, '')
                            .trim();

                        // 2. Manage unique link list
                        let index = this.allLinks.findIndex(l => l.href === href);
                        if (index === -1) {
                            this.allLinks.push({ text: text, href: href });
                            index = this.allLinks.length - 1;
                        }

                        return `<a href="${href}">${text}<sup>[${index + 1}]</sup></a>`;
                    } else {
                        return `<a href="${href}">${text}</a>`;
                    }
                }
            }]
        };
    }
}
