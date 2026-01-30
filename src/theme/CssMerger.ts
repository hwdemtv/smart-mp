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
				} else {
					console.warn(`Variable ${fullKey} not found and no fallback provided`);
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
				// Split multi-selectors (e.g., "h1::before, h1::after") to handle each pseudo-element correctly
				rule.selectors.forEach(selector => {
					let selectedRule = rules.get(selector);
					if (!selectedRule) {
						selectedRule = new Map();
						rules.set(selector, selectedRule);
					}
					rule.walkDecls(decl => {
						const baseDecl = selectedRule.get(decl.prop);
						if (baseDecl === undefined || !baseDecl.important || decl.important) {
							selectedRule.set(decl.prop, decl);
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
						// Validate variable name format
						if (!/^[a-zA-Z0-9-]+$/.test(decl.prop.substring(2))) {
							console.warn(`[CssMerger] Potentially invalid variable name format: ${decl.prop}`);
						}

						// Validation passed
						// Logic Update: Always set/overwrite the variable to support CSS cascading (Last wins)
						// This allows Custom CSS (loaded later) to override Base CSS.
						vars.set(decl.prop, decl.value);
						// console.log(`[CssMerger] Set variable: ${decl.prop} = ${decl.value}`);
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

			// Resolve variables in existing inline styles first
			const existingStyle = currentNode.getAttribute('style');
			if (existingStyle && existingStyle.includes('var(')) {
				const resolvedStyle = this.resolveCssVars(existingStyle, this.vars);
				currentNode.setAttribute('style', resolvedStyle);
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

			candidates.forEach((selector) => {
				const rule = this.rules.get(selector);
				if (!rule) return;

				const { baseSelector, pseudo } = this.normalizeSelector(selector);
				try {
					if (currentNode.matches(baseSelector)) {
						let target = currentNode;
						if (pseudo) {
							const displayDecl = rule.get('display');
							const contentDecl = rule.get('content');

							// Correctly handle display: none or content: none to HIDE base pseudo-elements
							if (displayDecl?.value === 'none' || contentDecl?.value === 'none') {
								const attr = `data-smart-mp-pseudo-${pseudo}`;
								const existing = currentNode.querySelector(`[${attr}]`);
								if (existing) existing.remove();
								return; // Break out of this specific rule application
							}

							target = this.ensurePseudoElement(currentNode, pseudo, contentDecl?.value);
						}
						rule.forEach((decl, prop) => {
							if (prop === 'content') {
								return;
							}
							let value = this.resolveCssVars(decl.value, this.vars);

							// [Security] Prevent XSS in CSS values
							const lowerValue = value.toLowerCase();
							if (lowerValue.includes('javascript:') || lowerValue.includes('vbscript:') || (lowerValue.includes('url(') && lowerValue.includes('data:') && !lowerValue.includes('data:image/'))) {
								return;
							}

							const fullValue = decl.important ? `${value} !important` : value;
							this.appendStyleText(target, prop, fullValue);
						})
					}
				} catch (error) {
					// safe ignore
				}
			})

			// Add children to stack
			// Iterate backwards so they are popped in order
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
