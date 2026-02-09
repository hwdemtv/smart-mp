export class Spinner {
	private spinnerEl: HTMLElement;
	private spinnerText: HTMLDivElement;
	constructor(spinnerEl: HTMLElement) {
		this.spinnerEl = spinnerEl;
		this.spinnerEl.addClass("spinner-container");
		const dots = this.spinnerEl.createDiv({
			cls: "spinner-dots",
		});
		for (let i = 0; i < 6; i++) {
			const dot = dots.createDiv({
				cls: `spinner-dot spinner-dot${i + 1}`,
			});
			dot.setCssProps({ 'animation-delay': `${i * 0.3}s` });
		}
		this.spinnerText = this.spinnerEl.createDiv({
			cls: "spinner-text"
		});
	}
	showSpinner(text: string = "") {
		this.spinnerEl.removeClass("smart-mp-spinner-hidden");
		this.spinnerEl.addClass("smart-mp-spinner-visible");
		this.spinnerText.setText(text);
	}
	isSpinning() {
		return this.spinnerEl.hasClass("smart-mp-spinner-visible");
	}

	hideSpinner() {
		this.spinnerEl.removeClass("smart-mp-spinner-visible");
		this.spinnerEl.addClass("smart-mp-spinner-hidden");
	}
	unload() {
		this.spinnerEl.remove();
	}
}
