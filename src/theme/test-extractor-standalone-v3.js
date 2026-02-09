
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

// NEW: Helper to find fake quotes
function extractFakeQuoteStyle($) {
    // Look for elements with border-left inside #js_content
    let bestStyle = {};

    // Priority: elements that look like quotes (border-left + padding or background)
    $('#js_content *[style*="border-left"]').each((i, el) => {
        const styleStr = $(el).attr('style') || '';
        const styles = {};
        styleStr.split(';').forEach(pair => {
            const index = pair.indexOf(':');
            if (index > -1) {
                const key = pair.substring(0, index).trim().toLowerCase();
                const value = pair.substring(index + 1).trim();
                styles[key] = value;
            }
        });

        // Validation: must have border-left
        if (styles['border-left'] || styles['border-left-width']) {
            // Heuristic: prefer elements with text content
            if ($(el).text().trim().length > 0) {
                bestStyle = styles;
                return false; // break
            }
        }
    });

    return bestStyle;
}


function extractHighlightStyle($, selector) {
    const styleCounts = {};
    const styleMap = {};

    // Added check for linear-gradient in background
    $('#js_content strong[style], #js_content span[style], #js_content mark[style]').each((i, el) => {
        const style = $(el).attr('style') || '';
        let key = '';
        let props = {};

        // 1. Check for background-color
        const bgMatch = style.match(/background-color:\s*([^;]+)/i);
        if (bgMatch && bgMatch[1]) {
            const color = bgMatch[1].trim();
            if (color !== 'transparent' && color !== '#ffffff' && !isGrayscale(color)) {
                key += `bg:${color};`;
                props['background-color'] = color;
            }
        }

        // 2. Check for linear-gradient in background/background-image
        // Regex to capture linear-gradient(...), simplified
        const gradMatch = style.match(/(background|background-image):\s*(linear-gradient\([^;]+\))/i);
        if (gradMatch && gradMatch[2]) {
            const val = gradMatch[2].trim();
            // Ignore simple transparent/white gradients if possible? 
            // Assume any gradient is deliberate highlight
            key += `grad:${val};`;
            props['background'] = val; // Use 'background' to override color
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
            'background-color', 'background', 'background-image',
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
        if (highlightStyle['background']) css += `    background: ${highlightStyle['background']};\n`;
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
        <!-- Fake Quote (Real from user issue) -->
        <strong style="font-weight: 600;color: #555 !important;background: linear-gradient(90deg, rgba(7,193,96,0.05) 0%, transparent 100%) !important;border-left: 4px solid #07c160;font-style: italic;">
            AI 已经这么强了
        </strong>
        
        <!-- Fake Highlight (Hypothetical) -->
        <p>Text <span style="background: linear-gradient(to right, #ffeb3b 0%, #ffeb3b 100%); color: red;">Highlight 1</span></p>
    </div>
</body>
</html>
`;

const $ = cheerio.load(html);

// Main Logic Simulation
let blockquoteStyle = extractElementStyle($, '#js_content blockquote');
// If empty, try fake
if (Object.keys(blockquoteStyle).length === 0) {
    console.log('Standard blockquote empty, trying fake quote...');
    blockquoteStyle = extractFakeQuoteStyle($);
}

const highlightStyle = extractHighlightStyle($, '#js_content');

const css = generateCss({ blockquoteStyle, highlightStyle });
console.log('--- CSS Output ---');
console.log(css);

let passed = true;
if (!css.includes('border-left: 4px solid #07c160')) {
    console.log('❌ FAIL: Fake quote border not captured');
    passed = false;
}
if (!css.includes('background: linear-gradient(90deg, rgba(7,193,96,0.05) 0%, transparent 100%) !important')) { // Note: extractElementStyle keeps !important? Yes, splits by :
    console.log('❌ FAIL: Fake quote gradient not captured');
    passed = false;
}
if (!css.includes('background: linear-gradient(to right, #ffeb3b 0%, #ffeb3b 100%)')) {
    console.log('❌ FAIL: Highlight gradient not captured');
    passed = false;
}

if (passed) console.log('✅ PASS: All styles captured');
