const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('temp_article.html', 'utf-8');
const $ = cheerio.load(html);

console.log('=== Blockquote Analysis ===\n');

const blockquote = $('#js_content blockquote').first();
if (blockquote.length === 0) {
    console.log('❌ No blockquote found in #js_content');
} else {
    console.log('✅ Found blockquote');
    console.log('Tag:', blockquote.prop('tagName'));
    console.log('Text (first 50 chars):', blockquote.text().substring(0, 50).trim());
    console.log('\nStyle attribute:');
    console.log(blockquote.attr('style') || '(no inline style)');

    console.log('\nHTML (first 200 chars):');
    console.log(blockquote.html().substring(0, 200));
}
