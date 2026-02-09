
const fs = require('fs');
const cheerio = require('cheerio');

// Target URL
const url = 'https://mp.weixin.qq.com/s/HD0ukpvYYUjOytF';

async function analyze() {
    console.log(`Fetching ${url}...`);
    try {
        const res = await fetch(url);
        const html = await res.text();
        console.log('HTML Length:', html.length);
        console.log('Preview:', html.substring(0, 500));

        const $ = cheerio.load(html);

        const content = $('#js_content');
        if (content.length === 0) {
            console.log('#js_content not found. Page might be JS loaded or blocked.');
        } else {
            console.log('#js_content found.');

            // Look for ANY quote-like elements
            // section with border-left
            const quoteCandidates = $('#js_content section[style*="border-left"]');
            console.log('Quote candidates (section w/ border-left):', quoteCandidates.length);

            quoteCandidates.each((i, el) => {
                console.log(`Quote Candidate ${i}: style="${$(el).attr('style')}"`);
                console.log(`Text: ${$(el).text().substring(0, 50)}...`);
            });

            // Look for blockquotes
            const blockquotes = $('#js_content blockquote');
            console.log('Blockquotes found:', blockquotes.length);
            blockquotes.each((i, el) => {
                console.log(`Blockquote ${i}: style="${$(el).attr('style')}"`);
            });
        }

    } catch (e) {
        console.error(e);
    }
}

analyze();
