
const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('temp_article.html', 'utf-8');
const $ = cheerio.load(html);

console.log('--- Analyzing "真正被放大了" highlight ---');
$('*').each((i, el) => {
    const text = $(el).text();
    // Check exact text or close to it
    if (text.includes("真正被放大了") && $(el).children().length === 0) {
        console.log(`Leaf Element: <${el.tagName}>`);
        console.log(`Style: ${$(el).attr('style')}`);
        console.log(`Parent: <${$(el).parent().prop('tagName')} style="${$(el).parent().attr('style')}">`);
    }
});
