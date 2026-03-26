/**
 * marked extension for handling images
 * 
 * post processing;
 * 
 * 
 */

import { MarkedExtension, Tokens } from "marked";
import { TFile } from "obsidian";
import { SmartMPMarkedExtension } from "./extension";
import { Logger } from "src/utils/logger";


export class Image extends SmartMPMarkedExtension {
	private pathCache = new Map<string, string>();
	private lastActiveFile: string | null = null;

	// Clean up cache when needed
	cleanup(): Promise<void> {
		this.pathCache.clear();
		this.lastActiveFile = null;
		return Promise.resolve();
	}

	processImage(dom: HTMLElement) {
		try {
			// Collect operations to minimize layout thrashing
			const operations: Array<() => void> = [];
			const imgEls = dom.querySelectorAll('img');
			const errors: Error[] = [];

			for (let i = 0; i < imgEls.length; i++) {
				try {
					const currentImg = imgEls[i];
					const classNames = currentImg.getAttribute('class')?.split(' ');

					if (classNames?.includes('smart-mp-avatar-image')) {
						continue;
					}

					const title = currentImg.getAttribute('title');
					const alt = currentImg.getAttribute('alt-text');
					const caption = title || alt || '';

					operations.push(() => {
						const parent = currentImg.parentNode;
						if (!parent) return;

						const fragment = document.createDocumentFragment();
						const figureEl = fragment.createEl('figure', { cls: 'image-with-caption' });

						if (caption) {
							const captionRow = figureEl.createEl('div', { cls: 'image-caption-row' });
							// captionRow.createEl('div', { cls: 'triangle' }); // Removed based on potentially simpler structure preference or previous context logic
							// Re-adding structure as it appeared in original but cleaner:
							const triangle = document.createElement('div');
							triangle.className = 'triangle';
							captionRow.appendChild(triangle);

							const ficCaptionEl = document.createElement('figcaption');
							ficCaptionEl.className = 'image-caption';
							ficCaptionEl.textContent = caption;
							captionRow.appendChild(ficCaptionEl);
						}

						parent.insertBefore(figureEl, currentImg);
						figureEl.prepend(currentImg);
					});
				} catch (imgError) {
					Logger.warn('ImageExtension', `[SmartMP] Skipped image ${i} due to error:`, imgError);
					errors.push(imgError instanceof Error ? imgError : new Error(String(imgError)));
				}
			}

			// Batch execute DOM updates
			operations.forEach(op => {
				try {
					op();
				} catch (domError) {
					Logger.error('ImageExtension', "[SmartMP] DOM operation failed:", domError);
				}
			});
		} catch (error) {
			Logger.error('ImageExtension', "Error processing images:", error);
		}
	}
	postprocess(dom: HTMLElement): Promise<HTMLElement> {
		this.processImage(dom);
		return Promise.resolve(dom);
	}

	markedExtension(): MarkedExtension {
		const plugin = this.plugin;
		// Helper to resolve paths like Embed does
		const getImagePath = (path: string) => {
			const activeFile = plugin.app.workspace.getActiveFile();
			const sourcePath = activeFile ? activeFile.path : "";

			// Clear cache if we switched files
			if (this.lastActiveFile !== sourcePath) {
				this.pathCache.clear();
				this.lastActiveFile = sourcePath;
			}

			// Check cache with context-aware key
			const cacheKey = `${sourcePath}:${path}`;
			if (this.pathCache.has(cacheKey)) {
				return this.pathCache.get(cacheKey)!;
			}

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
			// const activeFile = plugin.app.workspace.getActiveFile();
			// const sourcePath = activeFile ? activeFile.path : "";

			// Try as relative/wikilink path
			let file = plugin.app.metadataCache.getFirstLinkpathDest(decodedPath, sourcePath);

			// If not found, try as absolute path from vault root
			if (!file) {
				const abstractFile = plugin.app.vault.getAbstractFileByPath(decodedPath);
				if (abstractFile instanceof TFile) {
					file = abstractFile;
				}
			}

			// 新增：尝试从当前文件所在目录解析相对路径
			if (!file && sourcePath) {
				const currentDir = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
				const resolvedRelativePath = currentDir ? `${currentDir}/${decodedPath}` : decodedPath;
				const abstractFile = plugin.app.vault.getAbstractFileByPath(resolvedRelativePath);
				if (abstractFile instanceof TFile) {
					file = abstractFile;
					Logger.debug('ImageExtension', '[Image Extension] 从当前目录解析成功:', { decodedPath, resolvedRelativePath });
				}
			}

			if (file instanceof TFile) {
				const resolved = plugin.app.vault.getResourcePath(file);
				Logger.debug('ImageExtension', '[Image Extension] Vault File Resolved:', { decodedPath, resolved });
				this.pathCache.set(cacheKey, resolved);
				return resolved;
			}

			// 图片未找到，返回特殊标记以便后续处理
			Logger.warn('ImageExtension', '[Image Extension] 图片未找到:', { path, decodedPath });
			return `__MISSING_IMAGE__${path}`;
		};

		return {
			renderer: {
				image(this: any, token: Tokens.Image) {
					// 安全检查：确保 token.href 存在
					if (!token.href) {
						Logger.warn('ImageExtension', '[Image Extension] Missing href for image:', token.text);
						return `<img src="" alt="${token.text || ''}" class="smart-mp-image-fallback" />`;
					}
					const resolvedSrc = getImagePath(token.href);
					Logger.debug('ImageExtension', '[Image Extension] Original:', { href: token.href, resolvedSrc });
					const titleAttr = token.title ? ` title="${token.title}"` : "";
					return `<img src="${resolvedSrc}" alt="${token.text}"${titleAttr} />`;
				}
			}
		}
	}
}

