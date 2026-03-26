import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Test environment
        environment: 'node',

        // Test file patterns
        include: ['src/**/*.test.ts', 'src/__tests__/**/*.ts'],

        // Exclude setup files from test detection
        exclude: ['src/__tests__/setup.ts'],

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
        },
    },
});
