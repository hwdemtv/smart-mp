
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
}
