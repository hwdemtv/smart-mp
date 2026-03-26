import {
    EditorView,
    Decoration,
    DecorationSet,
    ViewPlugin,
    ViewUpdate
} from "@codemirror/view";
import {
    RangeSetBuilder,
    StateField,
    StateEffect,
    Transaction
} from "@codemirror/state";
import {
    HighlightStyleConfig,
    HighlightStyleManager,
    DEFAULT_HIGHLIGHT_STYLE,
    HIGHLIGHT_STYLE_PRESETS
} from "../utils/scroll-sync-config";

// 定义同步行号的 Effect
export const setSyncLineEffect = StateEffect.define<number | null>();

// 存储当前同步行号的状态字段
export const syncLineField = StateField.define<number | null>({
    create() { return null; },
    update(value: number | null, tr: Transaction) {
        for (let e of tr.effects) {
            if (e.is(setSyncLineEffect)) return e.value;
        }
        return value;
    },
    // 装饰由 scrollSyncPlugin 处理，这里只需要存储状态
    provide: (f: StateField<number | null>) => EditorView.decorations.from(f, () => Decoration.none)
});

// 视觉属性：高亮背景
const syncLineDecoration = Decoration.line({
    attributes: { class: "smart-mp-sync-line-highlight" }
});

// ViewPlugin 用于高效渲染高亮
export const scrollSyncPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged ||
            update.transactions.some(tr => tr.effects.some(e => e.is(setSyncLineEffect)))) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view: EditorView): DecorationSet {
        const lineNum = view.state.field(syncLineField);
        if (lineNum === null) return Decoration.none;

        const builder = new RangeSetBuilder<Decoration>();
        try {
            // 确保行号在有效范围内
            const totalLines = view.state.doc.lines;
            const safeLine = Math.max(1, Math.min(lineNum, totalLines));
            const line = view.state.doc.line(safeLine);
            builder.add(line.from, line.from, syncLineDecoration);
        } catch (e) {
            // 忽略边界错误
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

/**
 * 创建自定义高亮样式的主题扩展
 * @param styleConfig 高亮样式配置
 */
export function createScrollSyncStyles(styleConfig?: HighlightStyleConfig) {
    const style = styleConfig || DEFAULT_HIGHLIGHT_STYLE;
    return EditorView.baseTheme({
        ".smart-mp-sync-line-highlight": {
            backgroundColor: style.backgroundColor,
            borderLeft: `${style.borderWidth} ${style.borderStyle} ${style.borderColor}`,
            transition: style.transition
        }
    });
}

/**
 * 默认样式注入（螺旋金配色风格）
 */
export const scrollSyncStyles = createScrollSyncStyles(DEFAULT_HIGHLIGHT_STYLE);

// ============== 动态样式注入 ==============

/**
 * CSS 样式元素 ID
 */
const STYLE_ELEMENT_ID = 'smart-mp-scroll-sync-dynamic-styles';

/**
 * 高亮样式管理器实例（单例）
 */
let styleManagerInstance: HighlightStyleManager | null = null;

/**
 * 获取高亮样式管理器实例
 */
export function getHighlightStyleManager(): HighlightStyleManager {
    if (!styleManagerInstance) {
        styleManagerInstance = new HighlightStyleManager();
    }
    return styleManagerInstance;
}

/**
 * 注入或更新动态 CSS 样式
 */
function injectDynamicCSS(css: string): void {
    let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement;

    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ELEMENT_ID;
        document.head.appendChild(styleEl);
    }

    styleEl.textContent = css;
}

/**
 * 移除动态 CSS 样式
 */
export function removeDynamicCSS(): void {
    const styleEl = document.getElementById(STYLE_ELEMENT_ID);
    if (styleEl) {
        styleEl.remove();
    }
}

/**
 * 更新高亮样式（动态注入 CSS）
 * @param preset 预设名称
 * @param customStyle 自定义样式（可选）
 */
export function updateHighlightStyle(
    preset: 'gold' | 'blue' | 'green' | 'purple' | 'minimal' | 'custom',
    customStyle?: Partial<HighlightStyleConfig>
): HighlightStyleConfig {
    const manager = getHighlightStyleManager();

    if (preset === 'custom' && customStyle) {
        manager.customize(customStyle);
    } else if (preset !== 'custom' && HIGHLIGHT_STYLE_PRESETS[preset]) {
        manager.applyPreset(preset);
    } else {
        manager.applyPreset('gold');
    }

    const style = manager.getCurrentStyle();

    // 生成并注入 CSS
    const css = `
        .smart-mp-sync-line-highlight {
            background-color: ${style.backgroundColor} !important;
            border-left: ${style.borderWidth} ${style.borderStyle} ${style.borderColor} !important;
            transition: ${style.transition} !important;
        }
    `.trim();

    injectDynamicCSS(css);

    return style;
}

/**
 * 初始化滚动同步样式
 * 根据设置自动应用正确的样式
 */
export function initScrollSyncStyle(preset?: 'gold' | 'blue' | 'green' | 'purple' | 'minimal' | 'custom'): void {
    const stylePreset = preset || 'gold';
    updateHighlightStyle(stylePreset);
}
