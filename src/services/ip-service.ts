import { getPublicIpAddress } from "src/utils/ip-address";
import { Logger } from "../utils/logger";
import type SmartMPPlugin from "../main";

export class IPService {
	private plugin: SmartMPPlugin;

	constructor(plugin: SmartMPPlugin) {
		this.plugin = plugin;
	}

	async updateIpAddress(): Promise<string> {
		try {
			const ip = await getPublicIpAddress();
			if (!ip) {
				throw new Error("空的公网 IP 地址");
			}
			this.plugin.settings.ipAddress = ip;
			void this.plugin.saveSettings();
			return ip;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			Logger.error("IP", "获取公网 IP 地址失败", error);
			throw new Error(`获取公网 IP 地址失败: ${message}`);
		}
	}
}
