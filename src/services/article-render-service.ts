import { Component, Notice, TFile } from "obsidian";
import SmartMPPlugin from "../main";
import { WechatRender } from "../render/wechat-render";
import { ThemeManager } from "../theme/theme-manager";
import { PreviewRender } from "../render/marked-extensions/extension";

export interface RenderResult {
    html: string;
    element: HTMLElement; // Return live DOM element to support async updates
    text: string;
    stats: {
        words: number;
        chars: number;
        readTime: number;
    }
}

/**
 * Service responsible for article rendering logic, markdown processing, and data preparation.
 * Detached from UI view logic.
 */
export class ArticleRenderService extends Component implements PreviewRender {
    private plugin: SmartMPPlugin;
    private render: WechatRender;
    public articleProperties: Map<string, string> = new Map();
    private currentContainer: HTMLElement | null = null;

    // PreviewRender Interface Implementation
    updateElementByID(id: string, html: string): void {
        if (this.currentContainer) {
            const el = this.currentContainer.querySelector(`#${id}`);
            if (el) {
                el.innerHTML = html;
            }
        }
    }
    addElementByID(id: string, node: string | HTMLElement): void {
        if (this.currentContainer) {
            const target = this.currentContainer.querySelector(`#${id}`);
            if (target) {
                if (typeof node === 'string') {
                    target.innerHTML = node;
                } else {
                    target.appendChild(node);
                }
            }
        }
    }

    constructor(plugin: SmartMPPlugin) {
        super();
        this.plugin = plugin;
        this.render = WechatRender.getInstance(plugin, this);
    }

    /**
     * Parse markdown content to HTML string suitable for WeChat
     */
    public async renderArticle(file: TFile, content: string): Promise<RenderResult> {
        // 1. Process Markdown to HTML
        // WechatRender.parseNote returns HTMLElement (DocumentFragment or Div)
        const container = document.createElement("div");
        this.currentContainer = container; // Track current container for async updates

        // parseNote expects (path, container, component)
        // [Fix] parseNote returns the rendered content, it doesn't necessarily append to the passed container
        // We must catch the result and append it to our container.
        const resultEl = await this.render.parseNote(file.path, container, this);
        if (resultEl && resultEl !== container) {
            container.appendChild(resultEl);
        }

        const html = container.innerHTML;

        // 2. Calculate Stats
        const stats = this.calculateStats(content);

        return {
            html,
            element: container,
            text: content, // Or processed text if needed
            stats
        };
    }

    /**
     * Process article for export (including image inlining)
     */
    public async processForExport(
        htmlContent: string,
        themeCss: string,
        progressCallback?: (msg: string) => void
    ): Promise<string> {
        // 1. Post-process (inline images, etc.)
        // Note: PostRender might need DOM context, so we might return HTML string or operate on a document fragment
        // For now, let's assume we can use a temporary DOM parser if needed, or rely on PostRender logic that handles strings/DOM

        // This part often requires browser APIs (DOM), so it runs in window context.
        // If PostRender relies heavily on active DOM, we might need to pass a container.
        // But ideally, Service should handle logic.

        return htmlContent;
    }

    public calculateStats(text: string) {
        // Simple regex based stats
        const pattern = /[a-zA-Z0-9_\u0392-\u03c9\u0400-\u04FF]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af\u0400-\u04FF]+|[\u00E0-\u00FC]/g;
        const m = text.match(pattern);
        let count = 0;
        if (m) {
            for (let i = 0; i < m.length; i++) {
                if (m[i].charCodeAt(0) >= 0x4E00) {
                    count += m[i].length;
                } else {
                    count += 1;
                }
            }
        }
        const chars = text.length;
        const readTime = Math.ceil(count / 400); // ~400 words per minute for CN

        return {
            words: count,
            chars,
            readTime
        };
    }
}
