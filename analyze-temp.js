
const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('temp_article.html', 'utf-8');
const $ = cheerio.load(html);

console.log('--- Analyzing "AI 已经这么强了" block ---');
// Match text exactly or substring
$('*').each((i, el) => {
    const text = $(el).text();
    if (text.includes("AI 已经这么强了") && $(el).children().length === 0) {
        console.log(`Leaf Element: <${el.tagName}>`);
        console.log(`Style: ${$(el).attr('style')}`);

        let parent = $(el).parent();
        console.log(`Parent: <${parent.prop('tagName')} style="${parent.attr('style')}">`);

        // Go up to find the green bar
        let p = parent;
        for (let k = 0; k < 5; k++) {
            const s = p.attr('style') || '';
            if (s.includes('border') || s.includes('gradient')) {
                console.log(`Ancestor-${k}: <${p.prop('tagName')} style="${s}">`);
            }
            p = p.parent();
        }
    }
});

console.log('\n--- Analyzing "真正被放大了" highlight ---');
$('*').each((i, el) => {
    const text = $(el).text();
    if (text.includes("真正被放大了") && $(el).children().length === 0) {
        console.log(`Leaf Element: <${el.tagName}>`);
        console.log(`Style: ${$(el).attr('style')}`);
        // Parent?
        console.log(`Parent Style: ${$(el).parent().attr('style')}`);
    }
});
