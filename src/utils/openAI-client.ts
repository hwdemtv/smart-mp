import { Notice } from "obsidian";
import OpenAI from "openai";
import { $t } from "src/lang/i18n";
import SmartMPPlugin from "src/main";
import { SmartMPSetting } from "src/settings/smart-mp-setting";
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

	private getMessages(key: string, defaultTemplate: any, content: string, account: any): ChatCompletionMessage[] {
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

		if (account.systemPrompt) {
			return [{ role: "system", content: account.systemPrompt }, ...messages] as ChatCompletionMessage[];
		}
		return messages as ChatCompletionMessage[];
	}

	public async getModelList(
		name: string | undefined = undefined
	): Promise<string[]> {
		// return ["gpt-4", "gpt-3.5-turbo", "gpt-3.5-turbo-16k"];
		const openai = this.getChatAI(name);
		if (!openai) {
			return [];
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return [];
		}
		const models = await openai.models.list();
		return models.data.map((model) => model.id);
	}
	public async generateSummary(content: string): Promise<string | null> {
		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return "";
		}
		const messages = this.getMessages("summary", prompt.summary, content, account);

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus", //"deepseek-chat",
			messages: messages,
			max_tokens: 100,
			temperature: 0.7,
		});
		return completion.choices[0].message.content;
	}

	public async proofContent(content: string): Promise<DeepSeekResult | null> {
		const openai = this.getChatAI();
		if (!openai) {
			return null;
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return null;
		}

		const messages = this.getMessages("proofread", prompt.proofread, content, account);

		try {
			const completion = await openai.chat.completions.create({
				model: account.model || "qwen-plus",
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
		if (!openai) {
			return null;
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return null;
		}
		const messages = this.getMessages("polish", prompt.polish, content, account);

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
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

	private getChatAI(name: string | undefined = undefined): OpenAI | null {
		const account = this.plugin.getChatAIAccount(name);
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return null;
		}
		if (account.baseUrl === undefined || !account.baseUrl) {
			new Notice($t("utils.no-ai-server-url-given"));
			return null;
		}
		if (account.apiKey === undefined || !account.apiKey) {
			new Notice($t("utils.no-ai-server-key-given"));
			return null;
		}
		const openai = new OpenAI({
			'fetch': async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
				const response = await obsidianFetch(url, init);
				return response;
			},
			dangerouslyAllowBrowser: true,
			baseURL: account.baseUrl,
			apiKey: account.apiKey,
		});
		return openai;
	}

	public async generateMermaid(content: string): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return "";
		}
		const messages = this.getMessages("mermaid", prompt.mermaid, content, account);

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: messages,
			max_tokens: 1000,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}

	public async generateLaTeX(content: string): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return "";
		}
		const messages = this.getMessages("latex", prompt.latex, content, account);

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: messages,
			max_tokens: 1000,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}

	public async synonym(content: string): Promise<string[]> {
		const openai = this.getChatAI();
		if (!openai) {
			return [];
		}

		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return [];
		}
		const messages = this.getMessages("synonyms", prompt.synonyms, content, account);

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
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
		console.debug('translateText in openAI');

		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			new Notice($t("settings.no-chat-account-selected"));
			return "";
		}
		const messages = this.getMessages("translate", prompt.translate, content, account);

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: messages,
			max_tokens: 4096,
			temperature: 0.7,
		});

		return completion.choices[0].message.content || "";
	}

	public async generateCustom(promptTemplate: string, content: string): Promise<string> {
		const openai = this.getChatAI();
		if (!openai) {
			return "";
		}
		const account = this.plugin.getChatAIAccount();
		if (!account) {
			return "";
		}

		const messages: any[] = [];
		if (account.systemPrompt) {
			messages.push({ role: "system", content: account.systemPrompt });
		}
		messages.push({
			role: "user",
			content: promptTemplate.replace("{{content}}", content)
		});

		const completion = await openai.chat.completions.create({
			model: account.model || "qwen-plus",
			messages: messages,
			max_tokens: 8192,
			temperature: 0.7,
		});
		return completion.choices[0].message.content || "";
	}
}
