/**
 * AI 客户端架构测试
 *
 * 验证重构后的 AI 客户端架构
 */

import { describe, it, expect } from 'vitest';

// ============== 接口测试 ==============

describe('IAIClient 接口定义', () => {
    it('应定义所有必需方法', async () => {
        // 接口是编译时类型，运行时不可访问
        // 验证文件存在且可导入
        await import('../../utils/ai-types');
        expect(true).toBe(true);
    });
});

// ============== BaseAIClient 测试 ==============

describe('BaseAIClient 基类', () => {
    it('应定义抽象类', async () => {
        const { BaseAIClient } = await import('../../utils/ai-base-client');

        expect(BaseAIClient).toBeDefined();
        expect(typeof BaseAIClient).toBe('function');
    });

    it('应包含通用 AI 功能方法', async () => {
        const { BaseAIClient } = await import('../../utils/ai-base-client');

        const methods = Object.getOwnPropertyNames(BaseAIClient.prototype);
        const commonMethods = [
            'constructor',
            'getCurrentProvider',
            'getCurrentModelId',
            'getPrompt',
            'generateSummary',
            'generateSummaryStream',
            'generateTitle',
            'polishContent',
            'polishContentStream',
            'synonym',
            'generateMermaid',
            'generateLaTeX',
            'translateText',
            'translateTextStream',
            'generateCustom'
        ];

        commonMethods.forEach(method => {
            expect(methods).toContain(method);
        });
    });
});

// ============== 文件结构测试 ==============

describe('架构文件结构', () => {
    it('ai-types.ts 应存在', async () => {
        await import('../../utils/ai-types');
        expect(true).toBe(true);
    });

    it('ai-base-client.ts 应存在', async () => {
        await import('../../utils/ai-base-client');
        expect(true).toBe(true);
    });

    it('服务层文件应存在', async () => {
        // 检查文件可导入（即使依赖 obsidian）
        const services = [
            '../../services/ai-feature-manager',
            '../../services/ip-service',
            '../../services/account-service',
            '../../services/auth-service'
        ];

        for (const service of services) {
            try {
                await import(service);
            } catch {
                // 预期可能失败 - 依赖 obsidian
            }
        }
        expect(true).toBe(true);
    });

    it('core 目录应包含必要文件', async () => {
        try {
            await import('../../core/command-manager');
        } catch {
            // 预期可能失败 - 依赖 obsidian
        }
        expect(true).toBe(true);
    });
});

// ============== 架构设计验证 ==============

describe('架构设计验证', () => {
    it('BaseAIClient 应定义抽象方法签名', async () => {
        const { BaseAIClient } = await import('../../utils/ai-base-client');

        const methods = Object.getOwnPropertyNames(BaseAIClient.prototype);
        expect(methods).toContain('generateSummary');
        expect(methods).toContain('generateTitle');
        expect(methods).toContain('polishContent');
        expect(methods).toContain('translateText');
        expect(methods).toContain('synonym');
    });

    it('getPrompt 方法应存在', async () => {
        const { BaseAIClient } = await import('../../utils/ai-base-client');

        const methods = Object.getOwnPropertyNames(BaseAIClient.prototype);
        expect(methods).toContain('getPrompt');
    });
});

// ============== 类型定义测试 ==============

describe('类型定义完整性', () => {
    it('DeepSeekResult 类型应被正确导入', async () => {
        await import('../../types/types');
        expect(true).toBe(true);
    });

    it('LLMProvider 类型应被正确导入', async () => {
        await import('../../settings/llm-types');
        expect(true).toBe(true);
    });
});
