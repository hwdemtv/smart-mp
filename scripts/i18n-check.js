/**
 * i18n 键验证脚本
 * 扫描代码中的 $t() 调用，检查是否有缺失的翻译键
 *
 * 用法:
 *   npm run i18n:check     - 检查缺失的键
 *   npm run i18n:report    - 生成详细报告
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  srcDir: path.join(__dirname, '..', 'src'),
  localesDir: path.join(__dirname, '..', 'src', 'lang', 'locales'),
  locales: {
    zh: 'zh-cn.json',
    en: 'en-us.json'
  },
  // 排除目录
  excludeDirs: ['__tests__', 'types', 'node_modules'],
  // $t() 调用匹配正则
  patterns: [
    /\$t\s*\(\s*['"`]([^'"`]+)['"`]/g,          // $t('key')
    /\$t\s*\(\s*['"`]([^'"`]+)['"`]\s*,/g,      // $t('key', ...)
  ]
};

/**
 * 递归获取目录下所有 .ts 文件
 */
function getTsFiles(dir, files = []) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!CONFIG.excludeDirs.includes(item)) {
        getTsFiles(fullPath, files);
      }
    } else if (item.endsWith('.ts') && !item.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 从文件内容提取 $t() 中的键
 */
function extractKeysFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const keys = new Set();

  for (const pattern of CONFIG.patterns) {
    // 重置正则 lastIndex
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      keys.add(match[1]);
    }
  }

  return Array.from(keys);
}

/**
 * 从 JSON 文件获取所有键（扁平化）
 */
function getKeysFromLocale(filePath) {
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const keys = new Set();

  function flatten(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null) {
        flatten(value, fullKey);
      } else {
        keys.add(fullKey);
      }
    }
  }

  flatten(content);
  return keys;
}

/**
 * 主函数：检查缺失的翻译键
 */
function checkMissingKeys() {
  console.log('🔍 正在扫描源代码中的 $t() 调用...\n');

  // 获取所有源文件
  const tsFiles = getTsFiles(CONFIG.srcDir);
  console.log(`📁 扫描了 ${tsFiles.length} 个 TypeScript 文件\n`);

  // 提取所有使用的键
  const usedKeys = new Set();
  const keyLocations = new Map(); // 记录键出现的位置

  for (const file of tsFiles) {
    const keys = extractKeysFromFile(file);
    for (const key of keys) {
      usedKeys.add(key);
      if (!keyLocations.has(key)) {
        keyLocations.set(key, []);
      }
      keyLocations.get(key).push(path.relative(CONFIG.srcDir, file));
    }
  }

  console.log(`🔑 找到 ${usedKeys.size} 个唯一的翻译键\n`);

  // 加载翻译文件
  const results = {};
  let hasMissing = false;

  for (const [lang, filename] of Object.entries(CONFIG.locales)) {
    const localePath = path.join(CONFIG.localesDir, filename);
    const definedKeys = getKeysFromLocale(localePath);

    const missing = [];
    for (const key of usedKeys) {
      if (!definedKeys.has(key)) {
        missing.push(key);
        hasMissing = true;
      }
    }

    // 检查未使用的键
    const unused = [];
    for (const key of definedKeys) {
      if (!usedKeys.has(key)) {
        unused.push(key);
      }
    }

    results[lang] = { missing, unused, total: definedKeys.size };

    console.log(`\n📋 ${lang.toUpperCase()} (${filename}):`);
    console.log(`   总翻译条目: ${definedKeys.size}`);

    if (missing.length > 0) {
      console.log(`   ❌ 缺失的键 (${missing.length}):`);
      for (const key of missing) {
        const locations = keyLocations.get(key) || [];
        console.log(`      - ${key}`);
        console.log(`        使用位置: ${locations.slice(0, 3).join(', ')}${locations.length > 3 ? '...' : ''}`);
      }
    } else {
      console.log(`   ✅ 无缺失键`);
    }

    if (unused.length > 0) {
      console.log(`   ⚠️  未使用的键 (${unused.length}): ${unused.slice(0, 5).join(', ')}${unused.length > 5 ? '...' : ''}`);
    }
  }

  // 输出汇总
  console.log('\n' + '='.repeat(50));
  console.log('📊 汇总:');
  console.log('='.repeat(50));
  console.log(`源文件数: ${tsFiles.length}`);
  console.log(`使用的翻译键: ${usedKeys.size}`);

  for (const [lang, data] of Object.entries(results)) {
    console.log(`\n${lang.toUpperCase()}:`);
    console.log(`  已定义: ${data.total}`);
    console.log(`  缺失: ${data.missing.length}`);
    console.log(`  未使用: ${data.unused.length}`);
  }

  // 返回退出码
  if (hasMissing) {
    console.log('\n❌ 存在缺失的翻译键，请补充！');
    return 1;
  } else {
    console.log('\n✅ 所有翻译键完整！');
    return 0;
  }
}

/**
 * 生成详细报告
 */
function generateReport() {
  console.log('# i18n 翻译键报告\n');
  console.log(`生成时间: ${new Date().toISOString()}\n`);

  const tsFiles = getTsFiles(CONFIG.srcDir);
  const usedKeys = new Set();

  for (const file of tsFiles) {
    const keys = extractKeysFromFile(file);
    keys.forEach(k => usedKeys.add(k));
  }

  console.log('## 统计\n');
  console.log(`- 源文件数: ${tsFiles.length}`);
  console.log(`- 使用的翻译键数: ${usedKeys.size}\n`);

  console.log('## 各语言状态\n');
  console.log('| 语言 | 文件 | 已定义 | 缺失 | 未使用 |');
  console.log('|------|------|--------|------|--------|');

  for (const [lang, filename] of Object.entries(CONFIG.locales)) {
    const localePath = path.join(CONFIG.localesDir, filename);
    const definedKeys = getKeysFromLocale(localePath);

    const missing = [...usedKeys].filter(k => !definedKeys.has(k)).length;
    const unused = [...definedKeys].filter(k => !usedKeys.has(k)).length;

    console.log(`| ${lang} | ${filename} | ${definedKeys.size} | ${missing} | ${unused} |`);
  }
}

// CLI 入口
const args = process.argv.slice(2);
if (args.includes('--report') || args.includes('-r')) {
  generateReport();
} else {
  const exitCode = checkMissingKeys();
  process.exit(exitCode);
}
