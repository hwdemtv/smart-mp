/**
 * Manipulate WeChat API
 * credits to Sun Booshi, and another author of wechat public platform.
 */

import {
	getBlobArrayBuffer,
	Notice,
	requestUrl,
	RequestUrlParam,
} from "obsidian";
import { LocalDraftItem } from "src/assets/draft-manager";
import SmartMPPlugin from "src/main";

import { getErrorMessage } from "./error-code";
import { $t } from "src/lang/i18n";
import { MSG_TYPE } from "src/utils/message-service";
import { SmartMPSetting } from "src/settings/smart-mp-setting";
import Logger from "src/utils/logger";
import { CryptoHelper } from "src/utils/crypto-helper";

// WeChat API constants
const WECHAT_LIMIT_IMAGE = 10 * 1024 * 1024; // 10MB
const WECHAT_LIMIT_VOICE = 2 * 1024 * 1024;  // 2MB
const WECHAT_LIMIT_VIDEO = 10 * 1024 * 1024; // 10MB

// 中心令牌服务器配置 (微信 API 反代)
const CENTER_TOKEN_SERVERS = [
	"https://wxapi.hwdemtv.com/cgi-bin",
	"https://api.weixin.qq.com/cgi-bin" // fallback to official
];

// 中心令牌缓存（按 appId 区分：多账户切换时 token 不能共用）
interface TokenCache {
	token: string;
	expiresAt: number;
}

export interface WechatBaseResponse {
	errcode?: number;
	errmsg?: string;
}

export interface AccessTokenResponse extends WechatBaseResponse {
	access_token?: string;
	expires_in?: number;
}

export interface UploadMaterialResponse extends WechatBaseResponse {
	url?: string;
	media_id?: string;
}

export interface BatchMaterialResponse extends WechatBaseResponse {
	total_count: number;
	item_count: number;
	item: Array<any>; // 暂时保留 any，后续细化
}

export class WechatClient {
	private static instance: WechatClient;
	private plugin: SmartMPPlugin;
	readonly baseUrl: string = "https://api.weixin.qq.com/cgi-bin";
	private centerTokenCache: Map<string, TokenCache> = new Map();

	private constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
	}
	public static getInstance(plugin: SmartMPPlugin): WechatClient {
		if (!WechatClient.instance) {
			WechatClient.instance = new WechatClient(plugin);
		}
		return WechatClient.instance;
	}

	public static onPluginUnload() {
		this.instance = undefined as any;
	}

	/**
	 * 从中心令牌服务器获取 access_token
	 * 支持多服务器容灾
	 */
	public async requestToken(appId: string, appSecret: string): Promise<string | null> {
		// 检查缓存是否有效 (提前 5 分钟刷新)
		// [Fix] 缓存按 appId 区分：多账户模式下切换账户后，
		// 此前会继续用 A 账户的 token 调 B 账户 API（必然 40001）
		const cached = this.centerTokenCache.get(appId);
		if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
			Logger.debug('WechatClient', 'Using cached center token');
			return cached.token;
		}

		// 尝试从反代服务器获取 token
		for (const serverUrl of CENTER_TOKEN_SERVERS) {
			try {
				Logger.debug('WechatClient', `Requesting token from ${serverUrl}`);

				const url = `${serverUrl}/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
				const req: RequestUrlParam = {
					url: url,
					method: "GET",
					headers: this.getHeaders(),
				};

				const resp = await requestUrl(req);
				const { access_token, expires_in, errcode, errmsg } = resp.json as AccessTokenResponse;

				if (access_token) {
					// 缓存 token
					this.centerTokenCache.set(appId, {
						token: access_token,
						expiresAt: Date.now() + (Number(expires_in) || 7200) * 1000
					});

					Logger.debug('WechatClient', `Center token obtained, expires in ${expires_in}s`);
					return access_token;
				} else {
					Logger.error('WechatClient', `Token request failed: ${errcode} - ${errmsg}`);
				}
			} catch (error) {
				Logger.error('WechatClient', `Failed to request token from ${serverUrl}:`, error);
			}
		}

		// 所有服务器都失败
		new Notice($t("wechat-api.center-token-request-failed"));
		return null;
	}

	/**
	 * 清除中心令牌缓存
	 * @param appId 指定 appId 时只清除该账户；不传则全部清空
	 */
	public clearCenterTokenCache(appId?: string): void {
		if (appId) {
			this.centerTokenCache.delete(appId);
		} else {
			this.centerTokenCache.clear();
		}
	}

	/**
	 * 使账户的 access_token 失效（用于 40001/42001 后强制刷新）
	 */
	public invalidateToken(accountName?: string): void {
		const account = this.plugin.getMPAccountByName(
			accountName || this.plugin.settings.selectedMPAccount
		);
		if (account) {
			account.access_token = "";
			account.lastRefreshTime = 0;
			if (account.appId) {
				this.clearCenterTokenCache(account.appId);
			}
		}
	}

	/**
	 * 获取当前使用的 API baseUrl
	 * 如果启用了中心令牌，使用反代服务器
	 */
	public getApiBaseUrl(): string {
		if (this.plugin.settings.useCenterToken) {
			return CENTER_TOKEN_SERVERS[0]; // 使用反代服务器
		}
		return this.baseUrl;
	}

	private getHeaders() {
		return {
			"Accept-Encoding": "gzip, deflate, br",
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
		};
	}

	/**
	 * 统一微信 API 调用助手（返回完整响应，包含错误码）
	 * 用于需要根据特定错误码做重试逻辑的场景
	 */
	private async callWechatApiRaw<T extends WechatBaseResponse>(
		endpoint: string,
		method: "GET" | "POST" = "GET",
		body?: any,
		accountName?: string,
		isRetry = false
	): Promise<T | false> {
		const accessToken = await this.plugin.refreshAccessToken(
			accountName || this.plugin.settings.selectedMPAccount
		);
		if (!accessToken) {
			return false;
		}
		const accessTokenValue = String(accessToken);
		const url = `${this.getApiBaseUrl()}${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${accessTokenValue}`;

		try {
			const res = await requestUrl({
				url: url,
				method: method,
				headers: this.getHeaders(),
				body: body ? JSON.stringify(body) : undefined,
				throw: false,
			});

			const resData = res.json as T;
			if (resData.errcode !== undefined && resData.errcode !== 0) {
				// 处理令牌过期或无效 (40001, 42001)
				if ((resData.errcode === 40001 || resData.errcode === 42001) && !isRetry) {
					Logger.warn('WechatClient', `Token invalid (${resData.errcode}), invalidating cached token and retrying...`);
					// [Fix] 必须先作废本地缓存的失效 token：此前只是重调一次，
					// refreshAccessToken 命中本地未过期缓存又返回同一个 token，重试形同虚设
					this.invalidateToken(accountName);
					return this.callWechatApiRaw(endpoint, method, body, accountName, true);
				}

				Logger.error('WechatClient', `API Error: ${resData.errcode} - ${resData.errmsg}`, { endpoint });
				// 不自动弹 Notice，让调用方决定如何处理
				return resData; // 返回完整响应，包含错误码
			}
			return resData;
		} catch (error) {
			Logger.error('WechatClient', `Request failed: ${endpoint}`, error);
			return false;
		}
	}

	/**
	 * 统一微信 API 调用助手
	 */
	private async callWechatApi<T extends WechatBaseResponse>(
		endpoint: string,
		method: "GET" | "POST" = "GET",
		body?: any,
		accountName?: string,
		isRetry = false
	): Promise<T | false> {
		const accessToken = await this.plugin.refreshAccessToken(
			accountName || this.plugin.settings.selectedMPAccount
		);
		if (!accessToken) {
			return false;
		}
		const accessTokenValue = String(accessToken);
		const url = `${this.getApiBaseUrl()}${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${accessTokenValue}`;

		try {
			const res = await requestUrl({
				url: url,
				method: method,
				headers: this.getHeaders(),
				body: body ? JSON.stringify(body) : undefined,
				throw: false,
			});

			const resData = res.json as T;
			if (resData.errcode !== undefined && resData.errcode !== 0) {
				// 处理令牌过期或无效 (40001, 42001)
				if ((resData.errcode === 40001 || resData.errcode === 42001) && !isRetry) {
					Logger.warn('WechatClient', `Token invalid (${resData.errcode}), invalidating cached token and retrying...`);
					// [Fix] 同 callWechatApiRaw：先作废失效 token，重试才会真正重新获取
					this.invalidateToken(accountName);
					return this.callWechatApi(endpoint, method, body, accountName, true);
				}

				Logger.error('WechatClient', `API Error: ${resData.errcode} - ${resData.errmsg}`, { endpoint });
				new Notice(`${$t("wechat-api.error") || '微信接口错误'}: ${getErrorMessage(resData.errcode)}`, 0);
				return false;
			}
			return resData;
		} catch (error) {
			Logger.error('WechatClient', `Request failed: ${endpoint}`, error);
			return false;
		}
	}
	public async getAccessToken(appId: string, appSecret: string) {
		const url = `${this.getApiBaseUrl()}/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
		const req: RequestUrlParam = {
			url: url,
			method: "GET",
			headers: this.getHeaders(),
		};
		const resp = await requestUrl(req);

		const { access_token, errcode, expires_in } = resp.json as AccessTokenResponse;

		if (access_token === undefined) {
			new Notice(getErrorMessage(errcode), 0);
			return false;
		}
		return { access_token, expires_in };
	}
	public async getBatchMaterial(
		accountName: string | undefined,
		type: string,
		offset: number = 0,
		count: number = 10
	) {
		return this.callWechatApi<BatchMaterialResponse>(
			"/material/batchget_material",
			"POST",
			{ type, offset, count },
			accountName
		);
	}
	/**
	 * 格式化文章内容（添加水印、截断摘要、转义 HTML 等）
	 */
	private async formatArticle(article: { title: string; content: string; digest?: string | null }, localDraft: LocalDraftItem, isLast = true) {
		let digest = article.digest || "";
		digest = digest.replace(/<[^>]*>?/gm, '');
		if (digest.length > 120) {
			digest = digest.substring(0, 120) + "...";
		}

		return {
			title: article.title,
			content: article.content,
			digest: digest,
			thumb_media_id: localDraft.thumb_media_id,
			...(localDraft.content_source_url && {
				content_source_url: localDraft.content_source_url,
			}),
			need_open_comment: localDraft.need_open_comment !== undefined ? localDraft.need_open_comment : 1,
			only_fans_can_comment: localDraft.only_fans_can_comment !== undefined ? localDraft.only_fans_can_comment : 0,
			...(localDraft.author && { author: localDraft.author }),
		};
	}

	/**
	 * 发送单篇文章到草稿箱
	 * @param localDraft 本地草稿信息
	 * @param data 文章 HTML 内容
	 * @param onThumbMediaIdExpired 当 thumb_media_id 失效时的回调，返回新的 thumb_media_id
	 */
	public async sendArticleToDraftBox(
		localDraft: LocalDraftItem,
		data: string,
		onThumbMediaIdExpired?: () => Promise<string | undefined>
	) {
		Logger.debug("sendArticleToDraftBox", `Sending draft: ${localDraft.title}`);
		
		const formattedArticle = await this.formatArticle(
			{ title: localDraft.title, content: data, digest: localDraft.digest },
			localDraft
		);

		const resData = await this.callWechatApiRaw<UploadMaterialResponse>(
			"/draft/add",
			"POST",
			{ articles: [formattedArticle] }
		);

		// 处理 thumb_media_id 失效 (40007)
		if (resData && resData.errcode === 40007 && onThumbMediaIdExpired) {
			Logger.warn("sendArticleToDraftBox", "thumb_media_id invalid (40007), re-uploading cover image...");
			new Notice("封面素材已失效，正在重新上传...", 3000);
			
			const newThumbMediaId = await onThumbMediaIdExpired();
			if (newThumbMediaId) {
				localDraft.thumb_media_id = newThumbMediaId;
				const retryArticle = await this.formatArticle(
					{ title: localDraft.title, content: data, digest: localDraft.digest },
					localDraft
				);
				const retryResData = await this.callWechatApi<UploadMaterialResponse>(
					"/draft/add",
					"POST",
					{ articles: [retryArticle] }
				);
				if (!retryResData) return false;
				new Notice($t("wechat-api.send-article-to-draft-box-successfully"));
				return retryResData.media_id;
			}
		}

		if (!resData || (resData.errcode !== undefined && resData.errcode !== 0)) return false;

		new Notice($t("wechat-api.send-article-to-draft-box-successfully"));
		return resData.media_id;
	}

	/**
	 * 发送多图文草稿（一个草稿包含多篇文章）
	 * @param localDraft 基础草稿配置
	 * @param articles 文章内容数组，每个元素包含 { title, content, digest? }
	 */
	/**
	 * 发送多图文草稿
	 */
	public async sendMultiArticlesToDraftBox(
		localDraft: LocalDraftItem,
		articles: Array<{ title: string; content: string; digest?: string }>
	) {
		Logger.debug("sendMultiArticlesToDraftBox", `Sending ${articles.length} articles to draft box`);

		const formattedArticles = await Promise.all(
			articles.map((article, index) => 
				this.formatArticle(article, localDraft, index === articles.length - 1)
			)
		);

		const resData = await this.callWechatApi<UploadMaterialResponse>(
			"/draft/add",
			"POST",
			{ articles: formattedArticles }
		);

		if (!resData) return false;

		new Notice($t("wechat-api.send-article-to-draft-box-successfully"));
		return resData.media_id;
	}


	/**
	 * 上传永久素材（支持图片、视频、语音）
	 */
	public async uploadMaterial(data: Blob, filename: string, type?: string) {
		// 1. 校验文件大小
		const sizeLimit = type === "video" ? WECHAT_LIMIT_VIDEO : (type === "voice" ? WECHAT_LIMIT_VOICE : WECHAT_LIMIT_IMAGE);
		if (data.size > sizeLimit) {
			const sizeKey = type === "video" ? "wechat-api.video-size-exceeds-10m" : type === "voice" ? "wechat-api.voice-size-exceeds-2m" : "wechat-api.image-size-exceeds-10m";
			new Notice($t(sizeKey) || "文件大小超出限制");
			return false;
		}

		// 2. 获取 Access Token
		const accessToken = await this.plugin.refreshAccessToken(this.plugin.settings.selectedMPAccount);
		if (!accessToken) return false;
		const accessTokenValue = String(accessToken);

		// 3. 确定上传 URL (如果是 type 为 undefined 且文件较大，默认为 image)
		let url = `${this.getApiBaseUrl()}/media/uploadimg?access_token=${accessTokenValue}`;
		if (type === undefined && data.size >= 1024 * 1024) type = "image";
		if (type !== undefined) {
			url = `${this.getApiBaseUrl()}/material/add_material?access_token=${accessTokenValue}&type=${type}`;
		}

		// 4. 构建 Multipart Body
		const boundary = "smartmpBoundary" + Math.random().toString(36).substring(2, 10);
		const bodyParts: (string | Uint8Array)[] = [];
		const encoder = new TextEncoder();

		// 添加 media 部分
		bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
		const fileBuffer = await getBlobArrayBuffer(data);
		bodyParts.push(new Uint8Array(fileBuffer));
		bodyParts.push("\r\n");

		// 视频素材需要额外的 description
		if (type === "video") {
			const description = JSON.stringify({ title: filename, introduction: "Uploaded via SmartMP" });
			bodyParts.push(`--${boundary}\r\nContent-Disposition: form-data; name="description"\r\nContent-Type: application/json\r\n\r\n${description}\r\n`);
		}
		bodyParts.push(`--${boundary}--\r\n`);

		// 合并全部二进制数据块
		const body: Uint8Array = bodyParts
			.map((part) => (typeof part === "string" ? encoder.encode(part) : part))
			.reduce((acc, part) => {
				const combined = new Uint8Array(acc.length + part.length);
				combined.set(acc);
				combined.set(part, acc.length);
				return combined;
			}, new Uint8Array(0));

		try {
			this.plugin.showSpinner($t('wechat-api.uploading-material-type', [type ? type : 'unknown']));
			const response = await requestUrl({
				url,
				method: "POST",
				headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
				body: body.buffer as ArrayBuffer,
			});
			this.plugin.hideSpinner();

			const resData = response.json;
			if (resData.errcode === undefined || resData.errcode == 0) {
				this.plugin.messageService.sendMessage((type + "-item-updated") as MSG_TYPE, resData);
			} else {
				new Notice(`${$t("wechat-api.error")}: ${getErrorMessage(resData.errcode)}`, 0);
				return false;
			}

			return {
				url: resData.url || "",
				media_id: resData.media_id || "",
				errcode: resData.errcode || 0,
				errmsg: resData.errmsg || "",
			};
		} catch (error) {
			this.plugin.hideSpinner();
			Logger.error('uploadMaterial', "上传素材时出错:", error);
			throw error;
		}
	}
	public async getMaterialList(
		accountName: string,
		type: string,
		offset: number = 0,
		count: number = 20
	) {
		return this.callWechatApi<BatchMaterialResponse>(
			"/material/batchget_material",
			"POST",
			{ type, offset, count },
			accountName
		);
	}
	public async getMaterialById(media_id: string, accountName?: string) {
		return this.callWechatApi<any>(
			"/material/get_material",
			"POST",
			{ media_id },
			accountName
		);
	}
	public async getBatchDraftList(
		accountName: string | undefined,
		offset: number = 0,
		count: number = 20
	) {
		return this.callWechatApi<any>(
			"/draft/batchget",
			"POST",
			{ offset, count, no_content: false },
			accountName
		);
	}

	public async getMaterialCounts(accountName: string) {
		return this.callWechatApi<any>(
			"/material/get_materialcount",
			"GET",
			undefined,
			accountName
		);
	}
	public async getDraftCount(accountName: string) {
		const res = await this.callWechatApi<any>(
			"/draft/count",
			"GET",
			undefined,
			accountName
		);
		return res ? res.total_count : 0;
	}
	public async getDraftById(accountName: string, mediaId: string) {
		const res = await this.callWechatApi<any>(
			"/draft/get",
			"POST",
			{ media_id: mediaId },
			accountName
		);
		return res ? res.news_item : false;
	}
	public async publishDraft(mediaId: string, accountName: string = "") {
		const res = await this.callWechatApi<any>(
			"/freepublish/submit",
			"POST",
			{ media_id: mediaId },
			accountName
		);
		return res ? res.publish_id : false;
	}
	public async deleteMedia(mediaId: string, accountName: string = "") {
		return this.callWechatApi<WechatBaseResponse>(
			"/material/del_material",
			"POST",
			{ media_id: mediaId },
			accountName
		);
	}
	public async deleteDraft(mediaId: string, accountName: string = "") {
		return this.callWechatApi<WechatBaseResponse>(
			"/draft/delete",
			"POST",
			{ media_id: mediaId },
			accountName
		);
	}
	public async massSendAll(media_id: string, accountName: string = "") {
		return this.callWechatApi<any>(
			"/message/mass/sendall",
			"POST",
			{ filter: { is_to_all: true }, mpnews: { media_id }, msgtype: "mpnews" },
			accountName || ""
		);
	}

	public async senfForPreview(media_id: string, wxname: string = "", accountName: string = "") {
		return this.callWechatApi<any>(
			"/message/mass/preview",
			"POST",
			{ towxname: wxname || this.plugin.settings.previewer_wxname || "", mpnews: { media_id }, msgtype: "mpnews" },
			accountName || ""
		);
	}

	/**
	 * [新增] 更新已有草稿（/draft/update）
	 * 解决改稿工作流断点：此前每次修改都新建草稿，草稿箱堆积重复项。
	 * 注意微信该接口的 articles 是单个文章对象（非数组）。
	 */
	public async updateDraft(
		mediaId: string,
		localDraft: LocalDraftItem,
		data: string,
		onThumbMediaIdExpired?: () => Promise<string | undefined>
	): Promise<string | false> {
		Logger.debug("updateDraft", `Updating draft: ${mediaId} - ${localDraft.title}`);

		const buildArticle = async () => this.formatArticle(
			{ title: localDraft.title, content: data, digest: localDraft.digest },
			localDraft
		);

		let resData = await this.callWechatApiRaw<WechatBaseResponse>(
			"/draft/update",
			"POST",
			{ media_id: mediaId, index: 0, articles: await buildArticle() }
		);

		// 封面素材失效（40007）：重传封面后重试一次
		if (resData && resData.errcode === 40007 && onThumbMediaIdExpired) {
			Logger.warn("updateDraft", "thumb_media_id invalid (40007), re-uploading cover...");
			const newThumbMediaId = await onThumbMediaIdExpired();
			if (newThumbMediaId) {
				localDraft.thumb_media_id = newThumbMediaId;
				resData = await this.callWechatApiRaw<WechatBaseResponse>(
					"/draft/update",
					"POST",
					{ media_id: mediaId, index: 0, articles: await buildArticle() }
				);
			}
		}

		if (!resData || (resData.errcode !== undefined && resData.errcode !== 0)) {
			return false;
		}
		new Notice($t("wechat-api.update-draft-success") ?? "草稿更新成功！");
		return mediaId;
	}

	/**
	 * [新增] 查询发布状态（/freepublish/get）
	 * publish_state: 0 成功 / 1 发布中 / 2 原始失败 / 3 常规失败 / 4 被撤回
	 */
	public async getPublishStatus(publish_id: string, accountName: string = "") {
		return this.callWechatApi<any>(
			"/freepublish/get",
			"POST",
			{ publish_id },
			accountName || this.plugin.settings.selectedMPAccount
		);
	}

	public async getTemporaryMaterial(media_id: string, accountName?: string) {
		// [Fix] /media/get 要求 media_id 在 query string 上。
		// 此前误把参数字符串当 body 传给 GET 请求（body 会被忽略，
		// URL 上只有 access_token），该接口从未正确工作过
		return this.callWechatApi<any>(
			`/media/get?media_id=${encodeURIComponent(media_id)}`,
			"GET",
			undefined,
			accountName
		);
	}
}
