/**
 * 文章统计与分割工具
 */

export class ArticleStats {
    // 微信 content 字段限制约 500KB 左右，安全阈值约 400KB
    static readonly MAX_SIZE = 400000;  // 400KB
    static readonly WARN_SIZE = 300000; // 300KB

    /**
     * 估算 HTML 内容大小（字节）
     * 使用 Blob 准确计算 UTF-8 编码大小
     */
    static estimateSize(html: string): number {
        return new Blob([html]).size;
    }

    /**
     * 统计图片数量
     */
    static countImages(html: string): number {
        return (html.match(/<img/g) || []).length;
    }

    /**
     * 检查内容是否超限
     */
    static isOverLimit(html: string): boolean {
        return this.estimateSize(html) > this.MAX_SIZE;
    }

    /**
     * 按 h2 标题智能分割
     * @param html HTML 内容
     * @param maxSize 单篇最大字节数
     * @returns 分割后的 HTML 数组
     */
    static splitByHeading(html: string, maxSize: number = this.MAX_SIZE): string[] {
        const articles: string[] = [];
        let currentArticle = '';

        // 按 h2 分割，保留分隔符
        const sections = html.split(/(?=<h2)/i);

        for (const section of sections) {
            const newSize = new Blob([currentArticle + section]).size;

            // 如果当前累积内容 + 新段落会超限，先保存当前内容
            if (newSize > maxSize && currentArticle) {
                articles.push(currentArticle.trim());
                currentArticle = '';
            }

            currentArticle += section;
        }

        // 添加最后一部分
        if (currentArticle.trim()) {
            articles.push(currentArticle.trim());
        }

        return articles;
    }

    /**
     * 生成分篇标题后缀
     * @param index 当前索引 (0-based)
     * @param total 总篇数
     */
    static getTitleSuffix(index: number, total: number): string {
        if (total === 2) {
            return index === 0 ? '（上篇）' : '（下篇）';
        } else if (total === 3) {
            return ['（上篇）', '（中篇）', '（下篇）'][index];
        } else {
            return `（${index + 1}/${total}）`;
        }
    }
}
