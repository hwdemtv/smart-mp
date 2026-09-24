import OpenAI from "openai";
import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";
import { LLMProvider } from "src/settings/llm-types";
import { DeepSeekResult } from "../types/types";
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

		// [Fix] 合并设置页全局采样参数（chatSetting）
		const opts = this.mergeOptions(options);
		const params: Record<string, unknown> = {
			model: this.getCurrentModelId(provider, "gpt-3.5-turbo"),
			messages: finalMessages, // OpenAI SDK 期待特定的接口，但我们的结构是兼容的
			max_tokens: opts.max_tokens ?? 2000,
			temperature: opts.temperature ?? 0.7,
		};
		if (opts.top_p != null) params.top_p = opts.top_p;
		if (opts.frequency_penalty != null) params.frequency_penalty = opts.frequency_penalty;
		if (opts.presence_penalty != null) params.presence_penalty = opts.presence_penalty;
		if ((options as any).response_format) params.response_format = (options as any).response_format;

		try {
			const completion = await openai.chat.completions.create(params as any);
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

		// [Fix] 合并设置页全局采样参数（chatSetting）
		const opts = this.mergeOptions(options);
		let apiKey = provider.apiKey || "dummy";
		const { safeStreamSSE } = await import("./stream-sse");

		return safeStreamSSE({
			url: `${provider.baseUrl}/chat/completions`,
			apiKey,
			model: this.getCurrentModelId(provider, "gpt-3.5-turbo"),
			messages: finalMessages as any[],
			maxTokens: opts.max_tokens ?? 2000,
			temperature: opts.temperature ?? 0.7,
			topP: opts.top_p,
			frequencyPenalty: opts.frequency_penalty,
			presencePenalty: opts.presence_penalty,
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

	/** 校对逻辑 (保持特有实现以处理复杂 JSON) */	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		// [Fix] 改用统一的 buildMessages：享受 prompt.json 的 system+user 双消息
		// 精修模板与用户自定义模板覆盖机制
		const messages = this.buildMessages(
			"proofread",
			"你是专业校对编辑，请校对以下文本并仅输出 JSON（corrections 数组）：\n\n{{content}}",
			content
		);

		try {
			const responseContent = await this.chat(messages, {
				response_format: { type: "json_object" },
				max_tokens: 8192
			});

			if (!responseContent) return this.getEmptyProofResult(content);

			// [Fix] 容错提取：模型常在 JSON 外包一层 ```json 代码块或说明文字，
			// 直接 JSON.parse 会失败并丢弃全部结果
			const parsed = this.extractJsonObject(responseContent);
			if (!parsed) {
				Logger.warn("OpenAI", "proofContent: 无法从响应中提取 JSON，回退为整体修正文本");
				return { summary: "", corrections: [], polished: responseContent.trim() || content, coverImage: "" };
			}
			const result = parsed as { corrections?: unknown[]; polished?: string };
			let start = 0;
			for (const correction of (result.corrections as any[]) || []) {
				correction.start = content.indexOf(correction.original, start);
				correction.end = correction.start + correction.original.length;
				start = correction.end;
			}

			return {
				summary: "",
				corrections: (result.corrections as any[]) || [],
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
