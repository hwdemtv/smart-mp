/**
 * to build custom css for SmartMP.
 * author: Learner Chen <learner.chen@icloud.com>
 * date: 2025-05-10
 */

import postcss from 'postcss';
import { Logger } from '../utils/logger';

import $00 from '../assets/default-styles/00_smart-mp.css';
import $01 from '../assets/default-styles/01_layout.css';
import $02 from '../assets/default-styles/02_icons.css';
import $03 from '../assets/default-styles/03_typography.css';
import $04 from '../assets/default-styles/04_paragragh.css';
import $05 from '../assets/default-styles/05_strong.css';
import $06 from '../assets/default-styles/06_em.css';
import $07 from '../assets/default-styles/07_u.css';
import $08 from '../assets/default-styles/08_del.css';
import $09 from '../assets/default-styles/09_codespan.css';
import $10 from '../assets/default-styles/10_heading.css';
import $11 from '../assets/default-styles/11_h1.css';
import $12 from '../assets/default-styles/12_h2.css';
import $13 from '../assets/default-styles/13_h3.css';
import $14 from '../assets/default-styles/14_h4.css';
import $15 from '../assets/default-styles/15_h5.css';
import $16 from '../assets/default-styles/16_h6.css';
import $20 from '../assets/default-styles/20_image.css';
import $21 from '../assets/default-styles/21_list.css';
import $23 from '../assets/default-styles/23_footnote.css';
import $24 from '../assets/default-styles/24_table.css';
import $25 from '../assets/default-styles/25_code.css';
import $26 from '../assets/default-styles/26_blockquote.css';
import $27 from '../assets/default-styles/27_links.css';
import $30 from '../assets/default-styles/30_callout.css';
import $31 from '../assets/default-styles/31_admonition.css';
import $32 from '../assets/default-styles/32_math.css';
import $33 from '../assets/default-styles/33_mermaid.css';
import $34 from '../assets/default-styles/34_chart.css';
import $35 from '../assets/default-styles/35_icon.css';
import $40 from '../assets/default-styles/40_summary.css';
import $50 from '../assets/default-styles/50_profile.css';
import $100 from '../assets/default-styles/100_article.css';
import { Notice } from 'obsidian';
import { $t } from 'src/lang/i18n';

const baseCSS = [
	$00,
	$01,
	$02,
	$03,
	$04,
	$05,
	$06,
	$07,
	$08,
	$09,
	$10,
	$11,
	$12,
	$13,
	$14,
	$15,
	$16,
	$20,
	$21,
	$23,
	$24,
	$25,
	$26,
	$27,
	$30,
	$31,
	$32,
	$33,
	$34,
	$35,
	$40,
	$50,
	$100
]

const RESERVED_CLASS_PREFIX = [
	'appmsg_',
	'wx_',
	'wx-',
	'common-webchat',
	'weui-'
]

const isClassReserved = (className: string) => {
	return RESERVED_CLASS_PREFIX.some(prefix => className.startsWith(prefix));
}

// Simple Parser to get properties with !important
const parseImportantProperties = (styleStr: string | null): Set<string> => {
	const importantProps = new Set<string>();
	if (!styleStr) return importantProps;

	// Split by semicolon
	const decls = styleStr.split(';');
	for (const decl of decls) {
		const part = decl.trim();
		if (!part) continue;
		const colonIndex = part.indexOf(':');
		if (colonIndex > 0) {
			const value = part.substring(colonIndex + 1);
			if (value.toLowerCase().includes('!important')) {
				const prop = part.substring(0, colonIndex).trim().toLowerCase();
				importantProps.add(prop);
			}
		}
	}
	return importantProps;
};

type Rule = Map<string, postcss.Declaration>;
type Rules = Map<string, Rule>;

export class CSSMerger {
	baseAST: postcss.Root | undefined;
	overrideAST: postcss.Root | undefined;
	vars: Map<string, string> = new Map()
	rules: Rules = new Map()

	// Indexing for performance
	private keyedRules: Map<string, string[]> = new Map();
	private universalRules: string[] = [];

	private buildRuleIndex() {
		this.keyedRules.clear();
		this.universalRules = [];

		this.rules.forEach((_, selector) => {
			const { baseSelector } = this.normalizeSelector(selector);
			const parts = baseSelector.split(/[\s>+~]+/);
			const subject = parts[parts.length - 1];

			const ids = subject.match(/#[a-zA-Z0-9_\-]+/g) || [];
			const classes = subject.match(/\.[a-zA-Z0-9_\-]+/g) || [];
			const tags = subject.match(/^[a-zA-Z0-9_\-]+/);

			let indexed = false;
			if (ids.length > 0) {
				ids.forEach(id => this.addIndex(id, selector));
				indexed = true;
			} else if (classes.length > 0) {
				classes.forEach(c => this.addIndex(c, selector));
				indexed = true;
			} else if (tags) {
				this.addIndex(tags[0].toUpperCase(), selector);
				indexed = true;
			}

			if (!indexed) {
				this.universalRules.push(selector);
			}
		});
		Logger.perf('CssMerger', `Index rebuilt. Keyed: ${this.keyedRules.size}, Universal: ${this.universalRules.length}`);
	}

	private addIndex(key: string, selector: string) {
		if (!this.keyedRules.has(key)) this.keyedRules.set(key, []);
		this.keyedRules.get(key)!.push(selector);
	}

	private static AST_CACHE: Map<string, postcss.Root> = new Map();
	private static cacheHits = 0;
	private static cacheMisses = 0;

	// Base CSS State Cache
	private static BASE_STATE_CACHE: {
		rules: Rules;
		vars: Map<string, string>;
		keyedRules: Map<string, string[]>;
		universalRules: string[];
	} | null = null;

	// Clear Static Caches
	static clearCaches() {
		CSSMerger.AST_CACHE.clear();
		CSSMerger.BASE_STATE_CACHE = null;
		CSSMerger.cacheHits = 0;
		CSSMerger.cacheMisses = 0;
	}

	async init(customCSS: string) {
		// Restore Base State (deep copy)
		if (CSSMerger.BASE_STATE_CACHE) {
			this.rules = new Map();
			CSSMerger.BASE_STATE_CACHE.rules.forEach((rule, selector) => this.rules.set(selector, new Map(rule)));
			this.vars = new Map(CSSMerger.BASE_STATE_CACHE.vars);
			this.keyedRules = new Map(CSSMerger.BASE_STATE_CACHE.keyedRules);
			this.universalRules = [...CSSMerger.BASE_STATE_CACHE.universalRules];
		} else {
			await this.buildBaseCSS();
		}

		if (customCSS && customCSS.trim()) {
			// Sanitize: strip zero-width characters, NBSP, and normalize newlines
			const sanitized = customCSS.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ").replace(/\r\n/g, "\n");

			try {
				// Use postcss.parse for faster synchronous parsing on the combined string
				const ast = postcss.parse(sanitized);
				this.pickVariables(ast, this.vars);
				this.pickRules(ast, this.rules);
				this.buildRuleIndex();
			} catch (e: any) {
				const errorMsg = `[CssMerger] CSS Parser Error: ${e.message}`;
				console.error(errorMsg);
				if (e.line) {
					const lines = sanitized.split('\n');
					console.error(`[CssMerger] Failed at Line ${e.line}: "${lines[e.line - 1]?.trim()}"`);
				}
				console.error('[CssMerger] Full Sanitized Input Sample (Lines 180-200):', sanitized.split('\n').slice(179, 201).join('\n'));
				new Notice($t('render.failed-to-parse-custom-css', [e]));
			}
		} else {
			this.buildRuleIndex();
		}
	}

	// New method to load from cache directly
	loadFromCache(baseRules: Rules, baseVars: Map<string, string>, customCSS: string) {
		// Deep copy base rules/vars to avoid mutation affecting cache
		this.rules = new Map(baseRules);
		this.vars = new Map(baseVars);
		// Re-parse custom CSS (usually small) or we could cache combined state?
		// For Phase 1, let's just optimize the Base CSS loading which is the bottleneck.
		// Actually, the cache key in ThemeManager is 'customCss' content. master cache handles "Merged State".
	}

	// Method to extract current state for caching
	getState() {
		return {
			rules: this.rules,
			vars: this.vars,
			keyedRules: this.keyedRules,
			universalRules: this.universalRules
		}
	}

	restoreState(state: any) {
		// Deep copy rules: new Map for the outer collection AND each inner rule Map
		this.rules = new Map();
		state.rules.forEach((rule: Map<string, any>, selector: string) => {
			this.rules.set(selector, new Map(rule));
		});

		this.vars = new Map(state.vars);
		this.keyedRules = new Map(state.keyedRules);
		this.universalRules = [...state.universalRules];
	}
	async buildBaseCSS() {
		// Check Static Cache
		if (CSSMerger.BASE_STATE_CACHE) {
			Logger.debug('CssMerger', 'Base State Cache hit!');
			this.rules = new Map(CSSMerger.BASE_STATE_CACHE.rules);
			this.vars = new Map(CSSMerger.BASE_STATE_CACHE.vars);
			this.keyedRules = new Map(CSSMerger.BASE_STATE_CACHE.keyedRules);
			this.universalRules = [...CSSMerger.BASE_STATE_CACHE.universalRules];
			return;
		}

		this.vars.clear();
		this.rules.clear();
		for (const css of baseCSS) {
			let ast = CSSMerger.AST_CACHE.get(css);
			if (!ast) {
				CSSMerger.cacheMisses++;
				// 限制缓存大小以防止内存溢出
				if (CSSMerger.AST_CACHE.size >= 100) {
					const firstKey = CSSMerger.AST_CACHE.keys().next().value;
					if (firstKey) CSSMerger.AST_CACHE.delete(firstKey);
				}
				ast = (await postcss().process(css, { from: undefined })).root;
				CSSMerger.AST_CACHE.set(css, ast);
			} else {
				CSSMerger.cacheHits++;
			}
			this.pickVariables(ast, this.vars);
			this.pickRules(ast, this.rules);
		}
		this.buildRuleIndex();

		// Cache the built state (Deep copy rules to avoid pollution)
		const rulesCopy = new Map();
		this.rules.forEach((rule, selector) => {
			rulesCopy.set(selector, new Map(rule));
		});

		CSSMerger.BASE_STATE_CACHE = {
			rules: rulesCopy,
			vars: new Map(this.vars),
			keyedRules: new Map(this.keyedRules),
			universalRules: [...this.universalRules]
		};

		console.log('[CssMerger] Base State Cache Saved - variables:',
			Array.from(CSSMerger.BASE_STATE_CACHE.vars.entries()).filter(([key]) =>
				key.includes('b08d55') || key.includes('D4AF37') || key.includes('1e1e1e')
			)
		);

		Logger.perf('CssMerger', `Cache Stats - Hits: ${CSSMerger.cacheHits}, Misses: ${CSSMerger.cacheMisses}, Ratio: ${((CSSMerger.cacheHits / (CSSMerger.cacheHits + CSSMerger.cacheMisses)) * 100).toFixed(2)}%`);
	}
	// Obsidian 常用 CSS 变量的默认回退值
	private static readonly DEFAULT_CSS_VARS: Record<string, string> = {
		'--text-normal': '#333333',
		'--text-muted': '#666666',
		'--text-faint': '#999999',
		'--text-accent': '#705dcf',
		'--text-accent-hover': '#8875ff',
		'--text-on-accent': '#ffffff',
		'--interactive-normal': '#f5f5f5',
		'--interactive-hover': '#e0e0e0',
		'--interactive-accent': '#705dcf',
		'--interactive-accent-hover': '#8875ff',
		'--background-primary': '#ffffff',
		'--background-secondary': '#f5f5f5',
		'--background-modifier-border': '#ddd',
		'--background-modifier-hover': 'rgba(0,0,0,0.05)',
		'--link-color': '#705dcf',
		'--link-external-color': '#705dcf',
		'--code-background': '#f5f5f5',
		'--tag-background': '#e0e0e0',
		'--tag-color': '#333333',
	};

	private resolveCssVars(value: string, vars: Map<string, string>, depth = 0): string {
		const MAX_DEPTH = 10; // 防止无限循环
		const varRegex = /var\(\s*--([\w-]+)(?:\s*,\s*((?:(?:\([^()]*\))|[^)\s])*?))?\s*\)/g;
		let result = value;
		let replaced: boolean;

		do {
			replaced = false;

			result = result.replace(varRegex, (_match, varName: string, fallback: string | undefined) => {

				const fullKey = `--${varName}`;
				if (vars.has(fullKey)) {
					const replacement = vars.get(fullKey)!;
					replaced = true;
					return replacement;
				} else if (fallback !== undefined) {
					replaced = true;
					return fallback;
				} else if (CSSMerger.DEFAULT_CSS_VARS[fullKey]) {
					// 使用预定义的默认值
					replaced = true;
					return CSSMerger.DEFAULT_CSS_VARS[fullKey];
				} else {
					// 仅在调试模式下输出警告
					if (process.env.NODE_ENV === 'development') {
						console.debug(`Variable ${fullKey} not found, using empty string`);
					}
					return '';
				}
			});

			depth++;
		} while (replaced && depth < MAX_DEPTH);

		return result;
	}

	private pickRules(root: postcss.Root, rules: Rules): void {
		root.walkRules(rule => {
			if (rule.selector !== ':root') {
				rule.selectors.forEach(selector => {
					let selectedRule = rules.get(selector);
					if (!selectedRule) {
						selectedRule = new Map();
						rules.set(selector, selectedRule);
					}
					rule.walkDecls(decl => {
						const baseDecl = selectedRule!.get(decl.prop);
						if (baseDecl === undefined || !baseDecl.important || decl.important) {
							// [Optimization] Pre-resolve variables here
							// Clone the decl to avoid mutating the original AST if cached
							const optimizedDecl = decl.clone();
							if (optimizedDecl.value.includes('var(')) {
								optimizedDecl.value = this.resolveCssVars(optimizedDecl.value, this.vars);
							}
							selectedRule!.set(decl.prop, optimizedDecl);
						}
					})
				});
			}
		})
	}

	private pickVariables(root: postcss.Root, vars: Map<string, string>): void {
		root.walkRules(rule => {
			if (rule.selector === ':root') {
				rule.walkDecls(decl => {
					if (decl.prop.startsWith('--')) {
						if (!/^[a-zA-Z0-9-]+$/.test(decl.prop.substring(2))) {
							console.warn(`[CssMerger] Potentially invalid variable name format: ${decl.prop}`);
						}
						vars.set(decl.prop, decl.value);
					}
				});
			}
		})
	}

	private normalizeSelector(selector: string) {
		const pseudoMatch = selector.match(/::?(before|after)/);
		const pseudo = pseudoMatch ? pseudoMatch[1] as 'before' | 'after' : null;
		const baseSelector = pseudo ? selector.replace(/::?(before|after)/g, '') : selector;
		return { baseSelector, pseudo };
	}

	private ensurePseudoElement(target: HTMLElement, pseudo: 'before' | 'after', content: string | undefined) {
		const attr = `data-smart-mp-pseudo-${pseudo}`;
		let pseudoEl = target.querySelector<HTMLElement>(`[${attr}]`);
		if (!pseudoEl) {
			pseudoEl = document.createElement('span');
			pseudoEl.setAttribute(attr, 'true');
			if (pseudo === 'before') {
				target.prepend(pseudoEl);
			} else {
				target.append(pseudoEl);
			}
		}
		if (content) {
			pseudoEl.textContent = content.replace(/(^")|("$)/g, '');
		}
		return pseudoEl;
	}

	applyStyleToElement(root: HTMLElement) {
		const stack: HTMLElement[] = [root];

		while (stack.length > 0) {
			const currentNode = stack.pop()!;

			// Highlight element diagnostic
			if (currentNode.tagName === 'MARK' || currentNode.classList.contains('highlight')) {
				Logger.debug('CssMerger', `Identified highlight element: <${currentNode.tagName}> content: "${currentNode.textContent?.substring(0, 20)}..."`);
			}

			// [Optimization] Batch Styles
			const finalStyles = new Map<string, string>();

			// 1. Existing Inline Styles (Highest Priority for vars, but we need to resolve them? 
			// Actually, existing inline styles usually come from Obsidian/Users and shouldn't be touched unless they use vars we know)
			// For performance, let's keep the existing logic: resolve vars in inline style.
			const existingStyle = currentNode.getAttribute('style');
			let preservedOriginalStyle = existingStyle || '';

			// [Optimization] Parse !important props once per node
			let existingImportantProps = parseImportantProperties(preservedOriginalStyle);

			if (existingStyle && existingStyle.includes('var(')) {
				const resolvedStyle = this.resolveCssVars(existingStyle, this.vars);
				if (resolvedStyle !== existingStyle) {
					// We don't setAttribute here to avoid Reflow. We just treat it as base.
					preservedOriginalStyle = resolvedStyle;
					// Re-parse if changed (rare)
					existingImportantProps = parseImportantProperties(preservedOriginalStyle);
				}
			}

			// Collect Candidate Rules
			const candidates = new Set<string>(this.universalRules);

			// Tag
			const tagRules = this.keyedRules.get(currentNode.tagName);
			if (tagRules) tagRules.forEach(s => candidates.add(s));

			// Classes
			if (currentNode.classList && currentNode.classList.length > 0) {
				currentNode.classList.forEach(c => {
					const classRules = this.keyedRules.get(`.${c}`);
					if (classRules) classRules.forEach(s => candidates.add(s));
				});
			}

			// IDs
			if (currentNode.id) {
				const idRules = this.keyedRules.get(`#${currentNode.id}`);
				if (idRules) idRules.forEach(s => candidates.add(s));
			}

			// Calculate Theme Styles
			const themeStyleBatch: string[] = [];

			candidates.forEach((selector) => {
				const rule = this.rules.get(selector);
				if (!rule) return;

				const { baseSelector, pseudo } = this.normalizeSelector(selector);
				try {
					if (currentNode.matches(baseSelector)) {
						if (pseudo) {
							// Pseudo-elements handling remains direct DOM manipulation for now (less frequent)
							const displayDecl = rule.get('display');
							const contentDecl = rule.get('content');

							if (displayDecl?.value === 'none' || contentDecl?.value === 'none') {
								const attr = `data-smart-mp-pseudo-${pseudo}`;
								const existing = currentNode.querySelector(`[${attr}]`);
								if (existing) existing.remove();
								return;
							}
							// Only resolve vars if we haven't pre-resolved (which we have in pickRules!)
							// But content might need resolution if it wasn't caught.
							// ensurePseudoElement logic...
							const target = this.ensurePseudoElement(currentNode, pseudo, contentDecl?.value);

							// Pseudo-element styles apply to the span, so we batch them for that span?
							// For simplicity, keep pseudo logic as is, it's rare compared to main elements.
							rule.forEach((decl, prop) => {
								if (prop === 'content') return;
								// Values are already pre-resolved in pickRules!
								const fullValue = decl.important ? `${decl.value} !important` : decl.value;
								this.appendStyleText(target, prop, fullValue);
							})
						} else {
							// Main Element Rules
							rule.forEach((decl, prop) => {
								// Values are already pre-resolved in pickRules!
								// Just need security check
								const lowerValue = decl.value.toLowerCase();
								if (lowerValue.includes('javascript:') || lowerValue.includes('vbscript:') || (lowerValue.includes('url(') && lowerValue.includes('data:') && !lowerValue.includes('data:image/'))) {
									return;
								}

								// Check !important conflict
								// Optimized: Check against Set
								if (existingImportantProps.has(prop)) {
									return;
								}

								const fullValue = decl.important ? `${decl.value} !important` : decl.value;
								themeStyleBatch.push(`${prop}: ${fullValue}`);
							})
						}
					}
				} catch (error) {
					// safe ignore
				}
			})

			// [Optimization] Batch Write
			if (themeStyleBatch.length > 0) {
				const cssToAppend = themeStyleBatch.join('; ');
				// Check for semicolon in original
				const prefix = (preservedOriginalStyle && !preservedOriginalStyle.trim().endsWith(';')) ? '; ' : '';

				// Single write
				currentNode.setAttribute('style', `${preservedOriginalStyle}${prefix}${cssToAppend}`);
			}

			// Add children to stack
			let child = currentNode.lastElementChild;
			while (child) {
				stack.push(child as HTMLElement);
				child = child.previousElementSibling;
			}
		}
		return root;
	}
	removeClassName(root: HTMLElement) {
		const stack: HTMLElement[] = [root];
		while (stack.length > 0) {
			const node = stack.pop()!;
			const className = node.getAttribute('class');
			if (className) {
				const classes = className.split(' ');
				const validClasses: string[] = [];
				for (const c of classes) {
					if (isClassReserved(c)) {
						validClasses.push(c);
					}
				}
				if (validClasses.length > 0) {
					node.setAttribute('class', validClasses.join(' '));
				} else {
					node.removeAttribute('class');
				}
			}

			let element = node.lastElementChild;
			while (element) {
				stack.push(element as HTMLElement);
				element = element.previousElementSibling;
			}
		}
	}

	private appendStyleText(target: HTMLElement, prop: string, value: string) {
		// If the element already has this property set as !important in style attribute, don't override it
		const currentStyle = target.getAttribute('style') || '';
		const regex = new RegExp(`${prop}\\s*:\\s*[^;]*!important`, 'i');
		if (regex.test(currentStyle)) {
			return;
		}

		const prefix =
			target.style.cssText && !target.style.cssText.trim().endsWith(";")
				? "; "
				: "";
		target.style.cssText += `${prefix}${prop}: ${value};`;
	}
}
