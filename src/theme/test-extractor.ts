
import { ThemeExtractor } from './theme-extractor';
import * as cheerio from 'cheerio';
import Logger from '../utils/logger';

// Mock ThemeExtractor to avoid networking
class MockThemeExtractor extends ThemeExtractor {
    async extractFromHtml(html: string): Promise<string> {
        const $ = cheerio.load(html);
        const primaryColor = (this as any).extractPrimaryColor($);
        const backgroundColor = (this as any).extractBackgroundColor($);
        const h1Style = (this as any).extractElementStyle($, '#js_content h1, #activity-name');
        const h2Style = (this as any).extractElementStyle($, '#js_content h2');
        const pStyle = (this as any).extractElementStyle($, '#js_content p');
        const blockquoteStyle = (this as any).extractElementStyle($, '#js_content blockquote');

        return (this as any).generateCss({
            primaryColor,
            backgroundColor,
            h1Style,
            h2Style,
            pStyle,
            blockquoteStyle
        });
    }
}

async function test() {
    const html = `
    <html>
    <body>
        <div id="js_content">
            <h1>Article Title</h1>
            <blockquote style="border-left: 8px solid rgb(0, 187, 236); background-color: rgb(248, 249, 250); padding: 10px; border-radius: 4px;">
                This is a quote with green border.
            </blockquote>
            <p>Normal text</p>
        </div>
    </body>
    </html>
    `;

    const extractor = new MockThemeExtractor();
    const css = await extractor.extractFromHtml(html);
    Logger.debug('Test', '--- Generated CSS ---');
    Logger.debug('Test', css);
    Logger.debug('Test', '---------------------');

    if (css.includes('border-left: 8px solid rgb(0, 187, 236)')) {
        Logger.debug('Test', '✅ PASS: border-left shorthand captured');
    } else {
        Logger.debug('Test', '❌ FAIL: border-left shorthand NOT captured');
    }

    if (css.includes('padding: 10px')) {
        Logger.debug('Test', '✅ PASS: padding captured');
    } else {
        Logger.debug('Test', '❌ FAIL: padding NOT captured');
    }
}

test();
