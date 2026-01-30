import { requestUrl, type RequestUrlParam } from 'obsidian';

type ObsidianFetch = (
  url: RequestInfo | URL | string,
  init?: RequestInit
) => Promise<Response>;

function normalizeBody(body: unknown): string | ArrayBuffer | undefined {
  if (typeof body === 'string' || body === undefined) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (ArrayBuffer.isView(body)) {
    const view = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    return view.slice().buffer; // 拷贝出一段 ArrayBuffer
  }

  throw new Error('Unsupported body type passed to requestUrl');
}

export const obsidianFetch: ObsidianFetch = async (url, init) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  const method = init?.method ?? 'GET';
  const headers = init?.headers as Record<string, string> | undefined;

  const body = normalizeBody(init?.body);
  const urlString = resolveUrlString(url);

  console.debug(`[${requestId}] Fetch started: ${urlString}`);

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (headers?.authorization) {
    requestHeaders.Authorization = headers.authorization;
  }
  const param: RequestUrlParam = {
    url: urlString,
    method: method,
    headers: requestHeaders,
    body: body,
  };

  return await requestUrl(param).then(
    (res) => {
      console.debug(`[${requestId}] Fetch completed in ${Date.now() - startTime}ms: ${urlString}`);
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        statusText: '', // Obsidian 没有 statusText 字段
        headers: new Headers(res.headers),
        json: () => Promise.resolve(JSON.parse(res.text)),
        text: () => Promise.resolve(res.text),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(res.text).buffer),
      } as Response;
    },
  ).catch((e) => {
    console.error(`[${requestId}] Fetch failed after ${Date.now() - startTime}ms: ${urlString}`, e);
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
      json: () => Promise.resolve({ error: e }),
      text: () => Promise.resolve(String(e)),
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(String(e)).buffer),
    } as Response;
  });
};

function resolveUrlString(url: RequestInfo | URL): string {
  let urlString = '';
  if (typeof url === 'string') {
    urlString = url;
  } else if (url instanceof URL) {
    urlString = url.toString();
  } else if (url instanceof Request) {
    urlString = url.url;
  } else {
    throw new Error('Unsupported request url type');
  }

  // Security Check: Block dangerous protocols
  const protocol = urlString.split(':')[0].toLowerCase();
  if (['file', 'blob', 'app', 'javascript', 'vbscript', 'data'].includes(protocol)) {
    throw new Error(`Unsupported protocol: ${protocol}:`);
  }

  return urlString;
}
