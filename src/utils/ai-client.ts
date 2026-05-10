import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";
import { SmartMPSetting } from "src/settings/smart-mp-setting";
import { LLMProviderType, LLMProvider } from "src/settings/llm-types";
import { DeepSeekResult } from "../types/types";
import { OllamaClient } from "./ollama-client";
import { OpenAIClient } from "./openAI-client";
import { QwenImageClient } from "./qwen-image-client";
import { IAIClient } from "./ai-types";

export class AiClient {
	private static instance: AiClient;
	private plugin: SmartMPPlugin;
	private openaiClient: OpenAIClient;
	private ollamaClient: OllamaClient;
	private imageClient: QwenImageClient;

	private constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
	}

	public static getInstance(plugin: SmartMPPlugin): AiClient {
		if (!AiClient.instance) {
			AiClient.instance = new AiClient(plugin);
		}
		return AiClient.instance;
	}

	public static onPluginUnload() {
		this.instance = undefined as any;
	}

	private async getClient(): Promise<IAIClient> {
		await this.plugin.ensureDecrypted();

		const provider = this.plugin.settings.llmProviders?.find(p => p.id === this.plugin.settings.selectedLLMProviderId);
		if (!provider) {
			throw new Error($t("settings.no-chat-account-selected"));
		}
		if (provider.baseUrl === undefined || !provider.baseUrl) {
			throw new Error($t("utils.no-ai-server-url-given"));
		}

		if (provider.type === LLMProviderType.Ollama && !provider.baseUrl.includes("/v1")) {
			if (!this.ollamaClient) this.ollamaClient = OllamaClient.getInstance(this.plugin);
			return this.ollamaClient;
		} else {
			if (!this.openaiClient) this.openaiClient = OpenAIClient.getInstance(this.plugin);
			return this.openaiClient;
		}
	}

	public async getModelList(): Promise<string[]> {
		return (await this.getClient()).getModelList();
	}

	public async generateSummary(content: string): Promise<string | null> {
		return (await this.getClient()).generateSummary(content);
	}

	public async generateSummaryStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const client = await this.getClient();
		return client.generateSummaryStream ? client.generateSummaryStream(content, onChunk, signal) : "";
	}

	public async generateTitle(content: string): Promise<string[]> {
		return (await this.getClient()).generateTitle(content);
	}

	public async generateTitleStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const client = await this.getClient();
		return client.generateTitleStream ? client.generateTitleStream(content, onChunk, signal) : "";
	}

	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		return (await this.getClient()).proofContent(content);
	}

	public async proofContentStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const client = await this.getClient();
		return client.proofContentStream ? client.proofContentStream(content, onChunk, signal) : "";
	}

	public async polishContent(content: string): Promise<DeepSeekResult | null> {
		return (await this.getClient()).polishContent(content);
	}

	public async polishContentStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const client = await this.getClient();
		return client.polishContentStream ? client.polishContentStream(content, onChunk, signal) : "";
	}

	public async translateText(content: string, sourceLang: string, targetLang: string): Promise<string> {
		return (await this.getClient()).translateText(content, sourceLang, targetLang);
	}

	public async translateStream(content: string, sourceLang: string, targetLang: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const client = await this.getClient();
		return client.translateTextStream ? client.translateTextStream(content, sourceLang, targetLang, onChunk, signal) : "";
	}

	public async generateMermaid(content: string): Promise<string> {
		return (await this.getClient()).generateMermaid(content);
	}

	public async generateLaTeX(content: string): Promise<string> {
		return (await this.getClient()).generateLaTeX(content);
	}

	public async synonym(content: string): Promise<string[]> {
		return (await this.getClient()).synonym(content);
	}

	public async getSynonymsStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const client = await this.getClient();
		if (client.getSynonymsStream) {
			return client.getSynonymsStream(content, onChunk, signal);
		}
		// Fallback kept for backward compatibility if a specific client doesn't implement it
		const result = await client.synonym(content);
		const text = result.join(", ");
		onChunk(text);
		return text;
	}

	public async generateCustom(promptTemplate: string, content: string, providerId?: string, modelId?: string): Promise<string> {
		return (await this.getClient()).generateCustom(promptTemplate, content, providerId, modelId);
	}

	public async generateCoverImageFromText(prompt: string, negative_prompt: string = "", size: string = "1440*613"): Promise<string> {
		await this.plugin.ensureDecrypted();
		if (!this.imageClient) this.imageClient = QwenImageClient.getInstance(this.plugin);
		return this.imageClient.generateCoverImageFromText(prompt, negative_prompt, size);
	}
}


export interface Prompt {
	role: string;
	content: string[];
}

export const buildPrompt = (msg: Prompt[]) => {
	return msg.map((item) => {
		return {
			role: item.role,
			content: item.content.join(""),
		}
	})
};

