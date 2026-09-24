import { LLMProvider, LLMProviderType } from "./llm-types";
import { $t } from "src/lang/i18n";

export type ProviderPresetKey =
    | "deepseek"
    | "openai"
    | "ollama"
    | "glm"
    | "siliconflow"
    | "qwen"
    | "moonshot"
    | "gemini"
    | "custom";

interface ProviderPreset {
    type: LLMProviderType;
    icon: string;
    /** 下拉菜单中显示的名称（含图标） */
    menuLabel: string;
    /** 新建 Provider 的默认名称 */
    defaultName: string;
    baseUrl: string;
    models: Array<{ id: string; name: string }>;
}

/**
 * 服务商预设的唯一权威数据表。
 * 此前 createProviderFromPreset（130 行 if-else）与图标 switch
 * （26 行）各自硬编码同一份知识，新增服务商要改两处。
 */
const PRESETS: Record<ProviderPresetKey, ProviderPreset> = {
    deepseek: {
        type: LLMProviderType.DeepSeek,
        icon: "🐋",
        menuLabel: "🐋 DeepSeek",
        defaultName: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        models: [
            { id: "deepseek-chat", name: "DeepSeek Chat" },
            { id: "deepseek-coder", name: "DeepSeek Coder" },
            { id: "deepseek-reasoner", name: "DeepSeek R1" },
        ],
    },
    openai: {
        type: LLMProviderType.OpenAI,
        icon: "🤖",
        menuLabel: "🤖 OpenAI",
        defaultName: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        models: [
            { id: "gpt-4o", name: "GPT-4o" },
            { id: "gpt-4o-mini", name: "GPT-4o Mini" },
            { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
        ],
    },
    ollama: {
        type: LLMProviderType.Ollama,
        icon: "🦙",
        menuLabel: "🦙 Ollama",
        defaultName: "Ollama (Local)",
        baseUrl: "http://localhost:11434/v1",
        models: [
            { id: "llama3.2", name: "Llama 3.2" },
            { id: "deepseek-r1:8b", name: "DeepSeek R1 8B" },
            { id: "qwen2.5:7b", name: "Qwen 2.5 7B" },
        ],
    },
    glm: {
        type: LLMProviderType.GLM,
        icon: "🔮",
        menuLabel: "🔮 智谱 AI (GLM)",
        defaultName: "智谱 AI (GLM)",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        models: [
            { id: "glm-4-plus", name: "GLM-4 Plus" },
            { id: "glm-4-flash", name: "GLM-4 Flash" },
            { id: "glm-4v-plus", name: "GLM-4V Plus (视觉)" },
        ],
    },
    siliconflow: {
        type: LLMProviderType.SiliconFlow,
        icon: "💎",
        menuLabel: "💎 硅基流动",
        defaultName: "硅基流动 (SiliconFlow)",
        baseUrl: "https://api.siliconflow.cn/v1",
        models: [
            { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3" },
            { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen2.5 72B" },
            { id: "Pro/deepseek-ai/DeepSeek-R1", name: "DeepSeek R1" },
        ],
    },
    qwen: {
        type: LLMProviderType.Qwen,
        icon: "☁️",
        menuLabel: "☁️ 通义千问",
        defaultName: "通义千问 (Qwen)",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        models: [
            { id: "qwen-max", name: "Qwen Max" },
            { id: "qwen-plus", name: "Qwen Plus" },
            { id: "qwen-turbo", name: "Qwen Turbo" },
        ],
    },
    moonshot: {
        type: LLMProviderType.Moonshot,
        icon: "🌙",
        menuLabel: "🌙 月之暗面",
        defaultName: "月之暗面 (Moonshot)",
        baseUrl: "https://api.moonshot.cn/v1",
        models: [
            { id: "moonshot-v1-8k", name: "Moonshot 8K" },
            { id: "moonshot-v1-32k", name: "Moonshot 32K" },
            { id: "moonshot-v1-128k", name: "Moonshot 128K" },
        ],
    },
    gemini: {
        type: LLMProviderType.Gemini,
        icon: "✨",
        menuLabel: "✨ Google Gemini",
        defaultName: "Google Gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        models: [
            { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
            { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
            { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
        ],
    },
    custom: {
        type: LLMProviderType.Custom,
        icon: "⚙️",
        menuLabel: "⚙️ " + ($t("settings.llm-provider.add-custom") || "自定义"),
        defaultName: "Custom Provider (自定义)",
        baseUrl: "",
        models: [{ id: "model-id", name: "Model Name" }],
    },
};

/** 图标查表（provider 列表头部用） */
export function providerIcon(type: LLMProviderType): { icon: string; title: string } {
    const preset = Object.values(PRESETS).find((p) => p.type === type);
    return { icon: preset?.icon ?? "⚙️", title: preset?.defaultName ?? "Custom" };
}

/** 按 key 生成新 Provider 实例（随机 UUID） */
export function createProviderFromPreset(key: ProviderPresetKey): LLMProvider {
    const preset = PRESETS[key];
    return {
        id: crypto.randomUUID(),
        type: preset.type,
        name: preset.defaultName,
        baseUrl: preset.baseUrl,
        apiKey: "",
        models: preset.models.map((m) => ({
            id: m.id,
            name: m.name,
            enabled: true,
            type: "chat" as const,
        })),
        enabled: true,
    };
}

/** 填充"添加服务商"下拉菜单 */
export function fillPresetOptions(
    addOption: (value: string, text: string) => void
): void {
    (Object.keys(PRESETS) as ProviderPresetKey[]).forEach((key) => {
        addOption(key, PRESETS[key].menuLabel);
    });
}
