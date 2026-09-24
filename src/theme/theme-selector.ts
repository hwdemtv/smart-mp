/**
 * Theme Selector
 */
import { DropdownComponent, EventRef, TFile } from "obsidian";
import SmartMPPlugin from "src/main";
import { ThemeManager } from "./theme-manager";
import { $t } from "src/lang/i18n";

export class ThemeSelector {
    private plugin: SmartMPPlugin;
    private _themeDropdown: DropdownComponent;
    private _themeManager: ThemeManager
    /** messageService 注销函数与 vault 事件引用，视图关闭时清理 */
    private disposers: (() => void)[] = [];
    private themeWatchRefs: EventRef[] = [];

    constructor(plugin: SmartMPPlugin) {
        this.plugin = plugin;
        this._themeManager = ThemeManager.getInstance(plugin)
		this.disposers.push(
			this.plugin.messageService.registerListener('custom-theme-folder-changed', () => {
				void this.updateThemeOptions()
			})
		)
    }
    public async dropdown(themDropdown: DropdownComponent) {
        this._themeDropdown = themDropdown;
        await this.updateThemeOptions()

        themDropdown.onChange((value) => {
            this.plugin.settings.custom_theme = value
            void this.plugin.saveSettings()
            this.plugin.messageService.sendMessage('custom-theme-changed', value)
        })
    }
    private async updateThemeOptions() {
        const themes = await this._themeManager.loadThemes()

        //clear all options
        this._themeDropdown.selectEl.length = 0
        this._themeDropdown.addOption('--default--', $t('views.theme-manager.default-theme'))
        themes.forEach(theme => {
            this._themeDropdown.addOption(theme.path, theme.name)
        })
        if (this.plugin.settings.custom_theme === undefined || !this.plugin.settings.custom_theme) {
            this._themeDropdown.setValue('--default--')
        } else {
            this._themeDropdown.setValue(this.plugin.settings.custom_theme)
        }

    }
    onThemeChange(file: TFile) {
        if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(this.plugin.settings.css_styles_folder)) {
            void this.updateThemeOptions()
        }
    }
    public startWatchThemes() {
        // [Fix] 保存 EventRef 供 stopWatchThemes 注销：此前用 plugin.registerEvent，
        // 每次打开预览视图都叠加 4 个 vault 监听器，视图关闭后回调仍操作已 detach 的下拉框
        this.stopWatchThemes();
        this.themeWatchRefs.push(
            this.plugin.app.vault.on('rename', (file: TFile) => {
                this.onThemeChange(file)
            }),
            this.plugin.app.vault.on('modify', (file: TFile) => {
                this.onThemeChange(file)
            }),
            this.plugin.app.vault.on('create', (file: TFile) => {
                this.onThemeChange(file)
            }),
            this.plugin.app.vault.on('delete', (file: TFile) => {
                this.onThemeChange(file)
            })
        );
    }

    public stopWatchThemes() {
        this.themeWatchRefs.forEach(ref => this.plugin.app.vault.offref(ref));
        this.themeWatchRefs = [];
    }

    /** 释放本组件注册的全部监听器（视图关闭时调用） */
    public destroy() {
        this.stopWatchThemes();
        this.disposers.forEach(d => d());
        this.disposers = [];
    }
}
