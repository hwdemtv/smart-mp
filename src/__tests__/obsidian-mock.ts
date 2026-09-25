export const requestUrl = () => Promise.resolve({});
export class Notice {
    constructor(public message: string, public timeout?: number) {}
}
export const debounce = (fn: Function) => fn;
export const TFile = class {};
export const Plugin = class {
    loadData() { return Promise.resolve({}); }
    saveData() { return Promise.resolve(); }
};
export const ItemView = class {
    constructor(public leaf: any) {}
};
export const MarkdownView = class {};
export const WorkspaceLeaf = class {};
export const Component = class {};
export const Editor = class {};
export const sanitizeHTMLToDom = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
};

// Obsidian 全局 DOM 辅助函数（渲染器/预览器用到）
export function createEl(tag: string, options?: any): HTMLElement {
    const el = document.createElement(tag);
    if (options?.cls) el.className = options.cls;
    if (options?.text) el.textContent = options.text;
    if (options?.attr) for (const [k, v] of Object.entries(options.attr)) el.setAttribute(k, String(v));
    return el;
}
export function createDiv(options?: any): HTMLElement {
    return createEl('div', options);
}
export function createSpan(options?: any): HTMLElement {
    return createEl('span', options);
}
export class MarkdownRenderer {
    static renderMarkdown() { return Promise.resolve(); }
}
export class Modal {
    constructor(public app?: any) {}
    open() {}
    close() {}
}
export class Setting {
    constructor(public containerEl?: any) {}
}
export class FuzzySuggestModal {
    constructor(public app?: any) {}
}
export class SuggestModal {
    constructor(public app?: any) {}
}
export class PluginSettingTab {
    constructor(public app?: any, public plugin?: any) {}
}
export class MarkdownRendererComponent {
}

// Obsidian 会给 HTMLElement 原型挂载扩展方法；jsdom 环境下补齐（幂等）。
// 注意：不要在此 declare global 增强 HTMLElement —— obsidian.d.ts 已提供
// createEl<K> 等全局类型，重复声明签名冲突会破坏 tsc 的 DOM 继承链解析。
if (typeof HTMLElement !== 'undefined') {
    const proto = HTMLElement.prototype as any;
    if (!proto.empty) proto.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); return this; };
    if (!proto.createEl) proto.createEl = function (tag: string, options?: any) {
        const el = document.createElement(tag);
        if (options?.cls) el.className = options.cls;
        if (options?.text) el.textContent = options.text;
        if (options?.attr) for (const [k, v] of Object.entries(options.attr)) el.setAttribute(k, String(v));
        this.appendChild(el);
        return el;
    };
    if (!proto.createSpan) proto.createSpan = function (options?: any) { return this.createEl('span', options); };
    if (!proto.createDiv) proto.createDiv = function (options?: any) { return this.createEl('div', options); };
    if (!proto.addClass) proto.addClass = function (...cls: string[]) { this.classList.add(...cls); return this; };
    if (!proto.removeClass) proto.removeClass = function (...cls: string[]) { this.classList.remove(...cls); return this; };
    if (!proto.toggleClass) proto.toggleClass = function (cls: string, value: boolean) { this.classList.toggle(cls, value); return this; };
    if (!proto.setText) proto.setText = function (text: string) { this.textContent = text; return this; };
}
