/**
 * i18next-scanner 配置文件
 * 用于自动扫描代码中的 $t() 调用，确保翻译键完整性
 */

module.exports = {
  input: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.test.ts',
    '!src/__tests__/**',
    '!src/types/**',
  ],
  output: 'src/lang/locales',
  options: {
    debug: false,
    sort: true,
    func: {
      list: ['$t'],  // 扫描 $t() 函数调用
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    },
    lngs: ['zh', 'en'],
    ns: ['translation'],
    defaultNs: 'translation',
    defaultValue: '__STRING_NOT_TRANSLATED__',
    resource: {
      loadPath: 'src/lang/locales/{{lng}}.json',
      savePath: 'src/lang/locales/{{lng}}.json',
      jsonIndent: 2,
      lineEnding: '\n'
    },
    nsSeparator: false,
    keySeparator: false,
    interpolation: {
      prefix: '{',
      suffix: '}'
    }
  }
};
