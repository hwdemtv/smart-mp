/**
 * 设置分节的稳定标识。
 * expandedSections 的 key 此前直接用标题字符串（含 emoji 和双语混排），
 * 一旦标题走 i18n 或改文案，展开状态记忆就会失效；改为与文案解耦的固定 id。
 */
export const SECTION_IDS = {
    license: "section-license",
    wechat: "section-wechat",
    general: "section-general",
    appearance: "section-appearance",
    security: "section-security",
    /** 文本 LLM 分节（标题本身已是 i18n key，id 仅用于保持一致） */
    llm: "section-llm",
    aiDraw: "section-ai-draw",
    assistants: "section-assistants",
    assistantManagement: "section-assistant-management",
} as const;
