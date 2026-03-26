/*
* marked extension for codespan
- special codespan
- image caption

 */



import { Tokens } from "marked";
import { escapeHtml } from "../../utils/utils";
import { SmartMPMarkedExtension } from "./extension";
export class CodespanRenderer extends SmartMPMarkedExtension {
	showLineNumber: boolean;
	mermaidIndex: number = 0;
	admonitionIndex: number = 0;
	chartsIndex: number = 0;

	extractSmartMPCaptions(input: string): string[] {
		// const regex = /wwcap:\s*(.+?)(?=\s|$)/gi;
		const regex = /^wwcap:\s*(.*)$/gim;
		const captions: string[] = [];
		let match: RegExpExecArray | null;

		while ((match = regex.exec(input)) !== null) {
			captions.push(match[1].trim());
		}

		return captions;
	}

	codespanRenderer(code: string): string {
		code = code.trim();
		const captions = this.extractSmartMPCaptions(code);
		if (captions.length > 0) {
			return `<div class="smart-mp-image-caption">${captions[0]}</div>`
		}
		// [Fixed] Remove smart-mp-codespan class to avoid forced dark theme background
		// [Fixed] Escape HTML to prevent tag stripping (e.g. Array<Image>)
		// [Enhancement] Inline styles for WeChat compatibility
		const theme = this.plugin.settings.codeTheme || 'github';
		let style = 'padding: .2em .4em; border-radius: 4px; font-family: SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace; font-size: .85em; margin: 0 .2em;';

		if (theme === 'github' || theme === 'github-light') {
			style += 'background-color: rgba(27,31,35,0.05); color: #24292e;';
		} else {
			// One Dark / Default
			style += 'background-color: #282c34; color: #e5c07b;';
		}



		return `<span class="smart-mp-codespan" style="${style}">${escapeHtml(code)}</span>`;
	}


	markedExtension() {
		return {
			extensions: [{
				name: 'codespan',
				level: 'inline',
				renderer: (token: Tokens.Generic) => {
					return token.html;
				},
			}
			],
			walkTokens: (token: Tokens.Generic) => {
				if (token.type === 'codespan') {
					token.html = this.codespanRenderer(token.text);
				}
			}
		}
	}
}
