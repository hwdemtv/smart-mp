/**
 *  WeChat MP Article Header settings
 */
import {
	arrayBufferToBase64,
	Notice,
	Setting,
	TextComponent,
	TFile,
	ToggleComponent,
} from "obsidian";
import { LocalDraftItem, LocalDraftManager } from "src/assets/draft-manager";
import SmartMPPlugin from "src/main";
import { UrlUtils } from "src/utils/urls";
import { fetchImageBlob } from "src/utils/utils";
import { WechatClient } from "src/wechat-api/wechat-client";
import { MaterialMeidaItem } from "src/wechat-api/wechat-types";
import { ImageGenerateModal } from "../modals/image-generate-modal";
import { ResourceManager } from "src/assets/resource-manager";
import { TitleSuggestModal } from "src/modals/title-suggest-modal";
import Logger from "src/utils/logger";

import { $t } from "src/lang/i18n";

export class MPArticleHeader {
	updateDraftDraftId(media_id: string) {
		if (this.activeLocalDraft !== undefined) {
			this.activeLocalDraft.last_draft_id = media_id;
		}
	}

	private plugin: SmartMPPlugin;
	private cover_image: string | null;
	private coverFrame: HTMLElement;
	private activeLocalDraft: LocalDraftItem | undefined;
	private localDraftmanager: LocalDraftManager;
	private _title: TextComponent;
	private _author: TextComponent;
	private _digest: HTMLTextAreaElement;
	private _digestCounter: HTMLElement;
	private _needOpenComment: ToggleComponent;
	private _onlyFansCanComment: ToggleComponent;
	private imageGenerateModal: ImageGenerateModal | undefined;
	constructor(plugin: SmartMPPlugin, containerEl: HTMLElement) {
		this.plugin = plugin;
		this.localDraftmanager = LocalDraftManager.getInstance(plugin);
		this.BuildUI(containerEl);
		this.plugin.messageService.registerListener(
			"wechat-account-changed",
			(data: string) => {
				void this.updateLocalDraft();
			}
		);

		this.plugin.messageService.registerListener(
			"active-file-changed",
			(data: string) => {
				void this.updateLocalDraft();
			}
		);
		this.plugin.messageService.registerListener(
			"set-draft-cover-image",
			(url: string) => {
				this.cover_image = url;
				this.setCoverImage(url);
				if (this.activeLocalDraft) {
					this.activeLocalDraft.thumb_media_id = undefined;
					void this.localDraftmanager.setDraft(this.activeLocalDraft);
				}
			}
		);
		this.plugin.messageService.registerListener(
			"set-image-as-cover",
			(item: MaterialMeidaItem) => {
				this.cover_image = item.url;
				this.setCoverImage(item.url);
				if (this.activeLocalDraft) {
					this.activeLocalDraft.thumb_media_id = item.media_id;
					void this.localDraftmanager.setDraft(this.activeLocalDraft);
				}
			}
		);

		this.imageGenerateModal = new ImageGenerateModal(
			this.plugin,
			(url: string) => {
				//save it to local folder.
				void ResourceManager.getInstance(this.plugin).saveImageFromUrl(url);
				this.cover_image = url;
				this.setCoverImage(url);
				if (this.activeLocalDraft) {
					this.activeLocalDraft.thumb_media_id = undefined;
					this.activeLocalDraft.cover_image_url = url;
					void this.localDraftmanager.setDraft(this.activeLocalDraft);
				}
			}
		);
		void this.updateLocalDraft();
	}

	onNoteRename(file: TFile) {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (activeFile === undefined || file !== activeFile) {
			return;
		}

		if (this.activeLocalDraft !== undefined) {
			this.activeLocalDraft.notePath = file.path;
			const dm = LocalDraftManager.getInstance(this.plugin);
			void dm.setDraft(this.activeLocalDraft);
		}
	}

	public getActiveLocalDraft() {
		return this.activeLocalDraft;
	}
	private BuildUI(containerEl: HTMLElement) {
		const container = containerEl.createEl("div", {
			cls: "smart-mp-article-header",
		});
		const details = container.createEl("details");
		details.createEl("summary", { text: $t("views.article-header.title"), cls: "smart-mp-draft-header" });

		new Setting(details)
			.setName($t("views.article-header.article-title"))
			.addExtraButton((button) => {
				button
					.setIcon("sparkles")
					.setTooltip("AI 标题推荐")
					.onClick(async () => {
						await this.generateTitleRecommendation();
					});
			})
			.addText((text) => {
				this._title = text;
				text.setPlaceholder(
					$t("views.article-header.article-title-placeholder")
				).onChange((value) => {
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.title = value;
						void this.localDraftmanager.setDraft(this.activeLocalDraft);
						this.plugin.messageService.sendMessage(
							"draft-title-updated",
							value
						);
						void this.updateFrontmatterTitle(value);
					}
				});
			});
		new Setting(details)
			.setName($t("views.article-header.author"))
			.addText((text) => {
				this._author = text;
				text.setPlaceholder(
					$t("views.article-header.author-name")
				).onChange((value) => {
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.author = value;
						void this.localDraftmanager.setDraft(this.activeLocalDraft);
					}
				});
			});

		new Setting(details)
			.setName($t("views.article-header.digest"))
			.addExtraButton((button) => {
				button
					.setIcon("sparkles")
					.setTooltip(
						$t("views.article-header.generate-digest-by-ai")
					)
					.onClick(() => {
						void this.generateDigest();
					});
			});

		// [UI] Add digest length counter
		this._digestCounter = details.createEl("div", {
			cls: "smart-mp-digest-counter",
			attr: { style: "text-align: right; font-size: 12px; color: var(--text-muted); margin-bottom: 4px;" }
		});

		this._digest = details.createEl("textarea", {
			cls: "digest",
			attr: {
				rows: 3,
				placeholder: $t("views.article-header.digest-text"),
				maxlength: "120", // Limit to 120 chars
			},
		});

		this._digest.onkeyup = (event: KeyboardEvent) => {
			const target = event.target as HTMLTextAreaElement;

			// Force truncate if somehow exceeds
			if (target.value.length > 120) {
				target.value = target.value.substring(0, 120);
				new Notice($t("notice.article.digest-truncated") ?? "描述最多 120 个字符，已自动截断", 2000);
			}

			this.updateDigestCounter();

			if (this.activeLocalDraft !== undefined) {
				this.activeLocalDraft.digest = target.value;
				void this.localDraftmanager.setDraft(this.activeLocalDraft);
			}
		};
		this._digest.onchange = (event: Event) => {
			const target = event.target as HTMLTextAreaElement;
			this.updateDigestCounter(); // Ensure counter is updated on change/paste
			void this.updateFrontmatterDigest(target.value);
		};

		// Initialize counter
		// We need to wait until value is set (updateHeaderProperties will set it) or set initial
		this.updateDigestCounter();

		this.coverFrame = this.createCoverFrame(details);

		new Setting(details)
			.setName($t("views.article-header.open-comments"))
			.setDesc($t("views.article-header.comments-description"))
			.addToggle((toggle) => {
				this._needOpenComment = toggle;
				toggle.setValue(true);
				toggle.onChange((value) => {
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.need_open_comment = value ? 1 : 0;
						void this.localDraftmanager.setDraft(this.activeLocalDraft);
					}
				});
			});
		new Setting(details)
			.setName($t("views.article-header.only-fans-can-comment"))
			.setDesc($t("views.article-header.only-fans-can-comment-description"))
			.addToggle((toggle) => {
				this._onlyFansCanComment = toggle;
				toggle.setValue(false);
				toggle.onChange((value) => {
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.only_fans_can_comment = value
							? 1
							: 0;
						void this.localDraftmanager.setDraft(this.activeLocalDraft);
					}
				});
			});
	}

	async generateDigest() {
		if (!this.plugin.aiClient) {
			new Notice($t("ai.no-llm"));
			return;
		}
		if (this.activeLocalDraft === undefined) {
			new Notice($t("views.article-header.no-active-note"));
			return;
		}
		if (this.activeLocalDraft.notePath === undefined) {
			new Notice($t("views.article-header.no-active-note"));
			return;
		}
		this.plugin.showSpinner($t("views.article-header.generating-digest"));
		const md = await this.plugin.app.vault.adapter.read(
			this.activeLocalDraft.notePath
		);
		const summary = await this.plugin.aiClient?.generateSummary(md);
		if (summary) {
			this._digest.value = summary;
			this.activeLocalDraft.digest = summary;
			void this.localDraftmanager.setDraft(this.activeLocalDraft);
			void this.updateFrontmatterDigest(summary);
		}
		this.plugin.hideSpinner();
	}


	async updateFrontmatterTitle(content: string) {
		if (!this.activeLocalDraft?.notePath) return;
		const file = this.plugin.app.vault.getAbstractFileByPath(this.activeLocalDraft.notePath);
		if (file instanceof TFile) {
			try {
				await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					if (frontmatter['title'] !== undefined) {
						frontmatter['title'] = content;
					} else {
						frontmatter['标题'] = content;
					}
				});
			} catch (e) {
				Logger.error("MPArticleHeader", "Failed to update frontmatter title", e);
			}
		}
	}

	async generateTitleRecommendation() {
		if (!this.plugin.aiClient) {
			new Notice($t("ai.no-llm"));
			return;
		}
		if (this.activeLocalDraft?.notePath === undefined) {
			new Notice($t("views.article-header.no-active-note"));
			return;
		}

		this.plugin.showSpinner("正在生成爆款标题...");
		try {
			const md = await this.plugin.app.vault.adapter.read(this.activeLocalDraft.notePath);
			const titles = await this.plugin.aiClient.generateTitle(md);

			if (titles && titles.length > 0) {
				new TitleSuggestModal(this.plugin.app, titles, this._title.getValue(), (selectedTitle: string) => {
					this._title.setValue(selectedTitle);
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.title = selectedTitle;
						void this.localDraftmanager.setDraft(this.activeLocalDraft);
						this.plugin.messageService.sendMessage("draft-title-updated", selectedTitle);
						void this.updateFrontmatterTitle(selectedTitle);
					}
				}, async (titles: string[]) => {
					// onSave callback - 保存到 frontmatter 而非正文
					if (this.activeLocalDraft?.notePath) {
						const file = this.plugin.app.vault.getAbstractFileByPath(this.activeLocalDraft.notePath);
						if (file instanceof TFile) {
							try {
								await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
									frontmatter['推荐标题'] = titles;
								});
								new Notice($t("notice.article.titles-saved") ?? "已保存所有候选标题到笔记属性");
							} catch (e) {
								Logger.error("MPArticleHeader", "Failed to save titles to frontmatter", e);
								new Notice($t("notice.article.save-title-failed") ?? "保存标题失败");
							}
						}
					}
				}).open();
			} else {
				new Notice($t("notice.article.generate-title-failed") ?? "未能生成有效标题，请重试");
			}
		} catch (e) {
			Logger.error("MPArticleHeader", "Failed to generate title recommendation", e);
			new Notice($t("notice.main.generate-title-failed") ?? "生成标题失败");
		} finally {
			this.plugin.hideSpinner();
		}
	}

	async updateFrontmatterDigest(content: string) {
		if (!this.activeLocalDraft?.notePath) return;
		const file = this.plugin.app.vault.getAbstractFileByPath(this.activeLocalDraft.notePath);
		if (file instanceof TFile) {
			try {
				await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// Check which key exists, prioritise updating existing key
					if (frontmatter['digest'] !== undefined) {
						frontmatter['digest'] = content;
					} else {
						// Default to '摘要' if neither exists or '摘要' exists
						frontmatter['摘要'] = content;
					}
				});
			} catch (e) {
				Logger.error("MPArticleHeader", "Failed to update frontmatter digest", e);
			}
		}
	}
	private createCoverFrame(details: HTMLElement) {
		new Setting(details)
			.setName($t("views.article-header.cover-image"))
			.setDesc($t("views.article-header.cover-image-description"))
			.addExtraButton((button) =>
				button
					.setIcon("sparkles")
					.setTooltip(
						$t("views.article-header.generate-cover-image-by-ai")
					)
					.onClick(() => {
						if (this.imageGenerateModal === undefined) {
							return;
						}
						if (this._digest.value !== undefined && this._digest.value) {
							const prompt = this._digest.value.trim()
							if (prompt) {
								this.imageGenerateModal.prompt = prompt;
							}
						}
						this.imageGenerateModal.open();
					})
			);
		const container = details.createDiv({ cls: "cover-container" });
		const coverframe = container.createDiv({
			cls: "cover-frame",
			attr: { droppable: true },
		});

		coverframe.ondragenter = (e) => {
			e.preventDefault();
			coverframe.addClass("image-on-dragover");
		};
		coverframe.ondragleave = (e) => {
			e.preventDefault();
			coverframe.removeClass("image-on-dragover");
		};
		coverframe.ondragover = (e) => {
			e.preventDefault();
		};
		coverframe.addEventListener("drop", (e) => {
			e.preventDefault();
			void (async () => {
				const url = e.dataTransfer?.getData("text/uri-list");
				if (url) {
					if (url.startsWith("obsidian://")) {
						//image from vault

						const urlParser = new UrlUtils(this.plugin.app);

						const appurl = await urlParser.getInternalLinkDisplayUrl(
							url
						);
						this.cover_image = appurl;
					} else if (url.startsWith("http") || url.startsWith("https")) {
						this.cover_image = url;
						const media_id = await this.getCoverImageMediaId(url);
						if (media_id) {
							coverframe.setAttr("data-media_id", media_id);
						}
						if (this.activeLocalDraft !== undefined) {
							this.activeLocalDraft.thumb_media_id = media_id;
						}
					} else if (url.startsWith("file://")) {
						//image from local file
						const filePath = url.replace("file://", "");
						const file = await this.plugin.app.vault.adapter.readBinary(
							filePath
						);
						const base64 = arrayBufferToBase64(file);
						this.cover_image = `data:image/png;base64,${base64}`;
					} else {
						this.cover_image = "";
						this.setCoverImageXY();
					}
					if (this.activeLocalDraft !== undefined) {
						this.activeLocalDraft.cover_image_url = this.cover_image ?? undefined;
					}
					if (this.activeLocalDraft) {
						void this.localDraftmanager.setDraft(this.activeLocalDraft);
					}
					this.setCoverImage(this.cover_image);
				}
				coverframe.removeClass("image-on-dragover");
			})();
		});

		return coverframe;
	}

	setCoverImage(url: string | null) {
		while (this.coverFrame.firstChild) {
			this.coverFrame.firstChild.remove();
		}
		if (!url) {
			return;
		}

		const img = new Image();
		img.src = url;

		img.onload = () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d")!;

			canvas.width = 900;
			canvas.height = 383;

			let scale = Math.max(900 / img.width, 383 / img.height);
			let offsetX = 0; //(canvas.width - img.width * scale) / 2;
			let offsetY = 0; // (canvas.height - img.height * scale) / 2;

			ctx.drawImage(
				img,
				offsetX,
				offsetY,
				img.width * scale,
				img.height * scale
			);



			this.coverFrame.appendChild(canvas);
		};
	}
	updateCoverImage() {
		if (this.imageGenerateModal === undefined) {
			return;
		}
		if (this._digest.value !== undefined && this._digest.value) {
			const prompt = this._digest.value.trim()
			if (prompt) {
				this.imageGenerateModal.prompt = prompt;
			}
		}
		this.imageGenerateModal.open();
	}
	resetImage() {
		this.setCoverImageXY(0, 0);
	}

	async checkCoverImage() {
		if (this.activeLocalDraft !== undefined) {
			if (
				this.activeLocalDraft.thumb_media_id === undefined ||
				!this.activeLocalDraft.thumb_media_id
			) {
				if (this.cover_image) {
					const media_id = await this.getCoverImageMediaId(
						this.cover_image,
						true
					);
					this.activeLocalDraft.thumb_media_id = media_id;
					return true;
				}
			} else {
				return true;
			}
		}
		return false;
	}
	async getCoverImageMediaId(url: string, upload: boolean = false) {
		let _media_id = this.plugin.findImageMediaId(url);
		if (_media_id === undefined && upload) {
			const blob = await fetchImageBlob(url);
			if (blob === undefined || !blob) {
				return;
			}

			const res = await WechatClient.getInstance(this.plugin).uploadMaterial(
				blob,
				"banner-cover.png",
				"image"
			);

			if (res) {
				const { errcode, media_id } = res;

				if (errcode !== 0) {
					new Notice(
						$t("views.article-header.upload-cover-image-error")
					);
					return;
				} else {
					_media_id = media_id;
				}
			}
		}
		return _media_id;
	}
	private setCoverImageXY(x: number = 0, y: number = 0) {
		this.setCoverImage(this.cover_image);
	}

	private updateDigestCounter() {
		if (!this._digest || !this._digestCounter) return;

		const currentLength = this._digest.value.length;
		this._digestCounter.textContent = `${currentLength} / 120`;

		// 清除所有状态类
		this._digestCounter.removeClass('smart-mp-text-error', 'smart-mp-text-warning', 'smart-mp-text-muted');
		this._digest.removeClass('smart-mp-border-error', 'smart-mp-border-warning');

		if (currentLength > 120) {
			this._digestCounter.addClass('smart-mp-text-error');
			this._digest.addClass('smart-mp-border-error');
		} else if (currentLength > 100) {
			this._digestCounter.addClass('smart-mp-text-warning');
			this._digest.addClass('smart-mp-border-warning');
		} else {
			this._digestCounter.addClass('smart-mp-text-muted');
		}
	}

	async updateLocalDraft() {
		this.activeLocalDraft =
			await this.localDraftmanager.getDrafOfActiveNote();
		this.updateHeaderProporties();
		return true;
	}

	updateHeaderProporties() {
		let x = 0;
		let y = 0;
		if (this.activeLocalDraft !== undefined) {
			this._title.setValue(this.activeLocalDraft.title);
			this._author.setValue(this.activeLocalDraft.author || "");
			this._digest.value = this.activeLocalDraft.digest || "";
			this._needOpenComment.setValue(
				(this.activeLocalDraft.need_open_comment || 1) > 0
			);
			this._onlyFansCanComment.setValue(
				(this.activeLocalDraft.only_fans_can_comment || 0) > 0
			);
			this.cover_image = this.activeLocalDraft.cover_image_url || "";
			const [xStr, yStr] = this.activeLocalDraft.pic_crop_235_1?.split(" ") ?? [];
			x = xStr ? Number(xStr) : 0;
			y = yStr ? Number(yStr) : 0;
		} else {
			this._title.setValue("");
			this._author.setValue("");
			this._digest.value = "";
			this._needOpenComment.setValue(false);
			this._onlyFansCanComment.setValue(false);
			this.cover_image = "";
		}


		this.setCoverImageXY(Number(x), Number(y));
		this.plugin.messageService.sendMessage(
			"draft-title-updated",
			this._title.getValue()
		);
		// Update digest counter if exists
		this.updateDigestCounter();
	}
}
