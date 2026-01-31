/**
 * blockquote 与 callout 渲染
 *
 * 参考 note-to-mp 的实现思路
 */

import { MarkedExtension, Tokens } from "marked";
import { SmartMPMarkedExtension } from "./extension";

type CalloutInfo = { icon: string };

// 使用 Emoji 替代 SVG 图标，确保微信兼容
const iconNote = `📝`;
const iconAbstract = `📋`;
const iconInfo = `ℹ️`;
const iconTodo = `☑️`;
const iconTip = `💡`;
const iconSuccess = `✅`;
const iconQuestion = `❓`;
const iconWarning = `⚠️`;
const iconFailure = `❌`;
const iconDanger = `⚡`;
const iconBug = `🐛`;
const iconExample = `📖`;
const iconQuote = `💬`;

const calloutIcons = new Map<string, CalloutInfo>(Object.entries({
	note: { icon: iconNote },
	abstract: { icon: iconAbstract },
	summary: { icon: iconAbstract },
	tldr: { icon: iconAbstract },
	info: { icon: iconInfo },
	todo: { icon: iconTodo },
	tip: { icon: iconTip },
	hint: { icon: iconTip },
	important: { icon: iconTip },
	success: { icon: iconSuccess },
	check: { icon: iconSuccess },
	done: { icon: iconSuccess },
	question: { icon: iconQuestion },
	help: { icon: iconQuestion },
	faq: { icon: iconQuestion },
	warning: { icon: iconWarning },
	caution: { icon: iconWarning },
	attention: { icon: iconWarning },
	failure: { icon: iconFailure },
	fail: { icon: iconFailure },
	missing: { icon: iconFailure },
	danger: { icon: iconDanger },
	error: { icon: iconDanger },
	bug: { icon: iconBug },
	example: { icon: iconExample },
	quote: { icon: iconQuote },
	cite: { icon: iconQuote },
}));


function matchCallout(text: string | undefined) {
	if (!text) return "";
	const regex = /\[!(.*?)\]/;
	const match = text.match(regex);
	if (!match) return "";
	return match[1].trim();
}

function normalizeBlockquoteText(raw: string) {
	if (!raw) return "";
	return raw
		.split(/\r?\n/)
		.map((line) => line.replace(/^>\s?/, ""))
		.join("\n")
		.trim();
}

function getCalloutTitle(callout: string, text: string) {
	let title = callout.charAt(0).toUpperCase() + callout.slice(1).toLowerCase();
	let start = text.indexOf("]") + 1;
	if (text.indexOf("]-") > 0 || text.indexOf("]+") > 0) {
		start = start + 1;
	}
	let end = text.indexOf("\n");
	if (end === -1) end = text.length;
	if (start >= end) return title;
	const customTitle = text.slice(start, end).trim();
	if (customTitle !== "") {
		title = customTitle;
	}
	return title;
}

// 内联样式颜色映射，使用十六进制颜色确保微信兼容
// 微信编辑器可能不支持 rgba() 透明度，改用近似的浅色背景
function getCalloutColors(calloutType: string): { bg: string; text: string } {
	const colorMap: Record<string, { bg: string; text: string }> = {
		note: { bg: "#e8f4fd", text: "#086ddd" },      // 浅蓝
		abstract: { bg: "#e6f7ff", text: "#00b0ff" },  // 浅青
		summary: { bg: "#e6faf9", text: "#00bfbc" },   // 浅青绿
		tldr: { bg: "#e6f7ff", text: "#00b0ff" },      // 浅青
		info: { bg: "#e8f4fd", text: "#086ddd" },      // 浅蓝
		todo: { bg: "#e8f4fd", text: "#086ddd" },      // 浅蓝
		tip: { bg: "#e6faf9", text: "#08bfbc" },       // 浅青绿
		hint: { bg: "#e6faf9", text: "#08bfbc" },      // 浅青绿
		important: { bg: "#e6faf9", text: "#08bfbc" }, // 浅青绿
		success: { bg: "#e8f9ed", text: "#08b94e" },   // 浅绿
		check: { bg: "#e8f9ed", text: "#08b94e" },     // 浅绿
		done: { bg: "#e8f9ed", text: "#08b94e" },      // 浅绿
		question: { bg: "#fff4e6", text: "#ec7500" },  // 浅橙
		help: { bg: "#fff4e6", text: "#ec7500" },      // 浅橙
		faq: { bg: "#fff4e6", text: "#ec7500" },       // 浅橙
		warning: { bg: "#fff4e6", text: "#ec7500" },   // 浅橙
		caution: { bg: "#fff4e6", text: "#ec7500" },   // 浅橙
		attention: { bg: "#fff4e6", text: "#ec7500" }, // 浅橙
		failure: { bg: "#fdeaed", text: "#e93147" },   // 浅红
		fail: { bg: "#fdeaed", text: "#e93147" },      // 浅红
		missing: { bg: "#fdeaed", text: "#e93147" },   // 浅红
		danger: { bg: "#fdeaed", text: "#e93147" },    // 浅红
		error: { bg: "#fdeaed", text: "#e93147" },     // 浅红
		bug: { bg: "#fdeaed", text: "#e93147" },       // 浅红
		example: { bg: "#f3effd", text: "#7852ee" },   // 浅紫
		quote: { bg: "#f5f5f5", text: "#9e9e9e" },     // 浅灰
		cite: { bg: "#f5f5f5", text: "#9e9e9e" },      // 浅灰
	};
	return colorMap[calloutType] || colorMap.note;
}



export class BlockquoteRenderer extends SmartMPMarkedExtension {
	prepare(): Promise<void> {
		if (!this.marked) {
			console.error("marked is not ready");
		}
		return Promise.resolve();
	}

	async rendererBlockquote(token: Tokens.Blockquote) {
		// Use marked.parser directly on child tokens to avoid infinite recursion
		// Based on project types, this.marked.parser is the parsing function for block tokens
		const body = this.marked.parser(token.tokens || []);
		return `<blockquote dir="auto">${body}</blockquote>`;
	}

	async rendererCallout(token: Tokens.Blockquote) {
		// Callouts are usually at the top level of a blockquote, so we need to handle the title
		const rawText = token.text || normalizeBlockquoteText(token.raw || "");
		const callout = matchCallout(rawText);
		if (!callout) {
			return this.rendererBlockquote(token);
		}
		const calloutType = callout.toLowerCase();
		const title = getCalloutTitle(callout, rawText);
		const index = rawText.indexOf("\n");
		let body = "";
		if (index > 0) {
			const bodyText = rawText.slice(index + 1).trim();
			if (bodyText) {
				body = await this.marked.parse(bodyText);
			}
		}
		const info = calloutIcons.get(calloutType) || calloutIcons.get("note");
		const icon = info ? info.icon : "";

		// 获取 Callout 类型对应的颜色（内联样式，确保微信兼容）
		const colors = getCalloutColors(calloutType);
		// 使用 !important 防止被 CSSMerger 覆盖
		const containerStyle = `overflow: hidden; border-radius: 4px; margin: 1em 0; padding: 12px 12px 12px 24px; background-color: ${colors.bg} !important;`;
		const titleStyle = `padding: 0; display: flex; gap: 4px; font-size: inherit; line-height: 1.3; align-items: flex-start; color: ${colors.text} !important;`;
		const iconStyle = `height: 1em; flex: 0 0 auto; display: flex; align-items: center;`;
		const titleInnerStyle = `font-weight: 600; color: inherit;`;

		return `<section class="smart-mp-callout" data-callout="${calloutType}" style="${containerStyle}"><div class="callout-title" style="${titleStyle}"><div class="callout-icon" style="${iconStyle}">${icon}</div><div class="callout-title-inner" style="${titleInnerStyle}">${title}</div></div><div class="callout-content">${body}</div></section>`;
	}


	markedExtension(): MarkedExtension {
		return {
			async: true,
			walkTokens: async (token: Tokens.Generic) => {
				if (token.type !== "blockquote") {
					return;
				}
				const blockquote = token as Tokens.Blockquote;
				const raw = blockquote.raw || "";
				const rawText = normalizeBlockquoteText(raw);

				// Only hijack if it's a Callout, otherwise let default blockquote rendering occur
				const matched = matchCallout(rawText);
				if (matched) {
					token.html = await this.rendererCallout(blockquote);
				} else {
					token.html = await this.rendererBlockquote(blockquote);
				}
			},
			extensions: [
				{
					name: "blockquote",
					level: "block",
					renderer: (token: Tokens.Generic) => {
						return String(token.html ?? "");
					},
				},
			],
		};
	}
}
