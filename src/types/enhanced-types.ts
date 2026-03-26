/**
 * 类型增强定义
 * 用于消除代码中的 any 类型
 */

/**
 * CSS 规则定义
 */
export interface CSSRule {
  property: string;
  value: string;
  important: boolean;
}

/**
 * CSS 规则映射
 */
export type CSSRulesMap = Map<string, Map<string, CSSRule>>;

/**
 * CSS 变量映射
 */
export type CSSVariablesMap = Map<string, string>;

/**
 * CssMerger 状态
 */
export interface CssMergerState {
  rules: Map<string, Map<string, { value: string; important: boolean }>>;
  vars: Map<string, string>;
  keyedRules: Map<string, string[]>;
  universalRules: string[];
}

/**
 * PostCSS 错误接口
 */
export interface PostCSError extends Error {
  line?: number;
  column?: number;
  reason?: string;
}

/**
 * 类型守卫: 检查是否为 PostCSS 错误
 */
export function isPostCSError(error: unknown): error is PostCSError {
  return error instanceof Error && 'line' in error;
}

/**
 * LLM Provider 配置
 */
export interface LLMProviderConfig {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKey?: string;
  models: LLMModelConfig[];
  systemPrompt?: string;
}

/**
 * LLM 模型配置
 */
export interface LLMModelConfig {
  id: string;
  name: string;
}

/**
 * 流式响应回调
 */
export type StreamCallback = (chunk: string) => void;

/**
 * 产品订阅信息
 */
export interface ProductSubscription {
  product_id: string;
  expires_at?: string;
  status: 'active' | 'expired';
}

/**
 * Obsidian EditorView 扩展接口
 */
export interface EditorViewExtension {
  cm?: {
    scrollDOM: HTMLElement;
    state: {
      doc: {
        lines: number;
        lineAt(pos: number): { from: number; number: number };
        line(number: number): { from: number; to: number };
      };
    };
    lineBlockAt(pos: number): { top: number };
    lineBlockAtHeight(height: number): { from: number };
  };
}

/**
 * Obsidian MarkdownView 扩展接口
 */
export interface MarkdownViewExtension {
  editor: EditorViewExtension & {
    getValue(): string;
  };
  file?: { path: string };
}

/**
 * 类型断言辅助函数
 */
export function assertDefined<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

/**
 * 安全的类型转换
 */
export function safeCast<T>(value: unknown, defaultValue: T): T {
  return value as T;
}

/**
 * ChatCompletion 消息类型
 */
export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 流式 SSE 选项
 */
export interface StreamSSEOptions {
  url: string;
  headers: Record<string, string>;
  messages: ChatCompletionMessage[];
  model: string;
  onChunk: StreamCallback;
  signal?: AbortSignal;
}
