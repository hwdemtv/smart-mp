import SmartMPPlugin from "../main";

export interface DeepSeekResult {
    summary: string;
    corrections: {
        original: string;
        suggestion: string;
        start: number;
        end: number;
        type?: string;
        description?: string;
    }[];
    polished: string;
    coverImage: string;
}




declare global {
    interface Window {
        electron: unknown;
        require: NodeJS.Require;
    }
}


export { };
