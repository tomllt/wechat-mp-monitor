import { DEFAULT_TIMEOUT_MS, USER_AGENT, WECHAT_ORIGIN, WECHAT_REFERER } from '../config.js';
import { globalServicePool } from '../worker-proxy-pool.js';
import { globalDownloadRouteController } from './download-route-controller.js';
import type { StoredCookie } from '../types.js';

/**
 * ⚠️  分发环境约束：无代理，必须使用自定义域名方案
 * 
 * - 不能使用 workers.dev + 代理方案
 * - 所有 Worker 访问必须通过自定义域名
 * - 当前配置: new00.wechat-art.xyz ~ new19.wechat-art.xyz
 */

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
   * 是否使用 Worker 文章下载服务
   * 仅用于文章正文下载，其他请求（登录、获取列表等）不使用
   */
  useDownloadService?: boolean;
}

export interface WechatResponse<T = unknown> {
  data: T;
  headers: Headers;
  cookies: StoredCookie[];
  status: number;
  serviceUsed?: string;
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

export async function wechatRequest<T = unknown>(options: WechatRequestOptions): Promise<WechatResponse<T>> {
  const method = options.method ?? 'GET';
  const endpoint = new URL(options.endpoint);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    endpoint.searchParams.set(key, String(value));
  }

  // 构建请求头对象（用于传递给 Worker 下载服务）
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
  let serviceUsed: string | undefined;
  let finalHeaders = headers;

  // 仅当明确设置 useDownloadService 时才使用 Worker 下载服务
  // 仅限文章正文下载使用，其他请求（登录、获取列表等）直接请求
  const canUseDownloadService = options.useDownloadService && globalDownloadRouteController.shouldUseService();
  if (canUseDownloadService) {
    serviceUsed = globalServicePool.getBestService();
    if (serviceUsed) {
      // Worker 是查询参数驱动的定制文章下载服务
      finalUrl = globalServicePool.buildServiceUrl(serviceUsed, endpoint.toString(), headersObj);
      // 当使用 Worker 下载服务时，不再需要设置请求头，因为 Worker 会自己处理
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

    // 记录服务成功
    if (serviceUsed) {
      globalServicePool.recordSuccess(serviceUsed);
      globalDownloadRouteController.recordServiceSuccess();
    }

    return {
      data: data as T,
      headers: response.headers,
      cookies,
      status: response.status,
      serviceUsed,
    };
  } catch (error) {
    // 记录服务失败
    if (serviceUsed) {
      globalServicePool.recordFailure(serviceUsed);
      globalDownloadRouteController.recordServiceNetworkFailure();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
