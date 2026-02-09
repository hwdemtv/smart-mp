const fs = require('fs');
const cheerio = require('cheerio');

// 模拟 ThemeExtractor 的完整逻辑
const html = fs.readFileSync('temp_article.html', 'utf-8');
const $ = cheerio.load(html);

// === extractElementStyle ===
function extractElementStyle($, selector) {
    const el = $(selector).first();
    if (el.length === 0) return {};

    const styleStr = el.attr('style') || '';
    const styles = {};

    styleStr.split(';').forEach(pair => {
        const index = pair.indexOf(':');
        if (index > -1) {
            const key = pair.substring(0, index).trim().toLowerCase();
            const value = pair.substring(index + 1).trim();
            if (key && value) styles[key] = value;
        }
    });

    return styles;
}

// === extractFakeQuoteStyle ===
function extractFakeQuoteStyle($) {
    let bestStyle = {};

    $('#js_content [style*="border-left"]').each((i, el) => {
        if ($(el).text().trim().length === 0) return;

        const styleStr = $(el).attr('style') || '';
        const styles = {};

        styleStr.split(';').forEach(pair => {
            const index = pair.indexOf(':');
            if (index > -1) {
                const key = pair.substring(0, index).trim().toLowerCase();
                const value = pair.substring(index + 1).trim();
                if (key && value) styles[key] = value;
            }
        });

        if (styles['border-left'] || styles['border-left-width']) {
            bestStyle = styles;
            console.log('✅ Found fake quote element:', el.tagName);
            console.log('   Style keys:', Object.keys(styles));
            return false; // break
        }
    });

    return bestStyle;
}

// === Main Test ===
console.log('=== Testing Theme Extraction ===\n');

let blockquoteStyle = extractElementStyle($, '#js_content blockquote');
console.log('1. Standard blockquote style:', Object.keys(blockquoteStyle).length, 'properties');

if (Object.keys(blockquoteStyle).length === 0) {
    console.log('   → Trying fake quote extraction...');
    blockquoteStyle = extractFakeQuoteStyle($);
    console.log('   → Fake quote style:', Object.keys(blockquoteStyle).length, 'properties');
}

console.log('\n2. Blockquote style details:');
if (blockquoteStyle['border-left']) {
    console.log('   ✅ border-left:', blockquoteStyle['border-left']);
} else {
    console.log('   ❌ No border-left found');
}

if (blockquoteStyle['background']) {
    console.log('   ✅ background:', blockquoteStyle['background'].substring(0, 50) + '...');
} else {
    console.log('   ⚠️  No background gradient');
}

// Generate CSS snippet
if (Object.keys(blockquoteStyle).length > 0) {
    console.log('\n3. Generated CSS:');
    console.log('.smart-mp-article blockquote {');
    if (blockquoteStyle['background']) console.log(`    background: ${blockquoteStyle['background']};`);
    if (blockquoteStyle['border-left']) console.log(`    border-left: ${blockquoteStyle['border-left']};`);
    if (blockquoteStyle['color']) console.log(`    color: ${blockquoteStyle['color']};`);
    if (blockquoteStyle['font-style']) console.log(`    font-style: ${blockquoteStyle['font-style']};`);
    console.log('}');
} else {
    console.log('\n❌ FAIL: No blockquote style extracted!');
}
