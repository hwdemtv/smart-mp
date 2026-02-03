/*
manage the wechat account settings

*/
import PouchDB from 'pouchdb';
import { areObjectsEqual } from 'src/utils/utils';
import { LLMProvider } from './llm-types';

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
    codeTheme?: "github" | "dracula" | "monokai" | "atom-one-dark" | "vs2015" | "default";
    codeLineNumber: boolean;
    showCodeMacHeader?: boolean;
    fontSize?: string;
    firstLineIndent?: boolean;
    linkFootnotes?: boolean;
    showImageCaptions?: boolean;
    showArticleStats?: boolean;
    embedArticleStats?: boolean;
    css_styles_folder: string;
    _id?: string; // = 'smart-mp-setting';
    _rev?: string;
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

export const initSmartMPDB = () => {
    const db = new PouchDB('smart-mp-settings');
    return db;
}
// Create a new database
const db = initSmartMPDB();


export const getSmartMPSetting = (): Promise<SmartMPSetting | undefined> => {
    return new Promise((resolve, reject) => {
        db.get('smart-mp-settings')
            .then((doc) => {
                resolve(doc as SmartMPSetting);
            })
            .catch((error: any) => {
                if (error.status !== 404) {
                    console.warn('获取 SmartMPSetting 失败:', error);
                }
                resolve(undefined)
            });
    })
}

export const saveSmartMPSetting = (doc: SmartMPSetting): Promise<void> => {
    return new Promise((resolve, reject) => {
        doc._id = 'smart-mp-settings';
        db.get(doc._id).then(existedDoc => {
            if (areObjectsEqual(doc, existedDoc)) {
                resolve()
            }
            doc._rev = existedDoc._rev;
            db.put(doc)
                .then(() => {
                    resolve();
                })
                .catch((error: unknown) => {
                    console.error('Error setting SmartMPSetting:', error);
                    resolve()
                });
        }).catch(error => {
            db.put(doc)
                .then(() => {
                    resolve();
                })
                .catch((error: unknown) => {
                    console.error('Error setting SmartMPSetting:', error);
                    resolve()
                });
        })
    })
}
