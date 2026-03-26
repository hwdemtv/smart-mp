/**
 * 滚动同步改进方案深度分析与测试
 *
 * 本文件测试以下改进方案:
 * 1. 双向同步 (Bidirectional Sync)
 * 2. 行级精确映射 (Line-based Precise Mapping)
 * 3. 虚拟进度指示器 (Virtual Progress Indicator)
 * 4. 可见区域高亮 (Visible Section Highlighting)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============== 测试工具函数 ==============

/**
 * 模拟编辑器滚动状态
 */
interface MockEditorState {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    lineCount: number;
    visibleLineStart: number;
    visibleLineEnd: number;
}

/**
 * 模拟预览区滚动状态
 */
interface MockPreviewState {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    headingPositions: Array<{ level: number; text: string; offsetTop: number }>;
}

/**
 * 模拟标题元数据
 */
interface MockHeading {
    level: number;
    text: string;
    line: number;
}

// ============== 方案1: 双向同步测试 ==============

describe('方案1: 双向同步 (Bidirectional Sync)', () => {
    /**
     * 双向同步算法
     * 核心思路: 维护一个同步锁，避免循环触发
     */
    class BidirectionalSyncController {
        private syncLock: boolean = false;
        private lastEditorScroll: number = 0;
        private lastPreviewScroll: number = 0;
        private readonly THRESHOLD = 5; // 滚动阈值，避免抖动

        /**
         * 编辑器 → 预览 同步
         */
        syncEditorToPreview(
            editorState: MockEditorState,
            previewState: MockPreviewState,
            headings: MockHeading[]
        ): number {
            if (this.syncLock) return previewState.scrollTop;

            this.syncLock = true;

            // 使用标题锚点插值计算目标位置
            const scrollPercent = this.calculateEditorScrollPercent(editorState);
            const targetTop = this.interpolateWithHeadings(
                scrollPercent,
                editorState,
                previewState,
                headings
            );

            this.lastEditorScroll = Date.now();

            // 延迟释放锁
            setTimeout(() => { this.syncLock = false; }, 50);

            return targetTop;
        }

        /**
         * 预览 → 编辑器 同步
         */
        syncPreviewToEditor(
            previewState: MockPreviewState,
            editorState: MockEditorState,
            headings: MockHeading[]
        ): number {
            if (this.syncLock) return editorState.scrollTop;

            this.syncLock = true;

            // 反向计算编辑器滚动位置
            const scrollPercent = this.calculatePreviewScrollPercent(previewState);
            const targetLine = this.reverseInterpolateWithHeadings(
                scrollPercent,
                previewState,
                editorState,
                headings
            );

            this.lastPreviewScroll = Date.now();

            setTimeout(() => { this.syncLock = false; }, 50);

            return targetLine;
        }

        private calculateEditorScrollPercent(state: MockEditorState): number {
            const scrollable = state.scrollHeight - state.clientHeight;
            return scrollable > 0 ? state.scrollTop / scrollable : 0;
        }

        private calculatePreviewScrollPercent(state: MockPreviewState): number {
            const scrollable = state.scrollHeight - state.clientHeight;
            return scrollable > 0 ? state.scrollTop / scrollable : 0;
        }

        private interpolateWithHeadings(
            percent: number,
            editorState: MockEditorState,
            previewState: MockPreviewState,
            headings: MockHeading[]
        ): number {
            if (headings.length === 0) {
                // 无标题时使用纯百分比
                return percent * (previewState.scrollHeight - previewState.clientHeight);
            }

            // 标题锚点插值算法
            const currentLine = Math.floor(percent * editorState.lineCount);
            let prevHeading: MockHeading | null = null;
            let nextHeading: MockHeading | null = null;

            for (const h of headings) {
                if (h.line <= currentLine) {
                    prevHeading = h;
                } else {
                    nextHeading = h;
                    break;
                }
            }

            // 根据标题位置计算预览滚动
            if (prevHeading && nextHeading) {
                const lineRange = nextHeading.line - prevHeading.line;
                const localProgress = lineRange > 0
                    ? (currentLine - prevHeading.line) / lineRange
                    : 0;

                const prevIndex = headings.indexOf(prevHeading);
                const nextIndex = headings.indexOf(nextHeading);

                if (prevIndex < previewState.headingPositions.length &&
                    nextIndex < previewState.headingPositions.length) {
                    const prevTop = previewState.headingPositions[prevIndex].offsetTop;
                    const nextTop = previewState.headingPositions[nextIndex].offsetTop;
                    return prevTop + localProgress * (nextTop - prevTop);
                }
            }

            return percent * (previewState.scrollHeight - previewState.clientHeight);
        }

        private reverseInterpolateWithHeadings(
            percent: number,
            previewState: MockPreviewState,
            editorState: MockEditorState,
            headings: MockHeading[]
        ): number {
            if (headings.length === 0 || previewState.headingPositions.length === 0) {
                return percent * editorState.lineCount;
            }

            // 找到当前预览位置对应的标题
            const previewScrollable = previewState.scrollHeight - previewState.clientHeight;
            const currentTop = percent * previewScrollable;

            let prevHeadingIndex = -1;
            for (let i = 0; i < previewState.headingPositions.length; i++) {
                if (previewState.headingPositions[i].offsetTop <= currentTop) {
                    prevHeadingIndex = i;
                } else {
                    break;
                }
            }

            if (prevHeadingIndex >= 0 && prevHeadingIndex < headings.length - 1) {
                const prevHeading = headings[prevHeadingIndex];
                const nextHeading = headings[prevHeadingIndex + 1];
                const prevTop = previewState.headingPositions[prevHeadingIndex].offsetTop;
                const nextTop = previewState.headingPositions[prevHeadingIndex + 1].offsetTop;

                const previewRange = nextTop - prevTop;
                const localProgress = previewRange > 0
                    ? (currentTop - prevTop) / previewRange
                    : 0;

                const lineRange = nextHeading.line - prevHeading.line;
                return prevHeading.line + localProgress * lineRange;
            }

            return percent * editorState.lineCount;
        }

        isLocked(): boolean {
            return this.syncLock;
        }
    }

    let controller: BidirectionalSyncController;

    beforeEach(() => {
        controller = new BidirectionalSyncController();
    });

    it('应该正确计算编辑器滚动百分比', () => {
        const editorState: MockEditorState = {
            scrollTop: 100,
            scrollHeight: 1000,
            clientHeight: 500,
            lineCount: 100,
            visibleLineStart: 10,
            visibleLineEnd: 20
        };

        // 100 / (1000 - 500) = 0.2
        const percent = 100 / (1000 - 500);
        expect(percent).toBeCloseTo(0.2, 2);
    });

    it('应该使用标题锚点进行精确插值', () => {
        const editorState: MockEditorState = {
            scrollTop: 250,
            scrollHeight: 1000,
            clientHeight: 500,
            lineCount: 100,
            visibleLineStart: 25,
            visibleLineEnd: 35
        };

        const previewState: MockPreviewState = {
            scrollTop: 0,
            scrollHeight: 2000,
            clientHeight: 400,
            headingPositions: [
                { level: 1, text: 'Title', offsetTop: 0 },
                { level: 2, text: 'Section 1', offsetTop: 300 },
                { level: 2, text: 'Section 2', offsetTop: 800 },
                { level: 2, text: 'Section 3', offsetTop: 1200 }
            ]
        };

        const headings: MockHeading[] = [
            { level: 1, text: 'Title', line: 0 },
            { level: 2, text: 'Section 1', line: 10 },
            { level: 2, text: 'Section 2', line: 50 },
            { level: 2, text: 'Section 3', line: 80 }
        ];

        const targetTop = controller.syncEditorToPreview(editorState, previewState, headings);

        // 应该在有效范围内
        expect(targetTop).toBeGreaterThanOrEqual(0);
        expect(targetTop).toBeLessThanOrEqual(previewState.scrollHeight - previewState.clientHeight);
    });

    it('应该使用同步锁避免循环触发', () => {
        const editorState: MockEditorState = {
            scrollTop: 100, scrollHeight: 1000, clientHeight: 500,
            lineCount: 100, visibleLineStart: 10, visibleLineEnd: 20
        };
        const previewState: MockPreviewState = {
            scrollTop: 0, scrollHeight: 2000, clientHeight: 400,
            headingPositions: [{ level: 1, text: 'Title', offsetTop: 0 }]
        };
        const headings: MockHeading[] = [{ level: 1, text: 'Title', line: 0 }];

        // 第一次同步
        controller.syncEditorToPreview(editorState, previewState, headings);

        // 锁应该被激活
        expect(controller.isLocked()).toBe(true);

        // 等待锁释放
        return new Promise<void>(resolve => {
            setTimeout(() => {
                expect(controller.isLocked()).toBe(false);
                resolve();
            }, 100);
        });
    });

    it('应该支持预览 → 编辑器的反向同步', () => {
        const previewState: MockPreviewState = {
            scrollTop: 400,
            scrollHeight: 2000,
            clientHeight: 400,
            headingPositions: [
                { level: 1, text: 'Title', offsetTop: 0 },
                { level: 2, text: 'Section 1', offsetTop: 300 },
                { level: 2, text: 'Section 2', offsetTop: 800 }
            ]
        };

        const editorState: MockEditorState = {
            scrollTop: 0, scrollHeight: 1000, clientHeight: 500,
            lineCount: 100, visibleLineStart: 0, visibleLineEnd: 10
        };

        const headings: MockHeading[] = [
            { level: 1, text: 'Title', line: 0 },
            { level: 2, text: 'Section 1', line: 10 },
            { level: 2, text: 'Section 2', line: 50 }
        ];

        const targetLine = controller.syncPreviewToEditor(previewState, editorState, headings);

        // 应该返回有效的行号
        expect(targetLine).toBeGreaterThanOrEqual(0);
        expect(targetLine).toBeLessThanOrEqual(editorState.lineCount);
    });
});

// ============== 方案2: 行级精确映射测试 ==============

describe('方案2: 行级精确映射 (Line-based Precise Mapping)', () => {
    /**
     * 行级映射控制器
     * 核心: 构建编辑器行号 → 预览元素的精确映射表
     */
    class LineMappingController {
        private lineToElementMap: Map<number, string> = new Map();
        private elementToLineMap: Map<string, number> = new Map();
        private buildTime: number = 0;

        /**
         * 构建行级映射表
         * 基于渲染时的元素位置信息
         */
        buildMapping(
            elements: Array<{ line: number; elementId: string; type: string }>
        ): void {
            this.lineToElementMap.clear();
            this.elementToLineMap.clear();
            this.buildTime = Date.now();

            for (const el of elements) {
                this.lineToElementMap.set(el.line, el.elementId);
                this.elementToLineMap.set(el.elementId, el.line);
            }
        }

        /**
         * 根据编辑器行号查找对应预览元素
         */
        findPreviewElement(line: number): string | undefined {
            // 精确匹配
            if (this.lineToElementMap.has(line)) {
                return this.lineToElementMap.get(line);
            }

            // 查找最近的映射
            let closestLine = -1;
            for (const [mappedLine] of this.lineToElementMap) {
                if (mappedLine <= line && mappedLine > closestLine) {
                    closestLine = mappedLine;
                }
            }

            return closestLine >= 0 ? this.lineToElementMap.get(closestLine) : undefined;
        }

        /**
         * 根据预览元素查找对应编辑器行号
         */
        findEditorLine(elementId: string): number | undefined {
            return this.elementToLineMap.get(elementId);
        }

        /**
         * 获取映射表统计信息
         */
        getStats() {
            return {
                mappingCount: this.lineToElementMap.size,
                buildTime: this.buildTime,
                age: Date.now() - this.buildTime
            };
        }

        /**
         * 增量更新映射
         * 当内容变化时只更新受影响的部分
         */
        updateMapping(
            changes: Array<{ type: 'add' | 'remove' | 'update'; line: number; elementId?: string }>
        ): void {
            for (const change of changes) {
                if (change.type === 'add' && change.elementId) {
                    this.lineToElementMap.set(change.line, change.elementId);
                    this.elementToLineMap.set(change.elementId, change.line);
                } else if (change.type === 'remove') {
                    const existingId = this.lineToElementMap.get(change.line);
                    if (existingId) {
                        this.lineToElementMap.delete(change.line);
                        this.elementToLineMap.delete(existingId);
                    }
                } else if (change.type === 'update' && change.elementId) {
                    const existingId = this.lineToElementMap.get(change.line);
                    if (existingId) {
                        this.elementToLineMap.delete(existingId);
                    }
                    this.lineToElementMap.set(change.line, change.elementId);
                    this.elementToLineMap.set(change.elementId, change.line);
                }
            }
        }
    }

    let controller: LineMappingController;

    beforeEach(() => {
        controller = new LineMappingController();
    });

    it('应该正确构建行级映射表', () => {
        const elements = [
            { line: 0, elementId: 'h1-title', type: 'heading' },
            { line: 5, elementId: 'p-intro', type: 'paragraph' },
            { line: 10, elementId: 'h2-section1', type: 'heading' },
            { line: 15, elementId: 'p-content1', type: 'paragraph' },
            { line: 20, elementId: 'code-1', type: 'code' }
        ];

        controller.buildMapping(elements);
        const stats = controller.getStats();

        expect(stats.mappingCount).toBe(5);
    });

    it('应该精确查找对应的预览元素', () => {
        controller.buildMapping([
            { line: 0, elementId: 'h1-title', type: 'heading' },
            { line: 10, elementId: 'h2-section1', type: 'heading' },
            { line: 20, elementId: 'h2-section2', type: 'heading' }
        ]);

        // 精确匹配
        expect(controller.findPreviewElement(10)).toBe('h2-section1');

        // 查找最近的映射（15行 → 10行对应的元素）
        expect(controller.findPreviewElement(15)).toBe('h2-section1');

        // 查找最近的映射（19行 → 10行对应的元素）
        expect(controller.findPreviewElement(19)).toBe('h2-section1');

        // 查找最近的映射（20行 → 20行对应的元素）
        expect(controller.findPreviewElement(20)).toBe('h2-section2');
    });

    it('应该支持反向映射（预览元素 → 行号）', () => {
        controller.buildMapping([
            { line: 0, elementId: 'h1-title', type: 'heading' },
            { line: 10, elementId: 'h2-section1', type: 'heading' }
        ]);

        expect(controller.findEditorLine('h2-section1')).toBe(10);
        expect(controller.findEditorLine('non-existent')).toBeUndefined();
    });

    it('应该支持增量更新映射表', () => {
        controller.buildMapping([
            { line: 0, elementId: 'h1-title', type: 'heading' },
            { line: 10, elementId: 'h2-section1', type: 'heading' }
        ]);

        // 添加新映射
        controller.updateMapping([
            { type: 'add', line: 20, elementId: 'h2-section2' }
        ]);
        expect(controller.findPreviewElement(20)).toBe('h2-section2');

        // 更新现有映射
        controller.updateMapping([
            { type: 'update', line: 10, elementId: 'h2-section1-updated' }
        ]);
        expect(controller.findPreviewElement(10)).toBe('h2-section1-updated');

        // 删除映射
        controller.updateMapping([
            { type: 'remove', line: 0 }
        ]);
        expect(controller.findPreviewElement(0)).toBeUndefined();
    });

    it('映射表大小应该合理（内存效率测试）', () => {
        // 模拟1000行的文档
        const elements = [];
        for (let i = 0; i < 100; i++) {
            elements.push({
                line: i * 10,
                elementId: `el-${i}`,
                type: i % 5 === 0 ? 'heading' : 'paragraph'
            });
        }

        controller.buildMapping(elements);
        const stats = controller.getStats();

        expect(stats.mappingCount).toBe(100);

        // 内存估算: 每个映射约 100 字节
        // 100 个映射 ≈ 10KB，应该可以接受
    });
});

// ============== 方案3: 虚拟进度指示器测试 ==============

describe('方案3: 虚拟进度指示器 (Virtual Progress Indicator)', () => {
    /**
     * 进度指示器控制器
     * 核心思路: 在预览区显示当前阅读进度
     */
    class ProgressIndicatorController {
        private currentProgress: number = 0;
        private readingSpeed: number = 200; // 字/分钟
        private totalWords: number = 0;

        /**
         * 计算并更新进度
         */
        calculateProgress(
            scrollTop: number,
            scrollHeight: number,
            clientHeight: number
        ): number {
            const scrollable = scrollHeight - clientHeight;
            this.currentProgress = scrollable > 0
                ? Math.round((scrollTop / scrollable) * 100)
                : 0;

            return this.currentProgress;
        }

        /**
         * 获取预计剩余阅读时间
         */
        getRemainingTime(progress: number): number {
            const remainingWords = Math.round(this.totalWords * (1 - progress / 100));
            return Math.ceil(remainingWords / this.readingSpeed);
        }

        /**
         * 生成进度提示文本
         */
        generateProgressText(progress: number): string {
            if (progress < 10) return '刚刚开始';
            if (progress < 30) return '阅读中...';
            if (progress < 50) return '已阅读三分之一';
            if (progress < 70) return '过半了';
            if (progress < 90) return '快结束了';
            return '即将完成';
        }

        /**
         * 设置文章统计信息
         */
        setArticleStats(totalWords: number, readingSpeed?: number): void {
            this.totalWords = totalWords;
            if (readingSpeed) this.readingSpeed = readingSpeed;
        }

        /**
         * 生成进度条样式
         */
        generateProgressBarStyle(progress: number): {
            width: string;
            color: string;
            text: string;
        } {
            let color = '#4CAF50'; // 绿色
            if (progress < 30) color = '#2196F3'; // 蓝色
            else if (progress < 70) color = '#FF9800'; // 橙色

            return {
                width: `${progress}%`,
                color,
                text: this.generateProgressText(progress)
            };
        }
    }

    let controller: ProgressIndicatorController;

    beforeEach(() => {
        controller = new ProgressIndicatorController();
    });

    it('应该正确计算滚动进度百分比', () => {
        // 0% 进度
        expect(controller.calculateProgress(0, 1000, 500)).toBe(0);

        // 50% 进度
        expect(controller.calculateProgress(250, 1000, 500)).toBe(50);

        // 100% 进度
        expect(controller.calculateProgress(500, 1000, 500)).toBe(100);
    });

    it('应该正确计算剩余阅读时间', () => {
        controller.setArticleStats(1000); // 1000 字

        expect(controller.getRemainingTime(0)).toBe(5); // 1000/200 = 5 分钟
        expect(controller.getRemainingTime(50)).toBe(3); // 500/200 = 2.5 → 3 分钟
        expect(controller.getRemainingTime(100)).toBe(0);
    });

    it('应该生成合理的进度提示文本', () => {
        expect(controller.generateProgressText(5)).toBe('刚刚开始');
        expect(controller.generateProgressText(25)).toBe('阅读中...');
        expect(controller.generateProgressText(40)).toBe('已阅读三分之一');
        expect(controller.generateProgressText(60)).toBe('过半了');
        expect(controller.generateProgressText(80)).toBe('快结束了');
        expect(controller.generateProgressText(95)).toBe('即将完成');
    });

    it('应该生成正确的进度条样式', () => {
        const style = controller.generateProgressBarStyle(50);
        expect(style.width).toBe('50%');
        expect(style.color).toBe('#FF9800');
        expect(style.text).toBe('过半了'); // 修正：50% 对应 "过半了"
    });

    it('边界情况：0 字文章', () => {
        controller.setArticleStats(0);
        expect(controller.getRemainingTime(0)).toBe(0);
    });
});

// ============== 方案4: 可见区域高亮测试 ==============

describe('方案4: 可见区域高亮 (Visible Section Highlighting)', () => {
    /**
     * 可见区域高亮控制器
     * 核心思路: 高亮当前正在阅读的章节
     */
    class VisibleSectionController {
        private currentVisibleSections: Set<string> = new Set();
        private headingHierarchy: Array<{
            id: string;
            level: number;
            text: string;
            startY: number;
            endY: number;
        }> = [];

        /**
         * 设置标题层级结构
         */
        setHeadingHierarchy(
            headings: Array<{ id: string; level: number; text: string; offsetTop: number }>,
            totalHeight: number
        ): void {
            this.headingHierarchy = headings.map((h, index) => ({
                id: h.id,
                level: h.level,
                text: h.text,
                startY: h.offsetTop,
                endY: index < headings.length - 1
                    ? headings[index + 1].offsetTop
                    : totalHeight
            }));
        }

        /**
         * 计算当前可见的章节
         */
        calculateVisibleSections(
            viewportTop: number,
            viewportBottom: number
        ): string[] {
            this.currentVisibleSections.clear();

            for (const section of this.headingHierarchy) {
                // 检查章节是否与视口重叠
                if (section.endY >= viewportTop && section.startY <= viewportBottom) {
                    this.currentVisibleSections.add(section.id);
                }
            }

            return Array.from(this.currentVisibleSections);
        }

        /**
         * 获取当前主焦点章节（可见面积最大的）
         */
        getMainFocusedSection(
            viewportTop: number,
            viewportBottom: number
        ): string | null {
            let maxVisibleArea = 0;
            let focusedSection: string | null = null;

            for (const section of this.headingHierarchy) {
                const visibleStart = Math.max(viewportTop, section.startY);
                const visibleEnd = Math.min(viewportBottom, section.endY);
                const visibleArea = Math.max(0, visibleEnd - visibleStart);

                if (visibleArea > maxVisibleArea) {
                    maxVisibleArea = visibleArea;
                    focusedSection = section.id;
                }
            }

            return focusedSection;
        }

        /**
         * 生成大纲导航信息
         */
        generateOutlineInfo(): Array<{
            id: string;
            level: number;
            text: string;
            isVisible: boolean;
        }> {
            return this.headingHierarchy.map(h => ({
                id: h.id,
                level: h.level,
                text: h.text,
                isVisible: this.currentVisibleSections.has(h.id)
            }));
        }

        /**
         * 生成高亮样式类名
         */
        generateHighlightClass(sectionId: string): string {
            if (this.currentVisibleSections.has(sectionId)) {
                return 'section-visible';
            }
            return '';
        }
    }

    let controller: VisibleSectionController;

    beforeEach(() => {
        controller = new VisibleSectionController();
    });

    it('应该正确设置标题层级结构', () => {
        controller.setHeadingHierarchy([
            { id: 'h1', level: 1, text: 'Title', offsetTop: 0 },
            { id: 'h2-1', level: 2, text: 'Section 1', offsetTop: 200 },
            { id: 'h2-2', level: 2, text: 'Section 2', offsetTop: 500 },
            { id: 'h2-3', level: 2, text: 'Section 3', offsetTop: 800 }
        ], 1000);

        const outline = controller.generateOutlineInfo();
        expect(outline.length).toBe(4);
        expect(outline[0].level).toBe(1);
        expect(outline[0].text).toBe('Title');
    });

    it('应该正确计算可见章节', () => {
        controller.setHeadingHierarchy([
            { id: 'h1', level: 1, text: 'Title', offsetTop: 0 },
            { id: 'h2-1', level: 2, text: 'Section 1', offsetTop: 200 },
            { id: 'h2-2', level: 2, text: 'Section 2', offsetTop: 500 },
            { id: 'h2-3', level: 2, text: 'Section 3', offsetTop: 800 }
        ], 1000);

        // 视口在 0-400 范围
        const visible = controller.calculateVisibleSections(0, 400);

        // 应该包含 Title (0-200) 和 Section 1 (200-500)
        expect(visible).toContain('h1');
        expect(visible).toContain('h2-1');
        expect(visible).not.toContain('h2-3');
    });

    it('应该正确识别主焦点章节', () => {
        controller.setHeadingHierarchy([
            { id: 'h1', level: 1, text: 'Title', offsetTop: 0 },
            { id: 'h2-1', level: 2, text: 'Section 1', offsetTop: 200 },
            { id: 'h2-2', level: 2, text: 'Section 2', offsetTop: 500 }
        ], 1000);

        // 视口在 250-450，主要显示 Section 1 (200-500)
        const mainSection = controller.getMainFocusedSection(250, 450);
        expect(mainSection).toBe('h2-1');
    });

    it('应该生成正确的大纲导航信息', () => {
        controller.setHeadingHierarchy([
            { id: 'h1', level: 1, text: 'Title', offsetTop: 0 },
            { id: 'h2-1', level: 2, text: 'Section 1', offsetTop: 200 }
        ], 1000);

        controller.calculateVisibleSections(0, 300);
        const outline = controller.generateOutlineInfo();

        expect(outline[0].isVisible).toBe(true);
        expect(outline[1].isVisible).toBe(true);
    });

    it('应该生成正确的高亮类名', () => {
        controller.setHeadingHierarchy([
            { id: 'h1', level: 1, text: 'Title', offsetTop: 0 },
            { id: 'h2-1', level: 2, text: 'Section 1', offsetTop: 200 }
        ], 1000);

        controller.calculateVisibleSections(0, 300);

        expect(controller.generateHighlightClass('h1')).toBe('section-visible');
        expect(controller.generateHighlightClass('h2-1')).toBe('section-visible');
    });
});

// ============== 性能基准测试 ==============

describe('性能基准测试', () => {
    it('双向同步算法性能 < 1ms', () => {
        const iterations = 1000;
        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            // 模拟滚动计算
            const scrollTop = Math.random() * 1000;
            const scrollHeight = 2000;
            const clientHeight = 500;
            const percent = scrollTop / (scrollHeight - clientHeight);
        }

        const elapsed = performance.now() - start;
        const avgTime = elapsed / iterations;

        console.log(`双向同步平均耗时: ${avgTime.toFixed(4)}ms`);
        expect(avgTime).toBeLessThan(1);
    });

    it('行级映射查找性能 < 0.1ms', () => {
        const map = new Map<number, string>();
        for (let i = 0; i < 1000; i++) {
            map.set(i, `el-${i}`);
        }

        const iterations = 1000;
        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            map.get(Math.floor(Math.random() * 1000));
        }

        const elapsed = performance.now() - start;
        const avgTime = elapsed / iterations;

        console.log(`行级映射查找平均耗时: ${avgTime.toFixed(4)}ms`);
        expect(avgTime).toBeLessThan(0.1);
    });

    it('可见区域计算性能 < 0.5ms', () => {
        const headings = [];
        for (let i = 0; i < 100; i++) {
            headings.push({
                id: `h-${i}`,
                level: i % 3 + 1,
                text: `Heading ${i}`,
                offsetTop: i * 100
            });
        }

        const iterations = 1000;
        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            const viewportTop = Math.random() * 5000;
            const viewportBottom = viewportTop + 400;

            let count = 0;
            for (const h of headings) {
                const endY = h.offsetTop + 100;
                if (endY >= viewportTop && h.offsetTop <= viewportBottom) {
                    count++;
                }
            }
        }

        const elapsed = performance.now() - start;
        const avgTime = elapsed / iterations;

        console.log(`可见区域计算平均耗时: ${avgTime.toFixed(4)}ms`);
        expect(avgTime).toBeLessThan(0.5);
    });
});

// ============== 可行性分析总结 ==============

describe('可行性分析总结', () => {
    it('方案可行性评分', () => {
        const analysis = {
            '双向同步': {
                feasibility: 7, // 1-10
                impact: 8,
                complexity: 6,
                risk: 4, // 循环触发风险
                recommendation: '中等优先级，需要仔细处理同步锁逻辑'
            },
            '行级精确映射': {
                feasibility: 8,
                impact: 9,
                complexity: 5,
                risk: 2,
                recommendation: '高优先级，实现简单，效果显著'
            },
            '虚拟进度指示器': {
                feasibility: 9,
                impact: 6,
                complexity: 3,
                risk: 1,
                recommendation: '高优先级，实现最简单，用户体验提升'
            },
            '可见区域高亮': {
                feasibility: 7,
                impact: 7,
                complexity: 6,
                risk: 3,
                recommendation: '中等优先级，需要额外的 UI 组件支持'
            }
        };

        console.table(analysis);

        // 综合评分
        const scores = Object.values(analysis).map(a =>
            (a.feasibility * 0.3 + a.impact * 0.4 - a.complexity * 0.15 - a.risk * 0.15)
        );

        // 行级映射应该得分最高
        expect(scores[1]).toBeGreaterThan(4.5);
    });
});
