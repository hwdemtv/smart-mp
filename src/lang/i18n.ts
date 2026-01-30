/**
 * i18n module for SmartMP plugin
 */
import i18n from "i18next";
import { moment } from "obsidian";

import enUsTrans from "./locales/en-us.json";
import zhCnTrans from "./locales/zh-cn.json";
declare global {
	interface Window {
		$t: (key: string, options?: string[]) => string;
	}
}
const getLanguage = () => {
	const lng = moment.locale().toLowerCase();
	if (lng.startsWith("zh")) return "zh";
	return "en";
};

void i18n.init({
	debug: false,
	lng: getLanguage(),
	fallbackLng: "en",
	interpolation: {
		escapeValue: true,
	},
	resources: {
		en: {
			translation: enUsTrans,
		},
		zh: {
			translation: zhCnTrans,
		},
	},
});

function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function $t(key: string, options?: string[]) {
	let result = i18n.t(key);
	if (options !== undefined) {
		for (let i = 0; i < options.length; i++) {
			result = result.replace(`{${i}}`, escapeHtml(options[i]));
		}
	}
	return result;
}

window.$t = $t;

export default i18n;
