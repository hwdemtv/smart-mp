import { App, Modal } from "obsidian";
import { $t } from "src/lang/i18n";

export class PromptModal extends Modal {
	private resolve: (value: string | null) => void;
	private inputEl: HTMLInputElement;

	constructor(
		app: App,
		private message: string,
		private defaultValue: string = '',
		resolve: (value: string | null) => void
	) {
		super(app);
		this.resolve = resolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('p', { text: this.message });

		this.inputEl = contentEl.createEl('input', {
			type: 'text',
			value: this.defaultValue
		});

		const buttonContainer = contentEl.createDiv('modal-button-container');
		buttonContainer.createEl('button', { text: $t('modals.ok') })
			.addEventListener('click', () => {
				this.resolve(this.inputEl.value);
				this.close();
			});

		buttonContainer.createEl('button', { text: $t('modals.cancel') })
			.addEventListener('click', () => {
				this.resolve(null);
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
