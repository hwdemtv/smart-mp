// ESLint 9 flat config（取代 legacy .eslintrc/.eslintignore，v9 默认不再读取它们）
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
	{
		ignores: [
			"node_modules/**",
			"main.js",
			"packages/**",
			"temp/**",
			"temp_study/**",
			"themes/**",
		],
	},
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			...tseslint.configs.recommended.rules,
			// 存量代码大量使用 any / self=this / require 等既有模式，
			// 先降为 warn 保证 lint 可运行（此前 CI 的 lint 步骤因缺少
			// lint script + legacy 配置不兼容而永久静默失败），后续逐步收紧
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ args: "none", ignoreRestSiblings: true },
			],
			"@typescript-eslint/no-this-alias": "warn",
			"@typescript-eslint/no-require-imports": "warn",
			"@typescript-eslint/ban-ts-comment": "warn",
			"@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
			"@typescript-eslint/no-unsafe-function-type": "warn",
		},
	},
];
