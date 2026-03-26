const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('temp_article.html', 'utf-8');
const $ = cheerio.load(html);

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

const blockquoteStyle = extractElementStyle($, '#js_content blockquote');

console.log('=== Extracted Blockquote Styles ===');
console.log(JSON.stringify(blockquoteStyle, null, 2));

// Generate CSS
let css = '.smart-mp-article blockquote {\n';
const allowedProps = [
    'background-color', 'background',
    'border', 'border-left', 'border-right', 'border-top', 'border-bottom',
    'border-color', 'border-left-color',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'margin', 'margin-top', 'margin-bottom',
    'color', 'font-size', 'font-style', 'font-weight',
    'border-radius'
];

allowedProps.forEach(prop => {
    if (blockquoteStyle[prop]) {
        css += `    ${prop}: ${blockquoteStyle[prop]};\n`;
    }
});
css += '}\n';

console.log('\n=== Generated CSS ===');
console.log(css);

fs.writeFileSync('generated-theme.css', css);
console.log('\n✅ CSS saved to generated-theme.css');
