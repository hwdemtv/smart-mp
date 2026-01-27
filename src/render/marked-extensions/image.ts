/**
 * marked extension for handling images
 * 
 * post processing;
 * 
 * 
 */

import { MarkedExtension } from "marked";
import { arrayBufferToBase64, sanitizeHTMLToDom } from "obsidian";
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

			// Handle file:// protocol images
			const src = currentImg.getAttribute('src');
			if (src && src.startsWith('file://')) {
				console.log(`[WeWrite Image] Processing file:// src: ${src}`);

				// Remove file:// prefix and decode URI
				let filePath = src.replace('file://', '');
				// On Windows, file:// URLs may have an extra /
				if (filePath.startsWith('/') && filePath.length > 2 && filePath.charAt(2) === ':') {
					filePath = filePath.substring(1);
				}
				filePath = decodeURIComponent(filePath);

				console.log(`[WeWrite Image] Decoded file path: ${filePath}`);

				try {
					// Try to read the file as binary and convert to data URL
					const fileData = await this.plugin.app.vault.adapter.readBinary(filePath);
					const base64 = arrayBufferToBase64(fileData);

					// Determine MIME type from file extension
					const ext = filePath.split('.').pop()?.toLowerCase();
					let mimeType = 'image/png'; // default
					if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
					else if (ext === 'gif') mimeType = 'image/gif';
					else if (ext === 'webp') mimeType = 'image/webp';
					else if (ext === 'svg') mimeType = 'image/svg+xml';

					const dataUrl = `data:${mimeType};base64,${base64}`;
					currentImg.setAttribute('src', dataUrl);
					console.log(`[WeWrite Image] Converted to data URL, length: ${dataUrl.length}`);
				} catch (error) {
					console.error(`[WeWrite Image] Failed to load file:// image:`, error);
					// Keep original src, which won't work but shows the intent
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
