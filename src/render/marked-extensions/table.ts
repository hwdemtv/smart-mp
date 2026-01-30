/**
 * marked extension for table
 * add container for table
 * 
 * 
 */

import { Tokens, MarkedExtension } from "marked";
import { WeWriteMarkedExtension } from "./extension";
import { ObsidianMarkdownRenderer } from "../markdown-render";
import { serializeElement } from "src/utils/utils";


export class Table extends WeWriteMarkedExtension {

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

                        console.debug('[TableRenderer] Looking for table with sig:', searchSig);

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
                            console.warn('[TableRenderer] Content match failed, falling back to index', this.tableIndex);
                            bestMatch = domTables[this.tableIndex];
                        }

                        if (!bestMatch) {
                            return '<section class="table-container"><p>Table content not found</p><section>';
                        }

                        this.tableIndex++; // Keep incrementing just in case we need fallback
                        return `<section class="table-container">${serializeElement(bestMatch)}</section>`;
                    }
                }
            ]
        }
    }
}
