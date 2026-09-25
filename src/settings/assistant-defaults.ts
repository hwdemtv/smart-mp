import { CustomAssistant, SmartMPSetting } from "./smart-mp-setting";
import { $t } from "src/lang/i18n";

/**
 * 内置指令助手的唯一权威定义。
 * 此前 migrate.ts 与 setting-tab.ts 各维护一份，且 text-to-image
 * 的 i18n key 不一致（settings.assistant.* vs main.*）。
 */
export const DEFAULT_ASSISTANTS = (): Array<{ id: string; name: string }> => [
	{ id: "polish", name: $t("settings.assistant.polish") },
	{ id: "proofread", name: $t("settings.assistant.proofread") },
	{ id: "synonyms", name: $t("settings.assistant.synonyms") },
	{ id: "translate", name: $t("settings.assistant.translate") },
	{ id: "mermaid", name: $t("settings.assistant.mermaid") },
	{ id: "latex", name: $t("settings.assistant.latex") },
	{ id: "summary", name: $t("settings.assistant.summary") },
	{ id: "text-to-image", name: $t("settings.assistant.text-to-image") },
];

/**
 * 幂等补齐内置助手；不覆盖用户已修改的 prompt。
 * 返回是否有新增（调用方据此决定是否弹出提示/保存）。
 */
export function ensureDefaultAssistants(settings: SmartMPSetting): boolean {
	if (!settings.customAssistantList) {
		settings.customAssistantList = [];
	}
	let updated = false;
	for (const def of DEFAULT_ASSISTANTS()) {
		const exists = settings.customAssistantList.some((a) => a.id === def.id);
		if (!exists) {
			settings.customAssistantList.push({
				id: def.id,
				name: def.name,
				// 旧版将自定义提示词存在 customPrompts 中，补齐时带过来
				prompt: settings.customPrompts?.[def.id] || "",
				enabled: true,
				isDefault: true,
			});
			updated = true;
		}
	}
	return updated;
}

/**
 * 公众号运营向一键模板（标题/开头钩子/互动结尾）。
 * 提示词面向中文写作场景，按内容数据保留中文，不做 i18n。
 */
export const MP_ASSISTANT_TEMPLATES = (): CustomAssistant[] => [
	{
		id: "mp_title_" + Date.now(),
		name: $t("settings.assistant.mp-title-template"),
		prompt: "你是一位10w+爆款公众号文章的资深标题策划师，深谙读者心理和传播规律。\n\n## 标题技法\n1. **悬念法**：引发好奇心，让人想一探究竟\n2. **数字法**：具体数字增加可信度和吸引力\n3. **痛点法**：直击读者痛点，引发共鸣\n4. **利益法**：明确告知读者能获得什么\n5. **对比法**：前后对比，突出变化效果\n6. **故事法**：用故事元素增加代入感\n\n## 微信规范（必须遵守）\n- 字数：15-28个汉字为佳，不超过32个汉字\n- 前15字必须包含核心吸引点（避免被折叠）\n- 禁止：虚假夸大、低俗诱导、敏感政治内容\n\n## 输出要求\n- 生成5-8个风格各异的标题\n- 每行一个，纯文本，无序号无符号\n- 不要出现'标题'二字\n\n## 优秀示例\n- 月薪5000到月薪5万，我只用了这3招\n- 35岁被裁员后，我才明白这个残酷真相\n- 读完这10本书，我的认知彻底被颠覆了\n\n请为以下内容生成爆款标题：\n\n{{content}}",
		enabled: true,
	},
	{
		id: "mp_hook_" + Date.now(),
		name: $t("settings.assistant.mp-hook-template"),
		prompt: "你是一位资深公众号编辑，擅长撰写吸引眼球的开头钩子（Hook）。\n\n## 开头钩子类型\n1. **痛点提问**：直击读者痛点的疑问句\n2. **惊人数据**：用数据制造冲击力\n3. **故事开场**：用故事引发代入感\n4. **权威引用**：引用名人名言或研究\n5. **反转观点**：颠覆常识的观点\n6. **紧迫性**：制造时间紧迫感\n\n## 输出要求\n- 生成3个不同的开头钩子\n- 每个钩子不超过50字\n- 直接输出，不添加序号\n- 语言生动有力，有冲击力\n\n请为以下内容生成开头钩子：\n\n{{content}}",
		enabled: true,
	},
	{
		id: "mp_end_" + Date.now(),
		name: $t("settings.assistant.mp-end-template"),
		prompt: "你是一位擅长提升用户互动的公众号编辑，请为文章撰写引导互动的结尾。\n\n## 互动结尾类型\n1. **提问互动**：提出与文章相关的问题\n2. **行动召唤**：引导读者采取行动\n3. **福利诱导**：承诺福利引导关注/点赞\n4. **话题讨论**：发起话题讨论\n5. **个人故事**：邀请读者分享经历\n\n## 输出要求\n- 生成3个互动结尾\n- 每个结尾包含明确的行动指引\n- 语气亲切自然，像朋友对话\n- 直接输出，不添加序号\n\n请为以下内容生成互动结尾：\n\n{{content}}",
		enabled: true,
	},
];
