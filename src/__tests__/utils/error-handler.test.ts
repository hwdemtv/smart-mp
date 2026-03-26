/**
 * Tests for error-handler.ts and error-types.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode, AppError } from '../../utils/error-types';

describe('ErrorCode', () => {
    it('should have network error codes', () => {
        expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
        expect(ErrorCode.API_KEY_MISSING).toBe('API_KEY_MISSING');
        expect(ErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
        expect(ErrorCode.API_TIMEOUT).toBe('API_TIMEOUT');
    });

    it('should have WeChat API error codes', () => {
        expect(ErrorCode.WECHAT_API_ERROR).toBe('WECHAT_API_ERROR');
        expect(ErrorCode.WECHAT_UPLOAD_FAILED).toBe('WECHAT_UPLOAD_FAILED');
        expect(ErrorCode.WECHAT_PUBLISH_FAILED).toBe('WECHAT_PUBLISH_FAILED');
        expect(ErrorCode.WECHAT_MATERIAL_NOT_FOUND).toBe('WECHAT_MATERIAL_NOT_FOUND');
    });

    it('should have render error codes', () => {
        expect(ErrorCode.RENDER_ERROR).toBe('RENDER_ERROR');
        expect(ErrorCode.MARKDOWN_PARSE_ERROR).toBe('MARKDOWN_PARSE_ERROR');
        expect(ErrorCode.IMAGE_PROCESS_ERROR).toBe('IMAGE_PROCESS_ERROR');
    });

    it('should have database error codes', () => {
        expect(ErrorCode.DB_ERROR).toBe('DB_ERROR');
        expect(ErrorCode.DB_READ_ERROR).toBe('DB_READ_ERROR');
        expect(ErrorCode.DB_WRITE_ERROR).toBe('DB_WRITE_ERROR');
    });

    it('should have AI error codes', () => {
        expect(ErrorCode.GENERATION_FAILED).toBe('GENERATION_FAILED');
        expect(ErrorCode.LLM_PROVIDER_ERROR).toBe('LLM_PROVIDER_ERROR');
        expect(ErrorCode.PROMPT_TOO_LONG).toBe('PROMPT_TOO_LONG');
    });
});

describe('AppError', () => {
    it('should create an AppError with all properties', () => {
        const error = new AppError(
            'Test error message',
            ErrorCode.NETWORK_ERROR,
            'User friendly message',
            { detail: 'technical details' },
            true
        );

        expect(error.message).toBe('Test error message');
        expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
        expect(error.userMessage).toBe('User friendly message');
        expect(error.technicalDetails).toEqual({ detail: 'technical details' });
        expect(error.isFatal).toBe(true);
        expect(error.name).toBe('AppError');
    });

    it('should create an AppError with default values', () => {
        const error = new AppError('Simple error', ErrorCode.UNKNOWN_ERROR);

        expect(error.message).toBe('Simple error');
        expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
        expect(error.userMessage).toBeUndefined();
        expect(error.technicalDetails).toBeUndefined();
        expect(error.isFatal).toBe(false);
    });

    it('should be an instance of Error', () => {
        const error = new AppError('Test', ErrorCode.UNKNOWN_ERROR);
        expect(error).toBeInstanceOf(Error);
    });

    describe('Static factory methods', () => {
        it('should create network error', () => {
            const error = AppError.network('Network failed', { url: 'https://example.com' });
            expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
            expect(error.message).toBe('Network failed');
        });

        it('should create API error', () => {
            const error = AppError.api('API failed');
            expect(error.code).toBe(ErrorCode.API_KEY_MISSING);
        });

        it('should create WeChat error', () => {
            const error = AppError.wechat('WeChat API failed');
            expect(error.code).toBe(ErrorCode.WECHAT_API_ERROR);
        });

        it('should create render error', () => {
            const error = AppError.render('Render failed');
            expect(error.code).toBe(ErrorCode.RENDER_ERROR);
        });

        it('should create validation error', () => {
            const error = AppError.validation('Invalid input');
            expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
            expect(error.userMessage).toBe('Invalid input');
        });
    });
});
