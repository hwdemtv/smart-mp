/**
 * Support for WeChat MP Account selection
 */
import { DropdownComponent, Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";

export class WeChatMPAccountSwitcher extends Setting {
    private plugin: SmartMPPlugin;
    private accountDropdown: DropdownComponent;
    constructor(plugin: SmartMPPlugin, containerEl: HTMLElement) {
        super(containerEl);
        this.plugin = plugin;
        this.setName($t('settings.select-wechat-mp-account'))
        .addDropdown((dropdown) => {
            this.accountDropdown = dropdown
            this.plugin.settings.mpAccounts.forEach(account => {
                dropdown.addOption(account.accountName, account.accountName)
            })
            dropdown.setValue(this.plugin.settings.selectedMPAccount ?? $t('settings.select-wechat-mp-account'))
						.onChange((value) => {
							// this.plugin.onWeChantMPAccountChange(value)
                            this.plugin.messageService.sendMessage('wechat-account-changed', value)
                            void this.plugin.saveSettings()
						});
        }).addExtraButton((button) => {
            button.setIcon('cloud-download')
            .setTooltip($t('settings.refresh-all-material-from-remote'))
            .onClick(() => {
                this.plugin.pullAllWeChatMPMaterial();
            })
        }
        )
    }
}
