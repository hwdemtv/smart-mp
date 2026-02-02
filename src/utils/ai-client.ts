import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";
import {
	SmartMPSetting
} from "src/settings/smart-mp-setting";
import { LLMProviderType, LLMProvider } from "src/settings/llm-types";
import { DeepSeekResult } from "../types/types";
import { OllamaClient } from "./ollama-client";
import { OpenAIClient } from "./openAI-client";
import { QwenImageClient } from "./qwen-image-client";

export class AiClient {
	private static instance: AiClient;
	private plugin: SmartMPPlugin;
	private settings: SmartMPSetting;
	private openaiClient: OpenAIClient;
	private ollamaClient: OllamaClient;
	private imageClient: QwenImageClient;

	private constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
		this.openaiClient = OpenAIClient.getInstance(plugin);
		this.ollamaClient = OllamaClient.getInstance(plugin);
		this.imageClient = QwenImageClient.getInstance(plugin);
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
	private getClient() {
		const provider = this.plugin.settings.llmProviders?.find(p => p.id === this.plugin.settings.selectedLLMProviderId);
		if (!provider) {
			throw new Error($t("settings.no-chat-account-selected"));
		}
		if (provider.baseUrl === undefined || !provider.baseUrl) {
			throw new Error($t("utils.no-ai-server-url-given"));
		}

		// Use provider type for routing instead of URL heuristics
		// Ollama type uses native Ollama client, others use OpenAI-compatible client
		if (provider.type === LLMProviderType.Ollama && !provider.baseUrl.includes("/v1")) {
			return this.ollamaClient;
		} else {
			// OpenAI, DeepSeek, Moonshot, Custom (with /v1 endpoint) all use OpenAI client
			return this.openaiClient;
		}
	}
	public async getModelList(): Promise<string[]> {
		const client = this.getClient();
		return await client.getModelList();
	}
	public async generateSummary(content: string): Promise<string | null> {
		const client = this.getClient();
		return await client.generateSummary(content);
	}

	/**
	 * 流式生成摘要
	 */
	public async generateSummaryStream(
		content: string,
		onChunk: (chunk: string) => void,
		signal?: AbortSignal
	): Promise<string> {
		const client = this.getClient();
		if ('generateSummaryStream' in client) {
			return await (client as any).generateSummaryStream(content, onChunk, signal);
		} else {
			// 降级：非流式输出
			const result = await client.generateSummary(content);
			const summary = result || "";
			onChunk(summary);
			return summary;
		}
	}

	public async generateTitle(content: string): Promise<string[]> {
		const client = this.getClient();
		// If client doesn't support generateTitle (e.g. older Ollama impl), return empty
		if ('generateTitle' in client) {
			// @ts-ignore
			return await client.generateTitle(content);
		}
		return [];
	}

	/**
	 * 流式生成标题
	 */
	public async generateTitleStream(
		content: string,
		onChunk: (chunk: string) => void,
		signal?: AbortSignal
	): Promise<string> {
		const client = this.getClient();
		if ('generateTitleStream' in client) {
			return await (client as any).generateTitleStream(content, onChunk, signal);
		} else {
			// 降级：非流式输出
			const results = await this.generateTitle(content);
			const combined = results.join('\n');
			onChunk(combined);
			return combined;
		}
	}


	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		const client = this.getClient();
		return await client.proofContent(content);
	}

	public async polishContent(
		content: string
	): Promise<DeepSeekResult | null> {
		const client = this.getClient();
		return await client.polishContent(content);
	}

	/**
	 * 流式润色内容
	 */
	public async polishContentStream(
		content: string,
		onChunk: (chunk: string) => void,
		signal?: AbortSignal
	): Promise<string> {
		const client = this.getClient();
		if ('polishContentStream' in client) {
			return await (client as any).polishContentStream(content, onChunk, signal);
		} else {
			// 降级：非流式输出，一次性返回
			const result = await (client as any).polishContent(content);
			const polished = result?.polished || "";
			onChunk(polished);
			return polished;
		}
	}

	/**
	 * 流式翻译内容
	 */
	public async translateStream(
		content: string,
		sourceLang: string,
		targetLang: string,
		onChunk: (chunk: string) => void,
		signal?: AbortSignal
	): Promise<string> {
		const client = this.getClient();
		if ('translateTextStream' in client) {
			return await (client as any).translateTextStream(content, sourceLang, targetLang, onChunk, signal);
		} else {
			// 降级：非流式输出，一次性返回
			const result = await (client as any).translateText(content, sourceLang, targetLang);
			onChunk(result);
			return result;
		}
	}

	public async generateCoverImageFromText(
		prompt: string,
		negative_prompt: string = "",
		size: string = "1440*613"
	): Promise<string> {
		return await this.imageClient.generateCoverImageFromText(prompt, negative_prompt, size);
	}


	public async generateMermaid(content: string): Promise<string> {
		const client = this.getClient();
		return await client.generateMermaid(content);
	}

	public async generateLaTeX(content: string): Promise<string> {
		const client = this.getClient();
		return await client.generateLaTeX(content);
	}

	public async synonym(content: string): Promise<string[]> {
		const client = this.getClient();
		return await client.synonym(content);
	}

	public async translateText(
		content: string,
		sourceLang: string = "English",
		targetLang: string = "Chinese"
	): Promise<string> {
		const client = this.getClient();
		return await client.translateText(content, sourceLang, targetLang);
	}

	/**
	 * Get client and provider for a specific providerId, or fall back to global default
	 */
	private getClientForProvider(providerId?: string): { client: OpenAIClient | OllamaClient, provider: LLMProvider } {
		const targetProviderId = providerId || this.plugin.settings.selectedLLMProviderId;
		const provider = this.plugin.settings.llmProviders?.find(p => p.id === targetProviderId);

		if (!provider) {
			throw new Error($t("settings.no-chat-account-selected"));
		}
		if (provider.baseUrl === undefined || !provider.baseUrl) {
			throw new Error($t("utils.no-ai-server-url-given"));
		}

		// Use provider type for routing
		let client: OpenAIClient | OllamaClient;
		if (provider.type === LLMProviderType.Ollama && !provider.baseUrl.includes("/v1")) {
			client = this.ollamaClient;
		} else {
			client = this.openaiClient;
		}

		return { client, provider };
	}

	public async generateCustom(promptTemplate: string, content: string, providerId?: string, modelId?: string): Promise<string> {
		const { client, provider } = this.getClientForProvider(providerId);

		// Determine which model to use
		const targetModelId = modelId || this.plugin.settings.selectedLLMModelId;

		// @ts-ignore - generateCustom with model override
		return await client.generateCustomWithModel(promptTemplate, content, provider, targetModelId);
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

