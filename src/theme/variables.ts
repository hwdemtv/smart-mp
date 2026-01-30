export const THEME_VARIABLES = {
    // 颜色系统
    colors: {
        primary: '#1890ff',
        success: '#52c41a',
        warning: '#faad14',
        error: '#f5222d',
        text: {
            primary: 'rgba(0, 0, 0, 0.85)',
            secondary: 'rgba(0, 0, 0, 0.65)',
            tertiary: 'rgba(0, 0, 0, 0.45)',
        },
        background: {
            default: '#ffffff',
            paper: '#fafafa',
            disabled: '#f5f5f5',
        },
        border: {
            light: '#e8e8e8',
            medium: '#d9d9d9',
            dark: '#bfbfbf',
        }
    },

    // 排版
    typography: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: {
            xs: '12px',
            sm: '14px',
            md: '16px',
            lg: '18px',
            xl: '20px',
            h1: '32px',
            h2: '24px',
            h3: '20px',
            h4: '16px',
        },
        lineHeight: {
            tight: 1.2,
            normal: 1.6,
            relaxed: 1.8,
        },
        fontWeight: {
            light: 300,
            normal: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
        }
    },

    // 间距
    spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
    },

    // 圆角
    radius: {
        xs: '2px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        round: '50%',
    },

    // 阴影
    shadow: {
        none: 'none',
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    },

    // 微信特定
    wechat: {
        maxWidth: '677px', // 微信文章最大宽度
        padding: '20px',
        background: '#fafafa',
    }
};

/**
 * 将变量对象转换为 CSS 变量字符串
 */
export function generateCSSVariables(variables: any): string {
    let css = ':root {\n';

    const walk = (obj: any, prefix = '') => {
        Object.entries(obj).forEach(([key, value]) => {
            const currentKey = prefix ? `${prefix}-${key}` : key;
            if (typeof value === 'object' && value !== null) {
                walk(value, currentKey);
            } else {
                // Convert camelCase to kebab-case
                const kebabKey = currentKey.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
                css += `    --${kebabKey}: ${value};\n`;
            }
        });
    };

    walk(variables);
    css += '}\n';
    return css;
}
