import { DEFAULT_TIMEOUT_MS, USER_AGENT, WECHAT_ORIGIN, WECHAT_REFERER, getProxyMode, getProxyAuthorization } from '../config.js';
import { globalProxyPool } from '../worker-proxy-pool.js';
import type { StoredCookie } from '../types.js';

export interface WechatRequestOptions {
  method?: 'GET' | 'POST';
  endpoint: string;
  query?: Record<string, string | number | undefined | null>;
  body?: Record<string, string | number | undefined | null>;
  cookies?: StoredCookie[];
  headers?: Record<string, string>;
  timeoutMs?: number;
  responseType?: 'json' | 'text' | 'buffer';
  /**
   * 是否强制使用代理（即使 proxyMode 是 none）
   * 用于文章正文下载
   */
  forceProxy?: boolean;
}

export interface WechatResponse<T = unknown> {
  data: T;
  headers: Headers;
  cookies: StoredCookie[];
  status: number;
  proxyUsed?: string;
}

export function serializeCookies(cookies: StoredCookie[]): string {
  return cookies
    .filter(cookie => cookie.name && cookie.value && cookie.value !== 'EXPIRED')
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

export function mergeCookies(current: StoredCookie[], incoming: StoredCookie[]): StoredCookie[] {
  const merged = new Map<string, StoredCookie>();
  for (const cookie of current) {
    merged.set(cookie.name, cookie);
  }
  for (const cookie of incoming) {
    merged.set(cookie.name, cookie);
  }
  return Array.from(merged.values());
}

function parseSetCookieHeaders(headers: Headers): StoredCookie[] {
  const setCookieValues = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  return setCookieValues
    .map(value => {
      const [head, ...attributes] = value.split(';').map(item => item.trim());
      const [name, ...rest] = head.split('=');
      const cookie: StoredCookie = {
        name,
        value: rest.join('='),
      };
      for (const attribute of attributes) {
        const [rawKey, ...rawValue] = attribute.split('=');
        const key = rawKey.toLowerCase();
        const joinedValue = rawValue.join('=');
        if (key === 'path') cookie.path = joinedValue;
        if (key === 'domain') cookie.domain = joinedValue;
        if (key === 'expires') cookie.expires = joinedValue;
        if (key === 'samesite') cookie.sameSite = joinedValue;
        if (key === 'secure') cookie.secure = true;
        if (key === 'httponly') cookie.httpOnly = true;
      }
      return cookie;
    })
    .filter(cookie => cookie.name);
}

/**
 * 判断请求是否应该使用代理
 * 登录请求不走代理，仅文章下载可使用代理
 */
function shouldUseProxy(options: WechatRequestOptions): boolean {
  const proxyMode = getProxyMode();
  
  // 如果全局禁用代理，任何情况都不使用
  if (proxyMode === 'none') {
    return false;
  }
  
  // 强制使用代理（用于文章正文下载）
  if (options.forceProxy) {
    return true;
  }
  
  if (proxyMode === 'all') {
    return true;
  }
  
  // content 模式：仅文章内容下载使用代理（由调用方通过 forceProxy 控制）
  return false;
}

/**
 * 按照 wechat-article-exporter 标准实现构建 Worker 代理 URL
 * 
 * Worker 是查询参数驱动的定制程序，格式：
 * ${proxy}?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(JSON.stringify(headers))}&authorization=${Authorization}
 */
function buildWorkerProxyUrl(proxy: string, targetUrl: string, headersObj: Record<string, string>): string {
  const authorization = getProxyAuthorization();
  const proxyUrl = new URL(proxy);
  
  // 设置查询参数（严格按照 wechat-article-exporter 标准）
  proxyUrl.searchParams.set('url', targetUrl);
  proxyUrl.searchParams.set('headers', JSON.stringify(headersObj));
  proxyUrl.searchParams.set('authorization', authorization);
  
  return proxyUrl.toString();
}

export async function wechatRequest<T = unknown>(options: WechatRequestOptions): Promise<WechatResponse<T>> {
  const method = options.method ?? 'GET';
  const endpoint = new URL(options.endpoint);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    endpoint.searchParams.set(key, String(value));
  }

  // 构建请求头对象（用于传递给 Worker）
  const headersObj: Record<string, string> = {
    Referer: WECHAT_REFERER,
    Origin: WECHAT_ORIGIN,
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'identity',
    ...options.headers,
  };
  if (options.cookies?.length) {
    headersObj.Cookie = serializeCookies(options.cookies);
  }

  // 构建 Headers（用于直接请求时）
  const headers = new Headers(headersObj);

  let body: URLSearchParams | undefined;
  if (method === 'POST' && options.body) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(options.body)) {
      if (value === undefined || value === null) {
        continue;
      }
      body.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let finalUrl = endpoint.toString();
  let proxyUsed: string | undefined;
  let finalHeaders = headers;

  // 判断是否使用代理（严格按照 wechat-article-exporter 标准实现）
  if (shouldUseProxy(options)) {
    proxyUsed = globalProxyPool.getNextProxy();
    if (proxyUsed) {
      // Worker 是查询参数驱动的定制程序
      finalUrl = buildWorkerProxyUrl(proxyUsed, endpoint.toString(), headersObj);
      // 当使用 Worker 代理时，不再需要设置请求头，因为 Worker 会自己处理
      finalHeaders = new Headers();
    }
  }

  try {
    const response = await fetch(finalUrl, {
      method,
      headers: finalHeaders,
      body,
      redirect: 'follow',
      signal: controller.signal,
      referrerPolicy: 'unsafe-url',  // 按照 wechat-article-exporter 标准
    });

    const cookies = parseSetCookieHeaders(response.headers);
    let data: unknown;
    switch (options.responseType ?? 'json') {
      case 'buffer':
        data = Buffer.from(await response.arrayBuffer());
        break;
      case 'text':
        data = await response.text();
        break;
      default:
        data = await response.json();
        break;
    }

    // 记录代理成功
    if (proxyUsed) {
      globalProxyPool.recordSuccess(proxyUsed);
    }

    return {
      data: data as T,
      headers: response.headers,
      cookies,
      status: response.status,
      proxyUsed,
    };
  } catch (error) {
    // 记录代理失败
    if (proxyUsed) {
      globalProxyPool.recordFailure(proxyUsed);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
