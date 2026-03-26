import { DeepSeekResult } from "../types/types";

export type ChatRole = "system" | "user" | "assistant";

/**
 * AI 聊天消息接口
 */
export interface ChatMessage {
	role: ChatRole;
	content: string;
}

/**
 * AI 聊天配置选项
 */
export interface ChatOptions {
	model?: string;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	stream?: boolean;
	stop?: string[];
	response_format?: { type: "json_object" | "text" };
}

/**
 * AI 客户端统一接口
 */
export interface IAIClient {
	/** 获取模型列表 */
	getModelList(): Promise<string[]>;

	/** 生成摘要 */
	generateSummary(content: string): Promise<string | null>;
	/** 流式生成摘要 */
	generateSummaryStream?(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>;

	/** 生成标题列表 */
	generateTitle(content: string): Promise<string[]>;
	/** 流式生成标题 */
	generateTitleStream?(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>;

	/** 校对内容 */
	proofContent(content: string): Promise<DeepSeekResult | null>;
	/** 流式校对内容 */
	proofContentStream?(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>;

	/** 润色内容 */
	polishContent(content: string): Promise<DeepSeekResult | null>;
	/** 流式润色内容 */
	polishContentStream?(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>;

	/** 翻译文本 */
	translateText(content: string, sourceLang: string, targetLang: string): Promise<string>;
	/** 流式翻译文本 */
	translateTextStream?(content: string, sourceLang: string, targetLang: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>;

	/** 同义词生成 */
	synonym(content: string): Promise<string[]>;
	/** 流式同义词生成 */
	getSynonymsStream?(content: string, onChunk: (chunk: string) => void, signal?: AbortSignal): Promise<string>;
	/** Mermaid 图表生成 */
	generateMermaid(content: string): Promise<string>;
	/** LaTeX 公式生成 */
	generateLaTeX(content: string): Promise<string>;

	/** 自定义提示词生成 */
	generateCustom(promptTemplate: string, content: string, providerId?: string, modelId?: string): Promise<string>;
}
