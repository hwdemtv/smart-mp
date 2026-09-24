import { SmartMPSetting, DEFAULT_SETTINGS } from "./smart-mp-setting";
import { LLMProvider, LLMProviderType, LLMModel } from "./llm-types";
import { ensureDefaultAssistants } from "./assistant-defaults";
import { CryptoHelper } from "../utils/crypto-helper";
import { Notice } from "obsidian";
import { $t } from "../lang/i18n";
import Logger from "../utils/logger";

/**
 * Migrates old flat chatAccounts to new hierarchical llmProviders
 */
export function migrateSettings(settings: SmartMPSetting): boolean {
    // [Fix] 幂等保护：迁移完成后打上版本标记。此前用户删光 providers 后，
    // 每次启动都会从 chatAccounts 重新生成并弹出"迁移成功"，复活已删除的配置
    if (settings.schemaVersion && settings.schemaVersion >= 2) {
        if (!settings.llmProviders) {
            settings.llmProviders = [];
        }
        return false;
    }

    // If we already have providers, no migration needed
    if (settings.llmProviders && settings.llmProviders.length > 0) {
        settings.schemaVersion = 2; // 补上标记，随下次自然保存持久化
        return false;
    }

    // If we have no legacy accounts, no migration needed
    if (!settings.chatAccounts || settings.chatAccounts.length === 0) {
        // Initialize empty array if undefined
        if (!settings.llmProviders) {
            settings.llmProviders = [];
        }
        settings.schemaVersion = 2;
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
    settings.schemaVersion = 2; // 迁移完成标记，防止下次启动重复迁移

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
    new Notice($t("settings.migrate-success"));

    if (ensureDefaultAssistants(settings)) {
        new Notice($t("settings.restore-assistants-success"));
    }

    return true;
}

/**
 * 将导入的设置 JSON 整形为可安全使用的内存态设置。
 *
 * 此前导入直接整体替换 this.plugin.settings，存在三个问题：
 * 1. 不跑 migrateSettings，旧格式备份导入后缺 llmProviders/默认助手
 * 2. 不与默认值合并，导入文件缺失的字段变成 undefined
 * 3. 手工备份的 data.json 带密文字段和 cryptoKey，直接替换会让
 *    本设备的加解密状态错乱（密钥被静默损坏）
 *
 * 处理策略：
 * - 用导入文件自带的 cryptoKey 解密其中的密文字段（若有），随后丢弃该密钥
 * - 剥离设备绑定态（proToken/proProducts/fallbackDeviceId）
 * - 与 DEFAULT_SETTINGS 合并后跑 migrateSettings 补齐结构
 */
export async function applyImportedSettings(
    raw: Record<string, unknown>
): Promise<SmartMPSetting> {
    // 用导入文件自带的密钥把密文字段解回明文（内存态约定为明文）
    const importedKey = typeof raw.cryptoKey === "string" ? raw.cryptoKey : "";
    if (importedKey) {
        await decryptImportedSecrets(raw, importedKey);
    }

    // 剥离不属于"可迁移配置"的字段：外部加密密钥与设备绑定态
    delete raw.cryptoKey;
    delete raw.proToken;
    delete raw.proProducts;
    delete raw.fallbackDeviceId;
    delete raw._id;
    delete raw._rev;

    const merged = Object.assign({}, DEFAULT_SETTINGS, raw) as SmartMPSetting;
    if (!merged.llmProviders) merged.llmProviders = [];

    // 旧格式（chatAccounts）→ 新架构迁移 + 补默认助手，幂等
    if (migrateSettings(merged)) {
        // migrateSettings 只改内存，不落盘；由调用方决定保存时机
    }

    return merged;
}

async function decryptImportedSecrets(
    raw: Record<string, unknown>,
    key: string
): Promise<void> {
    const secretFields: Array<[Array<Record<string, unknown>>, string]> = [
        [(raw.mpAccounts as Array<Record<string, unknown>>) || [], "appSecret"],
        [(raw.chatAccounts as Array<Record<string, unknown>>) || [], "apiKey"],
        [(raw.drawAccounts as Array<Record<string, unknown>>) || [], "apiKey"],
    ];
    for (const [list, field] of secretFields) {
        for (const item of list) {
            const value = item[field];
            if (typeof value === "string" && CryptoHelper.isEncrypted(value)) {
                try {
                    item[field] = await CryptoHelper.decrypt(value, key);
                } catch (e) {
                    Logger.warn("Migrate", `导入字段 ${field} 解密失败，按原样保留`, e);
                }
            }
        }
    }
    for (const provider of (raw.llmProviders as Array<Record<string, unknown>>) || []) {
        const value = provider.apiKey;
        if (typeof value === "string" && CryptoHelper.isEncrypted(value)) {
            try {
                provider.apiKey = await CryptoHelper.decrypt(value, key);
            } catch (e) {
                Logger.warn("Migrate", "导入的 provider.apiKey 解密失败，按原样保留", e);
            }
        }
    }
}
