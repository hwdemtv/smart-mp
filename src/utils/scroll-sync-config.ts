/**
 * 滚动同步配置模块
 *
 * 提供三种改进功能的配置支持：
 * 1. 同步精度设置（像素阈值）
 * 2. 自定义高亮颜色/样式设置
 * 3. 代码块内部行号映射
 */

// ============== 同步精度设置 ==============

/**
 * 同步精度配置
 */
export interface SyncPrecisionConfig {
    /** 触发同步的最小滚动距离 (像素)，默认 5 */
    scrollThreshold: number;
    /** 平滑滚动的步进系数 (0-1)，默认 0.35 */
    smoothFactor: number;
    /** 是否启用平滑滚动，默认 true */
    enableSmoothScroll: boolean;
    /** 同步锁超时时间 (ms)，默认 80 */
    lockTimeout: number;
}

/**
 * 同步精度预设
 */
export type SyncPrecisionPreset = 'precise' | 'balanced' | 'performance';

/**
 * 同步精度预设配置
 */
export const SYNC_PRECISION_PRESETS: Record<SyncPrecisionPreset, SyncPrecisionConfig> = {
    precise: {
        scrollThreshold: 2,
        smoothFactor: 0.5,
        enableSmoothScroll: true,
        lockTimeout: 50
    },
    balanced: {
        scrollThreshold: 5,
        smoothFactor: 0.35,
        enableSmoothScroll: true,
        lockTimeout: 80
    },
    performance: {
        scrollThreshold: 15,
        smoothFactor: 0.25,
        enableSmoothScroll: false,
        lockTimeout: 100
    }
};

/**
 * 默认同步精度配置
 */
export const DEFAULT_SYNC_PRECISION: SyncPrecisionConfig = SYNC_PRECISION_PRESETS.balanced;


// ============== 高亮样式设置 ==============

/**
 * 高亮样式配置
 */
export interface HighlightStyleConfig {
    /** 背景颜色 */
    backgroundColor: string;
    /** 边框颜色 */
    borderColor: string;
    /** 边框宽度 */
    borderWidth: string;
    /** 边框样式 */
    borderStyle: string;
    /** 过渡动画 */
    transition: string;
}

/**
 * 高亮样式预设名称
 */
export type HighlightStylePreset = 'gold' | 'blue' | 'green' | 'purple' | 'minimal' | 'custom';

/**
 * 高亮样式预设配置
 */
export const HIGHLIGHT_STYLE_PRESETS: Record<Exclude<HighlightStylePreset, 'custom'>, HighlightStyleConfig> = {
    gold: {
        backgroundColor: 'rgba(212, 175, 55, 0.15)',
        borderColor: '#b08d55',
        borderWidth: '2px',
        borderStyle: 'solid',
        transition: 'background-color 0.2s ease'
    },
    blue: {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderColor: '#3b82f6',
        borderWidth: '2px',
        borderStyle: 'solid',
        transition: 'background-color 0.2s ease'
    },
    green: {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        borderColor: '#22c55e',
        borderWidth: '2px',
        borderStyle: 'solid',
        transition: 'background-color 0.2s ease'
    },
    purple: {
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        borderColor: '#8b5cf6',
        borderWidth: '2px',
        borderStyle: 'solid',
        transition: 'background-color 0.2s ease'
    },
    minimal: {
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderColor: 'transparent',
        borderWidth: '0px',
        borderStyle: 'none',
        transition: 'none'
    }
};

/**
 * 默认高亮样式配置
 */
export const DEFAULT_HIGHLIGHT_STYLE: HighlightStyleConfig = HIGHLIGHT_STYLE_PRESETS.gold;


// ============== 工具类 ==============

/**
 * 同步精度控制器
 */
export class SyncPrecisionController {
    private config: SyncPrecisionConfig;
    private lastScrollTop: number = 0;

    constructor(config: SyncPrecisionConfig = DEFAULT_SYNC_PRECISION) {
        this.config = { ...config };
    }

    /**
     * 从预设创建控制器
     */
    static fromPreset(preset: SyncPrecisionPreset): SyncPrecisionController {
        return new SyncPrecisionController(SYNC_PRECISION_PRESETS[preset]);
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
     * 获取上一次滚动位置
     */
    getLastScrollTop(): number {
        return this.lastScrollTop;
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
}

/**
 * 高亮样式管理器
 */
export class HighlightStyleManager {
    private currentStyle: HighlightStyleConfig;
    private preset: HighlightStylePreset;

    constructor(
        preset: HighlightStylePreset = 'gold',
        customStyle?: HighlightStyleConfig
    ) {
        this.preset = preset;
        this.currentStyle = this.resolveStyle(preset, customStyle);
    }

    private resolveStyle(
        preset: HighlightStylePreset,
        customStyle?: HighlightStyleConfig
    ): HighlightStyleConfig {
        if (preset === 'custom' && customStyle) {
            return { ...customStyle };
        }
        if (preset !== 'custom' && HIGHLIGHT_STYLE_PRESETS[preset]) {
            return { ...HIGHLIGHT_STYLE_PRESETS[preset] };
        }
        return { ...DEFAULT_HIGHLIGHT_STYLE };
    }

    /**
     * 应用预设主题
     */
    applyPreset(preset: HighlightStylePreset, customStyle?: HighlightStyleConfig): void {
        this.preset = preset;
        this.currentStyle = this.resolveStyle(preset, customStyle);
    }

    /**
     * 获取当前样式
     */
    getCurrentStyle(): HighlightStyleConfig {
        return { ...this.currentStyle };
    }

    /**
     * 获取当前预设名称
     */
    getPreset(): HighlightStylePreset {
        return this.preset;
    }

    /**
     * 自定义样式
     */
    customize(updates: Partial<HighlightStyleConfig>): HighlightStyleConfig {
        this.preset = 'custom';
        this.currentStyle = { ...this.currentStyle, ...updates };
        return this.getCurrentStyle();
    }

    /**
     * 生成 CSS 样式字符串（用于 CodeMirror EditorView.baseTheme）
     */
    generateThemeSpec(): Record<string, Record<string, string>> {
        const style = this.currentStyle;
        return {
            '.smart-mp-sync-line-highlight': {
                backgroundColor: `${style.backgroundColor} !important`,
                borderLeft: `${style.borderWidth} ${style.borderStyle} ${style.borderColor} !important`,
                transition: style.transition !== 'none' ? `${style.transition} !important` : 'none'
            }
        };
    }

    /**
     * 生成 CSS 样式字符串（用于动态注入）
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
}
