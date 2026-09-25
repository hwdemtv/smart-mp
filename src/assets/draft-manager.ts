/**
 * Draft Manager
 *
 * - manage the local parameters for WeChat Article rendering parameters
 * - support multi-account switch
 *
 */

import SmartMPPlugin from "src/main";
import { debounce } from "obsidian";
import { areObjectsEqual } from "src/utils/utils";
import Logger from "src/utils/logger";
import { $t } from "src/lang/i18n";
import { UrlUtils } from "src/utils/urls";



export type LocalDraftItem = {
    accountName?: string;
    notePath?: string; //obsidan file path for the note.
    theme?: string; // the theme selected for rendering. missing will use default theme.
    cover_image_url?: string; // the cover image url for the article. could be a obsidian file path or url
    _id?: string;
    _rev?: string;
    title: string;
    author?: string;
    digest?: string;
    content?: string;
    content_source_url?: string;
    thumb_media_id?: string;
    show_cover_pic?: number;
    need_open_comment?: number;
    only_fans_can_comment?: number;
    pic_crop_235_1?: string; //X1_Y1_X2_Y2, 用分隔符_拼接为X1_Y1_X2_Y2
    pic_crop_1_1?: string; //X1_Y1_X2_Y2, 用分隔符_拼接为X1_Y1_X2_Y2
    last_draft_url?: string; //	草稿的临时链接
    last_draft_id?: string; //

}

export class LocalDraftManager {
    private plugin: SmartMPPlugin;
    private drafts: Map<string, LocalDraftItem> = new Map();
    private dirty = false;
    private static instance: LocalDraftManager;

    private constructor(plugin: SmartMPPlugin) {
        this.plugin = plugin;
        this.loadFromDisk();
    }

    private async loadFromDisk(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            const raw = data?.['local-drafts'] || {};
            this.drafts = new Map(Object.entries(raw));
        } catch (e) {
            Logger.warn('DraftManager', 'Failed to load drafts from disk', e);
        }
    }

    private persistDebounced = debounce(async () => {
        if (!this.dirty) return;
        this.dirty = false;
        try {
            const data = (await this.plugin.loadData()) || {};
            data['local-drafts'] = Object.fromEntries(this.drafts);
            await this.plugin.saveData(data);
        } catch (e) {
            Logger.error('DraftManager', 'Failed to save drafts', e);
        }
    }, 3000);

    private markDirty(): void {
        this.dirty = true;
        this.persistDebounced();
    }

    public static getInstance(plugin: SmartMPPlugin): LocalDraftManager {
        if (!LocalDraftManager.instance) {
            LocalDraftManager.instance = new LocalDraftManager(plugin);
        }
        return LocalDraftManager.instance;
    }
    public async getDrafOfActiveNote() {
        let draft: LocalDraftItem | undefined

        const accountName = this.plugin.settings.selectedMPAccount;
        if (accountName !== undefined && accountName) {
            const f = this.plugin.app.workspace.getActiveFile()

            if (f) {
                draft = this.getDraft(accountName, f.path)

                // [Sync] Sync Frontmatter to Draft Properties
                const cache = this.plugin.app.metadataCache.getCache(f.path);
                const frontmatter = cache?.frontmatter;
                let needSave = false;

                // Initialize draft structure if new
                if (draft === undefined) {
                    draft = {
                        accountName: accountName,
                        notePath: f.path,
                        title: f.basename, // Default title
                        _id: accountName + f.path
                    }
                    // Will save later
                    needSave = true;
                }

                if (frontmatter) {
                    // 1. Title / 标题
                    // Prioritize '标题', then 'title', then fallback to existing draft title or basename
                    const fmTitle = frontmatter['标题'] || frontmatter['title'];
                    if (fmTitle && draft.title !== fmTitle) {
                        draft.title = fmTitle;
                        needSave = true;
                    }

                    // 2. Author / 作者
                    const fmAuthor = frontmatter['作者'] || frontmatter['author'];
                    if (fmAuthor && draft.author !== fmAuthor) {
                        draft.author = fmAuthor;
                        needSave = true;
                    }

                    // 3. Digest / 摘要
                    const fmDigest = frontmatter['摘要'] || frontmatter['digest'];
                    if (fmDigest && draft.digest !== fmDigest) {
                        draft.digest = fmDigest;
                        needSave = true;
                    }

                    // 4. Cover Check / 封面
                    const fmCover = frontmatter['封面'] || frontmatter['cover'] || frontmatter['cover_image'];
                    if (fmCover) {
                        let coverPath = fmCover;
                        // Handle [[wikilink]]
                        const wikiMatch = fmCover.match(/^\[\[(.*?)\]\]$/);
                        if (wikiMatch) {
                            coverPath = wikiMatch[1];
                            if (coverPath.includes('|')) coverPath = coverPath.split('|')[0];
                        }

                        // Resolve file
                        const file = this.plugin.app.metadataCache.getFirstLinkpathDest(coverPath, f.path);
                        if (file) {
                            const urlUtils = new UrlUtils(this.plugin.app);
                            try {
                                const displayUrl = await urlUtils.getDisplayUrl(file);
                                if (displayUrl && draft.cover_image_url !== displayUrl) {
                                    draft.cover_image_url = displayUrl;
                                    needSave = true;
                                }
                            } catch (e) {
                                Logger.error("DraftManager", "Failed to read cover image", e);
                            }
                        } else if (String(fmCover).startsWith("http")) {
                            // Remote URL
                            if (draft.cover_image_url !== fmCover) {
                                draft.cover_image_url = fmCover;
                                needSave = true;
                            }
                        }
                    }
                }

                // Ensure title is never empty
                if (!draft.title || draft.title.trim() === '') {
                    draft.title = f.basename;
                    needSave = true;
                }

                if (needSave) {
                    try {
                        this.setDraft(draft);
                    } catch (error) {
                        Logger.error('DraftManager', 'Failed to save draft', error);
                    }
                }
            }
        }
        return draft
    }
    public isActiveNoteDraft(draft: LocalDraftItem | undefined) {
        const activeFile = this.plugin.app.workspace.getActiveFile()
        if (draft === undefined && activeFile === null) {
            return true
        }
        if (draft !== undefined && activeFile) {
            return draft.notePath === activeFile.path
        }
        return false
    }
    public getDraft(accountName: string, notePath: string): LocalDraftItem | undefined {
        const key = accountName + notePath;
        return this.drafts.get(key);
    }

    public setDraft(doc: LocalDraftItem): boolean {
        if (!doc.accountName || !doc.notePath) {
            throw new Error($t('assets.invalid-draft'));
        }

        const key = doc._id || (doc.accountName + doc.notePath);
        doc._id = key;

        const existing = this.drafts.get(key);
        if (existing && areObjectsEqual(doc, existing)) {
            return true; // No changes
        }

        this.drafts.set(key, { ...doc });
        this.markDirty();
        return true;
    }
}
