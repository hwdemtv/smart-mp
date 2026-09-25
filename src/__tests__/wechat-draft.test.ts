import { vi, describe, it, expect, beforeEach } from 'vitest';
import { WechatClient } from '../wechat-api/wechat-client';
import { requestUrl, Notice } from 'obsidian';
import { LocalDraftItem } from '../assets/draft-manager';

// Mock Obsidian
vi.mock('obsidian', () => ({
    requestUrl: vi.fn(),
    Notice: vi.fn(),
    getBlobArrayBuffer: vi.fn(),
    debounce: (fn: any) => fn,
}));

describe('WechatClient Draft Functions', () => {
    let client: WechatClient;
    let mockPlugin: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPlugin = {
            settings: {
                selectedMPAccount: 'test-account',
                useCenterToken: false,
            },
            refreshAccessToken: vi.fn().mockResolvedValue('test-token'),
            showSpinner: vi.fn(),
            hideSpinner: vi.fn(),
            messageService: {
                sendMessage: vi.fn(),
            },
        };
        // Reset Singleton for each test
        (WechatClient as any).instance = undefined;
        client = WechatClient.getInstance(mockPlugin);
    });

    it('should send single article to draft box successfully', async () => {
        const localDraft: LocalDraftItem = {
            title: '测试文章',
            digest: '测试摘要',
            thumb_media_id: 'thumb-id-123',
            author: 'Antigravity',
            content_source_url: 'https://example.com'
        };

        const htmlData = '<p>Hello WeChat Drafts</p>';

        vi.mocked(requestUrl).mockResolvedValue({
            json: {
                media_id: 'new-draft-media-id-123',
                errcode: 0,
            },
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            text: '',
        });

        const result = await client.sendArticleToDraftBox(localDraft, htmlData);

        expect(result).toBe('new-draft-media-id-123');
        expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('/draft/add'),
            method: 'POST',
        }));

        // Verify the body sent to WeChat
        const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
        const body = JSON.parse(callArgs.body as string);
        expect(body.articles[0].title).toBe('测试文章');
        expect(body.articles[0].content).toBe(htmlData);
        expect(body.articles[0].thumb_media_id).toBe('thumb-id-123');
        expect(body.articles[0].digest).toBe('测试摘要');
        expect(body.articles[0].author).toBe('Antigravity');
    });

    it('should re-upload cover image and retry when thumb_media_id is invalid (40007)', async () => {
        const localDraft: LocalDraftItem = {
            title: '测试文章',
            digest: '测试摘要',
            thumb_media_id: 'old-thumb-id',
        };

        const htmlData = '<p>Hello WeChat Drafts</p>';

        // 第一次返回 40007（封面素材失效），重试后成功
        vi.mocked(requestUrl)
            .mockResolvedValueOnce({
                json: {
                    errcode: 40007,
                    errmsg: 'invalid media_id',
                },
                status: 200,
                headers: {},
                arrayBuffer: new ArrayBuffer(0),
                text: '',
            })
            .mockResolvedValue({
                json: {
                    media_id: 'success-draft-id',
                    errcode: 0,
                },
                status: 200,
                headers: {},
                arrayBuffer: new ArrayBuffer(0),
                text: '',
            });

        const onThumbExpired = vi.fn().mockResolvedValue('new-thumb-id-789');

        const result = await client.sendArticleToDraftBox(localDraft, htmlData, onThumbExpired);

        expect(onThumbExpired).toHaveBeenCalledTimes(1);
        expect(localDraft.thumb_media_id).toBe('new-thumb-id-789');
        expect(result).toBe('success-draft-id');
        // 初次请求 + 重试各一次
        expect(requestUrl).toHaveBeenCalledTimes(2);
    });

    it('should send multiple articles to draft box successfully', async () => {
        const localDraft: LocalDraftItem = {
            title: 'Main Article', // In multi-article, some shared settings might come from here
            thumb_media_id: 'shared-thumb-id',
        };

        const articles = [
            { title: 'Article 1', content: '<p>Content 1</p>', digest: 'Digest 1' },
            { title: 'Article 2', content: '<p>Content 2</p>', digest: 'Digest 2' }
        ];

        vi.mocked(requestUrl).mockResolvedValue({
            json: {
                media_id: 'multi-draft-id',
                errcode: 0,
            },
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            text: '',
        });

        const result = await client.sendMultiArticlesToDraftBox(localDraft, articles);

        expect(result).toBe('multi-draft-id');
        expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('/draft/add'),
            method: 'POST',
        }));

        const callArgs = vi.mocked(requestUrl).mock.calls[0][0] as any;
        const body = JSON.parse(callArgs.body as string);
        expect(body.articles).toHaveLength(2);
        expect(body.articles[0].title).toBe('Article 1');
        expect(body.articles[1].title).toBe('Article 2');
    });

    it('should handle API errors correctly', async () => {
        const localDraft: LocalDraftItem = {
            title: 'Fail Article',
            thumb_media_id: 'thumb-id',
        };

        vi.mocked(requestUrl).mockResolvedValue({
            json: {
                errcode: 45009, // Quota exhausted
                errmsg: 'reach max api daily quota limit'
            },
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            text: '',
        });

        const result = await client.sendArticleToDraftBox(localDraft, 'content');

        expect(result).toBe(false);
        // Notice is NOT called by WechatClient.sendArticleToDraftBox directly
        // because it uses callWechatApiRaw
    });

    it('should get draft count successfully', async () => {
        vi.mocked(requestUrl).mockResolvedValue({
            json: {
                total_count: 42,
            },
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            text: '',
        });

        const count = await client.getDraftCount('test-account');
        expect(count).toBe(42);
        expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('/draft/count'),
        }));
    });

    it('should publish draft successfully', async () => {
        vi.mocked(requestUrl).mockResolvedValue({
            json: {
                publish_id: 'pub-123',
                errcode: 0,
            },
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            text: '',
        });

        const result = await client.publishDraft('media-123', 'test-account');
        expect(result).toBe('pub-123');
        expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('/freepublish/submit'),
            method: 'POST',
        }));
    });

    it('should get batch draft list successfully', async () => {
        vi.mocked(requestUrl).mockResolvedValue({
            json: {
                item: [{ media_id: '1' }, { media_id: '2' }],
                total_count: 2,
                item_count: 2,
            },
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            text: '',
        });

        const result = await client.getBatchDraftList('test-account', 0, 10);
        expect(result.item).toHaveLength(2);
        expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('/draft/batchget'),
            method: 'POST',
        }));
    });

    it('should get draft by id successfully', async () => {
        vi.mocked(requestUrl).mockResolvedValue({
            json: {
                news_item: [{ title: 'Draft Title' }],
                errcode: 0,
            },
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            text: '',
        });

        const result = await client.getDraftById('test-account', 'media-123');
        expect(result[0].title).toBe('Draft Title');
        expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('/draft/get'),
            method: 'POST',
        }));
    });

    it('should delete draft successfully', async () => {
        vi.mocked(requestUrl).mockResolvedValue({
            json: {
                errcode: 0,
            },
            status: 200,
            headers: {},
            arrayBuffer: new ArrayBuffer(0),
            text: '',
        });

        const result = await client.deleteDraft('media-123', 'test-account');
        expect(result).toEqual({ errcode: 0 });
        expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('/draft/delete'),
            method: 'POST',
        }));
    });
});
