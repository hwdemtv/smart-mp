import { Notice } from "obsidian";
import { $t } from "src/lang/i18n";
import { Logger } from "../utils/logger";
import type SmartMPPlugin from "../main";

export class AccountService {
	private plugin: SmartMPPlugin;

	constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
	}

	async TestAccessToken(accountName: string) {
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
