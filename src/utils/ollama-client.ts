import { Ollama } from "ollama";
import { $t } from "src/lang/i18n";
import { Logger } from "src/utils/logger";
import SmartMPPlugin from "src/main";
import { LLMProvider } from "src/settings/llm-types";
import { DeepSeekResult } from "../types/types";
import { removeThinkTags } from "./utils";
import { BaseAIClient } from "./ai-base-client";

import { ChatMessage, ChatOptions } from "./ai-types";

export class OllamaClient extends BaseAIClient {
	private static instance: OllamaClient;

	private constructor(plugin: SmartMPPlugin) {
		super(plugin);
	}

	public static getInstance(plugin: SmartMPPlugin): OllamaClient {
		if (!OllamaClient.instance) {
			OllamaClient.instance = new OllamaClient(plugin);
		}
		return OllamaClient.instance;
	}

	/** 核心对话实现 (非流式) */
	protected async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
		const { ollama, model, systemPrompt } = this.getOllama();
		if (!ollama) return "";

		// [Fix] 注入 provider 配置的 System Prompt（此前取了变量却从未使用）
		// 并应用全局采样参数（temperature / num_predict）
		const opts = this.mergeOptions(options);
		try {
			const response = await ollama.chat({
				model: model || "deepseek-r1",
				messages: systemPrompt
					? [{ role: "system", content: systemPrompt }, ...messages]
					: messages,
				stream: false,
				options: {
					...(opts.temperature != null ? { temperature: opts.temperature } : {}),
					...(opts.max_tokens != null ? { num_predict: opts.max_tokens } : {}),
					...(opts.top_p != null ? { top_p: opts.top_p } : {}),
				},
			});
			return removeThinkTags(response.message.content || "");
		} catch (e) {
			Logger.error("Ollama", "Chat failed", e);
			throw e;
		}
	}

	/** 核心对话实现 (流式) */
	protected async chatStream(messages: ChatMessage[], options: ChatOptions, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const { ollama, model, systemPrompt } = this.getOllama();
		if (!ollama) return "";

		const opts = this.mergeOptions(options);
		try {
			const response = await ollama.chat({
				model: model || "deepseek-r1",
				messages: systemPrompt
					? [{ role: "system", content: systemPrompt }, ...messages]
					: messages,
				stream: true,
				options: {
					...(opts.temperature != null ? { temperature: opts.temperature } : {}),
					...(opts.max_tokens != null ? { num_predict: opts.max_tokens } : {}),
					...(opts.top_p != null ? { top_p: opts.top_p } : {}),
				},
			});

			let result = "";
			for await (const chunk of response) {
				if (signal?.aborted) break;
				const text = chunk.message.content || "";
				result += text;
				if (text) onChunk(text);
			}

			return removeThinkTags(result);
		} catch (e) {
			Logger.error("Ollama", "Stream chat failed", e);
			throw e;
		}
	}

	public async getModelList(): Promise<string[]> {
		try {
			const { ollama } = this.getOllama();
			const models = await ollama.list();
			return models.models.map((model) => model.name);
		} catch (e) {
			Logger.error("Ollama", "Failed to list models", e);
			return [];
		}
	}

	private getOllama(): {
		ollama: Ollama;
		model: string;
		systemPrompt?: string;
	} {
		const provider = this.getCurrentProvider();
		if (!provider) {
			throw new Error($t("settings.no-chat-account-selected"));
		}
		if (!provider.baseUrl) {
			throw new Error($t("utils.no-ai-server-url-given"));
		}

		const ollama = new Ollama({
			host: provider.baseUrl,
		});
		return { 
			ollama, 
			model: this.getCurrentModelId(provider, "deepseek-r1"), 
			systemPrompt: provider.systemPrompt 
		};
	}

	/** 特有的校对实现 (处理 JSON 解析与 Fallback) */
	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		// [Fix] 改用统一的 buildMessages（prompt.json 预置模板 + 自定义覆盖）
		const messages = this.buildMessages(
			"proofread",
			"你是专业校对编辑，请校对以下文本并仅输出 JSON（corrections 数组）：\n\n{{content}}",
			content
		);

		try {
			const result = await this.chat(messages);
			if (!result) return this.getEmptyProofResult(content);

			// [Fix] 容错提取 JSON（```json 包裹/前后杂文字），失败时回退整体修正文本
			const parsed = this.extractJsonObject(result) as { corrections?: any[]; polished?: string } | null;
			if (!parsed) {
				return { summary: "", corrections: [], polished: result.trim() || content, coverImage: "" };
			}
			return {
				summary: "",
				corrections: parsed.corrections || [],
				polished: parsed.polished || result,
				coverImage: "",
			};
		} catch (e) {
			Logger.warn("Ollama", "Failed to parse JSON, using fallback.", e);
			return this.getEmptyProofResult(content);
		}
	}

	private getEmptyProofResult(content: string): DeepSeekResult {
		return { summary: "", corrections: [], polished: content, coverImage: "" };
	}
}
