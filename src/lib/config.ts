import * as os from 'node:os';
import * as path from 'node:path';

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

export const WECHAT_ORIGIN = 'https://mp.weixin.qq.com';
export const WECHAT_REFERER = `${WECHAT_ORIGIN}/`;
export const DEFAULT_PAGE_SIZE = 5;
export const SYNC_PAGE_SIZE = 5;
export const DEFAULT_SYNC_DELAY_MS = 1500;
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 默认并发数
 */
export const DEFAULT_CONCURRENCY = 3;

/**
 * 下载间隔（毫秒），每篇文章下载后的延迟
 */
export const DEFAULT_DOWNLOAD_INTERVAL_MS = 300;

/**
 * 默认存储根目录
 */
export const DEFAULT_STORAGE_ROOT = path.join(os.homedir(), 'wechat-articles');

/**
 * 内置公共 Worker 代理池（来自 wechat-article-exporter）
 */
export const BUILTIN_WORKER_PROXIES: string[] = [
  // worker-proxy.asia (00-15)
  ...getDomainProxyList('worker-proxy.asia'),
  // net-proxy.asia (00-15)
  ...getDomainProxyList('net-proxy.asia'),
  // 1235566.space (00-15)
  ...getDomainProxyList('1235566.space'),
  // worker-proxy.shop (00-15)
  ...getDomainProxyList('worker-proxy.shop'),
  // worker-proxys.cyou (00-15)
  ...getDomainProxyList('worker-proxys.cyou'),
  // worker-proxy.cyou (00-15)
  ...getDomainProxyList('worker-proxy.cyou'),
];

/**
 * 从环境变量读取私有 Worker 列表
 * 格式: WORKER_PROXIES=https://proxy1.example.com,https://proxy2.example.com
 */
export function getPrivateWorkerProxies(): string[] {
  const envValue = process.env.WORKER_PROXIES || '';
  if (!envValue) return [];
  return envValue.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * 获取所有可用的 Worker 代理（内置 + 私有）
 */
export function getAllWorkerProxies(): string[] {
  const privateProxies = getPrivateWorkerProxies();
  // 如果配置了私有代理，优先使用私有代理，否则使用内置公共代理
  if (privateProxies.length > 0) {
    return privateProxies;
  }
  return BUILTIN_WORKER_PROXIES;
}

/**
 * 生成从 00. 到 15. 的 16 个二级域名
 */
function getDomainProxyList(domain: string): string[] {
  const list: string[] = [];
  for (let i = 0; i < 16; i++) {
    list.push(`https://${String(i).padStart(2, '0')}.${domain}`);
  }
  return list;
}

/**
 * 代理模式
 * - none: 不使用代理
 * - content: 仅文章正文下载走代理（推荐）
 * - all: 所有请求走代理
 */
export type ProxyMode = 'none' | 'content' | 'all';

export function getProxyMode(): ProxyMode {
  const mode = process.env.PROXY_MODE || 'content';
  if (['none', 'content', 'all'].includes(mode)) {
    return mode as ProxyMode;
  }
  return 'content';
}

/**
 * 获取并发数配置
 */
export function getConcurrency(): number {
  const value = process.env.DOWNLOAD_CONCURRENCY;
  if (value) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      return num;
    }
  }
  return DEFAULT_CONCURRENCY;
}

/**
 * 获取存储根目录
 */
export function getStorageRoot(): string {
  return process.env.STORAGE_ROOT || DEFAULT_STORAGE_ROOT;
}

/**
 * 获取私有代理授权信息（按照 wechat-article-exporter 标准）
 */
export function getProxyAuthorization(): string {
  return process.env.PROXY_AUTHORIZATION || '';
}
