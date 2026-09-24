/**
 * 设置页骨架：Tab 导航、共享状态与 sections 共用的基础设施。
 * 各分节的渲染逻辑按 createXxxSettings 的历史边界拆分在 ./sections/ 下。
 */

import {
	App,
	DropdownComponent,
	PluginSettingTab,
} from "obsidian";
import SmartMPPlugin from "src/main";
import { $t } from "src/lang/i18n";
import { PreviewPanel, VIEW_TYPE_SMART_MP_PREVIEW } from "../views/previewer";
import { SECTION_IDS } from "./section-ids";

import { renderLicenseSection } from "./sections/license-section";
import { renderWeChatSection } from "./sections/wechat-section";
import { renderGeneralSection } from "./sections/general-section";
import { renderAppearanceSection } from "./sections/appearance-section";
import { renderSecuritySection } from "./sections/security-section";
import { renderLLMSection } from "./sections/llm-section";
import { renderAiDrawSection } from "./sections/ai-draw-section";
import { renderAssistantSection } from "./sections/assistant-section";

export class SmartMPSettingTab extends PluginSettingTab {
	/** sections 以模块函数形式访问，故为 public */
	plugin: SmartMPPlugin;
	mpAccountContainer: HTMLElement;
	aiDrawAccountContainer: HTMLElement;
	mpAccountDropdown: DropdownComponent;
	aiDrawAccountDropdown: DropdownComponent;

	activeTab: 'general' | 'llm' = 'general';
	/** 折叠展开状态记忆；key 为分节稳定 id（SECTION_IDS）或实体 id（provider/助手） */
	expandedSections: Set<string> = new Set();
	expandedModelSections: Set<string> = new Set();
	initialAssistantPrompts: Record<string, string> = {};
	private isFirstDisplay = true;

	constructor(app: App, plugin: SmartMPPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		if (this.isFirstDisplay) {
			this.initialAssistantPrompts = {};
			this.plugin.settings.customAssistantList?.forEach(a => {
				this.initialAssistantPrompts[a.id] = a.prompt;
			});
			this.expandedSections.add(SECTION_IDS.license);
			this.isFirstDisplay = false;
		}

		containerEl.empty();

		// Tab Navigation
		const navContainer = containerEl.createDiv({ cls: 'smart-mp-settings-nav' });

		const generalTab = navContainer.createEl('div', { text: $t("render.general-tab"), cls: 'smart-mp-nav-tab' });
		generalTab.toggleClass('is-active', this.activeTab === 'general');

		generalTab.onClickEvent(() => {
			this.activeTab = 'general';
			this.display();
		});

		const llmTab = navContainer.createEl('div', { text: $t("render.llm-tab"), cls: 'smart-mp-nav-tab' });
		llmTab.toggleClass('is-active', this.activeTab === 'llm');

		llmTab.onClickEvent(() => {
			this.activeTab = 'llm';
			this.display();
		});

		// Render Content
		if (this.activeTab === 'general') {
			renderLicenseSection(this, containerEl); // License/Pro
			renderWeChatSection(this, containerEl); // Account
			renderGeneralSection(this, containerEl); // General
			renderAppearanceSection(this, containerEl); // Appearance
			renderSecuritySection(this, containerEl); // Advanced
		} else {
			renderLLMSection(this, containerEl);
			renderAiDrawSection(this, containerEl);
			renderAssistantSection(this, containerEl);
		}
	}

	// ==== sections 共用的基础设施 ====

	/**
	 * 折叠分节容器。stateKey 用于展开状态记忆——传入与文案解耦的稳定 id
	 * （SECTION_IDS），避免标题 i18n 化或改文案后状态失效。
	 */
	createCollapsibleFrame(
		container: HTMLElement,
		title: string,
		isOpen: boolean = false,
		groupName: string = 'ww-main-sections',
		stateKey?: string
	): HTMLElement {
		const details = container.createEl('details', { cls: "smart-mp-setting-frame" });
		if (groupName) details.setAttribute('name', groupName);
		const key = stateKey ?? title;
		if (isOpen || this.expandedSections.has(key)) {
			details.setAttribute('open', '');
		}

		details.ontoggle = () => {
			if (details.open) {
				this.expandedSections.add(key);
			} else {
				this.expandedSections.delete(key);
			}
		};

		const summary = details.createEl('summary', { cls: 'smart-mp-frame-summary' });
		summary.setText(title);

		return details.createDiv();
	}

	/**
	 * 对所有打开的预览视图执行操作（renderDraft / refreshHRStyle / rebuildDebounce）。
	 * 此前同样的 for-leaf 循环在设置代码里复制了 8 份，且用 as any 绕过类型。
	 */
	applyToPreviewers(apply: (view: PreviewPanel) => void): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SMART_MP_PREVIEW)) {
			if (leaf.view instanceof PreviewPanel) {
				apply(leaf.view);
			}
		}
	}

	/**
	 * 重建下拉选项。此前 4 处直接操作 selectEl.options.length = 0
	 * 绕过 DropdownComponent API 重建。
	 */
	rebuildDropdown(
		dropdown: DropdownComponent,
		options: string[],
		value: string
	): void {
		dropdown.selectEl.empty();
		options.forEach(o => dropdown.addOption(o, o));
		dropdown.setValue(value);
	}
}
