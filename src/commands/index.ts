/**
 * Commands module index
 * Exports all command definitions and utilities
 */

export * from './types';
export * from './ai-commands';
export * from './wechat-commands';

import SmartMPPlugin from 'src/main';
import { CommandRegistry } from './types';
import { AI_COMMANDS } from './ai-commands';
import { WECHAT_COMMANDS } from './wechat-commands';

/**
 * Register all command definitions with the registry
 */
export function registerAllCommands(plugin: SmartMPPlugin): CommandRegistry {
    const registry = CommandRegistry.getInstance(plugin);
    registry.registerAll([...AI_COMMANDS, ...WECHAT_COMMANDS]);
    return registry;
}

/**
 * Create and return all command instances for Obsidian registration
 */
export function createAllCommands(plugin: SmartMPPlugin) {
    const registry = registerAllCommands(plugin);
    return registry.createAllCommands();
}
