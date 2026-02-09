import { TFile, Notice } from "obsidian";
import SmartMPPlugin from "src/main";
import { ThemeManager } from "./theme-manager";

export class ThemeHotReloader {
    private plugin: SmartMPPlugin;
    private reloadTimeout: number | undefined;

    constructor(plugin: SmartMPPlugin) {
        this.plugin = plugin;
    }

    startWatching() {
        const cssFolder = this.plugin.settings.css_styles_folder;
        // Watch for file modifications
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(cssFolder)) {
                    this.scheduleReload(file.path);
                }
            })
        );
        // Also watch for creations (e.g. duplicating a theme)
        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file) => {
                if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(cssFolder)) {
                    // For new files, update the dropdown too
                    this.plugin.messageService.sendMessage('custom-theme-folder-changed', null);
                }
            })
        );
        // Watch for deletions
        this.plugin.registerEvent(
            this.plugin.app.vault.on('delete', (file) => {
                if (file instanceof TFile && file.extension === 'md' && file.path.startsWith(cssFolder)) {
                    this.plugin.messageService.sendMessage('custom-theme-folder-changed', null);
                }
            })
        );
    }

    private scheduleReload(filePath: string) {
        // Debounce 300ms
        if (this.reloadTimeout) {
            window.clearTimeout(this.reloadTimeout);
        }

        this.reloadTimeout = window.setTimeout(() => {
            this.reload(filePath);
        }, 300);
    }

    private async reload(filePath: string) {
        // Only trigger if this key matches the currently active theme
        // Or simplified: if current theme is this file.
        const currentTheme = this.plugin.settings.custom_theme;
        if (currentTheme && currentTheme === filePath) {
            console.debug(`[HotReloader] Theme changed: ${filePath}, reloading...`);

            // Invalidate Manager State
            await ThemeManager.getInstance(this.plugin).reloadTheme();

            // Trigger Render
            this.plugin.messageService.sendMessage('theme-reloaded', null);

            // Optional: visual feedback
            // new Notice('Theme reloaded');
        }
    }

    stopWatching() {
        if (this.reloadTimeout) {
            window.clearTimeout(this.reloadTimeout);
        }
    }
}
