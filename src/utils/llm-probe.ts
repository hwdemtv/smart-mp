import Logger from "./logger";

/**
 * 设置页"测试连接 / 拉取模型列表"共用的 OpenAI 兼容探测入口。
 * 此前两处各自内联 new OpenAI(...)，逻辑重复且错误提示不一致。
 * Ollama 等本地服务同样暴露 OpenAI 兼容的 /v1/models 端点，统一走此路径。
 */
async function createClient(baseUrl: string, apiKey: string) {
    const OpenAI = (await import("openai")).default;
    return new OpenAI({
        baseURL: baseUrl,
        apiKey: apiKey || "dummy",
        dangerouslyAllowBrowser: true,
    });
}

/** 测试连通性，返回可发现的模型数量 */
export async function testLlmConnection(
    baseUrl: string,
    apiKey: string
): Promise<number> {
    const client = await createClient(baseUrl, apiKey);
    const models = await client.models.list();
    return models.data.length;
}

/** 拉取远端模型 ID 列表（可能为空） */
export async function fetchRemoteModelIds(
    baseUrl: string,
    apiKey: string
): Promise<string[]> {
    const client = await createClient(baseUrl, apiKey);
    const response = await client.models.list();
    return response.data.map((m) => m.id);
}

/** 统一的探测错误归一化（Notice 文案用） */
export function probeErrorMessage(error: unknown): string {
    Logger.error("LlmProbe", "Probe failed:", error);
    const err = error as Error;
    return err?.message || String(error);
}
