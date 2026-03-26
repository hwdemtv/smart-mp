/**
 * Line Mapper - 编辑器行号与预览元素的精确映射
 *
 * 核心思路：
 * 1. 在渲染时记录每个元素对应的源码行号
 * 2. 构建双向映射表：行号 ↔ 元素ID
 * 3. 滚动时使用映射表精确定位
 */

import { TFile, MarkdownView, Editor } from 'obsidian';

/**
 * 映射条目
 */
export interface MappingEntry {
    /** 编辑器行号 (0-indexed) */
    line: number;
    /** 元素唯一标识 */
    elementId: string;
    /** 元素类型 */
    type: 'heading' | 'paragraph' | 'code' | 'list' | 'image' | 'table' | 'blockquote' | 'other';
    /** 元素在预览区的垂直位置 */
    offsetTop: number;
    /** 元素高度 */
    height: number;
}

/**
 * 行级映射器配置
 */
interface LineMapperConfig {
    /** 是否启用增量更新 */
    enableIncrementalUpdate: boolean;
    /** 映射表最大条目数 */
    maxEntries: number;
    /** 是否缓存映射结果 */
    enableCache: boolean;
}

/**
 * 行级映射器
 * 用于精确对齐编辑器行号和预览元素位置
 */
export class LineMapper {
    private lineToElementMap: Map<number, MappingEntry[]> = new Map();
    private elementToLineMap: Map<string, MappingEntry> = new Map();
    private sortedEntries: MappingEntry[] = [];
    private config: LineMapperConfig;
    private lastContentHash: string = '';
    private buildTime: number = 0;

    constructor(config?: Partial<LineMapperConfig>) {
        this.config = {
            enableIncrementalUpdate: config?.enableIncrementalUpdate ?? true,
            maxEntries: config?.maxEntries ?? 10000,
            enableCache: config?.enableCache ?? true
        };
    }

    /**
     * 构建映射表
     * @param entries 渲染时收集的映射条目
     */
    build(entries: MappingEntry[]): void {
        // 清空旧映射
        this.lineToElementMap.clear();
        this.elementToLineMap.clear();

        // 限制条目数量
        const limitedEntries = entries.slice(0, this.config.maxEntries);

        // 构建双向映射
        for (const entry of limitedEntries) {
            // 行号 → 元素列表（一行可能对应多个元素）
            if (!this.lineToElementMap.has(entry.line)) {
                this.lineToElementMap.set(entry.line, []);
            }
            this.lineToElementMap.get(entry.line)!.push(entry);

            // 元素ID → 行号
            this.elementToLineMap.set(entry.elementId, entry);
        }

        // 按行号排序，用于二分查找
        this.sortedEntries = [...limitedEntries].sort((a, b) => a.line - b.line);
        this.buildTime = Date.now();
    }

    /**
     * 根据编辑器行号查找预览元素
     * @param line 编辑器行号 (0-indexed)
     * @returns 最近的映射条目
     */
    findByLine(line: number): MappingEntry | null {
        // 精确匹配
        const exactMatches = this.lineToElementMap.get(line);
        if (exactMatches && exactMatches.length > 0) {
            // 返回第一个匹配的元素
            return exactMatches[0];
        }

        // 二分查找最近的映射
        return this.findClosestEntry(line);
    }

    /**
     * 根据预览位置查找编辑器行号
     * @param offsetTop 预览区滚动位置
     * @returns 对应的编辑器行号
     */
    findByOffsetTop(offsetTop: number): number | null {
        // 找到 offsetTop 最接近的元素
        let closestEntry: MappingEntry | null = null;
        let minDistance = Infinity;

        for (const entry of this.sortedEntries) {
            const distance = Math.abs(entry.offsetTop - offsetTop);
            if (distance < minDistance) {
                minDistance = distance;
                closestEntry = entry;
            }
        }

        return closestEntry?.line ?? null;
    }

    /**
     * 根据元素ID查找映射条目
     */
    findByElementId(elementId: string): MappingEntry | null {
        return this.elementToLineMap.get(elementId) ?? null;
    }

    /**
     * 获取指定行范围内的所有映射条目
     */
    getEntriesInRange(startLine: number, endLine: number): MappingEntry[] {
        const result: MappingEntry[] = [];

        for (let line = startLine; line <= endLine; line++) {
            const entries = this.lineToElementMap.get(line);
            if (entries) {
                result.push(...entries);
            }
        }

        return result;
    }

    /**
     * 获取当前可见的映射条目
     * @param viewportTop 视口顶部位置
     * @param viewportBottom 视口底部位置
     */
    getVisibleEntries(viewportTop: number, viewportBottom: number): MappingEntry[] {
        return this.sortedEntries.filter(entry =>
            entry.offsetTop + entry.height >= viewportTop &&
            entry.offsetTop <= viewportBottom
        );
    }

    /**
     * 计算编辑器滚动位置对应的预览位置
     * @param editorScrollTop 编辑器滚动位置
     * @param editorScrollHeight 编辑器可滚动高度
     * @param previewScrollHeight 预览区可滚动高度
     */
    calculatePreviewPosition(
        editorScrollTop: number,
        editorScrollHeight: number,
        previewScrollHeight: number
    ): number {
        const percent = editorScrollHeight > 0
            ? editorScrollTop / editorScrollHeight
            : 0;

        return percent * previewScrollHeight;
    }

    /**
     * 使用映射表精确计算预览位置
     * @param line 编辑器当前行号
     * @param lineProgress 在当前行内的进度 (0-1)
     */
    calculatePrecisePreviewPosition(line: number, lineProgress: number = 0): number | null {
        const entry = this.findByLine(line);
        if (!entry) return null;

        const nextEntry = this.findNextEntry(line);

        if (nextEntry) {
            // 在两个映射点之间插值
            const heightRange = nextEntry.offsetTop - entry.offsetTop;
            return entry.offsetTop + lineProgress * heightRange;
        }

        return entry.offsetTop;
    }

    /**
     * 获取映射统计信息
     */
    getStats() {
        return {
            totalEntries: this.sortedEntries.length,
            uniqueLines: this.lineToElementMap.size,
            uniqueElements: this.elementToLineMap.size,
            buildTime: this.buildTime,
            age: Date.now() - this.buildTime
        };
    }

    /**
     * 清空映射表
     */
    clear(): void {
        this.lineToElementMap.clear();
        this.elementToLineMap.clear();
        this.sortedEntries = [];
        this.lastContentHash = '';
    }

    // ============== 私有方法 ==============

    /**
     * 二分查找最近的映射条目
     */
    private findClosestEntry(targetLine: number): MappingEntry | null {
        if (this.sortedEntries.length === 0) return null;

        let left = 0;
        let right = this.sortedEntries.length - 1;

        // 找到第一个行号大于目标的位置
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (this.sortedEntries[mid].line < targetLine) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        // 比较前后两个条目，返回更近的
        const entry = this.sortedEntries[left];
        const prevEntry = left > 0 ? this.sortedEntries[left - 1] : null;

        if (prevEntry) {
            const distToCurrent = Math.abs(entry.line - targetLine);
            const distToPrev = Math.abs(prevEntry.line - targetLine);

            return distToPrev <= distToCurrent ? prevEntry : entry;
        }

        return entry;
    }

    /**
     * 查找下一个映射条目
     */
    private findNextEntry(line: number): MappingEntry | null {
        for (const entry of this.sortedEntries) {
            if (entry.line > line) {
                return entry;
            }
        }
        return null;
    }
}

// ============== 辅助函数 ==============

/**
 * 从 Markdown 渲染过程中提取映射信息
 * 需要在渲染时调用
 */
export function extractMappingFromRender(
    sourceLines: string[],
    renderedElement: HTMLElement
): MappingEntry[] {
    const entries: MappingEntry[] = [];
    let elementIdCounter = 0;

    // 遍历渲染后的元素，匹配源码行号
    const walkElement = (el: Element, sourceLine: number = 0) => {
        if (el instanceof HTMLElement) {
            const tagName = el.tagName.toLowerCase();
            let type: MappingEntry['type'] = 'other';

            // 根据标签名确定类型
            if (/^h[1-6]$/.test(tagName)) type = 'heading';
            else if (tagName === 'p') type = 'paragraph';
            else if (tagName === 'pre' || tagName === 'code') type = 'code';
            else if (tagName === 'ul' || tagName === 'ol' || tagName === 'li') type = 'list';
            else if (tagName === 'img') type = 'image';
            else if (tagName === 'table') type = 'table';
            else if (tagName === 'blockquote') type = 'blockquote';

            // 为有内容的元素创建映射
            if (el.textContent && el.textContent.trim().length > 0) {
                const id = `mp-el-${elementIdCounter++}`;
                el.id = id;

                entries.push({
                    line: sourceLine,
                    elementId: id,
                    type,
                    offsetTop: el.offsetTop,
                    height: el.offsetHeight
                });
            }
        }

        // 递归处理子元素
        for (const child of el.children) {
            walkElement(child, sourceLine);
        }
    };

    walkElement(renderedElement);

    return entries;
}

/**
 * 从 Obsidian 元数据缓存获取标题行号
 */
export function getHeadingLineNumbers(
    file: TFile,
    metadataCache: any
): Map<string, number> {
    const cache = metadataCache.getCache(file.path);
    const headingLines = new Map<string, number>();

    if (cache?.headings) {
        for (const heading of cache.headings) {
            const text = heading.heading;
            const line = heading.position.start.line;
            headingLines.set(text, line);
        }
    }

    return headingLines;
}

/**
 * 单例模式获取 LineMapper 实例
 */
let lineMapperInstance: LineMapper | null = null;

export function getLineMapper(config?: Partial<LineMapperConfig>): LineMapper {
    if (!lineMapperInstance) {
        lineMapperInstance = new LineMapper(config);
    }
    return lineMapperInstance;
}
