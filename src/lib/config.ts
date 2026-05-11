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

// 搜索公众号间隔（避免风控）
export const DEFAULT_ACCOUNT_SEARCH_DELAY_MS = 30000;

// 同步文章列表分页延迟（避免风控）
export const DEFAULT_SYNC_DELAY_MS = 5000;

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

// 默认下载间隔（代理模式）
export const DEFAULT_DOWNLOAD_INTERVAL_MS = 0;

// 直连降频下载间隔（当代理长时间不可用或被风控时）
export const DIRECT_DOWNLOAD_INTERVAL_MS = 3000;

// 触发退回直连所需的连续代理网络失败次数
export const SERVICE_NETWORK_FAILURES_BEFORE_DIRECT = 6;

// 触发退回直连所需的连续代理风控次数
export const SERVICE_RISK_HITS_BEFORE_DIRECT = 4;

// 退回直连后的保持时长（毫秒）
export const DIRECT_MODE_COOLDOWN_MS = 10 * 60 * 1000;

// 默认最大重试次数
export const DEFAULT_MAX_RETRIES = 3;

// 下载失败冷却时间（毫秒）
export const COOLDOWN_PERIOD_MS = 60000;

// 连续失败最大次数（达到后进入冷却）
export const MAX_FAILURES_BEFORE_COOLDOWN = 3;

/**
 * 用户私有 Cloudflare Worker 文章下载服务列表
 * 
 * 注意：由于中国大陆 DNS 污染，*.workers.dev 域名可能无法访问
 * 建议绑定自定义域名使用，例如：https://01.your-custom-domain.com
 * 
 * 如需配置私有服务，请设置环境变量 WECHAT_MP_PRIVATE_SERVICES
 * 多个服务用逗号分隔，例如：
 * export WECHAT_MP_PRIVATE_SERVICES="https://01.your-domain.com,https://02.your-domain.com"
 * 
 * 或者在代码中配置（不推荐，可能泄露到 Git）：
 * export const PRIVATE_WORKER_SERVICES: string[] = [
 *   'https://01.your-custom-domain.com',
 * ];
 */
export const PRIVATE_WORKER_SERVICES: string[] = [];

/**
 * 私有服务授权密钥（如需要）
 * 设置环境变量 WECHAT_MP_SERVICE_AUTHORIZATION
 */
export const PRIVATE_SERVICE_AUTHORIZATION = process.env.WECHAT_MP_SERVICE_AUTHORIZATION || '';

/**
 * 获取所有可用的 Worker 文章下载服务
 * 优先级：环境变量配置 > 内置私有服务 > 内置公共服务
 */
export function getAllWorkerServices(): string[] {
  // 从环境变量读取
  const envServices = process.env.WECHAT_MP_PRIVATE_SERVICES
    ? process.env.WECHAT_MP_PRIVATE_SERVICES.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (envServices.length > 0) {
    return envServices;
  }

  // 返回内置私有服务（如果有）
  if (PRIVATE_WORKER_SERVICES.length > 0) {
    return PRIVATE_WORKER_SERVICES;
  }

  // 没有私有服务时返回空，公共服务会在运行时动态加载
  return [];
}

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

/**
 * 获取服务授权密钥
 * 可通过环境变量 WECHAT_MP_SERVICE_AUTHORIZATION 设置
 */
export function getServiceAuthorization(): string {
  return process.env.WECHAT_MP_SERVICE_AUTHORIZATION ?? '';
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
  getAllWorkerServices,
  getServiceAuthorization,
};
