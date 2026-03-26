/**
 * Plugin initialization utilities
 */

import { addIcon } from 'obsidian';
import { SMART_MP_ICON } from '../icons';

/**
 * Initialize plugin icons
 */
export function initializeIcons(): void {
    addIcon('smart-mp', SMART_MP_ICON);
}

/**
 * Plugin lifecycle state
 */
export enum PluginState {
    UNINITIALIZED = 'uninitialized',
    INITIALIZING = 'initializing',
    READY = 'ready',
    ERROR = 'error',
    UNLOADING = 'unloading',
}

/**
 * Plugin state manager
 */
export class PluginStateManager {
    private static instance: PluginStateManager;
    private state: PluginState = PluginState.UNINITIALIZED;
    private listeners: Set<(state: PluginState) => void> = new Set();

    private constructor() {}

    static getInstance(): PluginStateManager {
        if (!PluginStateManager.instance) {
            PluginStateManager.instance = new PluginStateManager();
        }
        return PluginStateManager.instance;
    }

    getState(): PluginState {
        return this.state;
    }

    setState(newState: PluginState): void {
        const oldState = this.state;
        this.state = newState;
        if (oldState !== newState) {
            this.listeners.forEach(listener => listener(newState));
        }
    }

    subscribe(listener: (state: PluginState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    isReady(): boolean {
        return this.state === PluginState.READY;
    }
}

/**
 * Initialize database connections
 */
export async function initializeDatabases(): Promise<void> {
    // Import dynamically to avoid circular dependencies
    const { initSmartMPDB } = await import('../settings/smart-mp-setting');
    const { initAssetsDB } = await import('../assets/assets-manager');
    const { initDraftDB } = await import('../assets/draft-manager');

    await Promise.all([
        initSmartMPDB(),
        initAssetsDB(),
        initDraftDB(),
    ]);
}
