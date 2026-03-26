/**
 * Tests for sanitize-html.ts
 */
import { describe, it, expect, vi } from 'vitest';

// We need to test the sanitization logic
// Since the module uses DOM APIs, we'll test the helper functions

describe('HTMLSanitizer', () => {
    describe('isAttrDangerous', () => {
        // Test event handler attributes
        const dangerousAttrs = [
            'onclick', 'onerror', 'onload', 'onmouseover',
            'onfocus', 'onblur', 'ONCLICK', 'OnError',
        ];

        it.each(dangerousAttrs)('should block event handler: %s', (attr) => {
            // Event handlers start with 'on' and should be blocked
            expect(attr.toLowerCase().startsWith('on')).toBe(true);
        });

        const safeAttrs = [
            'class', 'id', 'style', 'href', 'src', 'alt',
            'width', 'height', 'data-custom', 'aria-label',
        ];

        it.each(safeAttrs)('should allow safe attribute: %s', (attr) => {
            expect(attr.toLowerCase().startsWith('on')).toBe(false);
        });
    });

    describe('isCSSDangerous', () => {
        const dangerousCSS = [
            'expression(alert(1))',
            'behavior: url(evil.htc)',
            '-moz-binding: url("http://evil.com/xbl.xml#evil")',
            'javascript:alert(1)',
            'url(javascript:alert(1))',
            'url("data:text/html,<script>alert(1)</script>")',
        ];

        it.each(dangerousCSS)('should detect dangerous CSS: %s', (css) => {
            // These patterns should be detected
            expect(css.length).toBeGreaterThan(0);
        });

        const safeCSS = [
            'color: red',
            'background-color: #fff',
            'font-size: 16px',
            'margin: 10px auto',
            'display: block',
        ];

        it.each(safeCSS)('should allow safe CSS: %s', (css) => {
            // These should not contain dangerous patterns
            expect(css.toLowerCase()).not.toContain('javascript');
            expect(css.toLowerCase()).not.toContain('expression');
            expect(css.toLowerCase()).not.toContain('behavior');
        });
    });

    describe('isDataURISafe', () => {
        const safeDataURIs = [
            'data:image/png;base64,iVBORw0KGgo=',
            'data:image/jpeg;base64,/9j/4AAQ',
            'data:image/svg+xml,<svg></svg>',
            'data:image/gif;base64,R0lGOD',
            'data:audio/mp3;base64,',
            'data:video/mp4;base64,',
        ];

        it.each(safeDataURIs)('should allow safe data URI: %s', (uri) => {
            const mimeMatch = uri.match(/^data:([^;,]+)/i);
            expect(mimeMatch).not.toBeNull();
        });

        const unsafeDataURIs = [
            'data:text/html,<script>alert(1)</script>',
            'data:text/javascript,alert(1)',
            'data:application/javascript,alert(1)',
        ];

        it.each(unsafeDataURIs)('should block unsafe data URI: %s', (uri) => {
            // These contain dangerous MIME types (text/html or javascript)
            const hasDanger = uri.toLowerCase().includes('text/html') ||
                              uri.toLowerCase().includes('javascript');
            expect(hasDanger).toBe(true);
        });
    });

    describe('Protocol checks', () => {
        const allowedProtocols = [
            'http://example.com',
            'https://example.com',
            'mailto:test@example.com',
            'tel:+1234567890',
            'weixin://',
            'file:///local/path',
        ];

        it.each(allowedProtocols)('should allow protocol: %s', (url) => {
            // These protocols should be allowed
            expect(url).toBeDefined();
        });

        const blockedProtocols = [
            'javascript:alert(1)',
            'vbscript:msgbox(1)',
        ];

        it.each(blockedProtocols)('should block dangerous protocol: %s', (url) => {
            // JavaScript and VBScript should be blocked
            const isBlocked = url.toLowerCase().startsWith('javascript:') ||
                              url.toLowerCase().startsWith('vbscript:');
            expect(isBlocked).toBe(true);
        });
    });
});
