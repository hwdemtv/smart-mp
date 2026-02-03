/**
 * SSE 流式解析通用工具
 * 用于处理 OpenAI 兼容 API 的流式响应
 */
import { Logger } from "./logger";
export interface StreamRequestOptions {
    url: string;
    apiKey: string;
    model: string;
    messages: any[];
    maxTokens?: number;
    temperature?: number;
    onChunk: (chunk: string) => void;
    signal?: AbortSignal;
}

/**
 * 执行流式 API 请求并解析 SSE 响应
 */
export async function streamSSE(options: StreamRequestOptions): Promise<string> {
    const {
        url,
        apiKey,
        model,
        messages,
        maxTokens = 4096,
        temperature = 0.7,
        onChunk,
        signal
    } = options;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: true,
        }),
        signal,
    });

    if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`);
    }

    if (!response.body) {
        throw new Error("响应没有 body，可能不支持流式");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (signal?.aborted) break;

            buffer += decoder.decode(value, { stream: true });

            // 解析 SSE 格式
            const lines = buffer.split('\n');
            buffer = lines.pop() || ""; // 保留未完成的行

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content || "";
                        if (delta) {
                            result += delta;
                            onChunk(delta);
                        }
                    } catch (e) {
                        // 忽略 JSON 解析错误（非标准格式行）
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    return result;
}

/**
 * 包装流式请求，处理 AbortError
 */
export async function safeStreamSSE(options: StreamRequestOptions): Promise<string> {
    try {
        return await streamSSE(options);
    } catch (error) {
        if ((error as any).name === 'AbortError') {
            Logger.debug("streamSSE", "流式请求已中断");
            return "";
        }
        throw error;
    }
}
