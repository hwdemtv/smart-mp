import { Editor, MarkdownView, Notice } from "obsidian";
import { $t } from "../lang/i18n";
import type SmartMPPlugin from "../main";
import { Logger } from "../utils/logger";
import { ErrorHandler } from "../utils/error-handler";
import { DeepSeekResult } from "../types/types";
import { SynonymsModal } from "../modals/synonyms-modal";
import { proofreadText } from "../utils/proofread";

/**
 * AIFeatureManager 负责所有 AI 相关的业务逻辑功能
 */
export class AIFeatureManager {
	private plugin: SmartMPPlugin;

	constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
	}

	async generateSummary(content: string): Promise<string | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.plugin.showSpinner($t("spinner.summarizing") ?? "正在生成摘要...");
			const result = await this.plugin.aiClient.generateSummary(content);
			this.plugin.hideSpinner();
			return result;
		} catch (error) {
			ErrorHandler.getInstance().handleError(error);
		} finally {
			this.plugin.hideSpinner();
		}
		return null;
	}

	async generateHeadline(content: string): Promise<string | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.plugin.showSpinner($t("spinner.generating-title") ?? "正在生成爆款标题...");
			const titles = await this.plugin.aiClient.generateTitle(content);

			if (titles && titles.length > 0) {
				return titles.join('\n');
			}
			return null;
		} catch (error) {
			ErrorHandler.getInstance().handleError(error);
			new Notice($t("notice.main.generate-title-failed") ?? "生成标题失败");
		} finally {
			this.plugin.hideSpinner();
		}
		return null;
	}

	async translateToEnglish(content: string): Promise<string | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.plugin.showSpinner($t("main.translating-to-english"));
			const result = await this.plugin.aiClient.translateText(content, "Chinese", "English");
			this.plugin.hideSpinner();
			return result;
		} catch (error) {
			ErrorHandler.getInstance().handleError(error);
		} finally {
			this.plugin.hideSpinner();
		}
		return null;
	}

	async translateToChinese(content: string): Promise<string | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.plugin.showSpinner($t("main.translating-to-chinese"));
			const result = await this.plugin.aiClient.translateText(content, "English", "Chinese");
			this.plugin.hideSpinner();
			return result;
		} catch (error) {
			ErrorHandler.getInstance().handleError(error);
		} finally {
			this.plugin.hideSpinner();
		}
		return null;
	}

	async getSynonyms(content: string): Promise<string | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.plugin.showSpinner($t("main.get-synonyms"));
			const result = await this.plugin.aiClient.synonym(content);
			this.plugin.hideSpinner();
			if (result) {
				const synonyms = result.map((s) => s.replace(/^\d+\.\s*/, ""));
				const selectedWord = await new Promise<string | null>((resolve) => {
					new SynonymsModal(this.plugin.app, synonyms, resolve).open();
				});
				return selectedWord ? selectedWord : null;
			}
			return null;
		} catch (error) {
			ErrorHandler.getInstance().handleError(error);
		} finally {
			this.plugin.hideSpinner();
		}
		return null;
	}

	async generateMermaid(content: string): Promise<string | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.plugin.showSpinner($t("main.generating-mermaid"));
			const result = await this.plugin.aiClient.generateMermaid(content);
			if (result) {
				const mermaidMatch = result.match(/```mermaid\n([\s\S]*?)\n```/);
				if (mermaidMatch && mermaidMatch[1]) {
					return `\n\`\`\`mermaid\n${mermaidMatch[1].trim()}\n\`\`\`\n`;
				}
				let cleanedResult = result.trim();
				cleanedResult = cleanedResult.replace(/^```(mermaid)?/i, '').replace(/```$/i, '').trim();
				return `\n\`\`\`mermaid\n${cleanedResult}\n\`\`\`\n`;
			}
			return null;
		} catch (error) {
			ErrorHandler.getInstance().handleError(error);
		} finally {
			this.plugin.hideSpinner();
		}
		return null;
	}

	async generateLaTex(content: string): Promise<string | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.plugin.showSpinner($t("main.generating-latex"));
			const result = await this.plugin.aiClient.generateLaTeX(content);
			if (result) {
				const latexMatch = result.match(/\$\$([\s\S]*?)\$\$/);
				if (latexMatch && latexMatch[0]) {
					return latexMatch[0].trim();
				}
				const codeBlockMatch = result.match(/```latex\n([\s\S]*?)\n```/);
				if (codeBlockMatch && codeBlockMatch[1]) {
					const innerLatexMatch = codeBlockMatch[1].match(/\$\$([\s\S]*?)\$\$/);
					if (innerLatexMatch && innerLatexMatch[0]) {
						return innerLatexMatch[0].trim();
					}
					return `$$${codeBlockMatch[1].trim()}$$`;
				}
				return result;
			}
			return null;
		} catch (error) {
			ErrorHandler.getInstance().handleError(error);
		} finally {
			this.plugin.hideSpinner();
		}
		return null;
	}

	async proofContent(content: string): Promise<DeepSeekResult["corrections"] | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		try {
			this.plugin.showSpinner($t("main.proofing"));
			const result = await this.plugin.aiClient.proofContent(content);
			if (result) {
				return result.corrections;
			}
		} catch (error) {
			ErrorHandler.getInstance().handleError(error);
		} finally {
			this.plugin.hideSpinner();
		}
		return null;
	}

	async polishContent(content: string): Promise<string | null> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return null;
		}
		this.plugin.showSpinner($t("main.polishing"));
		const result = await this.plugin.aiClient.polishContent(content);
		this.plugin.hideSpinner();
		if (result) {
			return result.polished;
		}
		return null;
	}

	async polishContentWithStreaming(editor: Editor, content: string): Promise<void> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return;
		}
		const { StreamingDiffModal } = await import("../modals/streaming-diff-modal");
		const regenerateCallback = (onChunk: (chunk: string) => void, signal?: AbortSignal) =>
			this.plugin.aiClient!.polishContentStream(content, onChunk, signal);

		const modal = new StreamingDiffModal(this.plugin.app, editor, content, (result) => {
			editor.replaceSelection(result);
			new Notice($t("notice.main.ai-modification-applied") ?? "已应用 AI 修改");
		}, regenerateCallback);
		modal.open();
		const signal = modal.getAbortSignal();
		try {
			await this.plugin.aiClient.polishContentStream(content, (chunk: string) => modal.appendChunk(chunk), signal);
			modal.finishStreaming();
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) {
				Logger.error("AI", "流式润色失败", error);
				modal.showError("AI 生成失败，请重试");
			}
		}
	}

	async translateWithStreaming(editor: Editor, content: string, sourceLang: string, targetLang: string): Promise<void> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return;
		}
		const { StreamingDiffModal } = await import("../modals/streaming-diff-modal");
		const regenerateCallback = (onChunk: (chunk: string) => void, signal?: AbortSignal) =>
			this.plugin.aiClient!.translateStream(content, sourceLang, targetLang, onChunk, signal);

		const modal = new StreamingDiffModal(this.plugin.app, editor, content, (result) => {
			editor.replaceSelection(result);
			new Notice($t("notice.main.translation-applied") ?? "已应用翻译");
		}, regenerateCallback);
		modal.open();
		const signal = modal.getAbortSignal();
		try {
			await this.plugin.aiClient.translateStream(content, sourceLang, targetLang, (chunk: string) => modal.appendChunk(chunk), signal);
			modal.finishStreaming();
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) {
				Logger.error("AI", "流式翻译失败", error);
				modal.showError("翻译失败，请重试");
			}
		}
	}

	async generateTitleWithStreaming(editor: Editor, content: string): Promise<void> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return;
		}
		const { StreamingDiffModal } = await import("../modals/streaming-diff-modal");
		const regenerateCallback = (onChunk: (chunk: string) => void, signal?: AbortSignal) =>
			this.plugin.aiClient!.generateTitleStream(content, onChunk, signal);

		const modal = new StreamingDiffModal(this.plugin.app, editor, content, (result) => {
			editor.replaceSelection(result);
			new Notice($t("notice.main.title-applied") ?? "已应用标题");
		}, regenerateCallback);
		modal.open();
		const signal = modal.getAbortSignal();
		try {
			await this.plugin.aiClient.generateTitleStream(content, (chunk: string) => modal.appendChunk(chunk), signal);
			modal.finishStreaming();
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) {
				Logger.error("AI", "流式标题生成失败", error);
				modal.showError("标题生成失败，请重试");
			}
		}
	}

	async generateSummaryWithStreaming(editor: Editor, content: string): Promise<void> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return;
		}
		const { StreamingDiffModal } = await import("../modals/streaming-diff-modal");
		const regenerateCallback = (onChunk: (chunk: string) => void, signal?: AbortSignal) =>
			this.plugin.aiClient!.generateSummaryStream(content, onChunk, signal);

		const modal = new StreamingDiffModal(this.plugin.app, editor, content, (result) => {
			editor.replaceSelection(result);
			new Notice($t("notice.main.summary-applied") ?? "已应用摘要");
		}, regenerateCallback);
		modal.open();
		const signal = modal.getAbortSignal();
		try {
			await this.plugin.aiClient.generateSummaryStream(content, (chunk: string) => modal.appendChunk(chunk), signal);
			modal.finishStreaming();
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) {
				Logger.error("AI", "流式摘要生成失败", error);
				modal.showError("摘要生成失败，请重试");
			}
		}
	}

	async proofContentWithStreaming(editor: Editor, content: string): Promise<void> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return;
		}
		const { StreamingDiffModal } = await import("../modals/streaming-diff-modal");
		const regenerateCallback = (onChunk: (chunk: string) => void, signal?: AbortSignal) =>
			this.plugin.aiClient!.proofContentStream(content, onChunk, signal);

		const modal = new StreamingDiffModal(this.plugin.app, editor, content, (result) => {
			editor.replaceSelection(result);
			new Notice($t("notice.main.proofread-applied") ?? "已应用校对");
		}, regenerateCallback);
		modal.open();
		const signal = modal.getAbortSignal();
		try {
			await this.plugin.aiClient.proofContentStream(content, (chunk) => modal.appendChunk(chunk), signal);
			modal.finishStreaming();
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) {
				Logger.error("AI", "流式校对失败", error);
				modal.showError("校对生成失败");
			}
		}
	}

	async getSynonymsWithStreaming(editor: Editor, content: string): Promise<void> {
		if (!this.plugin.aiClient) {
			new Notice($t("main.chat-llm-has-not-been-configured"));
			return;
		}
		const { StreamingDiffModal } = await import("../modals/streaming-diff-modal");
		const regenerateCallback = (onChunk: (chunk: string) => void, signal?: AbortSignal) =>
			this.plugin.aiClient!.getSynonymsStream(content, onChunk, signal);

		const modal = new StreamingDiffModal(this.plugin.app, editor, content, (result) => {
			editor.replaceSelection(result);
			new Notice($t("notice.main.synonym-replaced") ?? "已替换同义词");
		}, regenerateCallback);
		modal.open();
		const signal = modal.getAbortSignal();
		try {
			await this.plugin.aiClient.getSynonymsStream(content, (chunk) => modal.appendChunk(chunk), signal);
			modal.finishStreaming();
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) {
				Logger.error("AI", "流式同义词失败", error);
				modal.showError("同义词获取失败");
			}
		}
	}
}
