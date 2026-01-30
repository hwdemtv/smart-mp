import { THEME_VARIABLES, generateCSSVariables } from './variables';

export const THEME_PRESETS = {
    default: {
        name: '默认主题',
        description: 'WeWrite 默认样式',
        variables: THEME_VARIABLES
    },

    wechat: {
        name: '微信官方',
        description: '仿微信官方文章风格',
        variables: {
            ...THEME_VARIABLES,
            colors: {
                ...THEME_VARIABLES.colors,
                primary: '#07c160',
                text: {
                    ...THEME_VARIABLES.colors.text,
                    primary: '#333333',
                    secondary: '#888888'
                },
                background: {
                    ...THEME_VARIABLES.colors.background,
                    paper: '#ffffff'
                }
            },
            typography: {
                ...THEME_VARIABLES.typography,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
                fontSize: {
                    ...THEME_VARIABLES.typography.fontSize,
                    md: '17px',
                    h1: '22px',
                    h2: '18px'
                }
            }
        }
    },

    tech: {
        name: '科技风',
        description: '蓝色调科技感风格',
        variables: {
            ...THEME_VARIABLES,
            colors: {
                ...THEME_VARIABLES.colors,
                primary: '#1890ff',
                text: {
                    ...THEME_VARIABLES.colors.text,
                    primary: '#1f1f1f'
                },
                background: {
                    ...THEME_VARIABLES.colors.background,
                    paper: '#f0f2f5'
                }
            },
            spacing: {
                ...THEME_VARIABLES.spacing,
                md: '20px'
            }
        }
    },

    dark: {
        name: '夜间模式',
        description: '适合暗光环境下阅读',
        variables: {
            ...THEME_VARIABLES,
            colors: {
                ...THEME_VARIABLES.colors,
                primary: '#40a9ff',
                text: {
                    primary: '#e6e6e6',
                    secondary: '#a6a6a6',
                    tertiary: '#666666'
                },
                background: {
                    default: '#141414',
                    paper: '#1f1f1f',
                    disabled: '#262626'
                },
                border: {
                    light: '#434343',
                    medium: '#303030',
                    dark: '#1f1f1f'
                }
            }
        }
    }
};

export type PresetName = keyof typeof THEME_PRESETS;

export function getPresetCSS(presetName: PresetName = 'default'): string {
    const preset = THEME_PRESETS[presetName] || THEME_PRESETS['default'];
    return `/* Preset: ${preset.name} */\n` + generateCSSVariables(preset.variables as any);
}
