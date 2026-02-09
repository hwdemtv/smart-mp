import SmartMPPlugin from "../../main";
import { TFile } from "obsidian";

/**
 * Controller for manipulating the Preview DOM.
 * encapsulating layout enhancements, table wrapping, and other DOM transformations.
 */
export class PreviewDOMController {
    private container: HTMLElement;
    private plugin: SmartMPPlugin;

    constructor(container: HTMLElement, plugin: SmartMPPlugin) {
        this.container = container;
        this.plugin = plugin;
    }

    public applyLayoutEnhancements(element: HTMLElement) {
        if (!element) return;

        // 1. Process HR
        this.processHR(element);

        // 2. Wrap Tables
        this.wrapTables(element);

        // 3. Process Image Captions
        if (this.plugin.settings.showImageCaptions) {
            this.processImageCaptions(element);
        }

        // 4. Other layout enhancements...
    }

    private processHR(element: HTMLElement) {
        const hrStyle = this.plugin.settings.hrStyle || "dots";
        if (hrStyle === 'none') {
            element.querySelectorAll('hr').forEach(hr => hr.classList.add('smart-mp-hidden'));
            return;
        }

        let content = "· · ·";
        if (hrStyle === "lines") content = "— — —";
        else if (hrStyle === "stars") content = "* * *";
        else if (hrStyle === "custom") content = this.plugin.settings.customHrText || "· · ·";

        const hrs = element.querySelectorAll("hr");
        hrs.forEach((hr) => {
            const div = document.createElement("div");
            div.className = "smart-mp-hr-replacement";
            div.textContent = content;
            hr.replaceWith(div);
        });
    }

    public embedArticleStatsInContent(element: HTMLElement, stats: { words: number, readTime: number }) {
        // Remove existing stats if any
        const existing = element.querySelector(".smart-mp-embedded-stats");
        if (existing) existing.remove();

        if (stats.words === 0) return;

        const statsDiv = document.createElement("section");
        statsDiv.className = "smart-mp-embedded-stats";

        // Apply theme-specific styles if needed (migrated from previewer.ts)
        const currentTheme = this.plugin.settings.custom_theme || "";
        if (currentTheme.includes("互为螺旋·金") || currentTheme.includes("互为螺旋")) {
            statsDiv.setAttribute("style", `
                text-align: center;
                font-size: 13px;
                color: #b08d55;
                padding: 12px 20px;
                margin: 0 0 24px 0;
                background: linear-gradient(135deg, rgba(252, 244, 218, 0.6) 0%, rgba(255, 251, 240, 0.8) 100%);
                border-radius: 8px;
                border: 1px solid rgba(212, 175, 55, 0.3);
                box-shadow: 0 2px 8px rgba(176, 141, 85, 0.08);
                letter-spacing: 1px;
            `);
        }

        // We can't use $t here easily without importing it or passing it in. 
        // For simpler refactoring, let's hardcode or assume plugin has access to i18n
        // Ideally we pass the formatted string or $t function.
        // Let's rely on a simple string for now or import $t if possible.
        // Since I cannot easily verify if $t is available in this scope without import, I will add generic text or try to import it.
        // But `PreviewDOMController` is in `src/views/controllers`, $t is in `src/lang/i18n`. import { $t } from "../../../lang/i18n";

        statsDiv.innerHTML = `<p style="${currentTheme.includes("互为螺旋") ? 'margin: 0; color: #b08d55;' : ''}">📖 字数: ${stats.words} | 阅读: ${stats.readTime} 分钟</p>`;

        if (element.firstChild) {
            element.insertBefore(statsDiv, element.firstChild);
        } else {
            element.appendChild(statsDiv);
        }
    }

    private wrapTables(element: HTMLElement) {
        const tables = element.querySelectorAll("table");
        tables.forEach((table) => {
            if (table.parentElement?.classList.contains("smart-mp-table-wrapper")) return;
            const wrapper = document.createElement("div");
            wrapper.className = "smart-mp-table-wrapper";
            table.replaceWith(wrapper);
            wrapper.appendChild(table);
        });
    }

    private processImageCaptions(element: HTMLElement) {
        const images = element.querySelectorAll("img");
        images.forEach((img) => {
            if (img.alt && !img.parentElement?.classList.contains("smart-mp-figure")) {
                const figure = document.createElement("figure");
                figure.className = "smart-mp-figure";

                const figcaption = document.createElement("figcaption");
                figcaption.textContent = img.alt;

                img.replaceWith(figure);
                figure.appendChild(img);
                figure.appendChild(figcaption);
            }
        });
    }

    public injectThemeCSS(css: string, styleId: string = "smart-mp-theme-style") {
        let styleEl = this.container.querySelector(`#${styleId}`) as HTMLStyleElement;
        if (!styleEl) {
            styleEl = document.createElement("style");
            styleEl.id = styleId;
            this.container.appendChild(styleEl);
        }
        styleEl.textContent = css;
    }
}
