
export enum ErrorCode {
    NETWORK_ERROR = 'NETWORK_ERROR',
    API_KEY_MISSING = 'API_KEY_MISSING',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    UNAUTHORIZED = 'UNAUTHORIZED',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
    GENERATION_FAILED = 'GENERATION_FAILED'
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
}
