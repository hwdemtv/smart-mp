/**
 * Assets Manager
 *
 * - manages the assets for WeChat MP platform, including:
 *  - thumbnails from WeChat
 *  - images, videos, audios, etc from WeChat.
 *  - local meida and images
 *  - icons
 *  - svgs
 *  - excalidraw
 *  - mermaid
 *  - admonitions
 *  - LaTeX
 *
 *
 * - tracking the mapping between local and remote assets
 * - sync the assets with remote, upload.
 * - for replacing links during markdown rendering
 */

import { App, Notice, debounce, sanitizeHTMLToDom } from "obsidian";
import SmartMPPlugin from "src/main";
import { areObjectsEqual } from "src/utils/utils";
import Logger from "src/utils/logger";
import { getErrorMessage } from "src/wechat-api/error-code";
import { ConfirmDeleteModal } from "src/modals/confirm-delete-modal";
import { ConfirmPublishModal } from "src/modals/confirm-publish-modal";
import { DraftItem, MaterialItem, MaterialMeidaItem, MaterialNewsItem, MediaType, NewsItem } from "src/wechat-api/wechat-types";
import { $t } from "src/lang/i18n";
export const MediaTypeLable = new Map([
    ['image', $t('assets.image')],
    ['voice', $t('assets.voice')],
    ['video', $t('assets.video')],
    ['news', $t('assets.news')],
    ['draft', $t('assets.draft')]
]);

const MAX_COUNT = 20;
export class AssetsManager {
    app: App;
    assets: Map<string, MaterialItem[]>
    /** In-memory store keyed by _id (media_id) */
    private itemStore: Map<string, MaterialItem> = new Map();
    private dirty = false;
    used: Map<string, string[]>
    confirmPublishModal: ConfirmPublishModal;
    confirmDeleteModal: ConfirmDeleteModal;


    private static instance: AssetsManager;
    private plugin: SmartMPPlugin;
    private constructor(app: App, plugin: SmartMPPlugin) {
        this.app = app;
        this.plugin = plugin;
        this.assets = new Map();
        this.used = new Map();
        this.loadFromDisk();

        this.plugin.messageService.registerListener('wechat-account-changed', (data: string) => {
            void this.loadMaterial(data);
        });
        this.plugin.messageService.registerListener('delete-media-item', (item: MaterialItem) => {
            this.confirmDelete(item);
        });
        this.plugin.messageService.registerListener('delete-draft-item', (item: MaterialItem) => {
            this.confirmDelete(item);
        });
        this.plugin.messageService.registerListener('image-item-updated', (item: MaterialItem) => {
            this.addImageItem(item);
        });
        this.plugin.messageService.registerListener('draft-item-updated', (item: MaterialItem) => {
            this.addImageItem(item);
        });
        this.plugin.messageService.registerListener('publish-draft-item', (item: DraftItem) => {
            this.confirmPublish(item);
        });
        this.plugin.messageService.registerListener('delete-media-item', (item: MaterialItem) => {
            this.confirmDelete(item);
        });

    }

    private async loadFromDisk(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            const raw = data?.['wechat-assets'] || {};
            this.itemStore = new Map(Object.entries(raw));
        } catch (e) {
            Logger.warn('AssetsManager', 'Failed to load assets from disk', e);
        }
    }

    private persistDebounced = debounce(async () => {
        if (!this.dirty) return;
        this.dirty = false;
        try {
            const data = (await this.plugin.loadData()) || {};
            data['wechat-assets'] = Object.fromEntries(this.itemStore);
            await this.plugin.saveData(data);
        } catch (e) {
            Logger.error('AssetsManager', 'Failed to save assets', e);
        }
    }, 3000);

    private markDirty(): void {
        this.dirty = true;
        this.persistDebounced();
    }

    addImageItem(item: MaterialItem) {
        this.assets.get('image')?.push(item)
    }
    addDraftItem(item: MaterialItem) {
        this.assets.get('draft')?.push(item)
        this.scanDraftNewsUsedImages()
    }
    public static getInstance(app: App, plugin: SmartMPPlugin): AssetsManager {
        if (!AssetsManager.instance) {
            AssetsManager.instance = new AssetsManager(app, plugin);
        }
        return AssetsManager.instance;
    }

    public static onPluginUnload() {
        this.instance = undefined as any;
    }

    private isNewsLikeItem(item: MaterialItem): item is MaterialNewsItem | DraftItem {
        return "content" in item;
    }

    private isMediaItem(item: MaterialItem): item is MaterialMeidaItem {
        return "url" in item && "used" in item;
    }

    public async loadMaterial(accountName: string) {
        const types: MediaType[] = [
            'draft', 'image', 'video', 'voice', 'news'
        ];
        for (const type of types) {
            this.plugin.messageService.sendMessage(`clear-${type}-list`, null)
            const list = this.getAllMeterialOfTypeFromDB(accountName, type)
            this.assets.set(type, list)
            list.forEach(item => {
                this.plugin.messageService.sendMessage(`${type}-item-updated`, item)
            });
        }
        this.scanDraftNewsUsedImages()
    }
    public async pullAllMaterial(accountName: string) {
        const json = await this.plugin.wechatClient.getMaterialCounts(accountName)

        const types: MediaType[] = [
            'draft', 'image', 'video', 'voice', 'news'
        ];
        for (const type of types) {
            this.plugin.messageService.sendMessage(`clear-${type}-list`, null)
            void this.getAllMaterialOfType(type, (item) => { this.plugin.messageService.sendMessage(`${type}-item-updated`, item) }, accountName)
        }
        this.plugin.assetsUpdated()
    }

    public async getAllNews(callback: (newsItems: MaterialNewsItem) => void, accountName: string | undefined) {
        const list = []
        let offset = 0;
        let total = MAX_COUNT;
        while (offset < total) {
            const res = await this.plugin.wechatClient.getBatchMaterial(accountName, 'news', offset, MAX_COUNT);
            if (!res) break;
            const { item, total_count, item_count } = res;
            list.push(...item);
            total = total_count
            offset += item_count;
        }
        this.assets.set('news', list)
        list.forEach((item: MaterialNewsItem) => {
            item.accountName = accountName
            item.type = 'news'

            this.pushMaterailToDB(item)
            if (callback) {
                callback(item)
            }
        })
        this.scanDraftNewsUsedImages()
    }
    public async getAllDrafts(callback: (newsItem: DraftItem) => void, accountName: string | undefined) {
        const draftList = []
        let offset = 0;
        let total = MAX_COUNT;
        while (offset < total) {
            const res = await this.plugin.wechatClient.getBatchDraftList(accountName, offset, MAX_COUNT);
            if (!res) break;
            const { item, total_count, item_count } = res;
            draftList.push(...item);
            total = total_count
            offset += item_count;
        }
        draftList.sort((a, b) => {
            return b.update_time - a.update_time
        })
        this.assets.set('draft', draftList)
        this.removeMediaItemsFromDB('draft')
        draftList.forEach((i: DraftItem) => {
            i.accountName = accountName
            i.type = 'draft'
            if (callback) {
                callback(i)
            }
            this.pushMaterailToDB(i)
        })
        this.scanDraftNewsUsedImages()
    }
    public async getAllMaterialOfType(type: MediaType, callback: (item: MaterialItem) => void, accountName: string | undefined) {
        if (type === 'news') {
            return this.getAllNews(callback, accountName);
        }
        if (type === 'draft') {
            return this.getAllDrafts(callback, accountName);
        }
        const list = []
        let offset = 0;
        let total = MAX_COUNT;
        while (offset < total) {
            const res = await this.plugin.wechatClient.getBatchMaterial(accountName, type, offset, MAX_COUNT);
            if (!res) break;
            const { item, total_count, item_count } = res;
            list.push(...item);
            total = total_count
            offset += item_count;
        }
        list.sort((a, b) => {
            return b.update_time - a.update_time
        })

        this.assets.set(type, list)
        this.removeMediaItemsFromDB(type)
        list.forEach((item: MaterialItem) => {
            item.accountName = accountName
            item.type = type
            if (callback) {
                callback(item)
            }
            this.pushMaterailToDB(item)
        })
    }
    public getImageUsedUrl(imgItem: MaterialMeidaItem): string[] | null {

        let urls = null
        if (imgItem.url !== undefined && imgItem.url) {
            const urlUrls = this.used.get(imgItem.url)
            if (urlUrls !== undefined) {
                urls = urlUrls
            }
        }
        if (imgItem.media_id !== undefined && imgItem.media_id) {
            const idUrls = this.used.get(imgItem.media_id)
            if (idUrls !== undefined) {
                if (urls === null) {
                    urls = idUrls
                } else {
                    urls = urls.concat(idUrls)
                }
            }
        }
        return urls
    }
    public scanUsedImage(type: MediaType) {

        // Process news items
        const newsItems = this.assets.get(type) || [];
        newsItems.filter((item) => this.isNewsLikeItem(item)).forEach((news) => {
            news.content.news_item.forEach((item: NewsItem) => {
                if (item.thumb_media_id) {
                    this.setUsed(item.thumb_media_id, item.url);
                }
                this.scanUsedImageInContent(item.content, item.url)
            });
        });
    }
    public scanDraftNewsUsedImages() {
        // Clear existing used media map
        this.used.clear();
        this.scanUsedImage('draft')
        this.scanUsedImage('news')
    }
    public setUsed(media_id: string, url: string) {
        let v = this.used.get(media_id)
        if (v === undefined) {
            v = []
        }
        v.push(url)
        this.used.set(media_id, v)
    }
    public unUsed(media_id: string, url: string) {
        let v = this.used.get(media_id)
        if (v === undefined) {
            return
        }
        v = v.filter(i => i !== url)
        this.used.set(media_id, v)
    }
    public updateUsed(url: string) {
        Array.from(this.used.entries()).forEach(([media_id, urls]) => {
            urls = urls.filter(i => i !== url)
            this.used.set(media_id, urls)
        });
    }
    public scanUsedImageInContent(content: string, url: string) {

        const dom = sanitizeHTMLToDom(content)
        const imgs = dom.querySelectorAll('img')
        imgs.forEach(img => {
            const data_src = img.getAttribute('data-src')

            if (data_src !== null) {
                this.setUsed(data_src, url)
            }
        })
    }

    fetchAllMeterialOfTypeFromDB(accountName: string, type: MediaType): MaterialItem[] {
        return Array.from(this.itemStore.values()).filter(
            item => item.accountName === accountName && item.type === type
        );
    }
    pushMaterailToDB(doc: MaterialItem): void {
        if (!doc._id) {
            doc._id = doc.media_id;
        }

        const existing = this.itemStore.get(doc._id);
        if (existing && areObjectsEqual(doc, existing)) {
            return; // unchanged
        }

        this.itemStore.set(doc._id, { ...doc });
        this.markDirty();
    }
    AllMeterialOfTypeFromDB(media_id: string): MaterialItem[] {
        // Note: original code had a typo (mediea_id) — fixed to media_id
        return Array.from(this.itemStore.values()).filter(
            item => item.media_id === media_id
        );
    }
    getAllMeterialOfTypeFromDB(accountName: string, type: string): MaterialItem[] {
        if (!accountName) return [];
        const items = Array.from(this.itemStore.values()).filter(
            item => item.accountName === accountName && item.type === type
        );
        items.sort((a, b) => b.update_time - a.update_time);
        return items;
    }
    findUrlOfMediaId(type: MediaType, media_id: string) {
        const list = this.assets.get(type)
        if (list !== undefined) {
            const m = list
                .filter((item) => this.isMediaItem(item))
                .find((item) => item.media_id === media_id)

            if (m !== undefined) {
                return m.url
            }
        }
    }
    findMediaIdOfUrl(type: MediaType, url: string) {
        const list = this.assets.get(type)
        if (list !== undefined) {
            const m = list
                .filter((item) => this.isMediaItem(item))
                .find((item) => item.url === url)

            if (m !== undefined) {
                return m.media_id
            }
        }
    }

    getMaterialPanels(): MaterialPanelItem[] {
        const panels: MaterialPanelItem[] = [];

        // Get all material types and map to panel items
        const types: MediaType[] = [
            'draft', 'image', 'video', 'voice', 'news'
        ];
        types.forEach(type => {
            panels.push({
                name: MediaTypeLable.get(type)!,
                type: type,
                timestamp: Date.now(),
                url: ''
            });
        });

        return panels;
    }
    removeMediaItemsFromDB(type: MediaType) {
        const accountName = this.plugin.settings.selectedMPAccount;
        let changed = false;
        for (const [id, item] of this.itemStore) {
            if (item.accountName === accountName && item.type === type) {
                this.itemStore.delete(id);
                changed = true;
            }
        }
        if (changed) this.markDirty();
    }
    public async deleteMediaItem(item: MaterialMeidaItem) {
        const type = item.type
        if (type === undefined) {
            Logger.error('AssetsManager', 'deleteMediaItem type is undefined', item)
            return;
        }
        if (!await this.plugin.wechatClient.deleteMedia(item.media_id)) {
            Logger.error('AssetsManager', 'delete media failed', item)
            return false;
        }
        this.removeDocFromDB(item._id!)
        this.plugin.messageService.sendMessage(`${type}-item-deleted`, item)
        this.updateUsed(item.url)
        return true
    }
    public async deleteDraftItem(item: DraftItem) {
        if (!await this.plugin.wechatClient.deleteDraft(item.media_id)) {
            Logger.error('AssetsManager', 'delete draft failed', item)
            return false;
        }
        this.removeDocFromDB(item._id!)
        this.plugin.messageService.sendMessage('draft-item-deleted', item)
        item.content.news_item.forEach((newsItem) => {
            if (newsItem.url) {
                this.updateUsed(newsItem.url);
            }
        });
        return true
    }
    public removeDocFromDB(_id: string) {
        if (this.itemStore.has(_id)) {
            this.itemStore.delete(_id);
            this.markDirty();
        }
    }
    confirmPublish(item: DraftItem) {
        if (this.confirmPublishModal === undefined) {
            this.confirmPublishModal = new ConfirmPublishModal(this.plugin, item)
        } else {
            this.confirmPublishModal.update(item)
        }
        this.confirmPublishModal.open()
    }
    confirmDelete(item: MaterialItem) {
        let callback = this.deleteMediaItem.bind(this)
        if (item.type === 'draft') {
            callback = this.deleteDraftItem.bind(this)
        }

        if (this.confirmDeleteModal === undefined) {
            this.confirmDeleteModal = new ConfirmDeleteModal(this.plugin, item, callback)

        } else {
            this.confirmDeleteModal.update(item, callback)
        }

        this.confirmDeleteModal.open()
    }
}

export interface MaterialPanelItem {
    name: string;
    type: MediaType;
    timestamp: number;
    url: string;
}
