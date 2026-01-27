/**
 * marked extension for handling images
 * 
 * post processing;
 * 
 * 
 */

import { MarkedExtension } from "marked";
import { sanitizeHTMLToDom } from "obsidian";
import { WeWriteMarkedExtension } from "./extension";


export class Image extends WeWriteMarkedExtension {
	async processImage(dom: HTMLDivElement) {

		const imgEls = dom.querySelectorAll('img')

		for (let i = 0; i < imgEls.length; i++) {
			const currentImg = imgEls[i]

			const classNames = currentImg.getAttribute('class')?.split(' ')


			if (classNames?.includes('wewrite-avatar-image')) {
				continue
			}

			// Handle file:// protocol images - convert src to proper resource path
			const src = currentImg.getAttribute('src');
			if (src && src.startsWith('file://')) {
				// Remove file:// prefix and decode URI
				let filePath = src.replace('file://', '');
				// On Windows, file:// URLs may have an extra /
				if (filePath.startsWith('/') && filePath.length > 2 && filePath.charAt(2) === ':') {
					filePath = filePath.substring(1);
				}
				filePath = decodeURIComponent(filePath);

				try {
					// Try to convert absolute path to vault relative path
					const vaultPath = (this.plugin.app.vault.adapter as any).basePath;
					let relativePath = filePath;

					if (vaultPath && filePath.startsWith(vaultPath)) {
						// Convert absolute path to relative path
						relativePath = filePath.substring(vaultPath.length);
						// Remove leading slash or backslash
						if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
							relativePath = relativePath.substring(1);
						}
						// Normalize path separators to forward slashes for Obsidian
						relativePath = relativePath.replace(/\\/g, '/');
					}

					// Try to find the file in the vault using relative path
					const file = this.plugin.app.vault.getAbstractFileByPath(relativePath);
					if (file) {
						// Use adapter.getResourcePath like mp-preview does
						const resPath = (this.plugin.app.vault.adapter as any).getResourcePath(file.path);
						currentImg.setAttribute('src', resPath);
					} else {
						// Try using metadataCache with just the filename
						const filename = relativePath.split('/').pop() || relativePath;
						const metaFile = this.plugin.app.metadataCache.getFirstLinkpathDest(filename, '');
						if (metaFile) {
							const resPath = (this.plugin.app.vault.adapter as any).getResourcePath(metaFile.path);
							currentImg.setAttribute('src', resPath);
						}
					}
				} catch (error) {
					console.error(`[WeWrite Image] Failed to process file:// image:`, error);
				}
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
	async postprocess(html: string): Promise<string> {

		const dom = sanitizeHTMLToDom(html)
		const tempDiv = createEl('div');
		tempDiv.appendChild(dom);
		// processImage is now async, so we need to await it
		await this.processImage(tempDiv)
		const serializer = new XMLSerializer();
		const result = Array.from(tempDiv.childNodes)
			.map((node) => serializer.serializeToString(node))
			.join('');
		return result;
	}

	markedExtension(): MarkedExtension {
		return {
			extensions: []
		}
	}
}
