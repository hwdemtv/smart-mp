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

    postprocess(dom: HTMLElement): Promise<HTMLElement> {
        if (!this.allLinks.length) {
            return Promise.resolve(dom);
        }
        // 去重但保持顺序
        const uniqueLinks = [...new Set(this.allLinks)];
        const linksHtml = uniqueLinks.map((href, i) => {
            return `<li>${href}&nbsp;↩</li>`;
        }).join('');

        const footLinks = dom.createEl('section', { cls: 'foot-links' });
        footLinks.createEl('hr', { cls: 'foot-links-separator' });
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
                    if (token.href.startsWith('http')) {
                        this.allLinks.push(token.href);
                        return `<a href="${token.href}">${token.text}<sup>[${this.allLinks.length}]</sup></a>`;
                    } else {
                        // 非http外链直接返回，不添加到foot-links中
                        return `<a href="${token.href}">${token.text}</a>`;
                    }
                    // else {
                    //     return `<a>${token.text}[${token.href}]</a>`;
                    // }
                }
            }]
        }
    }
}
