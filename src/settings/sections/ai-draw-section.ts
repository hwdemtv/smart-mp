import { Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import { SmartMPSettingTab } from "../setting-tab";
import { SECTION_IDS } from "../section-ids";
import { AITaskAccountInfo } from "../smart-mp-setting";

export function renderAiDrawSection(
    tab: SmartMPSettingTab,
    container: HTMLElement
): void {
    const { plugin } = tab;
    const frame = tab.createCollapsibleFrame(
        container,
        $t("settings.image-llm"),
        false,
        'ww-main-sections',
        SECTION_IDS.aiDraw
    );

    const selectAIDrawSetting = new Setting(frame)
        .setName($t("settings.select-account"))
        .setDesc($t("settings.choose-the-llm-account-to-modify"));

    tab.aiDrawAccountContainer = frame.createDiv({
        cls: "smart-mp-account-info-content",
    });

    selectAIDrawSetting.addDropdown((dropdown) => {
        tab.aiDrawAccountDropdown = dropdown;
        updateAiDrawOptions(tab);
        dropdown
            .setValue(plugin.settings.selectedDrawAccount || "")
            .onChange((value) => {
                plugin.settings.selectedDrawAccount = value;
                updateAiDrawSettings(tab, value, tab.aiDrawAccountContainer);
                void plugin.saveSettings();
            });
    })
        .addExtraButton((button) => {
            button
                .setIcon("plus")
                .setTooltip($t("settings.create-new-draw-llm-account"))
                .onClick(() => {
                    newAiDrawAccount(tab);
                });
        });
    updateAiDrawSettings(
        tab,
        plugin.settings.selectedDrawAccount,
        tab.aiDrawAccountContainer
    );
}

function newAiDrawAccount(tab: SmartMPSettingTab) {
    const { plugin } = tab;
    let n = plugin.settings.drawAccounts.length + 1;
    let newName = $t("settings.new-draw-llm-account");
    while (true) {
        const account = plugin.settings.drawAccounts.find(
            (account: AITaskAccountInfo) => account.accountName === newName
        );
        if (account === undefined || account === null) {
            break;
        }
        n += 1;
        newName = $t("settings.new-draw-llm-account") + "-" + n;
    }
    plugin.settings.drawAccounts.push({
        accountName: newName,
        baseUrl: "",
        apiKey: "",
        taskUrl: "",
        model: "",
    });
    plugin.settings.selectedDrawAccount = newName;
    updateAiDrawOptions(tab);
    void plugin.saveSettings();
    updateAiDrawSettings(tab, newName, tab.aiDrawAccountContainer);
}

function updateAiDrawSettings(
    tab: SmartMPSettingTab,
    accountName: string | undefined,
    container: HTMLElement
) {
    const { plugin } = tab;
    const account = plugin.getDrawAIAccount(accountName);
    if (account === undefined) {
        newAiDrawAccount(tab);
        return;
    }
    container.empty();

    new Setting(container)
        .setName($t("settings.account-name"))
        .addText((text) =>
            text.setValue(account.accountName).onChange((rawValue) => {
                // [Fix] 此前 value=value.trim() 后又 value.trim() 重复裁剪，
                // 且"比较 trim 后、赋值原始值"不一致
                const value = rawValue.trim();
                if (value !== account.accountName) {
                    account.accountName = value;
                    plugin.settings.selectedDrawAccount = value;
                    void plugin.saveSettings();
                    updateAiDrawOptions(tab);
                }
            })
        );

    new Setting(container)
        .setName($t("settings.llm-access-base-url"))
        .addText((text) =>
            text.setValue(account.baseUrl).onChange((value) => {
                if (value.trim() !== account.baseUrl) {
                    account.baseUrl = value;
                    void plugin.saveSettings();
                }
            })
        );
    new Setting(container)
        .setName($t("settings.llm-task-url"))
        .addText((text) =>
            text.setValue(account.taskUrl).onChange((value) => {
                if (value.trim() !== account.taskUrl) {
                    account.taskUrl = value;
                    void plugin.saveSettings();
                }
            })
        );

    new Setting(container)
        .setName($t("settings.llm-access-api-key"))
        .addText((text) => {
            text.setValue(account.apiKey).onChange((value) => {
                if (value.trim() !== account.apiKey) {
                    account.apiKey = value;
                    void plugin.saveSettings();
                }
            });
            text.inputEl.type = "password";
        });

    new Setting(container)
        .setName($t("settings.llm-model-to-be-used"))
        .addText((text) =>
            text.setValue(account.model).onChange((value) => {
                if (value.trim() !== account.model) {
                    account.model = value;
                    void plugin.saveSettings();
                }
            })
        );

    new Setting(container)
        .setName($t("settings.llm-system-prompt"))
        .setDesc($t("settings.llm-system-prompt-desc"))
        .setClass("smart-mp-setting-textarea")
        .addTextArea((text) =>
            text
                .setPlaceholder("你是一个优秀的绘图提示词专家...")
                .setValue(account.systemPrompt || "")
                .onChange((value) => {
                    account.systemPrompt = value;
                    void plugin.saveSettings();
                })
        );

    new Setting(container)
        .setName($t("settings.delete-account"))
        .setClass("danger-extra-button")
        .addExtraButton((button) => {
            button.setIcon("trash-2").onClick(() => {
                const accountToDelete = account.accountName;
                plugin.settings.drawAccounts =
                    plugin.settings.drawAccounts.filter(
                        (a) => a.accountName !== accountToDelete
                    );
                const next = plugin.settings.drawAccounts[0];
                if (next !== undefined) {
                    plugin.settings.selectedDrawAccount = next.accountName;
                    updateAiDrawOptions(tab);
                    updateAiDrawSettings(tab, next.accountName, tab.aiDrawAccountContainer);
                } else {
                    newAiDrawAccount(tab);
                }
                void plugin.saveSettings();
            });
        });
}

function updateAiDrawOptions(tab: SmartMPSettingTab) {
    const { plugin } = tab;
    tab.rebuildDropdown(
        tab.aiDrawAccountDropdown,
        plugin.settings.drawAccounts.map((a) => a.accountName),
        plugin.settings.selectedDrawAccount ?? ""
    );
}
