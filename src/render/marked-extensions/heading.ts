/**
 * marked extension for heading
 * 
 * credits to Sun BooShi, author of note-to-mp plugin
 */

import { Tokens, MarkedExtension } from "marked";
import { SmartMPMarkedExtension } from "./extension";
import { sanitizeHTMLToDom } from "obsidian";
import { serializeChildren } from "src/utils/utils";

export class Heading extends SmartMPMarkedExtension {
	postprocess(dom: HTMLElement): Promise<HTMLElement> {
		const headings = dom.querySelectorAll('h1, h2, h3, h4, h5, h6');
		for (const heading of headings) {
			const contentHtml = heading.innerHTML;
			heading.empty();
			heading.createSpan({ text: " ", cls: 'smart-mp-heading-prefix' });
			const outbox = heading.createSpan({ cls: 'smart-mp-heading-outbox' });
			const leaf = outbox.createSpan({ cls: 'smart-mp-heading-leaf' });

			// 性能优化：如果只是纯文本，跳过安全过滤
			if (!/[<>&]/.test(contentHtml)) {
				leaf.textContent = contentHtml;
			} else {
				leaf.appendChild(sanitizeHTMLToDom(contentHtml));
			}

			heading.createSpan({ cls: 'smart-mp-heading-tail' });
		}
		return Promise.resolve(dom);

	}

	// async render(text: string, depth: number) {
	// 	console.log('heading=>', text);

	// 	return `
	//         <h${depth}>
	// 		<span class="smart-mp-heading-prefix">
	// 		${depth}
	// 		  </span>
	// 		<span class="smart-mp-heading-outbox">
	// 		<span class="smart-mp-heading-leaf">
	//           ${text}
	// 		  </span>
	// 		  </span>
	// 		  <span class="smart-mp-heading-tail">
	// 		  </span>
	//         </h${depth}>`;

	// }

	markedExtension(): MarkedExtension {
		return {
			extensions: []
		}
		// 	return {
		// 		async: true,
		// 		walkTokens: async (token: Tokens.Generic) => {
		// 			if (token.type !== 'heading') {
		// 				return;
		// 			}
		// 			token.html = await this.render(token.text, token.depth);
		// 		},
		// 		extensions: [{
		// 			name: 'heading',
		// 			level: 'block',

		// 			renderer(token: Tokens.Generic) {
		// 				return token.html;
		// 			}
		// 		}]
		// 	}
		// }
	}
}
