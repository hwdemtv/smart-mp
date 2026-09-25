const fs = require('fs');
const path = require('path');

const outputFile = path.join(__dirname, 'styles.css');
// 插件 UI 样式（弹窗/工具栏/文章头部/素材面板等）——单一手工维护源文件，最先拼接
const pluginUiFile = path.join(__dirname, 'src', 'assets', 'plugin-ui.css');
// 文章内容默认样式（正文排版/主题样式）——按序号排序，后置以覆盖 plugin-ui 中的旧文章规则
const stylesDir = path.join(__dirname, 'src', 'assets', 'default-styles');

let content = '/* Smart MP Styles - Auto Generated (npm run build 时由 build-styles.js 重新生成，勿直接编辑) */\n\n';

if (fs.existsSync(pluginUiFile)) {
    content += '/* --- plugin-ui.css (插件 UI) --- */\n';
    content += fs.readFileSync(pluginUiFile, 'utf-8') + '\n\n';
    console.log('Included plugin-ui.css');
} else {
    console.warn('⚠ 未找到 src/assets/plugin-ui.css，插件 UI 样式将缺失！');
}

const files = fs.readdirSync(stylesDir)
    .filter(file => file.endsWith('.css'))
    .sort(); // Sort by name to ensure correct order (00_, 01_, etc.)

console.log(`Found ${files.length} CSS files in ${stylesDir}`);

files.forEach(file => {
    const filePath = path.join(stylesDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    content += `/* --- ${file} --- */\n`;
    content += fileContent + '\n\n';
    console.log(`Included ${file}`);
});

fs.writeFileSync(outputFile, content);
console.log(`\n✅ styles.css generated successfully (${(content.length / 1024).toFixed(2)} KB)`);
