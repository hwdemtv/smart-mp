import { Notice, Setting } from "obsidian";
import { $t } from "src/lang/i18n";
import { SmartMPSettingTab } from "../setting-tab";
import { SECTION_IDS } from "../section-ids";
import {
    ensureDefaultAssistants,
    MP_ASSISTANT_TEMPLATES,
} from "../assistant-defaults";
import { ConfirmModal } from "src/modals/confirm-modal";

export function renderAssistantSection(
    tab: SmartMPSettingTab,
    container: HTMLElement
): void {
    const { plugin } = tab;
    ensureDefaultAssistants(plugin.settings);
    const frame = tab.createCollapsibleFrame(
        container,
        $t("settings.assistant-prompts-customization"),
        false,
        'ww-main-sections',
        SECTION_IDS.assistants
    );

    const header = new Setting(frame)
        .setName($t("settings.custom-instruction-templates"))
        .setDesc($t("settings.custom-prompt-desc"))
        .setHeading();

    header.addButton((button) => {
        button
            .setButtonText($t("settings.restore-defaults"))
            .setWarning()
            .onClick(() => {
                // [Fix] 此前用原生 confirm()（Obsidian 下为阻塞式系统对话框）
                new ConfirmModal(
                    tab.app,
                    $t("settings.confirm-restore-defaults"),
                    (confirm) => {
                        if (!confirm) return;
                        plugin.settings.customPrompts = {};
                        // Also reset default prompts in the list
                        plugin.settings.customAssistantList?.forEach(a => {
                            if (a.isDefault) {
                                a.prompt = "";
                            }
                        });
                        void plugin.saveSettings();
                        tab.display();
                    }
                ).open();
            });
    });

    renderDynamicAssistantSettings(tab, frame);
}

function renderDynamicAssistantSettings(
    tab: SmartMPSettingTab,
    container: HTMLElement
) {
    const { plugin } = tab;
    const managementFrame = tab.createCollapsibleFrame(
        container,
        $t("settings.assistant.dynamic-assistants"),
        true,
        'ww-sub-sections',
        SECTION_IDS.assistantManagement
    );

    const header = new Setting(managementFrame)
        .setHeading();

    header.addButton((button) => {
        button
            .setButtonText($t("settings.assistant.add-assistant"))
            .setCta()
            .onClick(() => {
                if (!plugin.settings.customAssistantList) {
                    plugin.settings.customAssistantList = [];
                }
                plugin.settings.customAssistantList.push({
                    id: Date.now().toString(),
                    name: "New Assistant",
                    prompt: "指令模板，使用 {{content}} 代表原文",
                    enabled: true,
                });
                void plugin.saveSettings();
                tab.display();
            });
    });

    header.addButton((button) => {
        button
            .setButtonText($t("settings.assistant.add-mp-templates"))
            .setTooltip($t("settings.assistant.add-mp-templates-desc"))
            .onClick(() => {
                if (!plugin.settings.customAssistantList) {
                    plugin.settings.customAssistantList = [];
                }

                const templates = MP_ASSISTANT_TEMPLATES();
                let addedCount = 0;
                templates.forEach(tpl => {
                    const exists = plugin.settings.customAssistantList?.some(a => a.name === tpl.name);
                    if (!exists) {
                        plugin.settings.customAssistantList?.push(tpl);
                        addedCount++;
                    }
                });

                if (addedCount > 0) {
                    void plugin.saveSettings();
                    tab.display();
                    new Notice($t("settings.assistant.mp-templates-added", [String(addedCount)]));
                } else {
                    new Notice($t("notice.settings.template-exists"));
                }
            });
    });

    if (plugin.settings.customAssistantList) {
        plugin.settings.customAssistantList.forEach((assistant, index) => {
            const assistantDetails = managementFrame.createEl("details", { cls: "smart-mp-custom-assistant-item smart-mp-setting-frame" });

            assistantDetails.setAttribute('name', 'ww-assistant-group');
            if (tab.expandedSections.has(assistant.id)) {
                assistantDetails.setAttribute('open', '');
            }
            assistantDetails.ontoggle = () => {
                if (assistantDetails.open) {
                    tab.expandedSections.add(assistant.id);
                } else {
                    tab.expandedSections.delete(assistant.id);
                }
            };

            const summary = assistantDetails.createEl("summary");

            const titleSpan = summary.createEl("span", { text: assistant.name, cls: 'smart-mp-assistant-title' });
            if (assistant.enabled === false) {
                titleSpan.addClass('is-disabled');
            }

            const controls = summary.createDiv({ cls: 'smart-mp-assistant-controls' });

            // Stop propagation so clicking buttons doesn't toggle details
            controls.onClickEvent((e) => e.stopPropagation());

            // Enable Toggle
            const toggle = new Setting(controls)
                .setClass('smart-mp-setting-no-border')
                .addToggle((t) => t
                    .setValue(assistant.enabled !== false)
                    .setTooltip($t("settings.assistant.enable-assistant"))
                    .onChange(async (val) => {
                        assistant.enabled = val;
                        titleSpan.toggleClass('is-disabled', !val);
                        await plugin.saveSettings();
                    })
                );
            toggle.infoEl.remove();

            // Sorting buttons
            new Setting(controls)
                .setClass('smart-mp-setting-borderless')
                .addExtraButton(b => {
                    b.setIcon("arrow-up")
                        .setTooltip($t("settings.assistant.move-up"))
                        .onClick(() => {
                            const list = plugin.settings.customAssistantList!;
                            [list[index - 1], list[index]] = [list[index], list[index - 1]];
                            void plugin.saveSettings();
                            tab.display();
                        });
                    if (index === 0) b.extraSettingsEl.style.visibility = "hidden";
                });

            new Setting(controls)
                .setClass('smart-mp-setting-borderless')
                .addExtraButton(b => {
                    b.setIcon("arrow-down")
                        .setTooltip($t("settings.assistant.move-down"))
                        .onClick(() => {
                            const list = plugin.settings.customAssistantList!;
                            [list[index + 1], list[index]] = [list[index], list[index + 1]];
                            void plugin.saveSettings();
                            tab.display();
                        });
                    if (index === (plugin.settings.customAssistantList?.length || 0) - 1) b.extraSettingsEl.style.visibility = "hidden";
                });

            // Delete Button
            new Setting(controls)
                .setClass('smart-mp-setting-borderless')
                .addExtraButton(b => b
                    .setIcon("trash-2")
                    .setTooltip($t("settings.assistant.delete-assistant"))
                    .onClick(() => {
                        plugin.settings.customAssistantList?.splice(index, 1);
                        void plugin.saveSettings();
                        tab.display();
                    })
                );

            // Content
            const content = assistantDetails.createDiv({ cls: 'smart-mp-assistant-content' });

            new Setting(content)
                .setName($t("settings.assistant.assistant-name"))
                .setDesc($t("settings.assistant.assistant-name-desc"))
                .addText((text) =>
                    text.setValue(assistant.name).onChange((value) => {
                        assistant.name = value;
                        titleSpan.setText(value);
                        void plugin.saveSettings();
                    })
                );

            new Setting(content)
                .setName($t("settings.assistant.assistant-prompt"))
                .setDesc($t("settings.assistant.assistant-prompt-desc"))
                .setClass("smart-mp-setting-textarea")
                .addTextArea((text) =>
                    text
                        .setValue(assistant.prompt)
                        .onChange((value) => {
                            assistant.prompt = value;
                            if (assistant.isDefault) {
                                if (!plugin.settings.customPrompts) plugin.settings.customPrompts = {};
                                plugin.settings.customPrompts[assistant.id] = value;
                            }
                            void plugin.saveSettings();
                        })
                );

            // Per-Assistant Model Selection
            const modelSectionHeader = new Setting(content)
                .setName($t("settings.llm-provider.default-provider") + " / " + $t("settings.llm-provider.default-model"))
                .setDesc($t("settings.ai-chat-section.model-select-desc"));

            const providers = plugin.settings.llmProviders || [];

            // Provider dropdown
            modelSectionHeader.addDropdown(dropdown => {
                dropdown.addOption("", $t("settings.llm-provider.use-global-default"));
                providers.forEach(p => dropdown.addOption(p.id, p.name));
                dropdown.setValue(assistant.providerId || "");
                dropdown.onChange(async (val) => {
                    assistant.providerId = val || undefined;
                    // Auto-select first model of new provider
                    if (val) {
                        const selectedProvider = providers.find(p => p.id === val);
                        if (selectedProvider && selectedProvider.models.length > 0) {
                            assistant.modelId = selectedProvider.models[0].id;
                        } else {
                            assistant.modelId = undefined;
                        }
                    } else {
                        assistant.modelId = undefined;
                    }
                    await plugin.saveSettings();
                    tab.display();
                });
            });

            // Model dropdown (only if custom provider is selected)
            if (assistant.providerId) {
                const selectedProvider = providers.find(p => p.id === assistant.providerId);
                if (selectedProvider) {
                    modelSectionHeader.addDropdown(dropdown => {
                        selectedProvider.models.forEach(m => dropdown.addOption(m.id, m.name));
                        dropdown.setValue(assistant.modelId || "");
                        dropdown.onChange(async (val) => {
                            assistant.modelId = val || undefined;
                            await plugin.saveSettings();
                        });
                    });
                }
            }

            // Restore Button
            new Setting(content)
                .addButton((button) => {
                    const label = assistant.isDefault ? $t("settings.assistant.restore-default") : $t("settings.assistant.restore-last");
                    button.setButtonText(label)
                        .onClick(async () => {
                            if (assistant.isDefault) {
                                assistant.prompt = "";
                                if (plugin.settings.customPrompts) {
                                    delete plugin.settings.customPrompts[assistant.id];
                                }
                            } else {
                                assistant.prompt = tab.initialAssistantPrompts[assistant.id] || "";
                            }
                            await plugin.saveSettings();
                            tab.display();
                        });
                });
        });
    }
}
