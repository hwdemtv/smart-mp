export enum LLMProviderType {
    OpenAI = 'openai',
    DeepSeek = 'deepseek',
    Ollama = 'ollama',
    GLM = 'glm',           // 智谱 AI
    SiliconFlow = 'siliconflow', // 硅基流动
    Qwen = 'qwen',         // 通义千问
    Moonshot = 'moonshot', // 月之暗面
    Gemini = 'gemini',     // Google Gemini
    Custom = 'custom'
}

export interface LLMModel {
    id: string; // e.g., "deepseek-chat"
    name: string; // Display name
    enabled: boolean;
    type: 'chat' | 'embedding'; // Future proofing
}

export interface LLMProvider {
    id: string; // UUID
    type: LLMProviderType;
    name: string; // e.g., "DeepSeek"
    baseUrl: string;
    apiKey: string;
    systemPrompt?: string;
    models: LLMModel[];
    enabled: boolean;
}
