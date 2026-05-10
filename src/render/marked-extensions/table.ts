/**
 * marked extension for table
 * add container for table
 * 
 * 
 */

import { Tokens, MarkedExtension } from "marked";
import { SmartMPMarkedExtension } from "./extension";
import { Logger } from "src/utils/logger";
import { ObsidianMarkdownRenderer } from "../markdown-render";
import { serializeElement } from "src/utils/utils";


export class Table extends SmartMPMarkedExtension {

    tableIndex = 0;
    prepare(): Promise<void> {
        this.tableIndex = 0;
        return Promise.resolve();
    }
    markedExtension(): MarkedExtension {
        return {
            extensions: [
                {
                    name: 'table',
                    level: 'block', // Is this a block-level or inline-level tokenizer?
                    renderer: (token: Tokens.Table) => {
                        // Strategy: content matching instead of index matching
                        // Because marked traversal order !== DOM querySelectorAll order (especially with callouts)

                        // 1. Construct a search signature from the token
                        // e.g. "Header1Header2Cell1Cell2"
                        const tokenHeaders = token.header.map(h => h.text).join('').replace(/\s+/g, '');
                        const tokenCells = token.rows.map(row => row.map(c => c.text).join('')).join('').replace(/\s+/g, '');
                        const searchSig = (tokenHeaders + tokenCells).slice(0, 100); // Take first 100 chars as signature

                        Logger.debug('TableRenderer', '[TableRenderer] Looking for table with sig:', searchSig);

                        // 2. Query all tables in the Obsidian preview DOM
                        const rendererInstance = ObsidianMarkdownRenderer.getInstance(this.plugin.app);
                        const domTables = Array.from(rendererInstance.previewEl?.querySelectorAll('table') || []);

                        // 3. Find the best match
                        let bestMatch: HTMLElement | null = null;

                        // Exact match first
                        for (const tbl of domTables) {
                            const tblContent = (tbl.textContent || '').replace(/\s+/g, '');
                            if (tblContent.includes(searchSig) || searchSig.includes(tblContent.slice(0, 100))) {
                                bestMatch = tbl;
                                break;
                            }
                        }

                        // Fallback to index if no content match (sanity check)
                        if (!bestMatch && this.tableIndex < domTables.length) {
                            Logger.warn('TableRenderer', '[TableRenderer] Content match failed, falling back to index', this.tableIndex);
                            bestMatch = domTables[this.tableIndex];
                        }

                        if (!bestMatch) {
                            return '<section style="max-width:100%;overflow:auto;-webkit-overflow-scrolling:touch;"><p>Table content not found</p></section>';
                        }

                        this.tableIndex++; // Keep incrementing just in case we need fallback

                        // Apply cell alignment from Obsidian DOM
                        bestMatch.querySelectorAll('th, td').forEach((cell) => {
                            const align = cell.getAttribute('align');
                            if (align) {
                                (cell as HTMLElement).style.textAlign = align;
                            }
                        });

                        // Wrap with horizontal scroll container
                        const tableHtml = serializeElement(bestMatch);
                        return `<section style="max-width:100%;overflow:auto;-webkit-overflow-scrolling:touch;">${tableHtml}</section>`;
                    }
                }
            ]
        }
    }
}
