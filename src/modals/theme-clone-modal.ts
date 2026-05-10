import { App, Modal, Setting, Notice } from "obsidian";
import SmartMPPlugin from "../main";
import { ThemeExtractor } from "../theme/theme-extractor";
import { ThemeManager } from "../theme/theme-manager";
import { $t } from "../lang/i18n";

export class ThemeCloneModal extends Modal {
    plugin: SmartMPPlugin;
    url: string = "";
    themeName: string = "";
    isCloning: boolean = false;

    constructor(app: App, plugin: SmartMPPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: $t("settings.clone-theme-from-url") || "从微信文章克隆主题" });
        contentEl.createEl("p", {
            text: $t("settings.clone-theme-desc") || "输入一篇微信公众号文章链接，插件将自动提取其配色、字体等样式信息并生成新主题。",
            cls: "smart-mp-setting-desc"
        });

        new Setting(contentEl)
            .setName($t("settings.clone-theme-url") || "文章链接")
            .setDesc($t("settings.clone-theme-url-desc") || "请粘贴微信公众号文章的 URL")
            .addText((text) =>
                text
                    .setPlaceholder("https://mp.weixin.qq.com/s/...")
                    .onChange((value) => {
                        this.url = value;
                    })
            );

        new Setting(contentEl)
            .setName($t("settings.clone-theme-name") || "新主题名称")
            .setDesc($t("settings.clone-theme-name-desc") || "为克隆的主题起个名字")
            .addText((text) =>
                text
                    .setPlaceholder($t("settings.clone-theme-name-placeholder"))
                    .onChange((value) => {
                        this.themeName = value;
                    })
            );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText($t("settings.clone-theme-btn") || "开始克隆")
                    .setCta()
                    .onClick(async () => {
                        if (this.isCloning) return;
                        if (!this.url) {
                            new Notice($t("notice.theme.clone-invalid-url") ?? "请输入有效的微信文章链接");
                            return;
                        }
                        if (!this.themeName) {
                            new Notice($t("notice.theme.clone-name-required") ?? "请输入主题名称");
                            return;
                        }

                        this.isCloning = true;
                        btn.setButtonText($t("settings.clone-theme-extracting"));
                        btn.setDisabled(true);

                        try {
                            new Notice($t("notice.theme.clone-analyzing") ?? "正在分析文章样式，这可能需要几秒钟...");
                            const extractor = new ThemeExtractor();
                            const css = await extractor.extractFromUrl(this.url);

                            await ThemeManager.getInstance(this.plugin).saveTheme(this.themeName, css);

                            new Notice(`主题 "${this.themeName}" 克隆成功！已自动添加到主题列表。`);
                            this.close();

                            // 尝试自动应用新主题（可选，或仅刷新列表）
                            const folder = this.plugin.settings.css_styles_folder.replace(/\/+$/, '');
                            this.plugin.settings.custom_theme = `${folder}/${this.themeName}.md`;
                            await this.plugin.saveSettings();

                        } catch (error) {
                            console.error("Clone failed:", error);
                            new Notice(($t("notice.theme.clone-failed") ?? "克隆失败: {0}").replace("{0}", error instanceof Error ? error.message : String(error)));
                        } finally {
                            this.isCloning = false;
                            btn.setButtonText($t("settings.clone-theme-btn"));
                            btn.setDisabled(false);
                        }
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
