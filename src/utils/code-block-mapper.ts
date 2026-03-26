/**
 * 代码块内部行号映射工具
 *
 * 用于超长代码块的精确滚动同步
 */

/**
 * 代码块行号映射条目
 */
export interface CodeBlockLineMapping {
    /** 代码块唯一标识 */
    codeBlockId: string;
    /** 源码起始行号 (1-indexed) */
    sourceStartLine: number;
    /** 源码结束行号 */
    sourceEndLine: number;
    /** 行映射：DOM 行号 -> 源码行号 */
    lineMap: Map<number, number>;
}

/**
 * 代码块行号映射器
 *
 * 功能：
 * 1. 为代码块内的每一行注入 data-source-line 属性
 * 2. 支持精确到行级的滚动同步
 * 3. 处理代码块内的水平滚动
 */
export class CodeBlockMapper {
    private mappings: Map<string, CodeBlockLineMapping> = new Map();
    private codeBlockCounter: number = 0;
    private readonly MAX_MAPPINGS: number = 100;

    /**
     * 为代码块生成唯一 ID
     */
    generateCodeBlockId(): string {
        return `smart-mp-code-block-${this.codeBlockCounter++}`;
    }

    /**
     * 注册代码块映射
     * @param sourceStartLine 代码块在源文件中的起始行号 (1-indexed)
     * @param codeContent 代码内容
     * @returns 代码块 ID
     */
    registerCodeBlock(sourceStartLine: number, codeContent: string): string {
        const codeBlockId = this.generateCodeBlockId();
        const lines = codeContent.split('\n');
        const lineMap = new Map<number, number>();

        // 构建行映射
        lines.forEach((_, index) => {
            lineMap.set(index, sourceStartLine + index);
        });

        const mapping: CodeBlockLineMapping = {
            codeBlockId,
            sourceStartLine,
            sourceEndLine: sourceStartLine + lines.length - 1,
            lineMap
        };

        // 内存保护：超过上限时删除最早的映射
        if (this.mappings.size >= this.MAX_MAPPINGS) {
            const firstKey = this.mappings.keys().next().value;
            if (firstKey) this.mappings.delete(firstKey);
        }

        this.mappings.set(codeBlockId, mapping);
        return codeBlockId;
    }

    /**
     * 获取代码块映射
     */
    getMapping(codeBlockId: string): CodeBlockLineMapping | undefined {
        return this.mappings.get(codeBlockId);
    }

    /**
     * 获取代码块内某行对应的源码行号
     */
    getSourceLine(codeBlockId: string, internalLine: number): number | null {
        const mapping = this.mappings.get(codeBlockId);
        if (!mapping) return null;
        return mapping.lineMap.get(internalLine) ?? null;
    }

    /**
     * 获取代码块内某源码行对应的内部行号
     */
    getInternalLine(codeBlockId: string, sourceLine: number): number | null {
        const mapping = this.mappings.get(codeBlockId);
        if (!mapping) return null;

        if (sourceLine < mapping.sourceStartLine || sourceLine > mapping.sourceEndLine) {
            return null;
        }

        return sourceLine - mapping.sourceStartLine;
    }

    /**
     * 清空所有映射
     */
    clear(): void {
        this.mappings.clear();
        this.codeBlockCounter = 0;
    }

    /**
     * 获取所有映射
     */
    getAllMappings(): CodeBlockLineMapping[] {
        return Array.from(this.mappings.values());
    }
}

/**
 * 为代码块 DOM 元素注入行号属性
 * @param codeBlockElement 代码块 DOM 元素
 * @param sourceStartLine 源码起始行号
 * @param mapper 映射器实例（可选）
 */
export function injectCodeBlockLineNumbers(
    codeBlockElement: HTMLElement,
    sourceStartLine: number,
    mapper?: CodeBlockMapper
): void {
    // 找到代码块中的 pre 元素（包含代码内容）
    const preElements = codeBlockElement.querySelectorAll('pre');

    preElements.forEach((pre) => {
        const codeElement = pre.querySelector('code') || pre;
        const codeContent = codeElement.textContent || '';

        // 为代码块注册映射
        const codeBlockId = mapper?.registerCodeBlock(sourceStartLine, codeContent);

        // 为代码块本身添加 ID 和起始行号
        if (codeBlockId) {
            (pre as HTMLElement).id = codeBlockId;
            (pre as HTMLElement).setAttribute('data-source-line', String(sourceStartLine));
            (pre as HTMLElement).setAttribute('data-code-block', 'true');
        }

        // 按换行符分割，为每行包装一个带行号的元素
        // 使用 DocumentFragment 减少 DOM 操作，并避免 innerHTML 拼接风险
        const html = codeElement.innerHTML;
        const lines = html.split('\n');

        if (lines.length > 1) {
            const fragment = document.createDocumentFragment();
            lines.forEach((line, index) => {
                const lineNum = sourceStartLine + index;
                const lineSpan = document.createElement('span');
                lineSpan.className = 'smart-mp-code-line';
                lineSpan.setAttribute('data-source-line', String(lineNum));
                // 将原有的 HTML 片段放入 span。由于这是 hljs 生成的，
                // 我们假设它是安全的，或者至少比手动拼接 HTML 字符串安全。
                lineSpan.innerHTML = line; 
                
                fragment.appendChild(lineSpan);
                if (index < lines.length - 1) {
                    fragment.appendChild(document.createTextNode('\n'));
                }
            });

            codeElement.innerHTML = '';
            codeElement.appendChild(fragment);
        }
    });
}

/**
 * 处理 DOM 中的所有代码块，注入行号
 * @param container 包含代码块的容器元素
 * @param mapper 映射器实例
 */
export function processCodeBlockLineNumbers(
    container: HTMLElement,
    mapper: CodeBlockMapper
): void {
    // 找到所有代码块（通常是 section 或 pre 元素）
    // 根据实际渲染结构调整选择器

    // 方式 1: 查找带有 data-source-line 的代码块容器
    const codeSections = container.querySelectorAll('[data-source-line]');

    codeSections.forEach((section) => {
        const el = section as HTMLElement;
        const startLine = parseInt(el.getAttribute('data-source-line') || '0');

        // 检查是否是代码块（包含 pre 元素）
        const preElement = el.querySelector('pre');
        if (preElement && startLine > 0) {
            injectCodeBlockLineNumbers(el, startLine, mapper);
        }
    });

    // 方式 2: 直接查找 pre 元素（备用）
    const preElements = container.querySelectorAll('pre:not([data-code-block])');

    preElements.forEach((pre) => {
        // 查找最近的父元素是否有 data-source-line
        let parent = pre.parentElement;
        while (parent && parent !== container) {
            const lineAttr = parent.getAttribute('data-source-line');
            if (lineAttr) {
                const startLine = parseInt(lineAttr);
                if (startLine > 0) {
                    injectCodeBlockLineNumbers(parent, startLine, mapper);
                }
                break;
            }
            parent = parent.parentElement;
        }
    });
}

// 单例实例
let mapperInstance: CodeBlockMapper | null = null;

/**
 * 获取代码块映射器单例
 */
export function getCodeBlockMapper(): CodeBlockMapper {
    if (!mapperInstance) {
        mapperInstance = new CodeBlockMapper();
    }
    return mapperInstance;
}

/**
 * 重置代码块映射器
 */
export function resetCodeBlockMapper(): void {
    if (mapperInstance) {
        mapperInstance.clear();
    } else {
        mapperInstance = new CodeBlockMapper();
    }
}
