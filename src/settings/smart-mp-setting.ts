/*
manage the wechat account settings

*/
import { Plugin } from 'obsidian';
import { areObjectsEqual } from 'src/utils/utils';
import { LLMProvider } from './llm-types';
import Logger from 'src/utils/logger';

export type WeChatAccountInfo = {
    _id?: string;
    accountName: string;
    appId: string;
    appSecret: string;
    access_token?: string;
    expires_in?: number;
    lastRefreshTime?: number;
    isTokenValid?: boolean;
    doc_id?: string;
}

export type AIChatAccountInfo = {
    _id?: string;
    accountName: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt?: string;
    doc_id?: string;
}
export type AITaskAccountInfo = {
    _id?: string;
    accountName: string;
    baseUrl: string;
    taskUrl: string;
    apiKey: string;
    model: string;
    systemPrompt?: string;
    doc_id?: string;
}

export type CustomAssistant = {
    id: string;
    name: string;
    prompt: string;
    enabled?: boolean;
    isDefault?: boolean;
    // Per-assistant model selection (optional, falls back to global default)
    providerId?: string;
    modelId?: string;
}

// export type SmartMPAccountInfo = WeChatAccountInfo | AIChatAccountInfo | AITaskAccountInfo;
export type SmartMPSetting = {
    useCenterToken: boolean;
    realTimeRender: boolean;
    realTimeRenderDelay?: number;
    scrollSync?: boolean;
    enableStrictSecurityMode?: boolean;
    previewer_wxname?: string;
    custom_theme?: string;
    themePreset?: string;
    codeTheme?: "github" | "github-light" | "dracula" | "monokai" | "atom-one-dark" | "vs2015" | "default";
    codeLineNumber: boolean;
    showCodeMacHeader?: boolean;
    fontSize?: string;
    firstLineIndent?: boolean;
    linkFootnotes?: boolean;
    showImageCaptions?: boolean;
    showArticleStats?: boolean;
    embedArticleStats?: boolean;
    css_styles_folder: string;
    _id?: string; // deprecated (PouchDB), kept for type compat
    _rev?: string; // deprecated (PouchDB), kept for type compat
    ipAddress?: string;
    selectedMPAccount?: string;
    selectedChatAccount?: string;
    selectedDrawAccount?: string;
    mpAccounts: Array<WeChatAccountInfo>;
    chatAccounts: Array<AIChatAccountInfo>;
    drawAccounts: Array<AITaskAccountInfo>;
    accountDataPath: string;
    chatSetting: ChatSetting;
    customPrompts?: Record<string, string>;
    customAssistantList?: CustomAssistant[];
    hrStyle?: string;
    customHrText?: string;

    // New LLM Architecture
    llmProviders?: Array<LLMProvider>;
    selectedLLMProviderId?: string;
    selectedLLMModelId?: string;
    cryptoKey?: string; // For upgraded encryption
    enableFloatingToolbar?: boolean;
    proPassword?: string; // Password to unlock Pro features (remove watermark)
    proToken?: string; // Cloudflare worker returned JWT token for true Pro validation
    fallbackDeviceId?: string; // UUID fallback for cases where HWID is unavailable
    proProducts?: Array<{ product_id: string, expires_at: string | null, status: string }>;

    // ============== 滚动同步增强设置 ==============
    /** 同步精度预设: 'precise' | 'balanced' | 'performance' */
    scrollSyncPrecision?: 'precise' | 'balanced' | 'performance';
    /** 高亮样式预设: 'gold' | 'blue' | 'green' | 'purple' | 'minimal' | 'custom' */
    scrollHighlightPreset?: 'gold' | 'blue' | 'green' | 'purple' | 'minimal' | 'custom';
    /** 自定义高亮样式（当 scrollHighlightPreset 为 'custom' 时使用） */
    customScrollHighlight?: {
        backgroundColor?: string;
        borderColor?: string;
        borderWidth?: string;
    };
    /** 是否启用代码块内部行号映射 */
    enableCodeBlockLineMapping?: boolean;
    /** 滚动同步模式: 'precise' (按行对齐) | 'proportional' (按百分比对齐) */
    scrollSyncMode?: 'precise' | 'proportional';
}

export type ChatSetting = {
    _id?: string;
    _rev?: string;
    chatSelected?: string;
    modelSelected?: string;
    temperature?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    max_tokens?: number;
}

export const getSmartMPSetting = async (plugin: Plugin): Promise<SmartMPSetting | undefined> => {
    try {
        const data = await plugin.loadData();
        return data?.settings as SmartMPSetting | undefined;
    } catch (error) {
        Logger.warn("SmartMPSetting", "获取 SmartMPSetting 失败:", error);
        return undefined;
    }
}

export const saveSmartMPSetting = async (plugin: Plugin, doc: SmartMPSetting): Promise<void> => {
    try {
        const existing = (await plugin.loadData()) || {};

        // Strip PouchDB fields before saving
        const cleaned = { ...doc };
        delete cleaned._id;
        delete cleaned._rev;

        // Skip write if unchanged
        if (existing.settings && areObjectsEqual(cleaned, existing.settings)) {
            return;
        }

        existing.settings = cleaned;
        await plugin.saveData(existing);
    } catch (error) {
        Logger.error("SmartMPSetting", "Error saving SmartMPSetting:", error);
    }
}
