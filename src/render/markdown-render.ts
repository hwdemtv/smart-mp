/**
 * MarkdownRender of obsidian. 
 * credits to author of export as image plugin
*/

import { App, Component, MarkdownRenderChild, MarkdownRenderer, MarkdownView } from "obsidian";
import domtoimage from './dom-to-image-more';
export class ObsidianMarkdownRenderer {
    private static instance: ObsidianMarkdownRenderer;
    private path: string
    previewEl: HTMLElement
    private rendering: boolean = false
    private container: HTMLElement
    private view: Component
    mdv: MarkdownRenderChild;
    markdownBody: HTMLDivElement;
    private constructor(private app: App) {
        this.app = app;
    }

    public static getInstance(app: App,) {
        if (!ObsidianMarkdownRenderer.instance) {
            ObsidianMarkdownRenderer.instance = new ObsidianMarkdownRenderer(app);
        }
        return ObsidianMarkdownRenderer.instance;
    }
    public async render(path: string, container: HTMLElement, view: Component) {
        // 使用 Obsidian 自带渲染器生成 DOM（用于处理内部链接/嵌入等）
        if (path === undefined || !path || !path.toLowerCase().endsWith('.md')) {
            return;
        }

        this.container = container
        this.container.addClass('wewrite-markdown-render-container')
        this.view = view
        this.path = path

        this.container.empty();
        this.container.show();

        // Use visible container for proper Excalidraw/Canvas rendering
        // No need for off-screen positioning
        this.container.style.display = "block";
        this.container.style.width = "100%"; // Let container use full width

        this.rendering = true
        if (this.mdv) {
            this.mdv.unload();
        }

        this.previewEl = createDiv()
        this.markdownBody = this.previewEl.createDiv()
        this.mdv = new MarkdownRenderChild(this.markdownBody)
        this.view.addChild(this.mdv)
        this.container.appendChild(this.previewEl)
        this.path = path
        const markdown = await this.app.vault.adapter.read(path)
        await MarkdownRenderer.render(this.app, markdown, this.markdownBody, path, this.view)

        try {
            const waiters: Promise<void>[] = [];

            // Safety check: ensure previewEl is still valid
            if (!this.previewEl) return;

            if (/^\s*>+\s*\[!/m.test(markdown)) {
                waiters.push(this.waitForSelector(this.previewEl, ".callout", 1500));
            }
            if (/```\s*mermaid/i.test(markdown)) {
                waiters.push(this.waitForSelector(this.previewEl, ".mermaid svg", 3000));
            }
            if (/!\[\[/.test(markdown) || /!\[.*?\]\(/.test(markdown)) {
                // Wait for any obsidian embed to finish loading
                waiters.push(this.waitForSelector(this.previewEl, ".internal-embed.is-loaded, .excalidraw-svg, .excalidraw-plugin-view", 10000));
            }
            if (waiters.length) {
                await Promise.all(waiters);
            }
        } catch (err) {
            console.warn("[WeWrite] Optional plugin rendering wait timed out or failed:", err);
        }

        this.rendering = false
    }
    public queryElement(index: number, query: string) {
        if (this.previewEl === undefined || !this.previewEl) {
            return null
        }
        if (this.rendering) {
            return null
        }
        if (this.previewEl === undefined || !this.previewEl) {
            return null
        }
        const nodes = this.previewEl.querySelectorAll<HTMLElement>(query)
        if (nodes.length < index) {
            return null
        }
        return nodes[index]
    }

    public async domToImage(
        element: Element,
        p: Record<string, unknown> = {}
    ): Promise<string> {
        return await domtoimage.toPng(element, p)
    }
    waitForSelector(
        container: HTMLElement,
        selector: string,
        timeout = 1000
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            if (container.querySelector(selector)) return resolve();

            const observer = new MutationObserver(() => {
                if (container.querySelector(selector)) {
                    observer.disconnect();
                    resolve();
                }
            });

            observer.observe(container, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                // reject(new Error(`Timeout waiting for selector: ${selector}`));
                resolve();
            }, timeout);
        });
    }

}
