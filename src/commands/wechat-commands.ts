/**
 * WeChat-related commands for SmartMP plugin
 */

import { Notice } from 'obsidian';
import { CommandDefinition } from './types';
import SmartMPPlugin from 'src/main';
import { $t } from 'src/lang/i18n';

/**
 * WeChat command definitions
 * These commands interact with WeChat Official Account API
 */
export const WECHAT_COMMANDS: CommandDefinition[] = [
    {
        id: 'open-previewer',
        name: '打开预览面板',
        category: 'wechat',
        description: '打开微信公众号文章预览面板',
        create: (plugin: SmartMPPlugin) => ({
            id: 'open-previewer',
            name: $t("main.open-previewer") ?? '打开预览面板',
            callback: () => {
                void plugin.activateView();
            },
        }),
    },
    {
        id: 'open-material-view',
        name: '打开素材管理',
        category: 'wechat',
        description: '打开微信公众号素材管理面板',
        create: (plugin: SmartMPPlugin) => ({
            id: 'open-material-view',
            name: $t("main.open-material-view") ?? '打开素材管理',
            callback: () => {
                void plugin.activateMaterialView();
            },
        }),
    },
    {
        id: 'toggle-scroll-sync',
        name: '切换滚动同步',
        category: 'wechat',
        description: '切换编辑器和预览的滚动同步',
        create: (plugin: SmartMPPlugin) => ({
            id: 'toggle-scroll-sync',
            name: $t("main.toggle-scroll-sync") ?? '切换滚动同步',
            callback: () => {
                // This is handled in PreviewPanel, so we just toggle the setting
                plugin.settings.scrollSync = !plugin.settings.scrollSync;
                new Notice(plugin.settings.scrollSync ? "滚动同步已开启" : "滚动同步已关闭");
                void plugin.saveSettings();
            },
        }),
    },
];

/**
 * Register WeChat commands to the registry
 */
export function registerWeChatCommands(plugin: SmartMPPlugin): void {
    const { CommandRegistry } = require('./types');
    CommandRegistry.getInstance(plugin).registerAll(WECHAT_COMMANDS);
}
