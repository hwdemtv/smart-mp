const fs = require('fs');
const path = require('path');

const stylesDir = path.join(__dirname, 'src', 'assets', 'default-styles');
const outputFile = path.join(__dirname, 'styles.css');

// Get all CSS files
const files = fs.readdirSync(stylesDir)
    .filter(file => file.endsWith('.css'))
    .sort(); // Sort by name to ensure correct order (00_, 01_, etc.)

console.log(`Found ${files.length} CSS files in ${stylesDir}`);

let content = '/* Smart MP Styles - Auto Generated */\n\n';

files.forEach(file => {
    const filePath = path.join(stylesDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    content += `/* --- ${file} --- */\n`;
    content += fileContent + '\n\n';
    console.log(`Included ${file}`);
});

fs.writeFileSync(outputFile, content);
console.log(`\n✅ styles.css generated successfully (${(content.length / 1024).toFixed(2)} KB)`);
