
import { App } from "obsidian";
import SmartMPPlugin from "src/main";

export abstract class SettingSection {
    constructor(
        protected app: App,
        protected plugin: SmartMPPlugin,
        protected container: HTMLElement
    ) { }

    abstract render(): void;

    /**
     * Helper to create a collapsible details frame
     */
    protected createCollapsibleFrame(title: string, isOpen: boolean = false, groupName: string = 'ww-main-sections', className: string = 'smart-mp-setting-frame', parent?: HTMLElement): HTMLElement {
        const targetContainer = parent || this.container;
        const details = targetContainer.createEl('details', { cls: className });
        if (groupName) details.setAttribute('name', groupName);

        // Check if previously expanded (could use a shared state manager or pass in extendedSections set)
        // For now, simple attribute check or default
        if (isOpen) {
            details.setAttribute('open', '');
        }

        const summary = details.createEl('summary');
        summary.style.outline = 'none';
        summary.style.fontWeight = 'bold';
        summary.style.fontSize = '1.1em';
        summary.setText(title);

        const content = details.createDiv();
        return content;
    }
}
