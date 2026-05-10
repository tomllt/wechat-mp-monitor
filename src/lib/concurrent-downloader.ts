import pLimit from 'p-limit';
import { getConcurrency, DEFAULT_DOWNLOAD_INTERVAL_MS } from './config.js';

/**
 * 并发下载控制器
 * 支持限制并发数和请求间隔
 */
export class ConcurrentDownloader {
  private limit: ReturnType<typeof pLimit>;
  private intervalMs: number;
  private lastRequestTime: number;

  constructor(concurrency?: number, intervalMs?: number) {
    const concurrencyValue = concurrency || getConcurrency();
    this.limit = pLimit(concurrencyValue);
    this.intervalMs = intervalMs ?? DEFAULT_DOWNLOAD_INTERVAL_MS;
    this.lastRequestTime = 0;
  }

  /**
   * 提交下载任务
   */
  async submit<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(async () => {
      await this.waitForInterval();
      this.lastRequestTime = Date.now();
      return fn();
    });
  }

  /**
   * 等待请求间隔
   */
  private async waitForInterval(): Promise<void> {
    if (this.intervalMs <= 0) return;
    
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.intervalMs) {
      await new Promise(resolve => setTimeout(resolve, this.intervalMs - elapsed));
    }
  }

  /**
   * 获取当前活跃任务数
   */
  get activeCount(): number {
    return this.limit.activeCount;
  }

  /**
   * 获取等待任务数
   */
  get pendingCount(): number {
    return this.limit.pendingCount;
  }
}

/**
 * 全局单例下载器
 */
export const globalDownloader = new ConcurrentDownloader();

export default globalDownloader;
