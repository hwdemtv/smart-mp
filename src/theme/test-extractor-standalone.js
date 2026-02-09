
const cheerio = require('cheerio');

// --- Mocked/Refactored Logic ---

function isGrayscale(color) {
    if (color.startsWith('#')) {
        if (color.length === 4) return color[1] === color[2] && color[2] === color[3];
        if (color.length === 7) return color[1] === color[2] && color[3] === color[4] && color[5] === color[6];
    }
    return ['black', 'white', 'gray', 'grey'].includes(color.toLowerCase());
}

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
            styles[key] = value;
        }
    });

    return styles;
}

function extractHighlightStyle($, selector) {
    const styleCounts = {};
    const styleMap = {};

    $('#js_content strong[style], #js_content span[style], #js_content mark[style]').each((i, el) => {
        const style = $(el).attr('style') || '';
        const bgMatch = style.match(/background-color:\s*([^;]+)/i);

        let key = '';
        let props = {};

        if (bgMatch && bgMatch[1]) {
            const color = bgMatch[1].trim();
            if (color !== 'transparent' && color !== '#ffffff' && !isGrayscale(color)) {
                key += `bg:${color};`;
                props['background-color'] = color;
            }
        }

        if (key) {
            const colorMatch = style.match(/color:\s*([^;]+)/i);
            if (colorMatch && colorMatch[1]) {
                props['color'] = colorMatch[1].trim();
            }
            styleCounts[key] = (styleCounts[key] || 0) + 1;
            styleMap[key] = props;
        }
    });

    let maxCount = 0;
    let bestStyle = {};
    for (const [key, count] of Object.entries(styleCounts)) {
        if (count > maxCount) {
            maxCount = count;
            bestStyle = styleMap[key];
        }
    }
    return bestStyle;
}

function generateCss(data) {
    const { blockquoteStyle, highlightStyle } = data;
    let css = '';

    if (blockquoteStyle && Object.keys(blockquoteStyle).length > 0) {
        css += '.smart-mp-article blockquote {\n';
        const allowedProps = [
            'background-color', 'background',
            'border', 'border-left', 'border-right', 'border-top', 'border-bottom',
            'border-color', 'border-left-color', 'border-right-color', 'border-top-color', 'border-bottom-color',
            'border-width', 'border-left-width', 'border-right-width', 'border-top-width', 'border-bottom-width',
            'border-style', 'border-left-style', 'border-right-style', 'border-top-style', 'border-bottom-style',
            'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
            'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
            'color', 'font-size', 'font-style', 'font-weight',
            'border-radius'
        ];
        allowedProps.forEach(prop => {
            if (blockquoteStyle[prop]) css += `    ${prop}: ${blockquoteStyle[prop]};\n`;
        });
        css += '}\n\n';
    }

    if (highlightStyle && Object.keys(highlightStyle).length > 0) {
        css += '.smart-mp-article mark {\n';
        if (highlightStyle['background-color']) css += `    background-color: ${highlightStyle['background-color']};\n`;
        if (highlightStyle['color']) css += `    color: ${highlightStyle['color']};\n`;
        css += '}\n\n';
    }

    return css;
}

// --- Test Case ---

const html = `
<html>
<body>
    <div id="js_content">
        <h1>Article Title</h1>
        <blockquote style="border-left: 8px solid rgb(0, 187, 236); background-color: rgb(248, 249, 250); padding: 10px; border-radius: 4px;">
            Quote
        </blockquote>
        <p>Text <span style="background-color: #ffeb3b; color: red;">Highlight 1</span></p>
        <p>Text <strong style="background-color: #ffeb3b;">Highlight 2</strong></p>
    </div>
</body>
</html>
`;

const $ = cheerio.load(html);
const blockquoteStyle = extractElementStyle($, '#js_content blockquote');
const highlightStyle = extractHighlightStyle($, '#js_content');

const css = generateCss({ blockquoteStyle, highlightStyle });
console.log('--- CSS Output ---');
console.log(css);

if (css.includes('.smart-mp-article mark') && css.includes('background-color: #ffeb3b')) {
    console.log('✅ PASS: Highlight style extracted');
} else {
    console.log('❌ FAIL: Highlight style NOT extracted');
}
