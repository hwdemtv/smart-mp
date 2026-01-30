import { SmartMPSetting } from "./smart-mp-setting";
import { LLMProvider, LLMProviderType, LLMModel } from "./llm-types";
import { Notice } from "obsidian";

/**
 * Migrates old flat chatAccounts to new hierarchical llmProviders
 */
export function migrateSettings(settings: SmartMPSetting): boolean {
    // If we already have providers, no migration needed
    if (settings.llmProviders && settings.llmProviders.length > 0) {
        return false;
    }

    // If we have no legacy accounts, no migration needed
    if (!settings.chatAccounts || settings.chatAccounts.length === 0) {
        // Initialize empty array if undefined
        if (!settings.llmProviders) {
            settings.llmProviders = [];
        }
        return false;
    }

    const newProviders: LLMProvider[] = [];

    // Process each legacy account
    for (const oldAccount of settings.chatAccounts) {
        const providerId = crypto.randomUUID();
        const modelId = oldAccount.model || "default-model";

        // Guess provider type based on URL or Name
        let type = LLMProviderType.Custom;
        if (oldAccount.baseUrl?.includes("openai")) type = LLMProviderType.OpenAI;
        else if (oldAccount.baseUrl?.includes("deepseek")) type = LLMProviderType.DeepSeek;
        else if (oldAccount.baseUrl?.includes("ollama") || oldAccount.baseUrl?.includes("localhost")) type = LLMProviderType.Ollama;

        // Create the single model for this provider (since old structure was 1-to-1)
        const model: LLMModel = {
            id: modelId,
            name: modelId, // Use ID as name for migrated models
            enabled: true,
            type: 'chat'
        };

        const provider: LLMProvider = {
            id: providerId,
            type: type,
            name: oldAccount.accountName,
            baseUrl: oldAccount.baseUrl,
            apiKey: oldAccount.apiKey,
            models: [model],
            enabled: true
        };

        newProviders.push(provider);
    }

    settings.llmProviders = newProviders;

    // Attempt to migrate selection
    if (settings.selectedChatAccount) {
        const selectedProvider = newProviders.find(p => p.name === settings.selectedChatAccount);
        if (selectedProvider) {
            settings.selectedLLMProviderId = selectedProvider.id;
            if (selectedProvider.models.length > 0) {
                settings.selectedLLMModelId = selectedProvider.models[0].id;
            }
        }
    }

    // Notify user
    new Notice("SmartMP: LLM Settings migrated to new format.");

    return true;
}
