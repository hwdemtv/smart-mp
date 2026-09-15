/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { inlineCssWithJuice, cleanHtmlForWechat, stripCssVarReferences } from '../../utils/utils';

describe('Rendering Fixes and Improvements', () => {
    describe('inlineCssWithJuice', () => {
        it('should handle orphaned nodes (nodes without parentNode)', async () => {
            const div = document.createElement('div');
            div.innerHTML = '<p style="color: red;">Hello</p><style>p { font-weight: bold; }</style>';
            
            // Initial state: no parent
            expect(div.parentNode).toBeNull();
            
            await inlineCssWithJuice(div);
            
            // Check if styles are inlined
            const p = div.querySelector('p');
            expect(p?.style.color).toBe('red');
            expect(p?.style.fontWeight).toBe('bold');
            // Style tag should be removed by juice (removeStyleTags: true)
            expect(div.querySelector('style')).toBeNull();
        });

        it('should preserve root attributes when inlining orphaned nodes', async () => {
            const div = document.createElement('div');
            div.setAttribute('data-test', 'root-attr');
            div.innerHTML = '<p>Content</p><style>p { color: blue; }</style>';
            
            await inlineCssWithJuice(div);
            
            // Verify content and attributes
            expect(div.getAttribute('data-test')).toBe('root-attr');
            expect(div.querySelector('p')?.style.color).toBe('blue');
        });
    });

    describe('cleanHtmlForWechat Whitelist', () => {
        it('should preserve the "dir" attribute in the whitelist', () => {
            const div = document.createElement('div');
            div.innerHTML = '<p dir="rtl">Right to Left Content</p><span dir="ltr">Left to Right</span>';
            
            const cleaned = cleanHtmlForWechat(div);
            
            const p = cleaned.querySelector('p');
            // 注意：p 的裸文本现会被包进新的无属性 <span>（wrapDirectTextInBlocks），
            // 因此按 [dir] 属性定位原 span，验证 dir 属性在白名单中保留
            const span = cleaned.querySelector('span[dir]');

            expect(p?.getAttribute('dir')).toBe('rtl');
            expect(span?.getAttribute('dir')).toBe('ltr');
        });
    });

    describe('CSS Variable Fallback Extraction (stripCssVarReferences)', () => {
        const applyToStyle = (style: string): string => {
            const root = document.createElement('div');
            const el = document.createElement('p');
            el.setAttribute('style', style);
            root.appendChild(el);
            stripCssVarReferences(root);
            return el.getAttribute('style') || '';
        };

        it('should extract fallback values from var()', () => {
            const cleaned = applyToStyle('background-color: var(--code-bg, #282c34); color: var(--text-color, #ffffff);');
            expect(cleaned).toContain('background-color: #282c34');
            expect(cleaned).toContain('color: #ffffff');
        });

        it('should remove the whole declaration when no fallback is provided', () => {
            const cleaned = applyToStyle('border-color: var(--some-undefined-var); margin: 10px;');
            expect(cleaned).not.toContain('border-color');
            expect(cleaned).toContain('margin: 10px');
        });

        it('should handle multiple var() in one property', () => {
            const cleaned = applyToStyle('margin: var(--m1, 10px) var(--m2, 20px);');
            expect(cleaned).toBe('margin: 10px 20px');
        });

        it('should handle complex fallbacks containing parens (e.g. rgba())', () => {
            const cleaned = applyToStyle('background: var(--grad, rgba(7,193,96,0.05));');
            expect(cleaned).toBe('background: rgba(7,193,96,0.05)');
        });
    });
});
