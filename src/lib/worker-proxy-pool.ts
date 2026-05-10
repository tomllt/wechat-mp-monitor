import { getAllWorkerProxies, getProxyAuthorization } from './config.js';

/**
 * Worker 健康检查结果
 */
export interface WorkerHealthCheck {
  proxy: string;
  healthy: boolean;
  status?: number;
  responseTime?: number;
  error?: string;
}

/**
 * 代理状态
 */
interface ProxyStats {
  successCount: number;
  failureCount: number;
  cooldownUntil: number;  // 冷却结束时间戳
}

/**
 * Worker 代理池
 * 按照 wechat-article-exporter 标准实现：
 * - 查询参数驱动的 Worker 代理
 * - 轮询负载均衡策略
 * - 健康检查
 * - 失败重试 + 冷却机制
 */
export class WorkerProxyPool {
  private allProxies: string[];
  private healthyProxies: string[];
  private proxyStats: Map<string, ProxyStats>;
  private currentIndex: number;
  private healthCheckTimeout: number;
  private cooldownPeriod: number;  // 冷却周期（毫秒）
  private maxFailures: number;     // 最大失败次数

  constructor(customProxies?: string[]) {
    this.allProxies = customProxies || getAllWorkerProxies();
    this.healthyProxies = [...this.allProxies]; // 初始假设全部健康
    this.proxyStats = new Map();
    this.currentIndex = 0;
    this.healthCheckTimeout = 10000; // 10秒超时
    this.cooldownPeriod = 60000;    // 60秒冷却
    this.maxFailures = 3;           // 最多失败3次
    
    // 初始化所有代理的统计数据
    for (const proxy of this.allProxies) {
      this.proxyStats.set(proxy, {
        successCount: 0,
        failureCount: 0,
        cooldownUntil: 0,
      });
    }
    
    if (this.allProxies.length === 0) {
      throw new Error('没有可用的 Worker 代理');
    }
  }

  /**
   * 按照 wechat-article-exporter 标准构建 Worker 代理 URL
   * 
   * 格式: ${proxy}?url=${encodeURIComponent(url)}&headers=${encodeURIComponent(JSON.stringify(headers))}&authorization=${Authorization}
   */
  buildProxyUrl(proxy: string, targetUrl: string, headers: Record<string, string> = {}): string {
    const authorization = getProxyAuthorization();
    const proxyUrl = new URL(proxy);
    
    proxyUrl.searchParams.set('url', targetUrl);
    proxyUrl.searchParams.set('headers', JSON.stringify(headers));
    proxyUrl.searchParams.set('authorization', authorization);
    
    return proxyUrl.toString();
  }

  /**
   * 检查单个 Worker 是否健康
   * 按照 wechat-article-exporter 标准：通过代理请求一个测试 URL 来验证
   */
  async checkWorkerHealth(proxy: string): Promise<WorkerHealthCheck> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.healthCheckTimeout);

    try {
      // 使用微信的静态资源 URL 进行健康检查
      const testUrl = 'https://mp.weixin.qq.com/';
      const testHeaders = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      };
      
      const healthUrl = this.buildProxyUrl(proxy, testUrl, testHeaders);
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        referrerPolicy: 'unsafe-url',
      });

      clearTimeout(timeoutId);
      
      const isHealthy = response.status >= 200 && response.status < 400;
      
      return {
        proxy,
        healthy: isHealthy,
        status: response.status,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      return {
        proxy,
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 批量检查所有 Worker 的健康状态
   */
  async checkAllWorkers(concurrent = 10): Promise<WorkerHealthCheck[]> {
    console.log(`🔍 开始检查 ${this.allProxies.length} 个 Worker 的健康状态...`);
    
    const results: WorkerHealthCheck[] = [];
    const chunks: string[][] = [];
    
    // 分批检查，避免并发过高
    for (let i = 0; i < this.allProxies.length; i += concurrent) {
      chunks.push(this.allProxies.slice(i, i + concurrent));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkResults = await Promise.all(
        chunk.map(proxy => this.checkWorkerHealth(proxy))
      );
      results.push(...chunkResults);
      
      console.log(`   已检查: ${results.length}/${this.allProxies.length}`);
    }

    // 更新健康代理列表
    this.healthyProxies = results
      .filter(r => r.healthy)
      .map(r => r.proxy);
    
    this.reset();

    const healthyCount = this.healthyProxies.length;
    const totalCount = this.allProxies.length;
    
    console.log(`✅ 健康检查完成: ${healthyCount}/${totalCount} (${Math.round(healthyCount/totalCount*100)}%) 可用`);
    
    return results;
  }

  /**
   * 获取下一个健康的代理地址（轮询）
   * 跳过处于冷却期的代理
   */
  getNextProxy(): string | undefined {
    const now = Date.now();
    
    // 最多尝试一轮寻找可用的代理
    for (let i = 0; i < this.healthyProxies.length; i++) {
      const proxy = this.healthyProxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.healthyProxies.length;
      
      const stats = this.proxyStats.get(proxy);
      if (stats && stats.cooldownUntil > now) {
        // 该代理在冷却期，跳过
        continue;
      }
      
      return proxy;
    }
    
    // 如果所有健康代理都在冷却期，回退到全部代理（跳过冷却检查）
    if (this.allProxies.length > 0) {
      const proxy = this.allProxies[this.currentIndex % this.allProxies.length];
      this.currentIndex = (this.currentIndex + 1) % this.allProxies.length;
      return proxy;
    }
    
    return undefined;
  }

  /**
   * 记录代理成功
   */
  recordSuccess(proxy: string): void {
    const stats = this.proxyStats.get(proxy);
    if (stats) {
      stats.successCount++;
      // 成功后重置失败计数
      stats.failureCount = 0;
      stats.cooldownUntil = 0;
    }
  }

  /**
   * 记录代理失败
   * 失败次数达到 maxFailures 时将代理放入冷却期
   */
  recordFailure(proxy: string): void {
    const stats = this.proxyStats.get(proxy);
    if (stats) {
      stats.failureCount++;
      
      if (stats.failureCount >= this.maxFailures) {
        stats.cooldownUntil = Date.now() + this.cooldownPeriod;
        console.warn(`⚠️ 代理 ${proxy} 失败次数过多，进入 ${this.cooldownPeriod/1000} 秒冷却期`);
      }
    }
  }

  /**
   * 标记某个代理为不健康
   */
  markUnhealthy(proxy: string): void {
    this.healthyProxies = this.healthyProxies.filter(p => p !== proxy);
  }

  /**
   * 获取健康代理数量
   */
  get healthyCount(): number {
    return this.healthyProxies.length;
  }

  /**
   * 获取总代理数量
   */
  get totalCount(): number {
    return this.allProxies.length;
  }

  /**
   * 获取所有代理
   */
  getAll(): string[] {
    return [...this.allProxies];
  }

  /**
   * 获取所有健康代理
   */
  getHealthy(): string[] {
    return [...this.healthyProxies];
  }

  /**
   * 重置指针
   */
  reset(): void {
    this.currentIndex = 0;
  }

  /**
   * 获取代理统计信息
   */
  getStats(proxy: string): ProxyStats | undefined {
    return this.proxyStats.get(proxy);
  }
}

/**
 * 全局单例代理池
 */
export const globalProxyPool = new WorkerProxyPool();

export default globalProxyPool;
