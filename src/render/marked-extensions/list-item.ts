/**
 * marked extension for List, remove empty cotent
 * 
 * credits to Sun BooShi, author of note-to-mp plugin
 */

import { Tokens, MarkedExtension } from "marked";
import { WeWriteMarkedExtension } from "./extension";
import { sanitizeHTMLToDom } from "obsidian";
import { serializeChildren, serializeElement } from "src/utils/utils";

export class ListItem extends WeWriteMarkedExtension {
    postprocess(html: string): Promise<string> {
        const fragment = sanitizeHTMLToDom(html)
        const root = createDiv()
        root.appendChild(fragment)
        const uls = root.querySelectorAll<HTMLElement>('ul,ol')
        for (let ul of uls) {
            if (ul.children.length === 0) {
                ul.remove()
            }
            const p = ul.parentNode
            if (p) {
                p.removeChild(ul)
                const frame = p.createDiv({ cls: 'wewrite-list-frame' })
                frame.setAttr('frame-type', 'list')
                frame.appendChild(ul)
            }
        }
        return Promise.resolve(serializeChildren(root));

    }
    renderItem(item: Tokens.ListItem) {
        return item.raw;
    }
    renderList(list: Tokens.List) {
        if (list.items.length === 0) {
            return '';
        }

        const frame = createDiv({ cls: 'wewrite-list-frame' });
        frame.setAttr('frame-type', 'list');
        const listTag = list.ordered ? 'ol' : 'ul';
        const listEl = frame.createEl(listTag);

        for (let item of list.items) {
            const li = listEl.createEl('li');

            if (item.task) {
                li.addClass('wewrite-task-list-item');
                const checkboxIcon = item.checked
                    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right:8px;vertical-align:middle;color:var(--interactive-accent)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg>`
                    : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;vertical-align:middle;opacity:0.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;

                li.innerHTML = `<span class="task-checkbox">${checkboxIcon}</span><span class="task-content">${item.text}</span>`;
            } else {
                li.setText(item.text || "");
            }
        }
        return serializeElement(frame);
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [
                {
                    name: 'list',
                    level: 'block',
                    renderer: (token: Tokens.List) => {
                        return this.renderList(token);
                    }
                }
            ]
        }
    }
}
