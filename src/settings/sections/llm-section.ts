import { Notice, Setting, setIcon } from "obsidian";
import { $t } from "src/lang/i18n";
import { SmartMPSettingTab } from "../setting-tab";
import { SECTION_IDS } from "../section-ids";
import { LLMProvider } from "../llm-types";
import {
    createProviderFromPreset,
    fillPresetOptions,
    providerIcon,
    ProviderPresetKey,
} from "../llm-presets";
import { ConfirmModal } from "src/modals/confirm-modal";
import {
    testLlmConnection,
    fetchRemoteModelIds,
    probeErrorMessage,
} from "src/utils/llm-probe";

export function renderLLMSection(
    tab: SmartMPSettingTab,
    container: HTMLElement
): void {
    const { plugin } = tab;
    const frame = tab.createCollapsibleFrame(
        container,
        $t("settings.text-llm"),
        false,
        'ww-main-sections',
        SECTION_IDS.llm
    );

    // 1. Global Selection (Default Provider & Model)
    new Setting(frame)
        .setName($t("settings.llm-provider.default-provider"))
        .addDropdown(dropdown => {
            const providers = plugin.settings.llmProviders || [];
            providers.forEach(p => dropdown.addOption(p.id, p.name));
            dropdown.setValue(plugin.settings.selectedLLMProviderId || "")
                .onChange(async val => {
                    plugin.settings.selectedLLMProviderId = val;
                    // Auto-select first model of the new provider
                    const p = providers.find(p => p.id === val);
                    if (p && p.models.length > 0) {
                        plugin.settings.selectedLLMModelId = p.models[0].id;
                    } else {
                        plugin.settings.selectedLLMModelId = "";
                    }
                    await plugin.saveSettings();
                    tab.display();
                });
        });

    new Setting(frame)
        .setName($t("settings.llm-provider.default-model"))
        .addDropdown(dropdown => {
            const providers = plugin.settings.llmProviders || [];
            const currentProvider = providers.find(p => p.id === plugin.settings.selectedLLMProviderId);
            if (currentProvider) {
                currentProvider.models.forEach(m => dropdown.addOption(m.id, m.name));
                dropdown.setValue(plugin.settings.selectedLLMModelId || "")
                    .onChange(async val => {
                        plugin.settings.selectedLLMModelId = val;
                        await plugin.saveSettings();
                    });
            }
        });

    // 2. Add Provider Dropdown
    const providerHeader = new Setting(frame)
        .setName($t("settings.llm-provider.manage-providers"))
        .setHeading();

    providerHeader.addDropdown(dropdown => {
        dropdown.addOption("", "➕ " + $t("settings.llm-provider.add-provider"));
        fillPresetOptions((value, text) => dropdown.addOption(value, text));
        dropdown.setValue("");
        dropdown.onChange(val => {
            if (val) {
                addProviderFromPreset(tab, val as ProviderPresetKey);
            }
        });
    });

    // 3. Provider List
    renderProviderList(tab, frame);
}

function renderProviderList(tab: SmartMPSettingTab, container: HTMLElement) {
    const { plugin } = tab;
    const providers = plugin.settings.llmProviders || [];
    providers.forEach((provider, index) => {
        const wrapper = container.createDiv({ cls: 'smart-mp-provider-wrapper smart-mp-account-wrapper' });

        // Collapsible Header
        const headerEl = wrapper.createDiv({ cls: 'smart-mp-provider-header smart-mp-account-header' });

        // Left side: chevron + icon + name + model count
        const leftSide = headerEl.createDiv({ cls: 'smart-mp-provider-header-left smart-mp-account-left' });

        const chevron = leftSide.createSpan({ cls: 'smart-mp-chevron smart-mp-account-chevron' });
        chevron.textContent = '▶';

        const iconSpan = leftSide.createSpan({ cls: 'smart-mp-provider-icon smart-mp-account-icon' });
        const { icon, title } = providerIcon(provider.type);
        iconSpan.textContent = icon;
        iconSpan.title = title;

        const nameSpan = leftSide.createSpan({ text: provider.name, cls: 'smart-mp-account-name' });

        leftSide.createSpan({ text: `(${provider.models.length} Models)`, cls: 'smart-mp-account-count' });

        // Right side: buttons (sorting, duplicate, delete)
        const rightSide = headerEl.createDiv({ cls: 'smart-mp-provider-header-right smart-mp-account-right' });

        // Move Up button
        if (index > 0) {
            const upBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
            setIcon(upBtn, "arrow-up");
            upBtn.title = $t("settings.assistant.move-up");
            upBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const list = plugin.settings.llmProviders!;
                [list[index - 1], list[index]] = [list[index], list[index - 1]];
                await plugin.saveSettings();
                tab.display();
            });
        }

        // Move Down button
        if (index < providers.length - 1) {
            const downBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
            setIcon(downBtn, "arrow-down");
            downBtn.title = $t("settings.assistant.move-down");
            downBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const list = plugin.settings.llmProviders!;
                [list[index + 1], list[index]] = [list[index], list[index + 1]];
                await plugin.saveSettings();
                tab.display();
            });
        }

        // Duplicate button
        const dupBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
        setIcon(dupBtn, "copy");
        dupBtn.title = $t("settings.llm-provider.duplicate");
        dupBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newProvider: LLMProvider = {
                ...provider,
                id: crypto.randomUUID(),
                name: provider.name + ' (Copy)',
                models: provider.models.map(m => ({ ...m }))
            };
            plugin.settings.llmProviders?.push(newProvider);
            tab.expandedSections.add(newProvider.id);
            await plugin.saveSettings();
            tab.display();
        });

        // Delete button
        const deleteBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
        setIcon(deleteBtn, "trash-2");
        deleteBtn.title = $t("settings.llm-provider.delete-provider");
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            new ConfirmModal(
                tab.app,
                $t("settings.llm-provider.delete-confirm").replace("{{name}}", provider.name),
                (confirm) => {
                    if (!confirm) return;
                    void (async () => {
                        const wasSelected = plugin.settings.selectedLLMProviderId === provider.id;
                        plugin.settings.llmProviders = plugin.settings.llmProviders?.filter(p => p.id !== provider.id);
                        if (wasSelected) {
                            if (plugin.settings.llmProviders && plugin.settings.llmProviders.length > 0) {
                                plugin.settings.selectedLLMProviderId = plugin.settings.llmProviders[0].id;
                                plugin.settings.selectedLLMModelId = plugin.settings.llmProviders[0].models[0]?.id || "";
                            } else {
                                plugin.settings.selectedLLMProviderId = "";
                                plugin.settings.selectedLLMModelId = "";
                            }
                        }
                        await plugin.saveSettings();
                        tab.display();
                    })();
                }
            ).open();
        });

        // Details section (collapsible)
        const detailsEl = wrapper.createDiv({ cls: 'smart-mp-provider-details smart-mp-account-details' });

        const shouldExpand = tab.expandedSections.has(provider.id);
        if (!shouldExpand) {
            detailsEl.addClass('smart-mp-hidden');
        }
        if (shouldExpand) {
            chevron.addClass('smart-mp-rotate-90');
        }

        headerEl.addEventListener('click', () => {
            const isCollapsed = detailsEl.hasClass('smart-mp-hidden');
            detailsEl.toggleClass('smart-mp-hidden', !isCollapsed);
            chevron.toggleClass('smart-mp-rotate-90', isCollapsed);
            if (isCollapsed) {
                tab.expandedSections.add(provider.id);
            } else {
                tab.expandedSections.delete(provider.id);
            }
        });

        renderProviderDetails(tab, provider, detailsEl, nameSpan);
    });
}

function renderProviderDetails(
    tab: SmartMPSettingTab,
    provider: LLMProvider,
    container: HTMLElement,
    /** 列表头部显示名称的 span，重命名时局部更新，避免整页重绘丢失焦点 */
    headerNameSpan: HTMLElement
) {
    const { plugin } = tab;
    const unnamedProvider = $t("settings.llm-provider.unnamed-provider");

    // Name
    new Setting(container)
        .setName($t("settings.llm-provider.provider-name"))
        .addText(text => {
            text.setValue(provider.name)
                .setPlaceholder(unnamedProvider)
                .onChange(async v => {
                    provider.name = v || unnamedProvider;
                    headerNameSpan.setText(provider.name);
                    await plugin.saveSettings();
                });
            // [Fix] 此前 blur 时整页 display() 重绘：焦点/滚动全部丢失。
            // 校验空名后局部同步即可
            text.inputEl.addEventListener('blur', () => {
                if (!provider.name || provider.name.trim() === '') {
                    provider.name = unnamedProvider;
                    text.setValue(provider.name);
                    headerNameSpan.setText(provider.name);
                    void plugin.saveSettings();
                }
            });
        });

    // Base URL
    new Setting(container)
        .setName($t("settings.llm-provider.base-url"))
        .addText(text => text.setValue(provider.baseUrl).setPlaceholder("https://api.openai.com/v1").onChange(async v => {
            provider.baseUrl = v;
            await plugin.saveSettings();
        }));

    // API Key with Test button
    const apiKeySetting = new Setting(container)
        .setName($t("settings.llm-provider.api-key"))
        .addText(text => {
            text.setPlaceholder("sk-...")
                .setValue(provider.apiKey)
                .onChange(async v => {
                    provider.apiKey = v;
                    await plugin.saveSettings();
                });
            text.inputEl.type = "password";
        });

    // Test Connection button
    apiKeySetting.addButton(btn => btn
        .setButtonText($t("settings.llm-provider.test-connection-btn"))
        .setTooltip($t("settings.llm-provider.test-connection-btn"))
        .onClick(async () => {
            if (!provider.baseUrl) {
                new Notice($t("notice.settings.base-url-required"));
                return;
            }
            btn.setButtonText($t("settings.llm-provider.testing"));
            btn.setDisabled(true);
            try {
                const modelCount = await testLlmConnection(provider.baseUrl, provider.apiKey);
                new Notice($t("notice.settings.llm-test-success", [String(modelCount)]));
            } catch (error) {
                new Notice($t("notice.settings.llm-test-failed", [probeErrorMessage(error)]));
            } finally {
                btn.setButtonText($t("settings.llm-provider.test-connection-btn"));
                btn.setDisabled(false);
            }
        }));

    // System Prompt
    new Setting(container)
        .setName($t("settings.llm-provider.system-prompt"))
        .setDesc($t("settings.llm-provider.system-prompt-desc"))
        .setClass("smart-mp-setting-textarea")
        .addTextArea(text => text
            .setPlaceholder("You are a helpful assistant...")
            .setValue(provider.systemPrompt || "")
            .onChange(async v => {
                provider.systemPrompt = v;
                await plugin.saveSettings();
            }));

    // Models Section (Collapsible)
    const modelsWrapper = container.createDiv({ cls: 'smart-mp-models-wrapper' });
    const modelsHeader = modelsWrapper.createDiv({ cls: 'smart-mp-models-header' });

    const modelsChevron = modelsHeader.createSpan({ cls: 'smart-mp-chevron smart-mp-account-chevron' });
    modelsChevron.textContent = '▶';

    modelsHeader.createSpan({ text: $t("settings.llm-provider.models"), cls: 'smart-mp-models-title' });
    modelsHeader.createSpan({ text: `(${provider.models.length})`, cls: 'smart-mp-account-count' });

    // Add Model button
    const addModelBtn = modelsHeader.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost smart-mp-btn-auto-left' });
    setIcon(addModelBtn, "plus");
    addModelBtn.title = $t("settings.llm-provider.add-model");
    addModelBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        provider.models.push({
            id: "new-model",
            name: "New Model",
            enabled: true,
            type: 'chat'
        });
        await plugin.saveSettings();
        tab.expandedModelSections.add(provider.id);
        tab.display();
    });

    // Fetch Models button
    const fetchModelsBtn = modelsHeader.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost smart-mp-btn-ml-4' });
    setIcon(fetchModelsBtn, "refresh-cw");
    fetchModelsBtn.title = $t("settings.llm-provider.fetch-models");
    fetchModelsBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!provider.baseUrl) {
            new Notice($t("notice.settings.base-url-required"));
            return;
        }
        setIcon(fetchModelsBtn, "hourglass");
        fetchModelsBtn.style.pointerEvents = 'none';
        try {
            const remoteIds = await fetchRemoteModelIds(provider.baseUrl, provider.apiKey);
            const existingIds = new Set(provider.models.map(m => m.id));
            let addedCount = 0;
            for (const modelId of remoteIds) {
                if (!existingIds.has(modelId)) {
                    provider.models.push({
                        id: modelId,
                        name: modelId,
                        enabled: true,
                        type: 'chat'
                    });
                    addedCount++;
                }
            }
            await plugin.saveSettings();
            new Notice($t("notice.settings.llm-fetch-success", [String(addedCount)]));
            // Auto-expand models list
            tab.expandedModelSections.add(provider.id);
            tab.display();
        } catch (error) {
            new Notice($t("notice.settings.llm-fetch-failed", [probeErrorMessage(error)]));
        } finally {
            setIcon(fetchModelsBtn, "refresh-cw");
            fetchModelsBtn.style.pointerEvents = 'auto';
        }
    });

    // Models List (collapsible content)
    const modelsListEl = modelsWrapper.createDiv({ cls: 'smart-mp-models-list' });

    const isModelsExpanded = tab.expandedModelSections.has(provider.id);
    if (!isModelsExpanded) {
        modelsListEl.addClass('smart-mp-hidden');
    }
    if (isModelsExpanded) {
        modelsChevron.addClass('smart-mp-rotate-90');
    }

    modelsHeader.addEventListener('click', () => {
        const isCollapsed = modelsListEl.hasClass('smart-mp-hidden');
        modelsListEl.toggleClass('smart-mp-hidden', !isCollapsed);
        modelsChevron.toggleClass('smart-mp-rotate-90', isCollapsed);

        if (isCollapsed) {
            tab.expandedModelSections.add(provider.id);
        } else {
            tab.expandedModelSections.delete(provider.id);
        }
    });

    // Models List Header (only if models exist)
    if (provider.models.length > 0) {
        const headerEl = modelsListEl.createDiv({ cls: 'smart-mp-model-header' });
        headerEl.createSpan({ text: $t("settings.llm-provider.model-id-header"), cls: 'smart-mp-model-header-col' });
        headerEl.createSpan({ text: $t("settings.llm-provider.model-name-header"), cls: 'smart-mp-model-header-col' });
        headerEl.createSpan({ cls: 'smart-mp-model-header-spacer' });
    }

    // Models List Items
    provider.models.forEach((model, idx) => {
        const modelSetting = new Setting(modelsListEl)
            .setClass("smart-mp-model-item");

        // Remove unused info element to maximize space
        modelSetting.infoEl.remove();

        modelSetting.addText(text => {
            text.setPlaceholder($t("settings.llm-provider.model-id-placeholder"))
                .setValue(model.id)
                .onChange(async v => {
                    model.id = v;
                    await plugin.saveSettings();
                });
        });

        modelSetting.addText(text => {
            text.setPlaceholder($t("settings.llm-provider.model-name-placeholder"))
                .setValue(model.name)
                .onChange(async v => {
                    model.name = v;
                    await plugin.saveSettings();
                });
        });

        modelSetting.addToggle(toggle => toggle.setTooltip($t("settings.llm-provider.toggle-model")).setValue(model.enabled).onChange(async v => {
            model.enabled = v;
            await plugin.saveSettings();
        }));

        modelSetting.addExtraButton(btn => btn.setIcon("trash-2").onClick(async () => {
            const wasSelected = plugin.settings.selectedLLMModelId === model.id;
            provider.models.splice(idx, 1);

            // If we deleted the selected model, switch to the first available one or clear it
            if (wasSelected) {
                if (provider.models.length > 0) {
                    plugin.settings.selectedLLMModelId = provider.models[0].id;
                } else {
                    plugin.settings.selectedLLMModelId = "";
                }
            }

            await plugin.saveSettings();
            tab.display();
        }));
    });
}

function addProviderFromPreset(tab: SmartMPSettingTab, preset: ProviderPresetKey) {
    const { plugin } = tab;
    if (!plugin.settings.llmProviders) plugin.settings.llmProviders = [];
    const provider = createProviderFromPreset(preset);
    plugin.settings.llmProviders.push(provider);
    // Auto-expand the newly added provider
    tab.expandedSections.add(provider.id);
    tab.expandedModelSections.add(provider.id);
    void plugin.saveSettings();
    tab.display();
}
