/**
 * marked extension for handling images
 * 
 * post processing;
 * 
 * 
 */

import { MarkedExtension, Tokens } from "marked";
import { sanitizeHTMLToDom, TFile } from "obsidian";
import { WeWriteMarkedExtension } from "./extension";


export class Image extends WeWriteMarkedExtension {
	processImage(dom: HTMLDivElement) {

		const imgEls = dom.querySelectorAll('img')

		for (let i = 0; i < imgEls.length; i++) {
			const currentImg = imgEls[i]

			const classNames = currentImg.getAttribute('class')?.split(' ')


			if (classNames?.includes('wewrite-avatar-image')) {
				continue
			}

			const title = currentImg.getAttribute('title')
			const alt = currentImg.getAttribute('alt-text')
			const caption = title || alt || ''
			const figureEl = createEl('figure', { cls: 'image-with-caption' })
			currentImg.parentNode?.insertBefore(figureEl, currentImg)
			figureEl.appendChild(currentImg)
			if (caption) {
				const captionRow = figureEl.createEl('div', { cls: 'image-caption-row' })
				captionRow.createEl('div', { cls: 'triangle' })
				captionRow.createEl('figcaption', { cls: 'image-caption', text: caption })
			}
		}
		return dom
	}
	postprocess(html: string): Promise<string> {

		const dom = sanitizeHTMLToDom(html)
		const tempDiv = createEl('div');
		tempDiv.appendChild(dom);
		this.processImage(tempDiv)
		const serializer = new XMLSerializer();
		const result = Array.from(tempDiv.childNodes)
			.map((node) => serializer.serializeToString(node))
			.join('');
		return Promise.resolve(result);
	}

	markedExtension(): MarkedExtension {
		const plugin = this.plugin;
		// Helper to resolve paths like Embed does
		const getImagePath = (path: string) => {
			if (path.startsWith("http") || path.startsWith("app://") || path.startsWith("data:")) return path;

			// Handle file:/// protocol
			if (path.startsWith("file:///")) {
				let filePath = decodeURIComponent(path.replace("file:///", ""));
				// Normalize Windows paths to use forward slashes for consistent comparison
				filePath = filePath.replace(/\\/g, "/");

				let adapter = plugin.app.vault.adapter as any;
				const vaultPath = (adapter.getBasePath ? adapter.getBasePath() : adapter.basePath).replace(/\\/g, "/");

				// 1. Try to resolve as a vault file
				if (filePath.toLowerCase().startsWith(vaultPath.toLowerCase())) {
					const relativePath = filePath.substring(vaultPath.length).replace(/^[/\\]/, "");
					const abstractFile = plugin.app.vault.getAbstractFileByPath(relativePath);
					if (abstractFile instanceof TFile) {
						return plugin.app.vault.getResourcePath(abstractFile);
					}
				}

				// 2. If not in vault or not found, try to use app://local/ for absolute paths
				// This allows loading external images if Obsidian permissions allow
				// On Windows, app://local/D:/path...
				return `app://local/${filePath}`;
			}

			const decodedPath = decodeURIComponent(path);

			// Try to find the file in vault
			const activeFile = plugin.app.workspace.getActiveFile();
			const sourcePath = activeFile ? activeFile.path : "";

			// Try as relative/wikilink path
			let file = plugin.app.metadataCache.getFirstLinkpathDest(decodedPath, sourcePath);

			// If not found, try as absolute path from vault root
			if (!file) {
				const abstractFile = plugin.app.vault.getAbstractFileByPath(decodedPath);
				if (abstractFile instanceof TFile) {
					file = abstractFile;
				}
			}

			if (file instanceof TFile) {
				const resolved = plugin.app.vault.getResourcePath(file);
				console.log('[Image Extension] Vault File:', decodedPath, '→', resolved);
				return resolved;
			}

			console.warn('[Image Extension] Fallback to original path:', path);
			return path; // Fallback to original
		};

		return {
			renderer: {
				image(this: any, token: Tokens.Image) {
					// 安全检查：确保 token.href 存在
					if (!token.href) {
						console.warn('[Image Extension] Missing href for image:', token.text);
						return `<img src="" alt="${token.text || ''}" />`;
					}
					const resolvedSrc = getImagePath(token.href);
					console.log('[Image Extension] Original:', token.href, '→ Resolved:', resolvedSrc);
					const titleAttr = token.title ? ` title="${token.title}"` : "";
					return `<img src="${resolvedSrc}" alt="${token.text}"${titleAttr} />`;
				}
			}
		}
	}
}

