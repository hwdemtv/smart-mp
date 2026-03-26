import SmartMPPlugin from "src/main";
import { SmartMPSetting } from "src/settings/smart-mp-setting";
import { LLMProvider } from "src/settings/llm-types";
import { IAIClient, ChatMessage, ChatOptions } from "./ai-types";
import { DeepSeekResult } from "../types/types";

export abstract class BaseAIClient implements IAIClient {
	protected plugin: SmartMPPlugin;
	protected settings: SmartMPSetting;

	constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
	}

	protected getCurrentProvider(): LLMProvider | undefined {
		return this.settings.llmProviders?.find(p => p.id === this.settings.selectedLLMProviderId);
	}

	protected getCurrentModelId(provider: LLMProvider, defaultModel: string): string {
		if (this.settings.selectedLLMModelId) {
			return this.settings.selectedLLMModelId;
		}
		return provider.models.length > 0 ? provider.models[0].id : defaultModel;
	}

	/** 获取 Prompt */
	protected getPrompt(key: string, defaultPrompt: string, content: string): string {
		const customTemplate = this.settings.customPrompts?.[key];
		if (customTemplate) {
			return customTemplate.replace("{{content}}", content);
		}
		return defaultPrompt.replace("{{content}}", content);
	}

	/** 抽象对话接口，由子类实现具体协议 (OpenAI/Ollama) */
	protected abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
	protected abstract chatStream(messages: ChatMessage[], options: ChatOptions, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>;

	abstract getModelList(): Promise<string[]>;

	async generateSummary(content: string): Promise<string | null> {
		const promptStr = this.getPrompt("summary", "总结下面的一段话, 句子完整，行文流畅。输出的字数最多100个字符：\n\n{{content}}", content);
		return this.chat([{ role: "user", content: promptStr }], { max_tokens: 1000 });
	}

	async generateSummaryStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const promptStr = this.getPrompt("summary", "总结下面的一段话, 句子完整，行文流畅。输出的字数最多100个字符：\n\n{{content}}", content);
		return this.chatStream([{ role: "user", content: promptStr }], { max_tokens: 1000 }, onChunk, signal);
	}

	async generateTitle(content: string): Promise<string[]> {
		const truncatedContent = content.length > 3000 ? content.slice(0, 3000) + "..." : content;
		const promptStr = this.getPrompt("headline", "为以下内容生成 5-10 个吸引人的爆款标题：\n\n{{content}}", truncatedContent);
		const result = await this.chat([{ role: "user", content: promptStr }], { max_tokens: 2000, temperature: 0.8 });
		if (!result) return [];
		return result.split('\n')
			.map(line => line.trim().replace(/^[\d\-\.\*]+[\.\s]*/, ''))
			.filter(line => line.length > 0);
	}

	async polishContent(content: string): Promise<DeepSeekResult | null> {
		const promptStr = this.getPrompt("polish", "请对以下内容进行润色，提升表达清晰度和专业性：\n\n{{content}}", content);
		const result = await this.chat([{ role: "user", content: promptStr }], { max_tokens: 8192 });
		return {
			summary: "",
			corrections: [],
			polished: result || content,
			coverImage: "",
		};
	}

	async polishContentStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const promptStr = this.getPrompt("polish", "请对以下内容进行润色，提升表达清晰度和专业性：\n\n{{content}}", content);
		return this.chatStream([{ role: "user", content: promptStr }], { max_tokens: 8192 }, onChunk, signal);
	}

	async synonym(content: string): Promise<string[]> {
		const promptStr = this.getPrompt("synonyms", "请为以下内容提供 10 个同义词：\n\n{{content}}", content);
		const result = await this.chat([{ role: "user", content: promptStr }], { max_tokens: 200 });
		return result ? result.split("\n").map(s => s.trim().replace(/^[\d\-\.\*]+[\.\s]*/, '')).slice(0, 10) : [];
	}

	async getSynonymsStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const promptStr = this.getPrompt("synonyms", "请为以下内容提供 10 个同义词：\n\n{{content}}", content);
		return this.chatStream([{ role: "user", content: promptStr }], { max_tokens: 200 }, onChunk, signal);
	}

	async generateMermaid(content: string): Promise<string> {
		const promptStr = this.getPrompt("mermaid", "请为以下内容生成 Mermaid 图表代码：\n\n{{content}}", content);
		return this.chat([{ role: "user", content: promptStr }], { max_tokens: 2000 }) || "";
	}

	async generateLaTeX(content: string): Promise<string> {
		const promptStr = this.getPrompt("latex", "请为以下内容生成 LaTeX 公式：\n\n{{content}}", content);
		return this.chat([{ role: "user", content: promptStr }], { max_tokens: 2000 }) || "";
	}

	async translateText(content: string, sourceLang: string, targetLang: string): Promise<string> {
		const promptStr = this.getPrompt("translate", `请将以下内容从 ${sourceLang} 翻译成 ${targetLang}：\n\n{{content}}`, content);
		return this.chat([{ role: "user", content: promptStr }], { max_tokens: 4096 }) || "";
	}

	async translateTextStream(content: string, sourceLang: string, targetLang: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const promptStr = this.getPrompt("translate", `请将以下内容从 ${sourceLang} 翻译成 ${targetLang}：\n\n{{content}}`, content);
		return this.chatStream([{ role: "user", content: promptStr }], { max_tokens: 4096 }, onChunk, signal);
	}

	async generateCustom(promptTemplate: string, content: string, providerId?: string, modelId?: string): Promise<string> {
		const promptStr = promptTemplate.replace("{{content}}", content);
		return this.chat([{ role: "user", content: promptStr }], { max_tokens: 8192 });
	}

	// 强制子类实现 proofContent，因为其复杂的 JSON 逻辑难以在基类通用化
	abstract proofContent(content: string): Promise<DeepSeekResult | null>;
}
