const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('temp_article.html', 'utf-8');
const $ = cheerio.load(html);

const style = $('#js_content blockquote').first().attr('style');
console.log('Full style attribute:');
console.log(style);
