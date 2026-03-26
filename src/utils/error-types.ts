import { $t } from "src/lang/i18n";

export enum ErrorCode {
    // Network & API
    NETWORK_ERROR = 'NETWORK_ERROR',
    API_KEY_MISSING = 'API_KEY_MISSING',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    API_TIMEOUT = 'API_TIMEOUT',

    // Authentication
    UNAUTHORIZED = 'UNAUTHORIZED',
    TOKEN_EXPIRED = 'TOKEN_EXPIRED',
    INVALID_LICENSE = 'INVALID_LICENSE',

    // WeChat API
    WECHAT_API_ERROR = 'WECHAT_API_ERROR',
    WECHAT_UPLOAD_FAILED = 'WECHAT_UPLOAD_FAILED',
    WECHAT_PUBLISH_FAILED = 'WECHAT_PUBLISH_FAILED',
    WECHAT_MATERIAL_NOT_FOUND = 'WECHAT_MATERIAL_NOT_FOUND',

    // Render
    RENDER_ERROR = 'RENDER_ERROR',
    MARKDOWN_PARSE_ERROR = 'MARKDOWN_PARSE_ERROR',
    IMAGE_PROCESS_ERROR = 'IMAGE_PROCESS_ERROR',

    // Theme
    THEME_ERROR = 'THEME_ERROR',
    THEME_LOAD_FAILED = 'THEME_LOAD_FAILED',
    THEME_PARSE_ERROR = 'THEME_PARSE_ERROR',

    // Database
    DB_ERROR = 'DB_ERROR',
    DB_READ_ERROR = 'DB_READ_ERROR',
    DB_WRITE_ERROR = 'DB_WRITE_ERROR',

    // File System
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    FILE_READ_ERROR = 'FILE_READ_ERROR',
    FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',

    // AI
    GENERATION_FAILED = 'GENERATION_FAILED',
    LLM_PROVIDER_ERROR = 'LLM_PROVIDER_ERROR',
    PROMPT_TOO_LONG = 'PROMPT_TOO_LONG',

    // General
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    OPERATION_CANCELLED = 'OPERATION_CANCELLED',
}

export class AppError extends Error {
    constructor(
        public message: string,
        public code: ErrorCode,
        public userMessage?: string,
        public technicalDetails?: any,
        public isFatal: boolean = false
    ) {
        super(message);
        this.name = 'AppError';
    }

    /**
     * Create a network error
     */
    static network(message: string, details?: any): AppError {
        return new AppError(message, ErrorCode.NETWORK_ERROR, $t('errors.network-error') || 'Network error occurred', details);
    }

    /**
     * Create an API error
     */
    static api(message: string, code: ErrorCode = ErrorCode.API_KEY_MISSING, details?: any): AppError {
        return new AppError(message, code, $t('errors.api-error') || 'API error occurred', details);
    }

    /**
     * Create a WeChat API error
     */
    static wechat(message: string, code: ErrorCode = ErrorCode.WECHAT_API_ERROR, details?: any): AppError {
        return new AppError(message, code, $t('errors.wechat-error') || 'WeChat API error', details);
    }

    /**
     * Create a render error
     */
    static render(message: string, details?: any): AppError {
        return new AppError(message, ErrorCode.RENDER_ERROR, $t('errors.render-error') || 'Render error', details);
    }

    /**
     * Create a validation error
     */
    static validation(message: string, details?: any): AppError {
        return new AppError(message, ErrorCode.VALIDATION_ERROR, message, details);
    }
}
