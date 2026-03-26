// 测试LaTeX渲染输出
const { parseMath } = require('./src/render/mathjax');

// 测试行内公式
const inlineFormula = 'E = mc^2';
const inlineSvg = parseMath(inlineFormula);
console.log('Inline SVG:', inlineSvg.substring(0, 200));

// 测试块级公式  
const blockFormula = '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';
const blockSvg = parseMath(blockFormula);
console.log('Block SVG:', blockSvg.substring(0, 200));
