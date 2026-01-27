/**
 * Post-processor for WeChat MP rendering
 * Replaces marked.js extensions with HTML transformations after Obsidian native rendering
 * Based on mp-preview's converter pattern
 */

import { App, TFile } from 'obsidian';

export class WeWritePostProcessor {
    private static app: App;

    static initialize(app: App) {
        this.app = app;
    }

    /**
     * Main entry point - formats rendered HTML for WeChat MP
     */
    static async formatContent(element: HTMLElement, sourcePath: string): Promise<void> {
        // Wrap content in section for WeChat compatibility
        const section = document.createElement('section');
        section.className = 'wewrite-article';

        // Move all content to section
        while (element.firstChild) {
            section.appendChild(element.firstChild);
        }
        element.appendChild(section);

        // Process elements
        await this.processFileProtocolImages(section, sourcePath);
        this.processWikilinks(section);
        this.processCodeBlocks(section);
        this.processFrontmatter(section);
        this.processListItems(section);
        this.processTables(section);
    }

    /**
     * Convert file:// protocol images to app:// resource paths
     */
    private static async processFileProtocolImages(container: HTMLElement, sourcePath: string): Promise<void> {
        const images = container.querySelectorAll('img[src^="file://"], span.internal-embed[src^="file://"]');

        for (const el of Array.from(images)) {
            const isImg = el.tagName === 'IMG';
            const src = el.getAttribute('src');
            if (!src) continue;

            try {
                // Remove file:// prefix
                let filePath = src.replace(/^file:\/\/\//, '');

                // Normalize path separators
                filePath = filePath.replace(/\\\\/g, '/');

                // Convert to vault-relative path
                const vaultPath = this.app.vault.adapter.basePath.replace(/\\\\/g, '/');
                if (filePath.startsWith(vaultPath)) {
                    filePath = filePath.substring(vaultPath.length + 1);
                }

                // Try to find the file
                let file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
                if (!file) {
                    const linktext = filePath.split('|')[0];
                    file = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath) as TFile;
                }

                if (file) {
                    const resourcePath = this.app.vault.adapter.getResourcePath(file.path);

                    if (isImg) {
                        (el as HTMLImageElement).src = resourcePath;
                    } else {
                        // Convert span to img
                        const newImg = document.createElement('img');
                        newImg.src = resourcePath;
                        const alt = el.getAttribute('alt');
                        if (alt) newImg.alt = alt;
                        el.parentNode?.replaceChild(newImg, el);
                    }
                }
            } catch (error) {
                console.error('[WeWrite] Failed to convert file:// image:', error);
            }
        }
    }

    /**
     * Process internal embeds and convert to resource paths
     */
    private static processWikilinks(container: HTMLElement): void {
        container.querySelectorAll('span.internal-embed[alt][src]').forEach(el => {
            const originalSpan = el as HTMLElement;
            const src = originalSpan.getAttribute('src');
            const alt = originalSpan.getAttribute('alt');

            if (!src) return;

            try {
                const linktext = src.split('|')[0];
                const file = this.app.metadataCache.getFirstLinkpathDest(linktext, '');
                if (file) {
                    const absolutePath = this.app.vault.adapter.getResourcePath(file.path);
                    const newImg = document.createElement('img');
                    newImg.src = absolutePath;
                    if (alt) newImg.alt = alt;
                    originalSpan.parentNode?.replaceChild(newImg, originalSpan);
                }
            } catch (error) {
                console.error('[WeWrite] Failed to process wikilink:', error);
            }
        });
    }

    /**
     * Add decorative code block headers
     */
    private static processCodeBlocks(container: HTMLElement): void {
        container.querySelectorAll('pre').forEach(pre => {
            // Skip frontmatter
            if (pre.classList.contains('frontmatter') || pre.classList.contains('frontmatter-container')) {
                pre.remove();
                return;
            }

            const codeEl = pre.querySelector('code');
            if (codeEl) {
                // Add macOS-style window header
                const header = document.createElement('div');
                header.className = 'wewrite-code-header';

                // Add three dots
                for (let i = 0; i < 3; i++) {
                    const dot = document.createElement('span');
                    dot.className = 'wewrite-code-dot';
                    header.appendChild(dot);
                }

                pre.insertBefore(header, pre.firstChild);

                // Remove Obsidian's copy button
                const copyButton = pre.querySelector('.copy-code-button');
                if (copyButton) {
                    copyButton.remove();
                }
            }
        });
    }

    /**
     * Remove frontmatter from display
     */
    private static processFrontmatter(container: HTMLElement): void {
        container.querySelectorAll('.frontmatter, .frontmatter-container, pre.frontmatter').forEach(el => {
            el.remove();
        });
    }

    /**
     * Wrap list item content in sections for WeChat
     */
    private static processListItems(container: HTMLElement): void {
        container.querySelectorAll('li').forEach(li => {
            // Skip if already wrapped
            if (li.querySelector('section')) return;

            const section = document.createElement('section');
            while (li.firstChild) {
                section.appendChild(li.firstChild);
            }
            li.appendChild(section);
        });
    }

    /**
     * Process tables for WeChat compatibility
     */
    private static processTables(container: HTMLElement): void {
        container.querySelectorAll('table').forEach(table => {
            // Ensure table has proper WeChat classes
            table.classList.add('wewrite-table');
        });
    }
}
