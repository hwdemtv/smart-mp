/**
 * Vitest setup file
 * Run before each test file
 */
import { beforeAll, afterAll, vi } from 'vitest';

// Mock Obsidian's Notice class
class MockNotice {
    constructor(public message: string, public timeout?: number) {}
}
(global as any).Notice = MockNotice;

// Mock console methods for cleaner test output
const originalConsole = { ...console };
beforeAll(() => {
    console.warn = vi.fn();
    console.error = vi.fn();
});

afterAll(() => {
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
});

// Mock i18next
vi.mock('src/lang/i18n', () => ({
    $t: (key: string) => key,
    default: {
        t: (key: string) => key,
    },
}));
