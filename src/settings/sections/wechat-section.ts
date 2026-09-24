import { Notice, Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import Logger from "src/utils/logger";
import { SmartMPSettingTab } from "../setting-tab";
import { SECTION_IDS } from "../section-ids";
import { WeChatAccountInfo, SmartMPSetting } from "../smart-mp-setting";
import { applyImportedSettings } from "../migrate";
import { WECHAT_MP_WEB_PAGE } from "../../assets/mp-web-images";

interface FileSystemFileHandle {
	createWritable(): Promise<FileSystemWritableFileStream>;
	getFile(): Promise<File>;
}

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: FilePickerAcceptType[];
}

interface FilePickerAcceptType {
	description: string;
	accept: Record<string, string[]>;
}

declare global {
	interface Window {
		showSaveFilePicker(
			options?: SaveFilePickerOptions
		): Promise<FileSystemFileHandle>;
	}
}

export function renderWeChatSection(
    tab: SmartMPSettingTab,
    container: HTMLElement
): void {
    const { plugin } = tab;
    const mpFrame = tab.createCollapsibleFrame(
        container,
        $t("settings.sections.wechat"),
        false,
        'ww-main-sections',
        SECTION_IDS.wechat
    );

    const ip = new Setting(mpFrame)
        .setName(
            $t("settings.public-ip-address") +
            ": " +
            $t("settings.fetching")
        )
        .setHeading()
        .setDesc($t("settings.you-should-add-this-ip-to-ip-whitelist-o"));

    void plugin
        .updateIpAddress()
        .then((ipAddress) => {
            Logger.debug("SettingTab", "ipAddress: " + ipAddress);
            ip.setName($t("settings.public-ip-address") + ": " + ipAddress);
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
                        plugin.settings.ipAddress ?? ""
                    );
                    new Notice($t("settings.ip-copied-to-clipboard"));
                })();
            });
    });

    new Setting(mpFrame).setName($t("settings.account-info")).setHeading();

    const div = mpFrame.createDiv({ cls: "smart-mp-web-image elevated-shadow" });
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
    frame.createEl("div", {
        cls: "smart-mp-account-info-title",
        text: $t("settings.account.info"),
    });

    new Setting(mpFrame)
        .setName($t("settings.draft-previewer-wechat-id"))
        .setDesc($t("settings.draft-only-visible-for-the-wechat-user-o"))
        .addText((text) =>
            text
                .setValue(plugin.settings.previewer_wxname || "")
                .onChange((value) => {
                    plugin.settings.previewer_wxname = value;
                    void plugin.saveSettings();
                })
        );

    tab.mpAccountContainer = frame.createDiv({
        cls: "smart-mp-account-info-content",
    });

    selectAccountSetting
        .addDropdown((dropdown) => {
            tab.mpAccountDropdown = dropdown;
            if (plugin.settings.mpAccounts.length === 0) {
                newMPAccountInfo(tab);
            } else {
                updateMPAccountOptions(tab);
            }
            dropdown
                .setValue(
                    plugin.settings.selectedMPAccount ??
                    $t("settings.select-account")
                )
                .onChange((value) => {
                    plugin.settings.selectedMPAccount = value;
                    updateMPAccountSettings(tab, value, tab.mpAccountContainer);
                    void plugin.saveSettings();
                    plugin.messageService.sendMessage(
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
                    newMPAccountInfo(tab);
                });
        });
    updateMPAccountSettings(
        tab,
        tab.mpAccountDropdown.getValue(),
        tab.mpAccountContainer
    );

    new Setting(mpFrame)
        .setName($t("settings.import-export-smart-mp-account"))
        .setHeading()
        .setDesc($t("settings.import-or-export-your-account-info-for-b"))
        .setClass("smart-mp-import-export-config")
        .addExtraButton((button) => {
            button
                .setIcon("upload")
                .setTooltip($t("settings.import-account-info"))
                .onClick(() => {
                    importSettings(tab);
                });
        })
        .addExtraButton((button) => {
            button
                .setIcon("download")
                .setTooltip($t("settings.export-account-info"))
                .onClick(() => {
                    void exportSettings(tab);
                });
        });
}

function newMPAccountInfo(tab: SmartMPSettingTab) {
    const { plugin } = tab;
    let n = 0;
    let newName = $t("settings.new-account");
    while (true) {
        const account = plugin.settings.mpAccounts.find(
            (account: WeChatAccountInfo) => account.accountName === newName
        );
        if (account === undefined || account === null) {
            break;
        }
        n += 1;
        newName = $t("settings.new-account") + "-" + n;
    }

    plugin.settings.mpAccounts.push({
        accountName: newName,
        appId: "",
        appSecret: "",
    });
    // [Fix] 与 newAiDrawAccount 行为对齐：新建即落盘，
    // 不再依赖"之后编辑过某字段"才保存
    plugin.settings.selectedMPAccount = newName;
    updateMPAccountOptions(tab);
    void plugin.saveSettings();

    updateMPAccountSettings(tab, newName, tab.mpAccountContainer);
}

function updateMPAccountSettings(
    tab: SmartMPSettingTab,
    accountName: string | undefined,
    container: HTMLElement
) {
    const { plugin } = tab;
    if (accountName === undefined) {
        return;
    }
    const account = plugin.getMPAccountByName(accountName);
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
                plugin.settings.selectedMPAccount = value;
                void plugin.saveSettings();
                updateMPAccountOptions(tab);
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
                void plugin.saveSettings();
            })
        );

    //addSecret
    new Setting(container)
        .setName($t("settings.app-secret"))
        .setDesc($t("settings.app-secret-for-your-wechat-official"))
        .setClass("smart-mp-setting-input")
        .addText((text) => {
            text.setPlaceholder($t("settings.app-secret-placeholder"))
                .setValue(account.appSecret)
                .onChange(async (value) => {
                    account.appSecret = value;
                    await plugin.saveSettings();
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
                    const success = await plugin.TestAccessToken(
                        account.accountName
                    );
                    if (success) {
                        new Notice(
                            $t("settings.successfully-connected-to-wechat-server")
                        );
                    } else {
                        new Notice($t("settings.failed-to-connect-wechat-server"));
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
                // [Fix] 删除展示中的账号（参数），而非隐式依赖 selectedMPAccount；
                // 两者在边界情况下（如重命名中途）可能不一致
                plugin.settings.mpAccounts =
                    plugin.settings.mpAccounts.filter(
                        (a) => a.accountName !== accountName
                    );
                const next = plugin.settings.mpAccounts[0];

                if (next !== undefined) {
                    plugin.settings.selectedMPAccount = next.accountName;
                    updateMPAccountOptions(tab);
                    updateMPAccountSettings(tab, next.accountName, tab.mpAccountContainer);
                } else {
                    newMPAccountInfo(tab);
                }
                void plugin.saveSettings();
            });
        });
}

function updateMPAccountOptions(tab: SmartMPSettingTab) {
    const { plugin } = tab;
    tab.rebuildDropdown(
        tab.mpAccountDropdown,
        plugin.settings.mpAccounts.map((a) => a.accountName),
        plugin.settings.selectedMPAccount ?? ""
    );
}

async function exportSettings(tab: SmartMPSettingTab): Promise<boolean> {
    const { plugin } = tab;
    try {
        // [Security] 内存态 settings 是解密后的明文，直接序列化会把
        // appSecret/apiKey/激活码全部明文写出；同时加密密钥与设备绑定
        // 凭证绝不能离开本机，导出前一律剥离
        const exportCopy: SmartMPSetting = JSON.parse(
            JSON.stringify(plugin.settings)
        );
        delete exportCopy.cryptoKey;
        delete exportCopy.proToken;
        delete exportCopy.proProducts;
        delete exportCopy.fallbackDeviceId;
        delete exportCopy._id;
        delete exportCopy._rev;

        const settingData = JSON.stringify(exportCopy, null, 2);
        const blob = new Blob([settingData], { type: "application/json" });

        const fileHandle = await window.showSaveFilePicker({
            suggestedName: `smart-mp-settings-${new Date()
                .toISOString()
                .slice(0, 10)}.json`,
            types: [
                {
                    description: "JSON",
                    accept: { "application/json": [".json"] },
                },
            ],
        });

        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        new Notice($t("settings.settings-exported"));
        // 明文密钥提醒：文件可直接被读取，用户需要知道这一点
        new Notice($t("settings.export-contains-secrets"), 8000);
        return true;
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            // User canceled the save dialog
            return false;
        }
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        new Notice($t("settings.settings-exporting-failed") + errorMessage);
        Logger.error("SettingTab", "Operation failed", error);
        return false;
    }
}

function importSettings(tab: SmartMPSettingTab) {
    const { plugin } = tab;
    try {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                (async () => {
                    try {
                        const content = loadEvent.target?.result as string;
                        let importedRaw: Record<string, unknown>;

                        try {
                            importedRaw = JSON.parse(content);
                        } catch (parseError) {
                            new Notice($t("settings.invalid-json-file"));
                            return;
                        }

                        if (
                            !Array.isArray(importedRaw.mpAccounts) ||
                            typeof importedRaw.css_styles_folder !== "string"
                        ) {
                            new Notice(
                                $t("settings.invalid-wewerite-settings-file")
                            );
                            return;
                        }

                        // [Fix] applyImportedSettings 统一整形为内存态：
                        // 解密外部密文字段、剥离外部密钥与设备态、
                        // 合并默认值并跑结构迁移
                        const merged = await applyImportedSettings(importedRaw);
                        plugin.settings = merged;

                        // 导入是一次性重要操作，绕过 3s 防抖立即落盘
                        await plugin.saveSettingsNow();
                        updateMPAccountOptions(tab);
                        tab.display();
                        new Notice(
                            $t("settings.settings-imported-successfully")
                        );
                    } catch (error) {
                        const errorMessage =
                            error instanceof Error
                                ? error.message
                                : String(error);
                        new Notice(
                            $t("settings.settings-imported-failed") +
                            errorMessage
                        );
                        Logger.error("SettingTab", "Settings import failed", error);
                    }
                })();
            };

            reader.readAsText(file);
        };

        input.click();
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        new Notice($t("settings.settings-imported-error") + errorMessage);
        Logger.error("SettingTab", "Operation failed", error);
    }
}
