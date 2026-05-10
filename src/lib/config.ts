/**
 * 应用配置
 */

import { homedir } from 'os';
// HTTP 请求超时
export const DEFAULT_TIMEOUT_MS = 30000;

// User-Agent
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';

// 微信 Origin
export const WECHAT_ORIGIN = 'https://mp.weixin.qq.com';

// 微信 Referer
export const WECHAT_REFERER = 'https://mp.weixin.qq.com/';

// 同步延迟（避免风控）
export const DEFAULT_SYNC_DELAY_MS = 1000;

// 同步分页大小
export const SYNC_PAGE_SIZE = 20;


import { join } from 'path';

// 工作目录
export const WORK_DIR = join(homedir(), '.wechat-mp-monitor');

// 数据库路径
export const DB_PATH = join(WORK_DIR, 'app.db');

// 登录状态缓存路径
export const LOGIN_STATE_PATH = join(WORK_DIR, 'login-state.json');

// 微信公众号后台域名
export const MP_BASE_URL = 'https://mp.weixin.qq.com';

// 默认 User-Agent
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';

// 文章列表每页大小
export const ARTICLE_LIST_PAGE_SIZE = 20;

// 登录二维码有效期（秒）
export const QR_CODE_EXPIRE_SECONDS = 300;

// 轮询间隔（毫秒）
export const POLL_INTERVAL_MS = 2000;

// 默认下载并发数
export const DEFAULT_CONCURRENCY = 5;

// 默认下载超时时间（毫秒）
export const DEFAULT_DOWNLOAD_TIMEOUT = 30000;

// 下载间隔（避免风控）
export const DEFAULT_DOWNLOAD_INTERVAL_MS = 0;

// 默认最大重试次数
export const DEFAULT_MAX_RETRIES = 3;

// 下载失败冷却时间（毫秒）
export const COOLDOWN_PERIOD_MS = 60000;

// 连续失败最大次数（达到后进入冷却）
export const MAX_FAILURES_BEFORE_COOLDOWN = 3;

/**
 * 用户私有 Cloudflare Worker 代理列表
 * 
 * 注意：由于中国大陆 DNS 污染，*.workers.dev 域名可能无法访问
 * 建议绑定自定义域名使用，例如：https://01.your-custom-domain.com
 * 
 * 如需配置私有代理，请设置环境变量 WECHAT_MP_PRIVATE_PROXIES
 * 多个代理用逗号分隔，例如：
 * export WECHAT_MP_PRIVATE_PROXIES="https://01.your-domain.com,https://02.your-domain.com"
 * 
 * 或者在代码中配置（不推荐，可能泄露到 Git）：
 * export const PRIVATE_WORKER_PROXIES: string[] = [
 *   'https://01.your-custom-domain.com',
 * ];
 */
export const PRIVATE_WORKER_PROXIES: string[] = [];

/**
 * 私有代理授权密钥（如需要）
 * 设置环境变量 WECHAT_MP_PROXY_AUTHORIZATION
 */
export const PRIVATE_PROXY_AUTHORIZATION = process.env.WECHAT_MP_PROXY_AUTHORIZATION || '';

/**
 * 获取所有可用的 Worker 代理
 * 优先级：环境变量配置 > 内置私有代理 > 内置公共代理
 */
export function getAllWorkerProxies(): string[] {
  // 从环境变量读取
  const envProxies = process.env.WECHAT_MP_PRIVATE_PROXIES
    ? process.env.WECHAT_MP_PRIVATE_PROXIES.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (envProxies.length > 0) {
    return envProxies;
  }

  // 返回内置私有代理（如果有）
  if (PRIVATE_WORKER_PROXIES.length > 0) {
    return PRIVATE_WORKER_PROXIES;
  }

  // 没有私有代理时返回空，公共代理会在运行时动态加载
  return [];
}

/**
 * 代理模式
 * - none: 不使用代理（直接连接）
 * - content: 仅文章内容使用代理（默认）
 * - all: 所有请求都使用代理
 */
export type ProxyMode = 'none' | 'content' | 'all';

/**
 * 获取当前代理模式
 * 可通过环境变量 WECHAT_MP_PROXY_MODE 设置
 */
export function getProxyMode(): ProxyMode {
  const mode = process.env.WECHAT_MP_PROXY_MODE?.toLowerCase() ?? 'content';
  if (['none', 'content', 'all'].includes(mode)) {
    return mode as ProxyMode;
  }
  return 'content';
}

/**
 * 获取代理授权密钥
 * 可通过环境变量 WECHAT_MP_PROXY_AUTHORIZATION 设置
 */

/**
 * 获取下载并发数
 * 可通过环境变量 WECHAT_MP_CONCURRENCY 设置
 */
export function getConcurrency(): number {
  const value = process.env.WECHAT_MP_CONCURRENCY;
  if (value) {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_CONCURRENCY;
}

export function getProxyAuthorization(): string {
  return process.env.WECHAT_MP_PROXY_AUTHORIZATION ?? '';
}

export default {
  SYNC_PAGE_SIZE,
  DEFAULT_SYNC_DELAY_MS,
  WECHAT_REFERER,
  WECHAT_ORIGIN,
  DEFAULT_TIMEOUT_MS,
  WORK_DIR,
  DB_PATH,
  LOGIN_STATE_PATH,
  MP_BASE_URL,
  DEFAULT_USER_AGENT,
  ARTICLE_LIST_PAGE_SIZE,
  QR_CODE_EXPIRE_SECONDS,
  POLL_INTERVAL_MS,
  DEFAULT_CONCURRENCY,
  DEFAULT_DOWNLOAD_INTERVAL_MS,
  DEFAULT_DOWNLOAD_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  COOLDOWN_PERIOD_MS,
  MAX_FAILURES_BEFORE_COOLDOWN,
  getAllWorkerProxies,
  getProxyMode,
  getProxyAuthorization,
};
