import {
  DIRECT_DOWNLOAD_INTERVAL_MS,
  DIRECT_MODE_COOLDOWN_MS,
  SERVICE_NETWORK_FAILURES_BEFORE_DIRECT,
  SERVICE_RISK_HITS_BEFORE_DIRECT,
} from '../config.js';

export type DownloadRouteMode = 'service' | 'direct';

export class DownloadRouteController {
  private directUntil = 0;
  private lastDirectRequestAt = 0;
  private consecutiveServiceNetworkFailures = 0;
  private consecutiveServiceRiskHits = 0;

  getMode(): DownloadRouteMode {
    return Date.now() < this.directUntil ? 'direct' : 'service';
  }

  getState(now = Date.now()) {
    return {
      mode: now < this.directUntil ? 'direct' as const : 'service' as const,
      directUntil: this.directUntil,
      lastDirectRequestAt: this.lastDirectRequestAt,
      consecutiveServiceNetworkFailures: this.consecutiveServiceNetworkFailures,
      consecutiveServiceRiskHits: this.consecutiveServiceRiskHits,
    };
  }

  shouldUseService(): boolean {
    return this.getMode() === 'service';
  }

  async waitIfNeeded(options: { now?: () => number; sleepFn?: (ms: number) => Promise<void> } = {}): Promise<void> {
    const nowFn = options.now ?? (() => Date.now());
    const sleepFn = options.sleepFn ?? sleep;
    if ((nowFn() < this.directUntil ? 'direct' : 'service') !== 'direct') {
      return;
    }
    if (this.lastDirectRequestAt <= 0) {
      this.lastDirectRequestAt = nowFn();
      return;
    }
    const elapsed = nowFn() - this.lastDirectRequestAt;
    if (elapsed < DIRECT_DOWNLOAD_INTERVAL_MS) {
      await sleepFn(DIRECT_DOWNLOAD_INTERVAL_MS - elapsed);
    }
    this.lastDirectRequestAt = nowFn();
  }

  recordServiceSuccess(): void {
    this.consecutiveServiceNetworkFailures = 0;
    this.consecutiveServiceRiskHits = 0;
  }

  recordServiceNetworkFailure(): void {
    this.consecutiveServiceNetworkFailures += 1;
    if (this.consecutiveServiceNetworkFailures >= SERVICE_NETWORK_FAILURES_BEFORE_DIRECT) {
      this.activateDirectMode();
    }
  }

  recordServiceRiskHit(): void {
    this.consecutiveServiceRiskHits += 1;
    if (this.consecutiveServiceRiskHits >= SERVICE_RISK_HITS_BEFORE_DIRECT) {
      this.activateDirectMode();
    }
  }

  activateDirectMode(until = Date.now() + DIRECT_MODE_COOLDOWN_MS): void {
    this.directUntil = Math.max(this.directUntil, until);
    this.consecutiveServiceNetworkFailures = 0;
    this.consecutiveServiceRiskHits = 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const globalDownloadRouteController = new DownloadRouteController();
