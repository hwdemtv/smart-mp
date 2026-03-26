
import { Notice } from "obsidian";
import { Logger } from "./logger";
import { AppError, ErrorCode } from "./error-types";
import { $t } from "src/lang/i18n";

export class ErrorHandler {
    private static instance: ErrorHandler;

    private constructor() { }

    public static getInstance(): ErrorHandler {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }

    public handleError(error: Error | AppError | unknown) {
        let appError: AppError;

        if (error instanceof AppError) {
            appError = error;
        } else if (error instanceof Error) {
            appError = new AppError(
                error.message,
                ErrorCode.UNKNOWN_ERROR,
                $t("errors.unexpected-error") || 'An unexpected error occurred.',
                { stack: error.stack }
            );
        } else {
            appError = new AppError(
                'Unknown error',
                ErrorCode.UNKNOWN_ERROR,
                $t("errors.unknown-error") || 'An unknown error occurred.',
                { rawError: error }
            );
        }

        // Log error with details
        Logger.error(`[${appError.code}] ${appError.message}`, appError.technicalDetails);

        // Show user-facing message if available
        if (appError.userMessage) {
            new Notice(`SmartMP: ${appError.userMessage}`);
        }
    }

    /**
     * Wrap an async function with error handling
     */
    public wrapAsync<T>(fn: () => Promise<T>, fallback?: T): Promise<T | undefined> {
        return fn().catch((error) => {
            this.handleError(error);
            return fallback;
        });
    }

    /**
     * Create a handled async function
     */
    public static createHandled<TArgs extends unknown[], TReturn>(
        fn: (...args: TArgs) => Promise<TReturn>,
        fallback?: TReturn
    ): (...args: TArgs) => Promise<TReturn | undefined> {
        return async (...args: TArgs) => {
            try {
                return await fn(...args);
            } catch (error) {
                ErrorHandler.getInstance().handleError(error);
                return fallback;
            }
        };
    }
}

/**
 * Method decorator for automatic error handling
 * Usage: @handleError
 */
export function handleError(
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    if (isAsync) {
        descriptor.value = async function (this: unknown, ...args: unknown[]) {
            try {
                return await originalMethod.apply(this, args);
            } catch (error) {
                ErrorHandler.getInstance().handleError(error);
                return undefined;
            }
        };
    } else {
        descriptor.value = function (this: unknown, ...args: unknown[]) {
            try {
                return originalMethod.apply(this, args);
            } catch (error) {
                ErrorHandler.getInstance().handleError(error);
                return undefined;
            }
        };
    }

    return descriptor;
}

/**
 * Method decorator for error handling with custom fallback
 * Usage: @handleErrorWith(fallbackValue)
 */
export function handleErrorWith<T>(fallback: T) {
    return function (
        target: unknown,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ): PropertyDescriptor {
        const originalMethod = descriptor.value;
        const isAsync = originalMethod.constructor.name === 'AsyncFunction';

        if (isAsync) {
            descriptor.value = async function (this: unknown, ...args: unknown[]) {
                try {
                    return await originalMethod.apply(this, args);
                } catch (error) {
                    ErrorHandler.getInstance().handleError(error);
                    return fallback;
                }
            };
        } else {
            descriptor.value = function (this: unknown, ...args: unknown[]) {
                try {
                    return originalMethod.apply(this, args);
                } catch (error) {
                    ErrorHandler.getInstance().handleError(error);
                    return fallback;
                }
            };
        }

        return descriptor;
    };
}

/**
 * Higher-order function to wrap async functions with error handling
 * Usage: const safeFn = withErrorHandling(asyncFn, fallback)
 */
export function withErrorHandling<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    fallback?: TReturn
): (...args: TArgs) => Promise<TReturn | undefined> {
    return async (...args: TArgs) => {
        try {
            return await fn(...args);
        } catch (error) {
            ErrorHandler.getInstance().handleError(error);
            return fallback;
        }
    };
}
