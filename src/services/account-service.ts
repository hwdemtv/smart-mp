import { Notice } from "obsidian";
import { $t } from "src/lang/i18n";
import { Logger } from "../utils/logger";
import type SmartMPPlugin from "../main";

export class AccountService {
	private plugin: SmartMPPlugin;
	// [Fix] token 刷新的 in-flight 去重：并行上传多张图会同时触发
	// refreshAccessToken，而微信每次签发新 token 会使旧 token 失效，
	// 并发刷新会互相顶掉（40001）。相同账户的并发请求应共享同一次刷新
	private refreshInFlight: Map<string, Promise<string | boolean | null>> = new Map();

	constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
	}

	async TestAccessToken(accountName: string) {
		await this.plugin.ensureDecrypted();
		if (this.plugin.settings.useCenterToken) {
			const account = this.getMPAccountByName(accountName);
			if (account === undefined) return false;
			return this.plugin.wechatClient.requestToken(account.appId, account.appSecret);
		} else {
			const account = this.getMPAccountByName(accountName);
			if (account === undefined) {
				new Notice($t("main.no-wechat-mp-account-selected"));
				return false;
			}
			const token = await this.plugin.wechatClient.getAccessToken(
				account.appId,
				account.appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in ?? 7200
				);
				return token.access_token;
			}
		}
		return false;
	}

	async refreshAccessToken(accountName: string | undefined): Promise<string | boolean | null> {
		const key = accountName || "";
		const inFlight = this.refreshInFlight.get(key);
		if (inFlight) return inFlight;

		const task = this.doRefreshAccessToken(accountName).finally(() => {
			this.refreshInFlight.delete(key);
		});
		this.refreshInFlight.set(key, task);
		return task;
	}

	private async doRefreshAccessToken(accountName: string | undefined): Promise<string | boolean | null> {
		await this.plugin.ensureDecrypted();
		if (this.plugin.settings.useCenterToken) {
			const account = this.getMPAccountByName(accountName);
			if (account === undefined) return false;
			return this.plugin.wechatClient.requestToken(account.appId, account.appSecret);
		}
		if (accountName === undefined) {
			return false;
		}
		const account = this.getMPAccountByName(accountName);
		if (account === undefined) {
			new Notice($t("main.no-wechat-mp-account-selected"));
			return false;
		}
		const { appId, appSecret } = account;
		if (
			appId === undefined ||
			appSecret === undefined ||
			!appId ||
			!appSecret
		) {
			new Notice($t("main.please-check-you-appid-and-appsecret"));
			return false;
		}
		const {
			access_token: accessToken,
			expires_in: expiresIn,
			lastRefreshTime,
		} = account;
		if (accessToken === undefined || accessToken === "") {
			const token = await this.plugin.wechatClient.getAccessToken(
				appId,
				appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in ?? 7200
				);
				return token.access_token;
			}
		} else if (
			(lastRefreshTime || 0) + (expiresIn || 0) * 1000 <
			new Date().getTime()
		) {
			const token = await this.plugin.wechatClient.getAccessToken(
				appId,
				appSecret
			);
			if (token) {
				this.setAccessToken(
					accountName,
					token.access_token,
					token.expires_in ?? 7200
				);
				return token.access_token;
			}
		} else {
			return accessToken;
		}
		return false;
	}

	getMPAccountByName(accountName: string | undefined) {
		// Note: This is synchronous, but settings might not be decrypted yet.
		// However, most callers of this are async or can wait.
		// For UI display, encrypted strings are fine (masked).
		return this.plugin.settings.mpAccounts.find(
			(account) => account.accountName === accountName
		);
	}

	public getDrawAIAccount(accountName: string | undefined = undefined) {
		if (accountName === undefined) {
			accountName = this.plugin.settings.selectedDrawAccount;
		}
		return this.plugin.settings.drawAccounts.find(
			(account) =>
				account.accountName === this.plugin.settings.selectedDrawAccount
		);
	}

	getSelectedMPAccount() {
		return this.getMPAccountByName(this.plugin.settings.selectedMPAccount);
	}

	setAccessToken(
		accountName: string,
		accessToken: string,
		expires_in: number
	) {
		const account = this.getMPAccountByName(accountName);
		if (account === undefined) {
			return;
		}
		account.access_token = accessToken;
		account.lastRefreshTime = new Date().getTime();
		account.expires_in = expires_in;
		void this.plugin.saveSettings();
	}
}
