
import { Notice, Setting, DropdownComponent } from "obsidian";
import { SettingSection } from "./setting-section";
import { $t } from "src/lang/i18n";
import { WECHAT_MP_WEB_PAGE } from "../mp-web-images";
import Logger from "src/utils/logger";
import { WeChatAccountInfo } from "../smart-mp-setting";

declare global {
    interface Window {
        showSaveFilePicker(options: any): Promise<any>;
    }
}

export class WeChatSection extends SettingSection {
    private mpAccountDropdown: DropdownComponent;
    private mpAccountContainer: HTMLElement;

    render(): void {
        this.createWeChatSettings(this.container);
    }

    private createWeChatSettings(container: HTMLElement) {
        // Use collapsible frame
        const mpFrame = this.createCollapsibleFrame("📱 账号配置 (Account Configuration)");

        const ip = new Setting(mpFrame)
            .setName(
                $t("settings.public-ip-address") +
                ": " +
                $t("settings.fetching")
            )
            .setHeading()
            .setDesc($t("settings.you-should-add-this-ip-to-ip-whitelist-o"));

        void this.plugin
            .updateIpAddress()
            .then((ipAddress) => {
                ip.setName(
                    $t("settings.public-ip-address") + ": " + ipAddress
                );
            })
            .catch(() => {
                ip.setName(
                    $t("settings.public-ip-address") +
                    ": " +
                    $t("settings.no-ip-address")
                );
            });

        ip.addExtraButton((button) => {
            button
                .setIcon("clipboard-copy")
                .setTooltip($t("settings.copy-ip-to-clipboard"))
                .onClick(() => {
                    void (async () => {
                        await navigator.clipboard.writeText(
                            this.plugin.settings.ipAddress ?? ""
                        );
                        new Notice($t("settings.ip-copied-to-clipboard"));
                    })();
                });
        });


        new Setting(mpFrame).setName($t("settings.account-info")).setHeading();

        const div = mpFrame.createDiv({
            cls: "smart-mp-web-image elevated-shadow",
        });
        const link = div.createEl("a", {
            cls: "smart-mp-web-image-link",
            href: "https://developers.weixin.qq.com/platform",
        });
        const img = link.createEl("img", { cls: "smart-mp-web-image-img" });
        img.src = WECHAT_MP_WEB_PAGE;
        img.alt = "smart-mp-web-page";

        const selectAccountSetting = new Setting(mpFrame)
            .setName($t("settings.select-account"))
            .setHeading()
            .setDesc($t("settings.choose-the-account-to-modify"));

        const frame = mpFrame.createDiv({ cls: "smart-mp-account-info-div" });
        const title = frame.createEl("div", {
            cls: "smart-mp-account-info-title",
            text: $t("settings.account.info"),
        });

        this.mpAccountContainer = frame.createDiv({
            cls: "smart-mp-account-info-content",
        });

        selectAccountSetting
            .addDropdown((dropdown) => {
                dropdown.selectEl.empty();
                this.mpAccountDropdown = dropdown;
                if (this.plugin.settings.mpAccounts.length == 0) {
                    this.newMPAccountInfo();
                } else {
                    this.plugin.settings.mpAccounts.forEach((account) => {
                        dropdown.addOption(
                            account.accountName,
                            account.accountName
                        );
                    });
                }
                dropdown
                    .setValue(
                        this.plugin.settings.selectedMPAccount ??
                        $t("settings.select-account")
                    )
                    .onChange((value) => {
                        this.plugin.settings.selectedMPAccount = value;
                        this.updateMPAccountSettings(
                            this.plugin.settings.selectedMPAccount,
                            this.mpAccountContainer
                        );
                        void this.plugin.saveSettings();
                        this.plugin.messageService.sendMessage(
                            "wechat-account-changed",
                            value
                        );
                    });
            })
            .addExtraButton((button) => {
                button
                    .setIcon("plus")
                    .setTooltip($t("settings.create-new-account"))
                    .onClick(() => {
                        this.newMPAccountInfo();
                    });
            });
        this.updateMPAccountSettings(
            this.mpAccountDropdown.getValue(),
            this.mpAccountContainer
        );

        // Advanced / Global Settings
        const advancedFrame = this.createCollapsibleFrame("🔧 高级选项 (Advanced Options)", false, 'ww-mp-advanced', 'smart-mp-setting-frame-nested', mpFrame);

        new Setting(advancedFrame)
            .setName($t("settings.draft-previewer-wechat-id"))
            .setDesc($t("settings.draft-only-visible-for-the-wechat-user-o"))
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.previewer_wxname || "")
                    .onChange((value) => {
                        this.plugin.settings.previewer_wxname = value;
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(advancedFrame)
            .setName($t("settings.import-export-smart-mp-account"))
            .setDesc($t("settings.import-or-export-your-account-info-for-b"))
            .setClass("smart-mp-import-export-config")
            .addExtraButton((button) => {
                button
                    .setIcon("upload")
                    .setTooltip($t("settings.import-account-info"))
                    .onClick(() => {
                        // This likely needs a callback or event, but for now we can assume the main tab handles general import, 
                        // OR we implement import logic here. 
                        // Since importSettings is on the main class and handles global settings, 
                        // we might need to expose it or duplicate it safely.
                        // Ideally, moved to a SettingUtil or similar.
                        // For this refactor, let's keep it simple: access plugin method if exists or re-implement.
                        // Actually, 'importSettings' was on SmartMPSettingTab. 
                        // Let's implement import/export logic here or pass it in.
                        // For now, let's trigger a custom event or use a static helper.
                        // Simplified: Assume we have access to the file picker logic here.
                        this.importSettings();
                    });
            })
            .addExtraButton((button) => {
                button
                    .setIcon("download")
                    .setTooltip($t("settings.export-account-info"))
                    .onClick(() => {
                        void this.exportSettings();
                    });
            });
    }

    private newMPAccountInfo() {
        let n = 0;
        let newName = $t("settings.new-account");
        while (true) {
            const account = this.plugin.settings.mpAccounts.find(
                (account: WeChatAccountInfo) => account.accountName === newName
            );
            if (account === undefined || account === null) {
                break;
            }
            n += 1;
            newName = $t("settings.new-account") + "-" + n;
        }

        const newAccount = {
            accountName: newName,
            appId: "",
            appSecret: "",
        };
        this.plugin.settings.mpAccounts.push(newAccount);
        this.mpAccountDropdown.selectEl.options.length = 0;
        this.plugin.settings.mpAccounts.forEach((account) => {
            this.mpAccountDropdown.addOption(
                account.accountName,
                account.accountName
            );
        });
        this.plugin.settings.selectedMPAccount = newAccount.accountName;
        this.mpAccountDropdown.setValue(newName);

        this.updateMPAccountSettings(newName, this.mpAccountContainer);
    }

    private updateMPAccountSettings(
        accountName: string | undefined,
        container: HTMLElement
    ) {
        if (accountName === undefined) {
            return;
        }
        const account = this.plugin.getMPAccountByName(accountName);
        if (account === undefined) {
            return;
        }
        container.empty();

        //account Name
        new Setting(container)
            .setName($t("settings.account-name"))
            .setDesc($t("settings.account-name-for-your-wechat-official"))
            .setClass("smart-mp-setting-input")
            .addText((text) =>
                text.setValue(account.accountName).onChange((value) => {
                    account.accountName = value;
                    this.plugin.settings.selectedMPAccount = value;
                    void this.plugin.saveSettings();
                    this.updateMPAccountOptions();
                })
            );
        //addId
        new Setting(container)
            .setName($t("settings.app-id"))
            .setDesc($t("settings.appid-for-your-wechat-official-account"))
            .setClass("smart-mp-setting-input")
            .addText((text) =>
                text.setValue(account.appId).onChange((value) => {
                    account.appId = value;
                    void this.plugin.saveSettings();
                })
            );

        //addSecret
        new Setting(container)
            .setName($t("settings.app-secret"))
            .setDesc($t("settings.app-secret-for-your-wechat-official"))
            .setClass("smart-mp-setting-input")
            .addText((text) => {
                text.setPlaceholder("请输入 AppSecret")
                    .setValue(account.appSecret)
                    .onChange(async (value) => {
                        account.appSecret = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = "password";
            });
        // refresh token
        new Setting(container)
            .setName($t("settings.test-connection"))
            .setDesc($t("settings.check-if-your-account-setting-is-correct"))
            .addExtraButton((button) => {
                button
                    .setTooltip($t("settings.click-to-connect-wechat-server"))
                    .setIcon("plug-zap");
                button.onClick(() => {
                    void (async () => {
                        const success = await this.plugin.TestAccessToken(
                            account.accountName
                        );
                        if (success) {
                            new Notice(
                                $t(
                                    "settings.successfully-connected-to-wechat-server"
                                )
                            );
                        } else {
                            new Notice(
                                $t("settings.failed-to-connect-to-wechat-server")
                            );
                        }
                    })();
                });
            });

        // delete this account
        new Setting(container)
            .setName($t("settings.delete-account"))
            .setDesc($t("settings.be-carefull-delete-account"))
            .setClass("danger-extra-button")
            .addExtraButton((button) => {
                button
                    .setTooltip($t("settings.delete-account"))
                    .setIcon("trash-2");
                button.onClick(() => {
                    const accountToDelete =
                        this.plugin.settings.selectedMPAccount;
                    this.plugin.settings.mpAccounts =
                        this.plugin.settings.mpAccounts.filter(
                            (account) => account.accountName !== accountToDelete
                        );
                    const account = this.plugin.settings.mpAccounts[0];

                    if (account !== undefined) {
                        this.plugin.settings.selectedMPAccount =
                            account.accountName;
                        this.updateMPAccountOptions();
                        this.updateMPAccountSettings(
                            account.accountName,
                            this.mpAccountContainer
                        );
                    } else {
                        this.newMPAccountInfo();
                    }
                    void this.plugin.saveSettings();
                });
            });
    }

    private updateMPAccountOptions() {
        this.mpAccountDropdown.selectEl.options.length = 0;
        this.plugin.settings.mpAccounts.forEach((account) => {
            this.mpAccountDropdown.addOption(
                account.accountName,
                account.accountName
            );
        });
        this.mpAccountDropdown.setValue(
            this.plugin.settings.selectedMPAccount ?? ""
        );
    }

    // Duplicated import/export logic for self-containment 
    // Ideally this should be a utility
    async exportSettings() {
        try {
            const settingData = JSON.stringify(this.plugin.settings, null, 2);
            const blob = new Blob([settingData], { type: "application/json" });
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: `smart-mp-settings-${new Date().toISOString().slice(0, 10)}.json`,
                types: [{ description: "JSON 文件", accept: { "application/json": [".json"] } }],
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            new Notice($t("settings.settings-exported"));
        } catch (error) {
            Logger.error("WeChatSection", "Settings export failed", error);
        }
    }

    importSettings() {
        try {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (loadEvent) => {
                    try {
                        const content = loadEvent.target?.result as string;
                        const importedData = JSON.parse(content);
                        // Validate
                        if (importedData.mpAccounts === undefined) {
                            new Notice($t("settings.invalid-wewerite-settings-file"));
                            return;
                        }
                        this.plugin.settings = importedData;
                        void this.plugin.saveSettings();
                        this.updateMPAccountOptions();
                        // this.display(); // Cannot re-render whole tab easily, maybe trigger refresh?
                        // Ideally we ask the main tab to refresh. 
                        new Notice($t("settings.settings-imported-successfully"));
                        // Hacky way to refresh UI:
                        // window.location.reload(); // Too heavy
                    } catch (error) {
                        Logger.error("WeChatSection", "Settings import failed", error);
                        new Notice($t("settings.settings-imported-failed"));
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        } catch (error) {
            Logger.error("WeChatSection", "Settings import interaction error", error);
        }
    }
}
