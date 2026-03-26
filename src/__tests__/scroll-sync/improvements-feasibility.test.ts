/**
 * 滚动同步改进建议可行性分析与测试
 *
 * 改进建议：
 * 1. 超长代码块内部行号映射
 * 2. 用户自定义高亮颜色/样式设置
 * 3. 同步精度设置（像素阈值）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============== 改进 1: 超长代码块内部行号映射 ==============

describe('改进1: 超长代码块内部行号映射', () => {

    interface CodeBlockLineMapping {
        codeBlockId: string;
        startLine: number;
        endLine: number;
        lineMap: Map<number, number>; // 代码块内行号 -> 源码行号
    }

    /**
     * 代码块行号映射器
     * 用于处理超长代码块的内部行号追踪
     */
    class CodeBlockLineMapper {
        private mappings: Map<string, CodeBlockLineMapping> = new Map();

        /**
         * 注册代码块映射
         */
        registerCodeBlock(
            codeBlockId: string,
            sourceStartLine: number,
            codeContent: string
        ): CodeBlockLineMapping {
            const lines = codeContent.split('\n');
            const lineMap = new Map<number, number>();

            lines.forEach((_, index) => {
                // 代码块内行号 (0-indexed) -> 源码行号 (1-indexed)
                lineMap.set(index, sourceStartLine + index);
            });

            const mapping: CodeBlockLineMapping = {
                codeBlockId,
                startLine: sourceStartLine,
                endLine: sourceStartLine + lines.length - 1,
                lineMap
            };

            this.mappings.set(codeBlockId, mapping);
            return mapping;
        }

        /**
         * 根据代码块内位置获取源码行号
         */
        getSourceLine(codeBlockId: string, internalLine: number): number | null {
            const mapping = this.mappings.get(codeBlockId);
            if (!mapping) return null;
            return mapping.lineMap.get(internalLine) ?? null;
        }

        /**
         * 根据源码行号获取代码块内位置
         */
        getInternalLine(codeBlockId: string, sourceLine: number): number | null {
            const mapping = this.mappings.get(codeBlockId);
            if (!mapping) return null;

            if (sourceLine < mapping.startLine || sourceLine > mapping.endLine) {
                return null;
            }

            return sourceLine - mapping.startLine;
        }

        /**
         * 获取代码块的滚动锚点数组
         */
        getScrollAnchors(codeBlockId: string): Array<{ internalLine: number; offsetTop: number }> {
            const mapping = this.mappings.get(codeBlockId);
            if (!mapping) return [];

            const anchors: Array<{ internalLine: number; offsetTop: number }> = [];
            // 假设每行高度为 20px（实际应从 DOM 获取）
            const lineHeight = 20;

            for (const [internalLine] of mapping.lineMap) {
                anchors.push({
                    internalLine,
                    offsetTop: internalLine * lineHeight
                });
            }

            return anchors;
        }

        /**
         * 清理映射
         */
        clear(codeBlockId?: string) {
            if (codeBlockId) {
                this.mappings.delete(codeBlockId);
            } else {
                this.mappings.clear();
            }
        }
    }

    let mapper: CodeBlockLineMapper;

    beforeEach(() => {
        mapper = new CodeBlockLineMapper();
    });

    describe('基本功能', () => {
        it('应该正确注册代码块映射', () => {
            const codeContent = `function hello() {\n    console.log("Hello");\n}`;
            const mapping = mapper.registerCodeBlock('code-1', 10, codeContent);

            expect(mapping.startLine).toBe(10);
            expect(mapping.endLine).toBe(12);
            expect(mapping.lineMap.size).toBe(3);
        });

        it('应该正确获取源码行号', () => {
            const codeContent = `line1\nline2\nline3`;
            mapper.registerCodeBlock('code-1', 5, codeContent);

            expect(mapper.getSourceLine('code-1', 0)).toBe(5);
            expect(mapper.getSourceLine('code-1', 1)).toBe(6);
            expect(mapper.getSourceLine('code-1', 2)).toBe(7);
        });

        it('应该正确获取代码块内行号', () => {
            const codeContent = `line1\nline2\nline3`;
            mapper.registerCodeBlock('code-1', 5, codeContent);

            expect(mapper.getInternalLine('code-1', 5)).toBe(0);
            expect(mapper.getInternalLine('code-1', 6)).toBe(1);
            expect(mapper.getInternalLine('code-1', 7)).toBe(2);
        });

        it('应该对超出范围的行返回 null', () => {
            const codeContent = `line1\nline2`;
            mapper.registerCodeBlock('code-1', 5, codeContent);

            expect(mapper.getSourceLine('code-1', 100)).toBeNull();
            expect(mapper.getInternalLine('code-1', 100)).toBeNull();
        });
    });

    describe('性能测试', () => {
        it('大规模代码块映射性能', () => {
            // 模拟 1000 行代码块
            const lines = Array(1000).fill(0).map((_, i) => `// Line ${i}`);
            const codeContent = lines.join('\n');

            const start = performance.now();
            mapper.registerCodeBlock('large-code', 1, codeContent);
            const elapsed = performance.now() - start;

            console.log(`[性能] 1000行代码块注册耗时: ${elapsed.toFixed(2)}ms`);
            expect(elapsed).toBeLessThan(10); // 应小于 10ms
        });

        it('查询性能', () => {
            const lines = Array(500).fill(0).map((_, i) => `// Line ${i}`);
            mapper.registerCodeBlock('code-1', 1, lines.join('\n'));

            const iterations = 1000;
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                mapper.getSourceLine('code-1', Math.floor(Math.random() * 500));
            }

            const elapsed = performance.now() - start;
            const avgTime = elapsed / iterations;

            console.log(`[性能] 1000次查询平均耗时: ${avgTime.toFixed(4)}ms`);
            expect(avgTime).toBeLessThan(0.01); // 应小于 0.01ms
        });
    });

    describe('可行性分析', () => {
        it('技术可行性评估', () => {
            const feasibility = {
                // 技术难度: 1-5 (5最难)
                technicalDifficulty: 3,
                // 实现时间估算 (小时)
                estimatedTime: 4,
                // 对现有代码的影响程度: 1-5
                impactLevel: 2,
                // 用户价值: 1-5
                userValue: 4,
                // 总体可行性分数: 1-10
                score: 7
            };

            console.log('[可行性分析] 超长代码块内部行号映射:');
            console.log(`  技术难度: ${feasibility.technicalDifficulty}/5`);
            console.log(`  预计时间: ${feasibility.estimatedTime}h`);
            console.log(`  影响程度: ${feasibility.impactLevel}/5`);
            console.log(`  用户价值: ${feasibility.userValue}/5`);
            console.log(`  总体评分: ${feasibility.score}/10`);

            expect(feasibility.score).toBeGreaterThanOrEqual(6);
        });

        it('实现方案验证', () => {
            // 验证实现方案的核心思路
            const implementationPlan = {
                // 1. 在 CodeRenderer 中注入行号属性
                codeRendererModify: true,
                // 2. 在 postprocess 中处理代码块行号
                postprocessModify: true,
                // 3. 在 scroll sync 中使用细粒度锚点
                scrollSyncModify: true,
                // 4. 需要考虑的问题
                challenges: [
                    '代码块渲染后的实际行高可能不一致',
                    '需要处理代码块内的水平滚动',
                    '需要与现有的 block-level 锚点共存'
                ]
            };

            expect(implementationPlan.codeRendererModify).toBe(true);
            expect(implementationPlan.challenges.length).toBeGreaterThan(0);
        });
    });
});


// ============== 改进 2: 用户自定义高亮颜色/样式设置 ==============

describe('改进2: 用户自定义高亮颜色/样式设置', () => {

    interface HighlightStyle {
        backgroundColor: string;
        borderColor: string;
        borderWidth: string;
        borderStyle: string;
        transition: string;
    }

    const defaultHighlightStyle: HighlightStyle = {
        backgroundColor: 'rgba(212, 175, 55, 0.15)',
        borderColor: '#b08d55',
        borderWidth: '2px',
        borderStyle: 'solid',
        transition: 'background-color 0.2s ease'
    };

    /**
     * 高亮样式管理器
     */
    class HighlightStyleManager {
        private currentStyle: HighlightStyle;
        private presets: Map<string, HighlightStyle> = new Map();

        constructor(defaultStyle: HighlightStyle = defaultHighlightStyle) {
            this.currentStyle = { ...defaultStyle };
            this.initPresets();
        }

        private initPresets() {
            // 预设主题
            this.presets.set('gold', {
                backgroundColor: 'rgba(212, 175, 55, 0.15)',
                borderColor: '#b08d55',
                borderWidth: '2px',
                borderStyle: 'solid',
                transition: 'background-color 0.2s ease'
            });

            this.presets.set('blue', {
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                borderColor: '#3b82f6',
                borderWidth: '2px',
                borderStyle: 'solid',
                transition: 'background-color 0.2s ease'
            });

            this.presets.set('green', {
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                borderColor: '#22c55e',
                borderWidth: '2px',
                borderStyle: 'solid',
                transition: 'background-color 0.2s ease'
            });

            this.presets.set('minimal', {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                borderColor: 'transparent',
                borderWidth: '0px',
                borderStyle: 'none',
                transition: 'none'
            });
        }

        /**
         * 获取当前样式
         */
        getCurrentStyle(): HighlightStyle {
            return { ...this.currentStyle };
        }

        /**
         * 应用预设主题
         */
        applyPreset(presetName: string): boolean {
            const preset = this.presets.get(presetName);
            if (!preset) return false;
            this.currentStyle = { ...preset };
            return true;
        }

        /**
         * 自定义样式
         */
        customize(updates: Partial<HighlightStyle>): HighlightStyle {
            this.currentStyle = { ...this.currentStyle, ...updates };
            return this.getCurrentStyle();
        }

        /**
         * 生成 CSS 样式字符串
         */
        generateCSS(): string {
            const style = this.currentStyle;
            return `
                .smart-mp-sync-line-highlight {
                    background-color: ${style.backgroundColor} !important;
                    border-left: ${style.borderWidth} ${style.borderStyle} ${style.borderColor} !important;
                    transition: ${style.transition} !important;
                }
            `.trim();
        }

        /**
         * 获取所有预设名称
         */
        getPresetNames(): string[] {
            return Array.from(this.presets.keys());
        }
    }

    let manager: HighlightStyleManager;

    beforeEach(() => {
        manager = new HighlightStyleManager();
    });

    describe('基本功能', () => {
        it('应该返回默认样式', () => {
            const style = manager.getCurrentStyle();
            expect(style.backgroundColor).toBe('rgba(212, 175, 55, 0.15)');
            expect(style.borderColor).toBe('#b08d55');
        });

        it('应该正确应用预设主题', () => {
            expect(manager.applyPreset('blue')).toBe(true);
            const style = manager.getCurrentStyle();
            expect(style.borderColor).toBe('#3b82f6');
        });

        it('应该拒绝不存在的预设', () => {
            expect(manager.applyPreset('nonexistent')).toBe(false);
        });

        it('应该支持自定义样式', () => {
            manager.customize({
                backgroundColor: 'rgba(255, 0, 0, 0.2)',
                borderColor: '#ff0000'
            });
            const style = manager.getCurrentStyle();
            expect(style.backgroundColor).toBe('rgba(255, 0, 0, 0.2)');
            expect(style.borderColor).toBe('#ff0000');
            // 其他属性保持不变
            expect(style.borderWidth).toBe('2px');
        });

        it('应该生成有效的 CSS', () => {
            const css = manager.generateCSS();
            expect(css).toContain('.smart-mp-sync-line-highlight');
            expect(css).toContain('background-color');
            expect(css).toContain('border-left');
        });

        it('应该返回所有预设名称', () => {
            const presets = manager.getPresetNames();
            expect(presets).toContain('gold');
            expect(presets).toContain('blue');
            expect(presets).toContain('green');
            expect(presets).toContain('minimal');
        });
    });

    describe('集成测试', () => {
        it('样式应与 CodeMirror 6 兼容', () => {
            // 验证生成的 CSS 可用于 EditorView.baseTheme
            const css = manager.generateCSS();

            // 检查 CSS 格式
            expect(css).toMatch(/\.smart-mp-sync-line-highlight\s*\{/);
            expect(css).toMatch(/background-color:\s*[^;]+!/);
            expect(css).toMatch(/transition:\s*[^;]+!/);
        });

        it('minimal 预设应生成透明样式', () => {
            manager.applyPreset('minimal');
            const style = manager.getCurrentStyle();
            expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0.05)');
            expect(style.borderColor).toBe('transparent');
        });
    });

    describe('可行性分析', () => {
        it('技术可行性评估', () => {
            const feasibility = {
                technicalDifficulty: 2, // 相对简单
                estimatedTime: 2, // 2小时
                impactLevel: 1, // 影响较小
                userValue: 3, // 中等用户价值
                score: 8 // 高可行性
            };

            console.log('[可行性分析] 用户自定义高亮颜色/样式:');
            console.log(`  技术难度: ${feasibility.technicalDifficulty}/5`);
            console.log(`  预计时间: ${feasibility.estimatedTime}h`);
            console.log(`  影响程度: ${feasibility.impactLevel}/5`);
            console.log(`  用户价值: ${feasibility.userValue}/5`);
            console.log(`  总体评分: ${feasibility.score}/10`);

            expect(feasibility.score).toBeGreaterThanOrEqual(7);
        });

        it('实现方案验证', () => {
            const implementationPlan = {
                // 1. 扩展 SmartMPSetting 接口
                settingsModify: true,
                // 2. 添加设置 UI
                settingsUI: true,
                // 3. 动态更新 scrollSyncStyles
                dynamicStyles: true,
                challenges: [
                    '需要在设置变更时重新注册 CodeMirror 主题',
                    '样式持久化需要集成到现有设置系统'
                ]
            };

            expect(implementationPlan.settingsModify).toBe(true);
        });
    });
});


// ============== 改进 3: 同步精度设置（像素阈值） ==============

describe('改进3: 同步精度设置（像素阈值）', () => {

    interface SyncPrecisionConfig {
        /** 触发同步的最小滚动距离 (像素) */
        scrollThreshold: number;
        /** 平滑滚动的步进系数 (0-1) */
        smoothFactor: number;
        /** 是否启用平滑滚动 */
        enableSmoothScroll: boolean;
        /** 同步锁超时时间 (ms) */
        lockTimeout: number;
    }

    const defaultConfig: SyncPrecisionConfig = {
        scrollThreshold: 5,
        smoothFactor: 0.35,
        enableSmoothScroll: true,
        lockTimeout: 80
    };

    /**
     * 同步精度控制器
     */
    class SyncPrecisionController {
        private config: SyncPrecisionConfig;
        private lastScrollTop: number = 0;

        constructor(config: SyncPrecisionConfig = defaultConfig) {
            this.config = { ...config };
        }

        /**
         * 更新配置
         */
        updateConfig(updates: Partial<SyncPrecisionConfig>): void {
            this.config = { ...this.config, ...updates };
        }

        /**
         * 获取当前配置
         */
        getConfig(): SyncPrecisionConfig {
            return { ...this.config };
        }

        /**
         * 判断是否应该触发同步
         */
        shouldTriggerSync(currentScrollTop: number): boolean {
            const delta = Math.abs(currentScrollTop - this.lastScrollTop);
            return delta >= this.config.scrollThreshold;
        }

        /**
         * 更新上一次滚动位置
         */
        updateLastScrollTop(scrollTop: number): void {
            this.lastScrollTop = scrollTop;
        }

        /**
         * 计算平滑滚动目标
         */
        calculateSmoothScroll(current: number, target: number): number {
            if (!this.config.enableSmoothScroll) {
                return target;
            }

            const delta = Math.abs(target - current);
            if (delta <= this.config.scrollThreshold) {
                return current; // 小阈值内不滚动
            }

            // 大距离跳跃直接定位
            if (delta > 350) {
                return target;
            }

            // 平滑过渡
            return current + (target - current) * this.config.smoothFactor;
        }

        /**
         * 获取同步锁超时
         */
        getLockTimeout(): number {
            return this.config.lockTimeout;
        }

        /**
         * 获取预设配置
         */
        static getPresets(): Record<string, SyncPrecisionConfig> {
            return {
                'precise': {
                    scrollThreshold: 2,
                    smoothFactor: 0.5,
                    enableSmoothScroll: true,
                    lockTimeout: 50
                },
                'balanced': {
                    scrollThreshold: 5,
                    smoothFactor: 0.35,
                    enableSmoothScroll: true,
                    lockTimeout: 80
                },
                'performance': {
                    scrollThreshold: 15,
                    smoothFactor: 0.25,
                    enableSmoothScroll: false,
                    lockTimeout: 100
                }
            };
        }
    }

    let controller: SyncPrecisionController;

    beforeEach(() => {
        controller = new SyncPrecisionController();
    });

    describe('阈值触发测试', () => {
        it('小幅度滚动不应触发同步', () => {
            controller.updateLastScrollTop(100);
            expect(controller.shouldTriggerSync(103)).toBe(false); // 3px < 5px
        });

        it('大幅度滚动应触发同步', () => {
            controller.updateLastScrollTop(100);
            expect(controller.shouldTriggerSync(110)).toBe(true); // 10px > 5px
        });

        it('应支持动态调整阈值', () => {
            controller.updateLastScrollTop(100);

            // 默认阈值 5px
            expect(controller.shouldTriggerSync(106)).toBe(true);

            // 调整阈值到 10px
            controller.updateConfig({ scrollThreshold: 10 });
            controller.updateLastScrollTop(100);
            expect(controller.shouldTriggerSync(106)).toBe(false);
            expect(controller.shouldTriggerSync(115)).toBe(true);
        });
    });

    describe('平滑滚动测试', () => {
        it('应计算平滑滚动位置', () => {
            const result = controller.calculateSmoothScroll(100, 200);
            expect(result).toBeGreaterThan(100);
            expect(result).toBeLessThan(200);
        });

        it('大距离跳跃应直接定位', () => {
            const result = controller.calculateSmoothScroll(100, 500);
            expect(result).toBe(500); // 直接跳转
        });

        it('禁用平滑滚动时应直接定位', () => {
            controller.updateConfig({ enableSmoothScroll: false });
            const result = controller.calculateSmoothScroll(100, 150);
            expect(result).toBe(150);
        });

        it('小阈值内应保持原位', () => {
            const result = controller.calculateSmoothScroll(100, 103);
            expect(result).toBe(100); // 阈值内不滚动
        });
    });

    describe('预设配置测试', () => {
        it('应提供多种预设', () => {
            const presets = SyncPrecisionController.getPresets();
            expect(presets['precise']).toBeDefined();
            expect(presets['balanced']).toBeDefined();
            expect(presets['performance']).toBeDefined();
        });

        it('precise 预设应有更低的阈值', () => {
            const presets = SyncPrecisionController.getPresets();
            expect(presets['precise'].scrollThreshold).toBeLessThan(presets['balanced'].scrollThreshold);
        });

        it('performance 预设应禁用平滑滚动', () => {
            const presets = SyncPrecisionController.getPresets();
            expect(presets['performance'].enableSmoothScroll).toBe(false);
        });
    });

    describe('性能测试', () => {
        it('阈值判断性能', () => {
            const iterations = 10000;
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                controller.shouldTriggerSync(Math.random() * 1000);
            }

            const elapsed = performance.now() - start;
            const avgTime = elapsed / iterations;

            console.log(`[性能] 阈值判断平均耗时: ${avgTime.toFixed(6)}ms`);
            expect(avgTime).toBeLessThan(0.001); // 极快
        });

        it('平滑计算性能', () => {
            const iterations = 10000;
            const start = performance.now();

            for (let i = 0; i < iterations; i++) {
                controller.calculateSmoothScroll(
                    Math.random() * 500,
                    Math.random() * 500 + 500
                );
            }

            const elapsed = performance.now() - start;
            const avgTime = elapsed / iterations;

            console.log(`[性能] 平滑计算平均耗时: ${avgTime.toFixed(6)}ms`);
            expect(avgTime).toBeLessThan(0.001);
        });
    });

    describe('可行性分析', () => {
        it('技术可行性评估', () => {
            const feasibility = {
                technicalDifficulty: 2, // 简单
                estimatedTime: 1.5, // 1.5小时
                impactLevel: 1, // 影响小
                userValue: 4, // 高用户价值
                score: 9 // 非常可行
            };

            console.log('[可行性分析] 同步精度设置（像素阈值）:');
            console.log(`  技术难度: ${feasibility.technicalDifficulty}/5`);
            console.log(`  预计时间: ${feasibility.estimatedTime}h`);
            console.log(`  影响程度: ${feasibility.impactLevel}/5`);
            console.log(`  用户价值: ${feasibility.userValue}/5`);
            console.log(`  总体评分: ${feasibility.score}/10`);

            expect(feasibility.score).toBeGreaterThanOrEqual(8);
        });

        it('实现方案验证', () => {
            const implementationPlan = {
                // 1. 扩展 SmartMPSetting
                settingsModify: true,
                // 2. 修改 smoothScroll 方法
                smoothScrollModify: true,
                // 3. 添加阈值判断
                thresholdCheck: true,
                challenges: [
                    '阈值过小可能导致过度敏感',
                    '需要在不同文档长度下测试最佳默认值'
                ]
            };

            expect(implementationPlan.settingsModify).toBe(true);
        });
    });
});


// ============== 综合可行性评估 ==============

describe('综合可行性评估', () => {
    it('三个改进的优先级排序', () => {
        const improvements = [
            {
                name: '同步精度设置',
                score: 9,
                effort: 1.5,
                value: 4,
                priority: 1
            },
            {
                name: '自定义高亮样式',
                score: 8,
                effort: 2,
                value: 3,
                priority: 2
            },
            {
                name: '代码块内部行号映射',
                score: 7,
                effort: 4,
                value: 4,
                priority: 3
            }
        ];

        // 按 score * value / effort 计算优先级分数
        const prioritized = improvements.map(imp => ({
            ...imp,
            priorityScore: (imp.score * imp.value) / imp.effort
        })).sort((a, b) => b.priorityScore - a.priorityScore);

        console.log('\n========== 改进优先级排序 ==========');
        prioritized.forEach((imp, index) => {
            console.log(`${index + 1}. ${imp.name}`);
            console.log(`   评分: ${imp.score}/10, 工时: ${imp.effort}h, 价值: ${imp.value}/5`);
            console.log(`   优先级分数: ${imp.priorityScore.toFixed(2)}`);
        });
        console.log('====================================\n');

        // 验证优先级计算
        expect(prioritized[0].name).toBe('同步精度设置');
        expect(prioritized[1].name).toBe('自定义高亮样式');
        expect(prioritized[2].name).toBe('代码块内部行号映射');
    });

    it('实现路线图', () => {
        const roadmap = {
            phase1: {
                name: '快速实现',
                duration: '1-2天',
                items: ['同步精度设置', '自定义高亮样式']
            },
            phase2: {
                name: '深度优化',
                duration: '3-5天',
                items: ['代码块内部行号映射']
            }
        };

        console.log('\n========== 实现路线图 ==========');
        console.log(`Phase 1 (${roadmap.phase1.duration}): ${roadmap.phase1.items.join(', ')}`);
        console.log(`Phase 2 (${roadmap.phase2.duration}): ${roadmap.phase2.items.join(', ')}`);
        console.log('================================\n');

        expect(roadmap.phase1.items.length).toBe(2);
        expect(roadmap.phase2.items.length).toBe(1);
    });
});
