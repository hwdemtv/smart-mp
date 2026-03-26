/**
 * Command types for SmartMP plugin
 */

import { Command, Editor, MarkdownView } from 'obsidian';
import SmartMPPlugin from 'src/main';

/**
 * Command definition with optional category for organization
 */
export interface SmartMPCommand extends Command {
    id: string;
    name: string;
    category?: 'ai' | 'wechat' | 'editor' | 'theme' | 'general';
    description?: string;
}

/**
 * Command definition with factory function for creating commands
 */
export interface CommandDefinition {
    id: string;
    name: string;
    category?: 'ai' | 'wechat' | 'editor' | 'theme' | 'general';
    description?: string;
    /**
     * Factory function to create the command with plugin context
     */
    create: (plugin: SmartMPPlugin) => SmartMPCommand;
}

/**
 * Command registry for managing plugin commands
 */
export class CommandRegistry {
    private static instance: CommandRegistry;
    private commands: Map<string, CommandDefinition> = new Map();
    private plugin: SmartMPPlugin | null = null;

    private constructor() {}

    static getInstance(plugin?: SmartMPPlugin): CommandRegistry {
        if (!CommandRegistry.instance) {
            CommandRegistry.instance = new CommandRegistry();
        }
        if (plugin) {
            CommandRegistry.instance.plugin = plugin;
        }
        return CommandRegistry.instance;
    }

    /**
     * Register a command definition
     */
    register(definition: CommandDefinition): void {
        if (this.commands.has(definition.id)) {
            console.warn(`[SmartMP] Command ${definition.id} already registered, overwriting.`);
        }
        this.commands.set(definition.id, definition);
    }

    /**
     * Register multiple command definitions
     */
    registerAll(definitions: CommandDefinition[]): void {
        definitions.forEach(def => this.register(def));
    }

    /**
     * Get a command definition by ID
     */
    get(id: string): CommandDefinition | undefined {
        return this.commands.get(id);
    }

    /**
     * Get all command definitions
     */
    getAll(): CommandDefinition[] {
        return Array.from(this.commands.values());
    }

    /**
     * Get command definitions by category
     */
    getByCategory(category: CommandDefinition['category']): CommandDefinition[] {
        return this.getAll().filter(def => def.category === category);
    }

    /**
     * Create a command instance for registration with Obsidian
     */
    createCommand(id: string): SmartMPCommand | null {
        const definition = this.commands.get(id);
        if (!definition || !this.plugin) {
            return null;
        }
        return definition.create(this.plugin);
    }

    /**
     * Create all commands for registration with Obsidian
     */
    createAllCommands(): SmartMPCommand[] {
        if (!this.plugin) {
            console.warn('[SmartMP] Plugin not set in CommandRegistry');
            return [];
        }
        return this.getAll()
            .map(def => def.create(this.plugin!))
            .filter((cmd): cmd is SmartMPCommand => cmd !== null);
    }

    /**
     * Clear all registered commands
     */
    clear(): void {
        this.commands.clear();
    }
}
