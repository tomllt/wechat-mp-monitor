import { DEFAULT_TIMEOUT_MS, USER_AGENT, WECHAT_ORIGIN, WECHAT_REFERER } from '../config.js';
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
}

export interface WechatResponse<T = unknown> {
  data: T;
  headers: Headers;
  cookies: StoredCookie[];
  status: number;
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

  const headers = new Headers({
    Referer: WECHAT_REFERER,
    Origin: WECHAT_ORIGIN,
    'User-Agent': USER_AGENT,
    'Accept-Encoding': 'identity',
    ...options.headers,
  });
  if (options.cookies?.length) {
    headers.set('Cookie', serializeCookies(options.cookies));
  }

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
  try {
    const response = await fetch(endpoint, {
      method,
      headers,
      body,
      redirect: 'follow',
      signal: controller.signal,
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

    return {
      data: data as T,
      headers: response.headers,
      cookies,
      status: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}
