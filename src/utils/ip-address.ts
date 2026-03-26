import { requestUrl } from "obsidian";
import Logger from "./logger";

export function getPublicIpAddress(): Promise<string> {
    return new Promise((resolve, reject) => {
		requestUrl('https://httpbin.org/ip')
		.then((response) => {
			// console.log("=> Public IP address:", response.json.origin);
			
			resolve(response.json.origin)
		}).catch((error) => {
			Logger.error("IPAddress", "Error fetching public IP address:", error);
			const message = error instanceof Error ? error.message : String(error);
			reject(new Error("Failed to fetch public IP address: " + message));
		})
    }) 
}
