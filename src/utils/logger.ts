/**
 * SmartMP Logger Utility
 * 
 * 提供统一的日志输出接口，支持条件化输出：
 * - error/warn: 始终输出（用于问题诊断）
 * - debug/perf: 仅在开发环境输出（通过 esbuild define 控制）
 * 
 * @author SmartMP Team
 */

// 生产环境构建时，esbuild 会将此值替换为 "production"
declare const SMARTMP_ENV: string;

const isDevelopment = (): boolean => {
    try {
        return typeof SMARTMP_ENV !== 'undefined' && SMARTMP_ENV === 'development';
    } catch {
        return false;
    }
};

export class Logger {
    private static prefix = '[SmartMP]';
    private static SENSITIVE_KEYS = [
        'access_token', 'refresh_token', 'token', 'ticket',
        'appSecret', 'app_secret', 'secret', 'password', 'passwd', 'pwd'
    ];

    /**
     * 脱敏处理
     * 递归遍历对象，将敏感字段的值替换为 ******
     */
    private static scrub(data: unknown): unknown {
        if (!data) return data;

        if (typeof data === 'string') {
            // 简单的字符串包含检查 (如果字符串很长且包含敏感key的引用，这里可能很难处理，暂时只处理 key-value 对象)
            return data;
        }

        if (Array.isArray(data)) {
            return data.map(item => this.scrub(item));
        }

        if (typeof data === 'object') {
            const scrubbed: any = {};
            for (const [key, value] of Object.entries(data)) {
                if (this.SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
                    scrubbed[key] = '******';
                } else {
                    scrubbed[key] = this.scrub(value);
                }
            }
            return scrubbed;
        }

        return data;
    }

    /**
     * 错误日志 - 始终输出
     * 用于记录需要用户注意的错误
     */
    static error(context: string, message: string, error?: unknown): void {
        console.error(`${this.prefix}:${context}] ${message}`, this.scrub(error ?? ''));
    }

    /**
     * 警告日志 - 始终输出
     * 用于记录非致命但可能有问题的情况
     */
    static warn(context: string, message: string, data?: unknown): void {
        console.warn(`${this.prefix}:${context}] ${message}`, this.scrub(data ?? ''));
    }

    /**
     * 调试日志 - 仅开发环境输出
     * 用于开发时的调试信息，生产环境不输出
     */
    static debug(context: string, message: string, data?: unknown): void {
        if (isDevelopment()) {
            console.debug(`${this.prefix}:${context}] ${message}`, this.scrub(data ?? ''));
        }
    }

    /**
     * 性能日志 - 仅开发环境输出
     * 用于记录性能相关信息
     */
    static perf(context: string, message: string, durationMs?: number): void {
        if (isDevelopment()) {
            const suffix = durationMs !== undefined ? ` (${durationMs}ms)` : '';
            console.debug(`${this.prefix}:PERF:${context}] ${message}${suffix}`);
        }
    }

    /**
     * 表格日志 - 仅开发环境输出
     * 用于以表格形式展示数据
     */
    static table(context: string, data: unknown[]): void {
        if (isDevelopment()) {
            console.debug(`${this.prefix}:${context}]`);
            console.table(this.scrub(data));
        }
    }
}

export default Logger;
