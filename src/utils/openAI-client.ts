import { Notice } from "obsidian";
import OpenAI from "openai";
import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";
import { SmartMPSetting } from "src/settings/smart-mp-setting";
import { LLMProvider } from "src/settings/llm-types";
import { DeepSeekResult } from "../types/types";
import prompt from "./prompt.json";
import { buildPrompt, Prompt } from "./ai-client";
import { ChatCompletionMessage } from "openai/resources";
import { obsidianFetch } from "./fetch";
export class OpenAIClient {
	private static instance: OpenAIClient;
	private plugin: SmartMPPlugin;
	private settings: SmartMPSetting;

	private constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
	}

	public static getInstance(plugin: SmartMPPlugin): OpenAIClient {
		if (!OpenAIClient.instance) {
			OpenAIClient.instance = new OpenAIClient(plugin);
		}
		return OpenAIClient.instance;
	}

	private getCurrentProvider(): LLMProvider | undefined {
		return this.settings.llmProviders?.find(p => p.id === this.settings.selectedLLMProviderId);
	}

	private getCurrentModelId(provider: LLMProvider): string {
		if (this.settings.selectedLLMModelId) {
			return this.settings.selectedLLMModelId;
		}
		return provider.models.length > 0 ? provider.models[0].id : "gpt-3.5-turbo";
	}

	private getMessages(key: string, defaultTemplate: any, content: string, provider: LLMProvider): ChatCompletionMessage[] {
		const customTemplate = this.settings.customPrompts?.[key];
		let messages: any[];

		if (customTemplate) {
			messages = [{
				role: "user",
				content: customTemplate.replace("{{content}}", content)
			}];
		} else {
			messages = buildPrompt(defaultTemplate);
			messages[1].content = messages[1].content.replace("{{content}}", content);
		}

		if (provider.systemPrompt) {
			return [{ role: "system", content: provider.systemPrompt }, ...messages] as ChatCompletionMessage[];
		}
		return messages as ChatCompletionMessage[];
	}

	public async getModelList(
		name: string | undefined = undefined
	): Promise<string[]> {
		const openai = this.getChatAI();
		if (!openai) {
			return [];
		}
		try {
			const models = await openai.models.list();
			return models.data.map((model) => model.id);
		} catch (e) {
			console.error("Failed to list models", e);
			return [];
		}
	}
	public async generateSummary(content: string): Promise<string | null> {
		const openai = this.getChatAI();
		if (!openai) return "";
		const provider = this.getCurrentProvider();
		if (!provider) return "";

		const messages = this.getMessages("summary", prompt.summary, content, provider);

		const completion = await openai.chat.completions.create({
			model: this.getCurrentModelId(provider),
			messages: messages,
			max_tokens: 1000,
			temperature: 0.7,
		});
		return completion.choices[0].message.content;
	}

	/**
	 * 流式生成摘要
	 */
	public async generateSummaryStream(
		content: string,
		onChunk: (chunk: string) => void,
		signal?: AbortSignal
	): Promise<string> {
		const provider = this.getCurrentProvider();
		if (!provider || !provider.baseUrl) return "";

		const messages = this.getMessages("summary", prompt.summary, content, provider);
		const modelId = this.getCurrentModelId(provider);

		let apiKey = provider.apiKey;
		if (!apiKey) {
			if (provider.baseUrl.includes("openai.com")) {
				return "";
			}
			apiKey = "dummy";
		}

		const { safeStreamSSE } = await import("./stream-sse");
		return safeStreamSSE({
			url: `${provider.baseUrl}/chat/completions`,
			apiKey,
			model: modelId,
			messages,
			maxTokens: 1000,
			temperature: 0.7,
			onChunk,
			signal,
		});
	}

	public async generateTitle(content: string): Promise<string[]> {
		const openai = this.getChatAI();
		if (!openai) return [];
		const provider = this.getCurrentProvider();
		if (!provider) return [];

		// Truncate content to avoid context limit (3000 chars is usually enough for title gen)
		const truncatedContent = content.length > 3000 ? content.slice(0, 3000) + "..." : content;
		// @ts-ignore - headline is newly added
		const messages = this.getMessages("headline", prompt.headline, truncatedContent, provider);

		const completion = await openai.chat.completions.create({
			model: this.getCurrentModelId(provider),
			messages: messages,
			max_tokens: 2000,
			temperature: 0.8, // Slightly higher temperature for creativity
		});

		const result = completion.choices[0].message.content;
		if (!result) return [];

		// Parse result: split by newline, filter empty, trim
		return result.split('\n')
			.map(line => line.trim())
			.filter(line => line.length > 0)
			// Remove common list prefixes if AI ignored instructions
			.map(line => line.replace(/^[\d\-\.\*]+[\.\s]*/, ''))
			.filter(line => line.length > 0);
	}

	/**
	 * 流式生成标题
	 */
	public async generateTitleStream(
		content: string,
		onChunk: (chunk: string) => void,
		signal?: AbortSignal
	): Promise<string> {
		const provider = this.getCurrentProvider();
		if (!provider || !provider.baseUrl) return "";

		const truncatedContent = content.length > 3000 ? content.slice(0, 3000) + "..." : content;
		// @ts-ignore
		const messages = this.getMessages("headline", prompt.headline, truncatedContent, provider);
		const modelId = this.getCurrentModelId(provider);

		let apiKey = provider.apiKey;
		if (!apiKey) {
			if (provider.baseUrl.includes("openai.com")) {
				return "";
			}
			apiKey = "dummy";
		}

		const url = `${provider.baseUrl}/chat/completions`;

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: modelId,
					messages: messages,
					max_tokens: 2000,
					temperature: 0.8,
					stream: true,
				}),
				signal: signal,
			});

			if (!response.ok) {
				throw new Error(`API 请求失败: ${response.status}`);
			}

			if (!response.body) {
				throw new Error("响应没有 body，可能不支持流式");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let result = "";
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (signal?.aborted) break;

				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split('\n');
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed.startsWith('data: ')) {
						const data = trimmed.slice(6);
						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices?.[0]?.delta?.content || "";
							if (delta) {
								result += delta;
								onChunk(delta);
							}
						} catch (e) {
							// 忽略解析错误
						}
					}
				}
			}

			return result;
		} catch (error) {
			if ((error as any).name === 'AbortError') {
				console.log("流式标题生成已中断");
				return "";
			}
			throw error;
		}
	}

	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		const openai = this.getChatAI();
		if (!openai) return null;
		const provider = this.getCurrentProvider();
		if (!provider) return null;

		const messages = this.getMessages("proofread", prompt.proofread, content, provider);

		try {
			const completion = await openai.chat.completions.create({
				model: this.getCurrentModelId(provider),
				messages: messages,
				response_format: { type: "json_object" },
				max_tokens: 8192,
				temperature: 0.7,
			});


			const responseContent = completion.choices[0].message.content;
			if (!responseContent) {
				return {
					summary: "",
					corrections: [],
					polished: content,
					coverImage: "",
				};
			}

			const result = JSON.parse(responseContent);
			let start = 0;
			for (const correction of result.corrections) {
				correction.start = content.indexOf(correction.original, start);
				correction.end = correction.start + correction.original.length;
				start = correction.end;
				console.debug(
					`text[${correction.start},${correction.end}]: ${correction.original} -> ${correction.suggestion} `
				);
			}

			return {
				summary: "",
				corrections: result.corrections || [],
				polished: result.polished || content,
				coverImage: "",
			};
		} catch (error) {
			console.error("Error in proofContent:", error);
			return {
				summary: "",
				corrections: [],
				polished: content,
				coverImage: "",
			};
		}
	}

	public async polishContent(
		content: string
	): Promise<DeepSeekResult | null> {
		const openai = this.getChatAI();
		if (!openai) return null;
		const provider = this.getCurrentProvider();
		if (!provider) return null;

		const messages = this.getMessages("polish", prompt.polish, content, provider);

		const completion = await openai.chat.completions.create({
			model: this.getCurrentModelId(provider),
			messages: messages,
			max_tokens: 8192,
			temperature: 0.7,
		});
		return {
			summary: "",
			corrections: [],
			polished: completion.choices[0].message.content || "",
			coverImage: "",
		};
	}

	/**
	 * 流式润色内容 - 实时返回生成的文本块
	 * 注意：使用原生 fetch 因为 obsidianFetch 不支持流式响应体
	 * @param content 要润色的内容
	 * @param onChunk 每次收到新文本块时的回调
	 * @param signal AbortController 信号，用于中断生成
	 * @returns 最终完整的润色结果
	 */
	public async polishContentStream(
		content: string,
		onChunk: (chunk: string) => void,
		signal?: AbortSignal
	): Promise<string> {
		const provider = this.getCurrentProvider();
		if (!provider || !provider.baseUrl) return "";

		const messages = this.getMessages("polish", prompt.polish, content, provider);
		const modelId = this.getCurrentModelId(provider);

		let apiKey = provider.apiKey;
		if (!apiKey) {
			if (provider.baseUrl.includes("openai.com")) {
				return "";
			}
			apiKey = "dummy";
		}

		// 使用原生 fetch 支持流式响应
		const url = `${provider.baseUrl}/chat/completions`;

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: modelId,
					messages: messages,
					max_tokens: 8192,
					temperature: 0.7,
					stream: true,
				}),
				signal: signal,
			});

			if (!response.ok) {
				throw new Error(`API 请求失败: ${response.status}`);
			}

			if (!response.body) {
				throw new Error("响应没有 body，可能不支持流式");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let result = "";
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (signal?.aborted) break;

				buffer += decoder.decode(value, { stream: true });

				// 解析 SSE 格式
				const lines = buffer.split('\n');
				buffer = lines.pop() || ""; // 保留未完成的行

				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed.startsWith('data: ')) {
						const data = trimmed.slice(6);
						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices?.[0]?.delta?.content || "";
							if (delta) {
								result += delta;
								onChunk(delta);
							}
						} catch (e) {
							// 忽略解析错误
						}
					}
				}
			}

			return result;
		} catch (error) {
			if ((error as any).name === 'AbortError') {
				console.log("流式生成已中断");
				return "";
			}
			throw error;
		}
	}
	private getChatAI(): OpenAI | null {
		const provider = this.getCurrentProvider();
		if (!provider) {
			new Notice($t("settings.no-chat-account-selected"));
			return null;
		}
		if (!provider.baseUrl) {
			new Notice($t("utils.no-ai-server-url-given"));
			return null;
		}

		// Some providers/proxies don't need API Key (e.g. local Ollama sometimes?), but better enforce providing something or handle it.
		// For consistency, we warn if missing.
		// For OpenAI official API, key is required.
		// For other providers (e.g. local Ollama), key might be optional.
		let finalApiKey = provider.apiKey;
		if (!finalApiKey) {
			if (provider.baseUrl.includes("openai.com")) {
				new Notice($t("utils.no-ai-server-key-given"));
				return null;
			}
			// For local/custom providers, use a dummy key to satisfy OpenAI SDK
			finalApiKey = "dummy";
		}

		const openai = new OpenAI({
			'fetch': async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
				const response = await obsidianFetch(url, init);
				return response;
			},
			dangerouslyAllowBrowser: true,
			baseURL: provider.baseUrl,
			apiKey: finalApiKey,
		});
		return openai;
	}

	public async generateMermaid(content: string): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) return "";
		const provider = this.getCurrentProvider();
		if (!provider) return "";

		const messages = this.getMessages("mermaid", prompt.mermaid, content, provider);

		const completion = await openai.chat.completions.create({
			model: this.getCurrentModelId(provider),
			messages: messages,
			max_tokens: 1000,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}

	public async generateLaTeX(content: string): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) return "";
		const provider = this.getCurrentProvider();
		if (!provider) return "";

		const messages = this.getMessages("latex", prompt.latex, content, provider);

		const completion = await openai.chat.completions.create({
			model: this.getCurrentModelId(provider),
			messages: messages,
			max_tokens: 1000,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}

	public async synonym(content: string): Promise<string[]> {
		const openai = this.getChatAI();
		if (!openai) return [];
		const provider = this.getCurrentProvider();
		if (!provider) return [];

		const messages = this.getMessages("synonyms", prompt.synonyms, content, provider);

		const completion = await openai.chat.completions.create({
			model: this.getCurrentModelId(provider),
			messages: messages,
			max_tokens: 200,
			temperature: 0.7,
		});

		const synonyms =
			completion.choices[0].message.content?.split("\n") || [];
		return synonyms.slice(0, 10);
	}

	public async translateText(
		content: string,
		sourceLang: string = "English",
		targetLang: string = "Chinese"
	): Promise<string> {
		const provider = this.getCurrentProvider();
		if (!provider || !provider.baseUrl) return "";

		const messages = this.getMessages("translate", prompt.translate, content, provider);
		const modelId = this.getCurrentModelId(provider);

		let apiKey = provider.apiKey;
		if (!apiKey) {
			if (provider.baseUrl.includes("openai.com")) {
				return "";
			}
			apiKey = "dummy";
		}

		// 使用原生 fetch 并添加超时
		const url = `${provider.baseUrl}/chat/completions`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: modelId,
					messages: messages,
					max_tokens: 4096,
					temperature: 0.7,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`API 请求失败: ${response.status}`);
			}

			const data = await response.json();
			return data.choices?.[0]?.message?.content || "";
		} catch (error) {
			clearTimeout(timeoutId);
			if ((error as any).name === 'AbortError') {
				console.error("翻译请求超时");
				throw new Error("翻译请求超时，请检查网络或 API 服务");
			}
			throw error;
		}
	}

	/**
	 * 流式翻译文本
	 */
	public async translateTextStream(
		content: string,
		sourceLang: string = "English",
		targetLang: string = "Chinese",
		onChunk: (chunk: string) => void,
		signal?: AbortSignal
	): Promise<string> {
		const provider = this.getCurrentProvider();
		if (!provider || !provider.baseUrl) return "";

		const messages = this.getMessages("translate", prompt.translate, content, provider);
		const modelId = this.getCurrentModelId(provider);

		let apiKey = provider.apiKey;
		if (!apiKey) {
			if (provider.baseUrl.includes("openai.com")) {
				return "";
			}
			apiKey = "dummy";
		}

		const url = `${provider.baseUrl}/chat/completions`;

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: modelId,
					messages: messages,
					max_tokens: 4096,
					temperature: 0.7,
					stream: true,
				}),
				signal: signal,
			});

			if (!response.ok) {
				throw new Error(`API 请求失败: ${response.status}`);
			}

			if (!response.body) {
				throw new Error("响应没有 body，可能不支持流式");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let result = "";
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (signal?.aborted) break;

				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split('\n');
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed.startsWith('data: ')) {
						const data = trimmed.slice(6);
						if (data === '[DONE]') continue;

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices?.[0]?.delta?.content || "";
							if (delta) {
								result += delta;
								onChunk(delta);
							}
						} catch (e) {
							// 忽略解析错误
						}
					}
				}
			}

			return result;
		} catch (error) {
			if ((error as any).name === 'AbortError') {
				console.log("流式翻译已中断");
				return "";
			}
			throw error;
		}
	}

	public async generateCustom(promptTemplate: string, content: string): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) return "";
		const provider = this.getCurrentProvider();
		if (!provider) return "";

		const messages: any[] = [];
		if (provider.systemPrompt) {
			messages.push({ role: "system", content: provider.systemPrompt });
		}
		messages.push({
			role: "user",
			content: promptTemplate.replace("{{content}}", content)
		});

		const completion = await openai.chat.completions.create({
			model: this.getCurrentModelId(provider),
			messages: messages,
			max_tokens: 8192,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}

	/**
	 * Generate custom content using a specific provider and model (for per-assistant model selection)
	 */
	public async generateCustomWithModel(promptTemplate: string, content: string, provider: LLMProvider, modelId: string): Promise<string> {
		const openai = this.getChatAIForProvider(provider);
		if (!openai) return "";

		const messages: any[] = [];
		if (provider.systemPrompt) {
			messages.push({ role: "system", content: provider.systemPrompt });
		}
		messages.push({
			role: "user",
			content: promptTemplate.replace("{{content}}", content)
		});

		const completion = await openai.chat.completions.create({
			model: modelId,
			messages: messages,
			max_tokens: 8192,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}

	/**
	 * Get OpenAI client for a specific provider
	 */
	private getChatAIForProvider(provider: LLMProvider): OpenAI | null {
		if (!provider.baseUrl) {
			new Notice($t("utils.no-ai-server-url-given"));
			return null;
		}

		let finalApiKey = provider.apiKey;
		if (!finalApiKey) {
			if (provider.baseUrl.includes("openai.com")) {
				new Notice($t("utils.no-ai-server-key-given"));
				return null;
			}
			finalApiKey = "dummy";
		}

		const openai = new OpenAI({
			'fetch': async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
				const response = await obsidianFetch(url, init);
				return response;
			},
			dangerouslyAllowBrowser: true,
			baseURL: provider.baseUrl,
			apiKey: finalApiKey,
		});
		return openai;
	}
}
