/**
 * wechat-article-exporter 标准 Worker 代理池实现
 * 
 * 代理协议：Query 参数驱动
 *   ${proxyUrl}?url=<encoded_url>&headers=<encoded_headers>&authorization=<auth_key>
 * 
 * 特性：
 * - 自动健康检查（请求前测试 /health 端点）
 * - 失败 3 次自动冷却 60 秒
 * - 支持私有代理授权密钥
 * - 轮询 + 失败次数优先的负载均衡
 */

import PUBLIC_PROXY_LIST from './public-proxy.js';

export interface ProxyStatus {
  failures: number;
  lastUsed: number;
  cooldown: boolean;
  totalFailures: number;
  totalSuccess: number;
  totalUse: number;
  lastCheck?: number;
  isHealthy?: boolean;
}

export interface WorkerProxyOptions {
  cooldownPeriod?: number;  // 冷却周期（毫秒），默认 60000
  maxFailures?: number;      // 最大失败次数，默认 3
  privateProxies?: string[]; // 私有代理列表
  authorization?: string;    // 私有代理授权密钥
}

const DEFAULT_OPTIONS = {
  COOLDOWN_PERIOD: 60000,
  MAX_FAILURES: 3,
};

export class WorkerProxyPool {
  private readonly proxies: string[];
  private readonly proxyStatus: Map<string, ProxyStatus>;
  private readonly cooldownPeriod: number;
  private readonly maxFailures: number;
  private readonly authorization: string;

  constructor(options: WorkerProxyOptions = {}) {
    // 优先使用私有代理，没有则使用公共代理
    this.proxies = options.privateProxies?.length
      ? [...options.privateProxies]
      : [...PUBLIC_PROXY_LIST];

    if (this.proxies.length === 0) {
      throw new Error('至少需要配置一个代理');
    }

    this.cooldownPeriod = options.cooldownPeriod ?? DEFAULT_OPTIONS.COOLDOWN_PERIOD;
    this.maxFailures = options.maxFailures ?? DEFAULT_OPTIONS.MAX_FAILURES;
    this.authorization = options.authorization ?? '';
    this.proxyStatus = new Map();

    this.initProxyStatus();
  }

  private initProxyStatus(): void {
    this.proxies.forEach(proxy => {
      this.proxyStatus.set(proxy, {
        failures: 0,
        lastUsed: 0,
        cooldown: false,
        totalFailures: 0,
        totalSuccess: 0,
        totalUse: 0,
        isHealthy: true,
      });
    });
  }

  /**
   * 获取最佳代理
   * 优先选择：未冷却 → 失败次数少 → 最早使用
   */
  public getBestProxy(): string {
    const now = Date.now();
    const availableProxies = Array.from(this.proxyStatus.entries())
      .filter(([_, status]) => 
        status.isHealthy !== false && 
        (!status.cooldown || now - status.lastUsed >= this.cooldownPeriod)
      )
      .sort((a, b) => {
        if (a[1].failures !== b[1].failures) {
          return a[1].failures - b[1].failures;
        }
        return a[1].lastUsed - b[1].lastUsed;
      });

    if (availableProxies.length === 0) {
      return this.resetAndGetProxy();
    }

    const [bestProxy, status] = availableProxies[0];
    status.lastUsed = now;
    status.totalUse++;
    return bestProxy;
  }

  /**
   * 无可用代理时，重置并返回最早使用的代理
   */
  private resetAndGetProxy(): string {
    const sorted = Array.from(this.proxyStatus.entries()).sort(
      ([, a], [, b]) => a.lastUsed - b.lastUsed
    );

    const [oldestProxy, status] = sorted[0];

    this.proxyStatus.set(oldestProxy, {
      ...status,
      failures: 0,
      cooldown: false,
      lastUsed: Date.now(),
      totalUse: status.totalUse + 1,
    });

    return oldestProxy;
  }

  /**
   * 记录代理失败
   */
  public recordFailure(proxy: string): void {
    const status = this.proxyStatus.get(proxy);
    if (!status) return;

    status.failures++;
    status.totalFailures++;
    status.cooldown = status.failures >= this.maxFailures;
  }

  /**
   * 记录代理成功
   */
  public recordSuccess(proxy: string): void {
    const status = this.proxyStatus.get(proxy);
    if (!status) return;

    status.failures = 0;
    status.cooldown = false;
    status.totalSuccess++;
  }

  /**
   * 构造代理请求 URL（wechat-article-exporter 标准协议）
   */
  public buildProxyUrl(proxy: string, targetUrl: string, headers: Record<string, string> = {}): string {
    const encodedUrl = encodeURIComponent(targetUrl);
    const encodedHeaders = encodeURIComponent(JSON.stringify(headers));
    const encodedAuth = encodeURIComponent(this.authorization);

    return `${proxy}?url=${encodedUrl}&headers=${encodedHeaders}&authorization=${encodedAuth}`;
  }

  /**
   * 批量健康检查所有代理
   * @param mode native - 检查 Worker 自带 /health 端点
   *             proxy  - 通过代理协议检查（需要能正常访问 Worker）
   */
  public async healthCheckAll(mode: 'native' | 'proxy' = 'native'): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    results: Array<{ proxy: string; healthy: boolean; latency: number; error?: string }>;
  }> {
    const results = [];
    let healthy = 0;
    let unhealthy = 0;

    console.log(`🔍 开始检查 ${this.proxies.length} 个代理节点 (mode: ${mode})`);

    for (const proxy of this.proxies) {
      const start = Date.now();
      const status = this.proxyStatus.get(proxy)!;

      try {
        const checkUrl = mode === 'native'
          ? `${proxy}/health`
          : this.buildProxyUrl(proxy, 'https://mp.weixin.qq.com/');

        const response = await fetch(checkUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        const isHealthy = response.ok;
        const latency = Date.now() - start;

        if (isHealthy) {
          healthy++;
          status.isHealthy = true;
        } else {
          unhealthy++;
          status.isHealthy = false;
        }

        results.push({
          proxy,
          healthy: isHealthy,
          latency,
        });
      } catch (error) {
        unhealthy++;
        status.isHealthy = false;
        results.push({
          proxy,
          healthy: false,
          latency: Date.now() - start,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      status.lastCheck = Date.now();
    }

    return {
      total: this.proxies.length,
      healthy,
      unhealthy,
      results,
    };
  }

  /**
   * 获取代理状态
   */
  public getProxyStatus(): Map<string, ProxyStatus> {
    return new Map(this.proxyStatus);
  }

  /**
   * 获取统计信息
   */
  public getStats() {
    let totalSuccess = 0;
    let totalFailures = 0;
    let totalUse = 0;
    let healthyCount = 0;

    for (const status of this.proxyStatus.values()) {
      totalSuccess += status.totalSuccess;
      totalFailures += status.totalFailures;
      totalUse += status.totalUse;
      if (status.isHealthy !== false) healthyCount++;
    }

    return {
      totalProxies: this.proxies.length,
      healthyProxies: healthyCount,
      totalSuccess,
      totalFailures,
      totalUse,
      successRate: totalUse > 0 ? (totalSuccess / totalUse * 100).toFixed(2) + '%' : 'N/A',
    };
  }

  /**
   * Total proxy count (getter for backward compatibility)
   */
  get totalCount(): number {
    return this.proxies.length;
  }

  /**
   * Healthy proxy count (getter for backward compatibility)
   */
  get healthyCount(): number {
    let count = 0;
    for (const status of this.proxyStatus.values()) {
      if (status.isHealthy !== false) count++;
    }
    return count;
  }

  /**
   * Get all proxies
   */
  public getAll(): string[] {
    return [...this.proxies];
  }

  /**
   * Get healthy proxies
   */
  public getHealthy(): string[] {
    const healthy: string[] = [];
    for (const [proxy, status] of this.proxyStatus.entries()) {
      if (status.isHealthy !== false) healthy.push(proxy);
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

import { getAllWorkerProxies, getProxyAuthorization, COOLDOWN_PERIOD_MS, MAX_FAILURES_BEFORE_COOLDOWN } from './config.js';

/**
 * 全局 Worker 代理池单例
 * 自动从环境变量和配置中加载代理列表
 */
export const globalProxyPool = new WorkerProxyPool({
  privateProxies: getAllWorkerProxies(),
  authorization: getProxyAuthorization(),
  cooldownPeriod: COOLDOWN_PERIOD_MS,
  maxFailures: MAX_FAILURES_BEFORE_COOLDOWN,
});

export default WorkerProxyPool;

