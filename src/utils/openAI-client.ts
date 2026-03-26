import OpenAI from "openai";
import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";
import { LLMProvider } from "src/settings/llm-types";
import { DeepSeekResult } from "../types/types";
import prompt from "./prompt.json";
import { buildPrompt } from "./ai-client";
import { ChatCompletionMessage } from "openai/resources";
import { obsidianFetch } from "./fetch";
import { Logger } from "./logger";
import { BaseAIClient } from "./ai-base-client";

import { ChatMessage, ChatOptions } from "./ai-types";

export class OpenAIClient extends BaseAIClient {
	private static instance: OpenAIClient;

	private constructor(plugin: SmartMPPlugin) {
		super(plugin);
	}

	public static getInstance(plugin: SmartMPPlugin): OpenAIClient {
		if (!OpenAIClient.instance) {
			OpenAIClient.instance = new OpenAIClient(plugin);
		}
		return OpenAIClient.instance;
	}

	/** 核心对话实现 (非流式) */
	protected async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) return "";
		const provider = this.getCurrentProvider();
		if (!provider) return "";

		// 注入 System Prompt
		const finalMessages = provider.systemPrompt 
			? [{ role: "system", content: provider.systemPrompt }, ...messages] 
			: messages;

		try {
			const completion = await openai.chat.completions.create({
				model: this.getCurrentModelId(provider, "gpt-3.5-turbo"),
				messages: finalMessages as any[], // OpenAI SDK 期待特定的接口，但我们的结构是兼容的
				max_tokens: options.max_tokens || 2000,
				temperature: options.temperature || 0.7,
				...(options as any).response_format ? { response_format: (options as any).response_format } : {}
			});
			return completion.choices[0].message.content || "";
		} catch (e) {
			Logger.error("OpenAI", "Chat failed", e);
			throw e;
		}
	}

	/** 核心对话实现 (流式) */
	protected async chatStream(messages: ChatMessage[], options: ChatOptions, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const provider = this.getCurrentProvider();
		if (!provider || !provider.baseUrl) return "";

		const finalMessages = provider.systemPrompt 
			? [{ role: "system", content: provider.systemPrompt }, ...messages] 
			: messages;

		let apiKey = provider.apiKey || "dummy";
		const { safeStreamSSE } = await import("./stream-sse");
		
		return safeStreamSSE({
			url: `${provider.baseUrl}/chat/completions`,
			apiKey,
			model: this.getCurrentModelId(provider, "gpt-3.5-turbo"),
			messages: finalMessages as any[],
			maxTokens: options.max_tokens || 2000,
			temperature: options.temperature || 0.7,
			onChunk,
			signal,
		});
	}

	public async getModelList(): Promise<string[]> {
		const openai = this.getChatAI();
		if (!openai) return [];
		try {
			const models = await openai.models.list();
			return models.data.map((model) => model.id);
		} catch (e) {
			Logger.error("OpenAI", "Failed to list models", e);
			return [];
		}
	}

	private getChatAI(): OpenAI | null {
		const provider = this.getCurrentProvider();
		if (!provider || !provider.baseUrl) return null;

		return new OpenAI({
			'fetch': async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
				return await obsidianFetch(url, init);
			},
			dangerouslyAllowBrowser: true,
			baseURL: provider.baseUrl,
			apiKey: provider.apiKey || "dummy",
		});
	}

	/** 校对逻辑 (保持特有实现以处理复杂 JSON) */
	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		const promptStr = this.getPrompt("proofread", prompt.proofread.map(p => p.content).join(""), content);
		
		try {
			const responseContent = await this.chat([{ role: "user", content: promptStr }], {
				response_format: { type: "json_object" },
				max_tokens: 8192
			});

			if (!responseContent) return this.getEmptyProofResult(content);

			const result = JSON.parse(responseContent);
			let start = 0;
			for (const correction of result.corrections) {
				correction.start = content.indexOf(correction.original, start);
				correction.end = correction.start + correction.original.length;
				start = correction.end;
			}

			return {
				summary: "",
				corrections: result.corrections || [],
				polished: result.polished || content,
				coverImage: "",
			};
		} catch (error) {
			Logger.error("OpenAI", "Error in proofContent", error);
			return this.getEmptyProofResult(content);
		}
	}

	private getEmptyProofResult(content: string): DeepSeekResult {
		return { summary: "", corrections: [], polished: content, coverImage: "" };
	}
}
