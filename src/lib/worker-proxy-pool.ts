/**
 * wechat-article-exporter 标准 Worker 文章下载服务池
 * 
 * 【重要】这不是通用 HTTP 代理，而是专门的微信文章下载服务
 * 仅用于下载 mp.weixin.qq.com 域名下的文章正文
 * 
 * 服务协议：Query 参数驱动
 *   ${serviceUrl}?url=<encoded_url>&headers=<encoded_headers>&authorization=<auth_key>
 * 
 * 特性：
 * - 失败 3 次自动冷却 60 秒
 * - 支持私有服务授权密钥
 * - 轮询 + 失败次数优先的负载均衡
 * - 【对齐 wechat-article-exporter】不依赖 /health 端点预检查，基于实际使用动态调整
 */

import PUBLIC_PROXY_LIST from './public-proxy.js';
import PRIVATE_PROXY_LIST from './private-proxy.js';

export interface ServiceStatus {
  failures: number;
  lastUsed: number;
  cooldown: boolean;
  totalFailures: number;
  totalSuccess: number;
  totalUse: number;
}

export interface ArticleDownloadServiceOptions {
  cooldownPeriod?: number;  // 冷却周期（毫秒），默认 60000
  maxFailures?: number;      // 最大失败次数，默认 3
  privateServices?: string[]; // 私有服务列表
  authorization?: string;    // 私有服务授权密钥
}

const DEFAULT_OPTIONS = {
  COOLDOWN_PERIOD: 60000,
  MAX_FAILURES: 3,
};

export class ArticleDownloadServicePool {
  private readonly services: string[];
  private readonly serviceStatus: Map<string, ServiceStatus>;
  private readonly cooldownPeriod: number;
  private readonly maxFailures: number;
  private readonly authorization: string;

  constructor(options: ArticleDownloadServiceOptions = {}) {
    // 优先使用私有服务，公共服务已全部失效
    this.services = options.privateServices && options.privateServices.length > 0
      ? [...options.privateServices]
      : PRIVATE_PROXY_LIST.length > 0
        ? [...PRIVATE_PROXY_LIST]
        : [...PUBLIC_PROXY_LIST];

    if (this.services.length === 0) {
      throw new Error(
        '⚠️ 所有公共代理节点已全部失效！\n' +
        '请配置私有代理服务后使用：\n' +
        '1. 部署自己的 Cloudflare Worker\n' +
        '2. 绑定自定义域名\n' +
        '3. 通过 privateServices 参数传入地址列表\n' +
        '参考文档：https://docs.mptext.top/get-started/private-proxy.html'
      );
    }

    this.cooldownPeriod = options.cooldownPeriod ?? DEFAULT_OPTIONS.COOLDOWN_PERIOD;
    this.maxFailures = options.maxFailures ?? DEFAULT_OPTIONS.MAX_FAILURES;
    this.authorization = options.authorization ?? '';
    this.serviceStatus = new Map();

    this.initServiceStatus();
  }

  private initServiceStatus(): void {
    this.services.forEach(service => {
      this.serviceStatus.set(service, {
        failures: 0,
        lastUsed: 0,
        cooldown: false,
        totalFailures: 0,
        totalSuccess: 0,
        totalUse: 0,
      });
    });
  }

  /**
   * 获取最佳服务
   * 优先选择：未冷却 → 失败次数少 → 最早使用
   * 【对齐 wechat-article-exporter】总是返回一个服务，绝不返回 undefined
   */
  public getBestService(): string {
    const now = Date.now();
    const availableServices = Array.from(this.serviceStatus.entries())
      .filter(([_, status]) => 
        !status.cooldown || now - status.lastUsed >= this.cooldownPeriod
      )
      .sort((a, b) => {
        if (a[1].failures !== b[1].failures) {
          return a[1].failures - b[1].failures;
        }
        return a[1].lastUsed - b[1].lastUsed;
      });

    if (availableServices.length === 0) {
      // 【对齐 wechat-article-exporter】无可用服务时，重置并返回最早使用的服务
      return this.resetAndGetService();
    }

    const [bestService, status] = availableServices[0];
    status.lastUsed = now;
    status.totalUse++;
    return bestService;
  }

  /**
   * 无可用服务时，重置并返回最早使用的服务
   */
  private resetAndGetService(): string {
    const sorted = Array.from(this.serviceStatus.entries()).sort(
      ([, a], [, b]) => a.lastUsed - b.lastUsed
    );

    const [oldestService, status] = sorted[0];

    this.serviceStatus.set(oldestService, {
      ...status,
      failures: 0,
      cooldown: false,
      lastUsed: Date.now(),
      totalUse: status.totalUse + 1,
    });

    return oldestService;
  }

  /**
   * 记录服务失败
   */
  public recordFailure(service: string): void {
    const status = this.serviceStatus.get(service);
    if (!status) return;

    status.failures++;
    status.totalFailures++;
    status.cooldown = status.failures >= this.maxFailures;
  }

  /**
   * 记录服务成功
   */
  public recordSuccess(service: string): void {
    const status = this.serviceStatus.get(service);
    if (!status) return;

    status.failures = 0;
    status.cooldown = false;
    status.totalSuccess++;
  }

  /**
   * 构建文章下载服务请求 URL
   * 【重要】仅支持微信文章域名 (mp.weixin.qq.com)
   */
  public buildServiceUrl(service: string, targetUrl: string, headers: Record<string, string> = {}): string {
    // 仅支持微信文章域名
    if (!targetUrl.includes('mp.weixin.qq.com')) {
      throw new Error('文章下载服务仅支持 mp.weixin.qq.com 域名的请求');
    }

    const encodedUrl = encodeURIComponent(targetUrl);
    const encodedHeaders = encodeURIComponent(JSON.stringify(headers));
    const encodedAuth = encodeURIComponent(this.authorization);

    return `${service}?url=${encodedUrl}&headers=${encodedHeaders}&authorization=${encodedAuth}`;
  }

  /**
   * 批量健康检查所有服务（仅用于诊断，不修改运行时状态）
   * 【对齐 wechat-article-exporter】运行时不依赖预检查，基于实际使用动态调整
   * @param mode native - 检查 Worker 自带 /health 端点
   *             service - 通过服务协议检查（需要能正常访问 Worker）
   */
  public async healthCheckAll(mode: 'native' | 'service' = 'native'): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    results: Array<{ service: string; healthy: boolean; latency: number; error?: string }>;
  }> {
    const results = [];
    let healthy = 0;
    let unhealthy = 0;

    console.log(`🔍 开始检查 ${this.services.length} 个文章下载服务节点 (mode: ${mode})`);
    console.log(`ℹ️  【对齐 wechat-article-exporter】此检查仅用于诊断，不影响运行时状态`);

    for (const service of this.services) {
      const start = Date.now();

      try {
        const checkUrl = mode === 'native'
          ? `${service}/health`
          : this.buildServiceUrl(service, 'https://mp.weixin.qq.com/');

        const response = await fetch(checkUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        const isHealthy = response.ok;
        const latency = Date.now() - start;

        if (isHealthy) {
          healthy++;
        } else {
          unhealthy++;
        }

        results.push({
          service,
          healthy: isHealthy,
          latency,
        });
      } catch (error) {
        unhealthy++;
        results.push({
          service,
          healthy: false,
          latency: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      total: this.services.length,
      healthy,
      unhealthy,
      results,
    };
  }

  /**
   * 获取服务状态
   */
  public getServiceStatus(): Map<string, ServiceStatus> {
    return new Map(this.serviceStatus);
  }

  /**
   * 获取统计信息
   */
  public getStats() {
    let totalSuccess = 0;
    let totalFailures = 0;
    let totalUse = 0;
    let availableCount = 0;
    const now = Date.now();

    for (const [_, status] of Array.from(this.serviceStatus.entries())) {
      totalSuccess += status.totalSuccess;
      totalFailures += status.totalFailures;
      totalUse += status.totalUse;
      if (!status.cooldown || now - status.lastUsed >= this.cooldownPeriod) {
        availableCount++;
      }
    }

    return {
      totalServices: this.services.length,
      availableServices: availableCount,
      totalSuccess,
      totalFailures,
      totalUse,
      successRate: totalUse > 0 ? (totalSuccess / totalUse * 100).toFixed(2) + '%' : 'N/A',
    };
  }

  /**
   * Total service count (getter for backward compatibility)
   */
  get totalCount(): number {
    return this.services.length;
  }

  /**
   * Available service count (getter for backward compatibility)
   * 【对齐 wechat-article-exporter】基于冷却状态判断可用性，而非预检查结果
   */
  get healthyCount(): number {
    let count = 0;
    const now = Date.now();
    for (const [_, status] of Array.from(this.serviceStatus.entries())) {
      if (!status.cooldown || now - status.lastUsed >= this.cooldownPeriod) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get all services
   */
  public getAll(): string[] {
    return [...this.services];
  }

  /**
   * Get available services (not in cooldown or cooldown expired)
   * 【对齐 wechat-article-exporter】基于冷却状态判断可用性
   */
  public getHealthy(): string[] {
    const healthy: string[] = [];
    const now = Date.now();
    for (const [service, status] of Array.from(this.serviceStatus.entries())) {
      if (!status.cooldown || now - status.lastUsed >= this.cooldownPeriod) {
        healthy.push(service);
      }
    }
    return healthy;
  }

  /**
   * Legacy health check wrapper for backward compatibility
   */
  async checkAllWorkers(concurrent: number = 10): Promise<void> {
    // We don't have mode parameter anymore, just use native health check
    await this.healthCheckAll();
  }
}

import { getAllWorkerServices, getServiceAuthorization, COOLDOWN_PERIOD_MS, MAX_FAILURES_BEFORE_COOLDOWN } from './config.js';

/**
 * 全局 Worker 文章下载服务池单例
 * 自动从环境变量和配置中加载服务列表
 */
export const globalServicePool = new ArticleDownloadServicePool({
  privateServices: getAllWorkerServices(),
  authorization: getServiceAuthorization(),
  cooldownPeriod: COOLDOWN_PERIOD_MS,
  maxFailures: MAX_FAILURES_BEFORE_COOLDOWN,
});

export default ArticleDownloadServicePool;

