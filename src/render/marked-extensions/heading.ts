/**
 * marked extension for heading
 * 
 * credits to Sun BooShi, author of note-to-mp plugin
 */

import { Tokens, MarkedExtension } from "marked";
import { WeWriteMarkedExtension } from "./extension";
import { sanitizeHTMLToDom } from "obsidian";
import { serializeChildren } from "src/utils/utils";

export class Heading extends WeWriteMarkedExtension {
	postprocess(html: string): Promise<string> {
		const dom = sanitizeHTMLToDom(html)
		const tempDiv = createEl('div');
		tempDiv.appendChild(dom);
		const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
		for (const heading of headings) {
			const contentHtml = heading.innerHTML; // 使用 innerHTML 替换 textContent
			heading.empty();
			heading.createSpan({ text: " ", cls: 'wewrite-heading-prefix' });
			const outbox = heading.createSpan({ cls: 'wewrite-heading-outbox' });
			const leaf = outbox.createSpan({ cls: 'wewrite-heading-leaf' });
			leaf.innerHTML = contentHtml; // 还原 HTML 内容
			heading.createSpan({ cls: 'wewrite-heading-tail' });
		}
		return Promise.resolve(serializeChildren(tempDiv))

	}

	// async render(text: string, depth: number) {
	// 	console.log('heading=>', text);

	// 	return `
	//         <h${depth}>
	// 		<span class="wewrite-heading-prefix">
	// 		${depth}
	// 		  </span>
	// 		<span class="wewrite-heading-outbox">
	// 		<span class="wewrite-heading-leaf">
	//           ${text}
	// 		  </span>
	// 		  </span>
	// 		  <span class="wewrite-heading-tail">
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
