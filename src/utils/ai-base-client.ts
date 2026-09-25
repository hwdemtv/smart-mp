import SmartMPPlugin from "src/main";
import { SmartMPSetting } from "src/settings/smart-mp-setting";
import { LLMProvider } from "src/settings/llm-types";
import { IAIClient, ChatMessage, ChatOptions } from "./ai-types";
import { DeepSeekResult } from "../types/types";
import promptJson from "./prompt.json";

/** prompt.json 中预置的双角色消息模板 */
type PresetPrompt = Array<{ role: string; content: string[] }>;

export abstract class BaseAIClient implements IAIClient {
	protected plugin: SmartMPPlugin;
	protected settings: SmartMPSetting;
	/**
	 * [新增] 按助手路由 provider/model 的临时覆盖，仅在 generateCustom
	 * 执行期间生效（try/finally 保证复位）。注意：并发触发多个助手时
	 * 单例上可能互相干扰，当前 AI 调用均为用户单次触发，可接受。
	 */
	private providerOverride: { providerId?: string; modelId?: string } | null = null;

	constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
		this.settings = this.plugin.settings;
	}

	protected getCurrentProvider(): LLMProvider | undefined {
		const targetId = this.providerOverride?.providerId ?? this.settings.selectedLLMProviderId;
		return this.settings.llmProviders?.find(p => p.id === targetId);
	}

	protected getCurrentModelId(provider: LLMProvider, defaultModel: string): string {
		// [Fix] 助手指定的 modelId 优先；未覆盖时才用全局选中模型
		if (this.providerOverride?.modelId) {
			return this.providerOverride.modelId;
		}
		if (!this.providerOverride && this.settings.selectedLLMModelId) {
			return this.settings.selectedLLMModelId;
		}
		return provider.models.length > 0 ? provider.models[0].id : defaultModel;
	}

	/** 模板变量替换：{{content}} 及扩展变量（{{targetLang}} 等） */
	private applyTemplateVars(template: string, vars: Record<string, string>): string {
		let out = template;
		for (const [placeholder, value] of Object.entries(vars)) {
			out = out.split(placeholder).join(value);
		}
		return out;
	}

	/**
	 * [Fix] 统一的 Prompt 构建入口，优先级：
	 * 1. 用户自定义模板（settings.customPrompts[key]）
	 * 2. prompt.json 预置的 system+user 双消息精修模板（此前仅 proofread 使用，其余闲置）
	 * 3. 内置单条回退 prompt
	 */
	protected buildMessages(
		key: string,
		fallbackUserPrompt: string,
		content: string,
		extraVars: Record<string, string> = {}
	): ChatMessage[] {
		const vars: Record<string, string> = { "{{content}}": content, ...extraVars };

		const customTemplate = this.settings.customPrompts?.[key];
		if (customTemplate) {
			return [{ role: "user", content: this.applyTemplateVars(customTemplate, vars) }];
		}

		const preset = (promptJson as Record<string, PresetPrompt | undefined>)[key];
		if (preset && preset.length > 0) {
			return preset
				.filter(m => m && m.role && Array.isArray(m.content))
				.map(m => ({
					role: m.role as ChatMessage["role"],
					content: this.applyTemplateVars(m.content.join(""), vars),
				}));
		}

		return [{ role: "user", content: this.applyTemplateVars(fallbackUserPrompt, vars) }];
	}

	/**
	 * [Fix] 合并设置页全局采样参数（chatSetting 此前定义了类型但从未被读取）。
	 * 功能级参数优先，其次用户全局设置，最后内置默认值。
	 */
	protected mergeOptions(featureOptions: ChatOptions = {}): ChatOptions {
		const cs = this.settings.chatSetting || {};
		const merged: ChatOptions = { ...featureOptions };
		if (merged.max_tokens == null && cs.max_tokens != null) merged.max_tokens = cs.max_tokens;
		if (merged.temperature == null && cs.temperature != null) merged.temperature = cs.temperature;
		if (merged.top_p == null && cs.top_p != null) merged.top_p = cs.top_p;
		if (merged.frequency_penalty == null && cs.frequency_penalty != null) merged.frequency_penalty = cs.frequency_penalty;
		if (merged.presence_penalty == null && cs.presence_penalty != null) merged.presence_penalty = cs.presence_penalty;
		return merged;
	}

	/** 抽象对话接口，由子类实现具体协议 (OpenAI/Ollama) */
	protected abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
	protected abstract chatStream(messages: ChatMessage[], options: ChatOptions, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>;

	abstract getModelList(): Promise<string[]>;

	async generateSummary(content: string): Promise<string | null> {
		const messages = this.buildMessages("summary", "总结下面的一段话, 句子完整，行文流畅。输出的字数最多100个字符：\n\n{{content}}", content);
		return this.chat(messages, { max_tokens: 1000 });
	}

	async generateSummaryStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const messages = this.buildMessages("summary", "总结下面的一段话, 句子完整，行文流畅。输出的字数最多100个字符：\n\n{{content}}", content);
		return this.chatStream(messages, { max_tokens: 1000 }, onChunk, signal);
	}

	async generateTitle(content: string): Promise<string[]> {
		const truncatedContent = content.length > 3000 ? content.slice(0, 3000) + "..." : content;
		const messages = this.buildMessages("headline", "为以下内容生成 5-10 个吸引人的爆款标题：\n\n{{content}}", truncatedContent);
		const result = await this.chat(messages, { max_tokens: 2000 });
		if (!result) return [];
		return result.split('\n')
			.map(line => line.trim().replace(/^[\d\-\.\*]+[\.\s]*/, ''))
			.filter(line => line.length > 0);
	}

	async polishContent(content: string): Promise<DeepSeekResult | null> {
		const messages = this.buildMessages("polish", "请对以下内容进行润色，提升表达清晰度和专业性：\n\n{{content}}", content);
		const result = await this.chat(messages, { max_tokens: 8192 });
		return {
			summary: "",
			corrections: [],
			polished: result || content,
			coverImage: "",
		};
	}

	async polishContentStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const messages = this.buildMessages("polish", "请对以下内容进行润色，提升表达清晰度和专业性：\n\n{{content}}", content);
		return this.chatStream(messages, { max_tokens: 8192 }, onChunk, signal);
	}

	async synonym(content: string): Promise<string[]> {
		const messages = this.buildMessages("synonyms", "请为以下内容提供 10 个同义词：\n\n{{content}}", content);
		const result = await this.chat(messages, { max_tokens: 200 });
		return result ? result.split("\n").map(s => s.trim().replace(/^[\d\-\.\*]+[\.\s]*/, '')).slice(0, 10) : [];
	}

	async getSynonymsStream(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const messages = this.buildMessages("synonyms", "请为以下内容提供 10 个同义词：\n\n{{content}}", content);
		return this.chatStream(messages, { max_tokens: 200 }, onChunk, signal);
	}

	async generateMermaid(content: string): Promise<string> {
		const messages = this.buildMessages("mermaid", "请为以下内容生成 Mermaid 图表代码：\n\n{{content}}", content);
		return this.chat(messages, { max_tokens: 2000 }) || "";
	}

	async generateLaTeX(content: string): Promise<string> {
		const messages = this.buildMessages("latex", "请为以下内容生成 LaTeX 公式：\n\n{{content}}", content);
		return this.chat(messages, { max_tokens: 2000 }) || "";
	}

	async translateText(content: string, sourceLang: string, targetLang: string): Promise<string> {
		const messages = this.buildMessages(
			"translate",
			`请将以下内容从 ${sourceLang} 翻译成 ${targetLang}：\n\n{{content}}`,
			content,
			{ "{{sourceLang}}": sourceLang, "{{targetLang}}": targetLang }
		);
		return this.chat(messages, { max_tokens: 4096 }) || "";
	}

	async translateTextStream(content: string, sourceLang: string, targetLang: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string> {
		const messages = this.buildMessages(
			"translate",
			`请将以下内容从 ${sourceLang} 翻译成 ${targetLang}：\n\n{{content}}`,
			content,
			{ "{{sourceLang}}": sourceLang, "{{targetLang}}": targetLang }
		);
		return this.chatStream(messages, { max_tokens: 4096 }, onChunk, signal);
	}

	async generateCustom(promptTemplate: string, content: string, providerId?: string, modelId?: string): Promise<string> {
		// [Fix] 真正使用助手指定的 provider/model：此前参数被接收后直接丢弃，
		// 永远走全局默认模型，设置页的按助手配置形同虚设
		if (providerId || modelId) {
			this.providerOverride = { providerId, modelId };
		}
		try {
			const promptStr = this.applyTemplateVars(promptTemplate, { "{{content}}": content });
			return this.chat([{ role: "user", content: promptStr }], { max_tokens: 8192 });
		} finally {
			this.providerOverride = null;
		}
	}

	/** 从模型响应中容错提取 JSON 对象（处理 ```json 包裹与前后杂文字） */
	protected extractJsonObject(text: string): unknown | null {
		try {
			return JSON.parse(text);
		} catch {
			// 继续
		}
		const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (fenced) {
			try { return JSON.parse(fenced[1]); } catch { /* 继续 */ }
		}
		const brace = text.match(/\{[\s\S]*\}/);
		if (brace) {
			try { return JSON.parse(brace[0]); } catch { /* 继续 */ }
		}
		return null;
	}

	// 强制子类实现 proofContent，因为其复杂的 JSON 逻辑难以在基类通用化
	abstract proofContent(content: string): Promise<DeepSeekResult | null>;
}
