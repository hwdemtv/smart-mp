/**
 * a dialog modal to confirm the publish action
 * 
*/

import { Modal, Notice } from 'obsidian';
import SmartMPPlugin from 'src/main';
import { DraftItem } from './../wechat-api/wechat-types';
import { $t } from 'src/lang/i18n';
import Logger from 'src/utils/logger';

export class ConfirmPublishModal extends Modal {
    plugin: SmartMPPlugin;
    media_id: string;
    title: string
    draftItem: DraftItem;
    constructor(plugin: SmartMPPlugin, draftItem: DraftItem) {
        super(plugin.app);
        this.plugin = plugin;
        this.draftItem = draftItem
    }

    update(item: DraftItem) {
        this.draftItem = item
    }
    onOpen() {
        const { contentEl, containerEl } = this;
        contentEl.addClass('confirm-pulbish-dialog-content')

        contentEl.createEl('h3', { text: $t('modals.publish.title') });
        const content = contentEl.createDiv({ cls: 'description' })
        content.createEl('p', { text: $t('modals.publish.message') });
        content.createEl('p', { text: $t('modals.publish.warning') });
        content.createEl('p', { text: $t('modals.caution') });
        
        const toolbar = contentEl.createDiv({ cls: 'confirm-pulbish-dialog-tool-bar' })
        const confirmButton = toolbar.createEl('button', { text: $t('modals.confirm'), cls: "danger-button" });
        const cancelButton = toolbar.createEl('button', { text: $t('modals.cancel') });

        confirmButton.addEventListener('click', () => {
            this.publish();
            this.close();
        });

        cancelButton.addEventListener('click', () => {
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
    publish() {
        const id = this.draftItem.media_id
        if (id !== undefined && id) {
            this.plugin.wechatClient.publishDraft(id)
                .then((publishId) => {
                    if (publishId) {
                        // [接线] 发布状态轮询：此前拿到 publish_id 即止，用户需自己去
                        // 后台确认结果。现在轮询 /freepublish/get，成功附正式链接
                        new Notice($t('modals.publish.success'));
                        void this.pollPublishStatus(String(publishId));
                    }
                })
                .catch((error: unknown) => {
                    Logger.error('ConfirmPublishModal.publish', "Publish failed:", error);
                    new Notice($t('modals.publish.failed'));
                })
        }
    }

    /**
     * 轮询发布状态：最多 6 次、每次间隔 5 秒。
     * publish_state: 0=成功 1=发布中 2/3=失败 4=被撤回
     */
    private async pollPublishStatus(publishId: string): Promise<void> {
        const MAX_POLLS = 6;
        const INTERVAL_MS = 5000;
        const account = this.plugin.settings.selectedMPAccount || '';
        for (let i = 0; i < MAX_POLLS; i++) {
            await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
            try {
                const res = await this.plugin.wechatClient.getPublishStatus(publishId, account);
                if (!res) continue; // 请求失败，继续下一轮
                const state = (res as any).publish_state;
                if (state === 0) {
                    // 成功：尝试读取正式链接
                    const article = (res as any).article_detail?.item?.[0]
                        ?? (res as any).article_url;
                    const url = article?.article_url || (res as any).article_url;
                    if (url) {
                        new Notice($t('modals.publish.status-success-url') ?? `发布成功！`, 6000);
                        window.open(url);
                    } else {
                        new Notice($t('modals.publish.status-success') ?? '发布成功！', 6000);
                    }
                    return;
                }
                if (state === 2 || state === 3) {
                    const failIdx = (res as any).fail_idx;
                    new Notice($t('modals.publish.status-failed') ?? `发布失败（第 ${failIdx ?? '?'} 篇未通过审核）`, 8000);
                    return;
                }
                // state 1（发布中）或 4：继续轮询
            } catch (e) {
                Logger.warn('ConfirmPublishModal', 'pollPublishStatus error', e);
            }
        }
        new Notice($t('modals.publish.status-pending') ?? '发布仍在审核中，请稍后在公众号后台查看结果', 6000);
    }
}
