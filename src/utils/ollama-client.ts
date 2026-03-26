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

		try {
			const response = await ollama.chat({
				model: model || "deepseek-r1",
				messages: messages,
				stream: false,
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

		try {
			const response = await ollama.chat({
				model: model || "deepseek-r1",
				messages: messages,
				stream: true,
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
		const promptStr = this.getPrompt("proofread", `#角色：你是一个专业的文本校对助手... #任务：请校对以下文本：\n\n{{content}}`, content);
		
		try {
			const result = await this.chat([{ role: "user", content: promptStr }]);
			if (!result) return this.getEmptyProofResult(content);

			const json = JSON.parse(result);
			return {
				summary: "",
				corrections: json.corrections || [],
				polished: json.polished || result,
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
