
import { Notice, Setting, setIcon } from "obsidian";
import { SettingSection } from "./setting-section";
import { $t } from "src/lang/i18n";
import { LLMProvider, LLMProviderType } from "../llm-types";

export class AiChatSection extends SettingSection {
    private expandedSections: Set<string> = new Set();
    private initialAssistantPrompts: Record<string, string> = {};

    render(): void {
        // Init cache if needed
        this.plugin.settings.customAssistantList?.forEach(a => {
            this.initialAssistantPrompts[a.id] = a.prompt;
        });

        this.createAiChatSettings(this.container);
        this.createCustomPromptSettings(this.container);
    }

    // Helper to refresh view - in full implementation we might need a better reactivity model
    private refresh() {
        this.container.empty();
        this.render();
    }

    private createAiChatSettings(container: HTMLElement) {
        const frame = this.createCollapsibleFrame($t("settings.text-llm"), false, 'ww-main-sections', 'smart-mp-setting-frame', container);

        // 1. Global Selection (Default Provider & Model)
        new Setting(frame)
            .setName($t("settings.llm-provider.default-provider"))
            .addDropdown(dropdown => {
                const providers = this.plugin.settings.llmProviders || [];
                providers.forEach(p => dropdown.addOption(p.id, p.name));
                dropdown.setValue(this.plugin.settings.selectedLLMProviderId || "")
                    .onChange(async val => {
                        this.plugin.settings.selectedLLMProviderId = val;
                        // Auto-select first model of the new provider
                        const p = providers.find(p => p.id === val);
                        if (p && p.models.length > 0) {
                            this.plugin.settings.selectedLLMModelId = p.models[0].id;
                        } else {
                            this.plugin.settings.selectedLLMModelId = "";
                        }
                        await this.plugin.saveSettings();
                        this.refresh();
                    });
            });

        new Setting(frame)
            .setName($t("settings.llm-provider.default-model"))
            .addDropdown(dropdown => {
                const providers = this.plugin.settings.llmProviders || [];
                const currentProvider = providers.find(p => p.id === this.plugin.settings.selectedLLMProviderId);
                if (currentProvider) {
                    currentProvider.models.forEach(m => dropdown.addOption(m.id, m.name));
                    dropdown.setValue(this.plugin.settings.selectedLLMModelId || "")
                        .onChange(async val => {
                            this.plugin.settings.selectedLLMModelId = val;
                            await this.plugin.saveSettings();
                        });
                }
            });

        // 2. Add Provider Dropdown
        const providerHeader = new Setting(frame)
            .setName($t("settings.llm-provider.manage-providers"))
            .setHeading();

        // Add provider dropdown
        providerHeader.addDropdown(dropdown => {
            dropdown.addOption("", "➕ " + ($t("settings.llm-provider.add-provider") || "添加服务商"));
            dropdown.addOption("deepseek", "🐋 DeepSeek");
            dropdown.addOption("openai", "🤖 OpenAI");
            dropdown.addOption("ollama", "🦙 Ollama");
            dropdown.addOption("glm", "🔮 智谱 AI (GLM)");
            dropdown.addOption("siliconflow", "💎 硅基流动");
            dropdown.addOption("qwen", "☁️ 通义千问");
            dropdown.addOption("moonshot", "🌙 月之暗面");
            dropdown.addOption("gemini", "✨ Google Gemini");
            dropdown.addOption("custom", "⚙️ " + ($t("settings.llm-provider.add-custom")?.replace("+ ", "") || "自定义"));
            dropdown.setValue("");
            dropdown.onChange(val => {
                if (val) {
                    this.createProviderFromPreset(val as any);
                    dropdown.setValue(""); // Reset dropdown
                    this.refresh();
                }
            });
        });

        // 3. Provider List
        this.renderProviderList(frame);
    }

    private createProviderFromPreset(type: "deepseek" | "openai" | "ollama" | "glm" | "siliconflow" | "qwen" | "moonshot" | "gemini" | "custom") {
        let newProvider: LLMProvider = {
            id: crypto.randomUUID(),
            name: "New Provider",
            type: LLMProviderType.Custom,
            baseUrl: "",
            apiKey: "",
            models: [],
            enabled: true
        };

        if (type === "deepseek") {
            newProvider = {
                id: crypto.randomUUID(),
                name: "DeepSeek",
                type: LLMProviderType.DeepSeek,
                baseUrl: "https://api.deepseek.com",
                apiKey: "",
                models: [
                    { id: "deepseek-chat", name: "DeepSeek V3", enabled: true, type: 'chat' },
                    { id: "deepseek-reasoner", name: "DeepSeek R1", enabled: true, type: 'chat' }
                ],
                enabled: true
            };
        } else if (type === "openai") {
            newProvider = {
                id: crypto.randomUUID(),
                name: "OpenAI",
                type: LLMProviderType.OpenAI,
                baseUrl: "https://api.openai.com/v1",
                apiKey: "",
                models: [
                    { id: "gpt-4o", name: "GPT-4o", enabled: true, type: 'chat' },
                    { id: "gpt-4o-mini", name: "GPT-4o Mini", enabled: true, type: 'chat' }
                ],
                enabled: true
            };
        }

        if (!this.plugin.settings.llmProviders) this.plugin.settings.llmProviders = [];
        this.plugin.settings.llmProviders.push(newProvider);
        this.expandedSections.add(newProvider.id);
        void this.plugin.saveSettings();
    }

    private renderProviderList(container: HTMLElement) {
        const providers = this.plugin.settings.llmProviders || [];
        providers.forEach((provider, index) => {
            const wrapper = container.createDiv({ cls: 'smart-mp-provider-wrapper smart-mp-account-wrapper' });

            // Collapsible Header
            const headerEl = wrapper.createDiv({ cls: 'smart-mp-provider-header smart-mp-account-header' });

            // Left side: chevron + icon + name + model count
            const leftSide = headerEl.createDiv({ cls: 'smart-mp-provider-header-left smart-mp-account-left' });

            const chevron = leftSide.createSpan({ cls: 'smart-mp-chevron smart-mp-account-chevron' });
            chevron.textContent = '▶';

            // Provider type icon
            const iconSpan = leftSide.createSpan({ cls: 'smart-mp-provider-icon smart-mp-account-icon' });
            iconSpan.textContent = '🤖';

            const nameSpan = leftSide.createSpan({ text: provider.name, cls: 'smart-mp-account-name' });

            const countSpan = leftSide.createSpan({ text: `(${provider.models.length} Models)`, cls: 'smart-mp-account-count' });

            // Right side: buttons (sorting, duplicate, delete)
            const rightSide = headerEl.createDiv({ cls: 'smart-mp-provider-header-right smart-mp-account-right' });

            // Delete button
            const deleteBtn = rightSide.createEl('button', { cls: 'clickable-icon smart-mp-btn-ghost' });
            setIcon(deleteBtn, "trash-2");
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Delete ${provider.name}?`)) {
                    this.plugin.settings.llmProviders = this.plugin.settings.llmProviders?.filter(p => p.id !== provider.id);
                    await this.plugin.saveSettings();
                    this.refresh();
                }
            });

            const detailsEl = wrapper.createDiv({ cls: 'smart-mp-provider-details smart-mp-account-details' });

            const shouldExpand = this.expandedSections.has(provider.id);
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
                    this.expandedSections.add(provider.id);
                } else {
                    this.expandedSections.delete(provider.id);
                }
            });

            this.renderProviderDetails(provider, detailsEl);
        });
    }

    private renderProviderDetails(provider: LLMProvider, container: HTMLElement) {
        new Setting(container)
            .setName($t("settings.llm-provider.provider-name"))
            .addText(text => {
                text.setValue(provider.name)
                    .onChange(async v => {
                        provider.name = v;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(container)
            .setName("Base URL")
            .addText(text => {
                text.setValue(provider.baseUrl)
                    .onChange(async v => {
                        provider.baseUrl = v;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(container)
            .setName("API Key")
            .addText(text => {
                text.setValue(provider.apiKey)
                    .onChange(async v => {
                        provider.apiKey = v;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = "password";
            });
    }

    private ensureDefaultAssistants() {
        if (!this.plugin.settings.customAssistantList) {
            this.plugin.settings.customAssistantList = [];
        }

        const defaults = [
            { id: "polish", name: $t("settings.assistant.polish") },
            { id: "proofread", name: $t("settings.assistant.proofread") },
            { id: "synonyms", name: $t("settings.assistant.synonyms") },
            { id: "translate", name: $t("settings.assistant.translate") },
            { id: "mermaid", name: $t("settings.assistant.mermaid") },
            { id: "latex", name: $t("settings.assistant.latex") },
            { id: "summary", name: $t("settings.assistant.summary") },
            { id: "text-to-image", name: $t("main.text-to-image") },
        ];

        defaults.forEach((def) => {
            const exists = this.plugin.settings.customAssistantList?.some(a => a.id === def.id);
            if (!exists) {
                this.plugin.settings.customAssistantList?.push({
                    id: def.id,
                    name: def.name,
                    prompt: this.plugin.settings.customPrompts?.[def.id] || "",
                    enabled: true,
                    isDefault: true
                });
            }
        });
    }

    private createCustomPromptSettings(container: HTMLElement) {
        this.ensureDefaultAssistants();
        const frame = this.createCollapsibleFrame($t("settings.assistant-prompts-customization"), false, 'ww-main-sections', 'smart-mp-setting-frame', container);

        const header = new Setting(frame)
            .setName($t("settings.custom-instruction-templates"))
            .setDesc($t("settings.custom-prompt-desc"))
            .setHeading();

        header.addButton((button) => {
            button
                .setButtonText($t("settings.restore-defaults"))
                .setWarning()
                .onClick(() => {
                    if (confirm($t("settings.confirm-restore-defaults"))) {
                        this.plugin.settings.customPrompts = {};
                        this.plugin.settings.customAssistantList?.forEach(a => {
                            if (a.isDefault) {
                                a.prompt = "";
                            }
                        });
                        void this.plugin.saveSettings();
                        this.refresh();
                    }
                });
        });

        this.createDynamicAssistantSettings(frame);
    }

    private createDynamicAssistantSettings(container: HTMLElement) {
        // Use nested frame style if desired, or just append since parent is already a frame
        const managementFrame = this.createCollapsibleFrame($t("settings.assistant.dynamic-assistants"), true, 'ww-sub-sections', 'smart-mp-setting-frame', container);

        const header = new Setting(managementFrame)
            .setHeading();

        header.addButton((button) => {
            button
                .setButtonText($t("settings.assistant.add-assistant"))
                .setCta()
                .onClick(() => {
                    if (!this.plugin.settings.customAssistantList) {
                        this.plugin.settings.customAssistantList = [];
                    }
                    this.plugin.settings.customAssistantList.push({
                        id: Date.now().toString(),
                        name: "New Assistant",
                        prompt: "指令模板，使用 {{content}} 代表原文",
                        enabled: true,
                    });
                    void this.plugin.saveSettings();
                    this.refresh();
                });
        });

        header.addButton((button) => {
            button
                .setButtonText("一键添加公众号模板")
                .setTooltip("添加标题优化、开头钩子、互动结尾助手")
                .onClick(() => {
                    if (!this.plugin.settings.customAssistantList) {
                        this.plugin.settings.customAssistantList = [];
                    }

                    const templates = [
                        {
                            id: "mp_title_" + Date.now(),
                            name: "公众号标题优化",
                            prompt: "你是一位10w+爆款公众号文章的资深标题策划师，深谙读者心理和传播规律。\n\n## 标题技法\n1. **悬念法**：引发好奇心，让人想一探究竟\n2. **数字法**：具体数字增加可信度和吸引力\n3. **痛点法**：直击读者痛点，引发共鸣\n4. **利益法**：明确告知读者能获得什么\n5. **对比法**：前后对比，突出变化效果\n6. **故事法**：用故事元素增加代入感\n\n## 微信规范（必须遵守）\n- 字数：15-28个汉字为佳，不超过32个汉字\n- 前15字必须包含核心吸引点（避免被折叠）\n- 禁止：虚假夸大、低俗诱导、敏感政治内容\n\n## 输出要求\n- 生成5-8个风格各异的标题\n- 每行一个，纯文本，无序号无符号\n- 不要出现'标题'二字\n\n## 优秀示例\n- 月薪5000到月薪5万，我只用了这3招\n- 35岁被裁员后，我才明白这个残酷真相\n- 读完这10本书，我的认知彻底被颠覆了\n\n请为以下内容生成爆款标题：\n\n{{content}}",
                            enabled: true
                        },
                        {
                            id: "mp_hook_" + Date.now(),
                            name: "公众号开头钩子",
                            prompt: "你是一位资深公众号编辑，擅长撰写吸引眼球的开头钩子（Hook）。\n\n## 开头钩子类型\n1. **痛点提问**：直击读者痛点的疑问句\n2. **惊人数据**：用数据制造冲击力\n3. **故事开场**：用故事引发代入感\n4. **权威引用**：引用名人名言或研究\n5. **反转观点**：颠覆常识的观点\n6. **紧迫性**：制造时间紧迫感\n\n## 输出要求\n- 生成3个不同的开头钩子\n- 每个钩子不超过50字\n- 直接输出，不添加序号\n- 语言生动有力，有冲击力\n\n请为以下内容生成开头钩子：\n\n{{content}}",
                            enabled: true
                        },
                        {
                            id: "mp_end_" + Date.now(),
                            name: "公众号互动结尾",
                            prompt: "你是一位擅长提升用户互动的公众号编辑，请为文章撰写引导互动的结尾。\n\n## 互动结尾类型\n1. **提问互动**：提出与文章相关的问题\n2. **行动召唤**：引导读者采取行动\n3. **福利诱导**：承诺福利引导关注/点赞\n4. **话题讨论**：发起话题讨论\n5. **个人故事**：邀请读者分享经历\n\n## 输出要求\n- 生成3个互动结尾\n- 每个结尾包含明确的行动指引\n- 语气亲切自然，像朋友对话\n- 直接输出，不添加序号\n\n请为以下内容生成互动结尾：\n\n{{content}}",
                            enabled: true
                        }
                    ];

                    let addedCount = 0;
                    templates.forEach(tpl => {
                        const exists = this.plugin.settings.customAssistantList?.some(a => a.name === tpl.name);
                        if (!exists) {
                            this.plugin.settings.customAssistantList?.push(tpl);
                            addedCount++;
                        }
                    });

                    if (addedCount > 0) {
                        void this.plugin.saveSettings();
                        this.refresh();
                        new Notice(`成功添加 ${addedCount} 个公众号助手模板`);
                    } else {
                        new Notice($t("notice.settings.template-exists") ?? "模板已存在，无需重复添加");
                    }
                });
        });

        if (this.plugin.settings.customAssistantList) {
            this.plugin.settings.customAssistantList.forEach((assistant, index) => {
                const assistantDetails = managementFrame.createEl("details", { cls: "smart-mp-custom-assistant-item smart-mp-setting-frame" });

                assistantDetails.setAttribute('name', 'ww-assistant-group');
                if (this.expandedSections.has(assistant.id)) {
                    assistantDetails.setAttribute('open', '');
                }
                assistantDetails.ontoggle = () => {
                    if (assistantDetails.open) {
                        this.expandedSections.add(assistant.id);
                    } else {
                        this.expandedSections.delete(assistant.id);
                    }
                };

                const summary = assistantDetails.createEl("summary");

                const titleSpan = summary.createEl("span", { text: assistant.name });
                titleSpan.style.fontWeight = "bold";
                titleSpan.style.flexGrow = "1";
                if (assistant.enabled === false) {
                    titleSpan.style.textDecoration = "line-through";
                    titleSpan.style.color = "var(--text-muted)";
                }

                const controls = summary.createDiv();
                controls.style.display = "flex";
                controls.style.gap = "8px";
                controls.style.alignItems = "center";

                // Stop propagation so clicking buttons doesn't toggle details
                controls.onClickEvent((e) => e.stopPropagation());

                // Enable Toggle
                const toggle = new Setting(controls)
                    .addToggle((t) => t
                        .setValue(assistant.enabled !== false)
                        .setTooltip($t("settings.assistant.enable-assistant"))
                        .onChange(async (val) => {
                            assistant.enabled = val;
                            if (val) {
                                titleSpan.style.textDecoration = "none";
                                titleSpan.style.color = "var(--text-normal)";
                            } else {
                                titleSpan.style.textDecoration = "line-through";
                                titleSpan.style.color = "var(--text-muted)";
                            }
                            await this.plugin.saveSettings();
                        })
                    );
                toggle.infoEl.remove();
                toggle.settingEl.style.border = "none";
                toggle.settingEl.style.padding = "0";

                // Sorting buttons
                new Setting(controls)
                    .addExtraButton(b => {
                        b.setIcon("arrow-up")
                            .setTooltip($t("settings.assistant.move-up"))
                            .onClick(() => {
                                const list = this.plugin.settings.customAssistantList!;
                                [list[index - 1], list[index]] = [list[index], list[index - 1]];
                                void this.plugin.saveSettings();
                                this.refresh();
                            });
                        if (index === 0) b.extraSettingsEl.style.visibility = "hidden";
                    }).settingEl.style.border = "none";

                new Setting(controls)
                    .addExtraButton(b => {
                        b.setIcon("arrow-down")
                            .setTooltip($t("settings.assistant.move-down"))
                            .onClick(() => {
                                const list = this.plugin.settings.customAssistantList!;
                                [list[index + 1], list[index]] = [list[index], list[index + 1]];
                                void this.plugin.saveSettings();
                                this.refresh();
                            });
                        if (index === (this.plugin.settings.customAssistantList?.length || 0) - 1) b.extraSettingsEl.style.visibility = "hidden";
                    }).settingEl.style.border = "none";

                // Delete Button
                new Setting(controls)
                    .addExtraButton(b => b
                        .setIcon("trash-2")
                        .setTooltip($t("settings.assistant.delete-assistant"))
                        .onClick(() => {
                            this.plugin.settings.customAssistantList?.splice(index, 1);
                            void this.plugin.saveSettings();
                            this.refresh();
                        })
                    ).settingEl.style.border = "none";

                // Content
                const content = assistantDetails.createDiv();
                content.style.marginTop = "10px";
                content.style.borderTop = "1px solid var(--background-modifier-border)";
                content.style.paddingTop = "10px";

                new Setting(content)
                    .setName($t("settings.assistant.assistant-name"))
                    .setDesc($t("settings.assistant.assistant-name-desc"))
                    .addText((text) =>
                        text.setValue(assistant.name).onChange((value) => {
                            assistant.name = value;
                            titleSpan.setText(value);
                            void this.plugin.saveSettings();
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
                                    if (!this.plugin.settings.customPrompts) this.plugin.settings.customPrompts = {};
                                    this.plugin.settings.customPrompts[assistant.id] = value;
                                }
                                void this.plugin.saveSettings();
                            })
                    );

                // Per-Assistant Model Selection
                const modelSectionHeader = new Setting(content)
                    .setName($t("settings.llm-provider.default-provider") + " / " + $t("settings.llm-provider.default-model"))
                    .setDesc($t("settings.ai-chat-section.model-select-desc"));

                const providers = this.plugin.settings.llmProviders || [];

                // Provider dropdown
                modelSectionHeader.addDropdown(dropdown => {
                    dropdown.addOption("", "-- 使用全局默认 --");
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
                        await this.plugin.saveSettings();
                        this.refresh();
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
                                await this.plugin.saveSettings();
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
                                    if (this.plugin.settings.customPrompts) {
                                        delete this.plugin.settings.customPrompts[assistant.id];
                                    }
                                } else {
                                    assistant.prompt = this.initialAssistantPrompts[assistant.id] || "";
                                }
                                await this.plugin.saveSettings();
                                this.refresh();
                            });
                    });
            });
        }
    }
}
