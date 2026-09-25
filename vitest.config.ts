import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export default defineConfig({
    // 镜像 esbuild.config.mjs 的 `.css: "text"` loader：CSS 导入为原始文本，
    // 否则 vitest 默认把 CSS 模块置空，CssMerger/主题在测试中完全不生效
    plugins: [
        {
            name: 'css-as-text-loader',
            enforce: 'pre',
            resolveId(source, importer) {
                // 防递归 + 虚拟 id 不以 .css 结尾（否则仍会被 vitest 的 css 空桩按后缀匹配清空）
                const PREFIX = '/@css-raw/', SUFFIX = '.rawtext';
                if (source.startsWith(PREFIX)) return null;
                if (source.endsWith('.css')) {
                    return PREFIX + resolve(dirname(importer || process.cwd()), source) + SUFFIX;
                }
            },
            load(id) {
                const PREFIX = '/@css-raw/', SUFFIX = '.rawtext';
                if (id.startsWith(PREFIX)) {
                    const file = id.slice(PREFIX.length, id.length - SUFFIX.length);
                    return `export default ${JSON.stringify(readFileSync(file, 'utf-8'))}`;
                }
            },
        },
    ],
    test: {
        // Test environment
        environment: 'node',

        // Test file patterns
        include: ['src/**/*.test.ts', 'src/__tests__/**/*.ts'],

        // Exclude setup/mock files from test detection
        exclude: ['src/__tests__/setup.ts', 'src/__tests__/obsidian-mock.ts'],

        // Coverage configuration
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/**/*.test.ts',
                'src/__tests__/**',
                'src/types/**',
                'src/main.ts',
            ],
        },

        // Global test APIs
        globals: true,

        // Timeout
        testTimeout: 10000,

        // Setup files
        setupFiles: ['./src/__tests__/setup.ts'],
    },

    // Path aliases (match tsconfig.json)
    resolve: {
        alias: {
            '@': '/src',
            '@types': '/types',
            // 支持 tsconfig baseUrl 风格的 'src/...' 导入
            'src': '/src',
            // obsidian 包仅含类型声明（无可解析入口），测试中指向 mock
            'obsidian': '/src/__tests__/obsidian-mock.ts',
        },
    },
});
