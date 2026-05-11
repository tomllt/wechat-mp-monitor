export type BackoffReason = 'success' | 'env_abnormal' | 'rate_limit' | 'verify' | 'aborted' | 'network' | 'other';

export interface DownloadBackoffOptions {
  envAbnormalBaseMs?: number;
  envAbnormalMaxMs?: number;
  transientBaseMs?: number;
  transientMaxMs?: number;
}

export interface BackoffState {
  currentDelayMs: number;
  backoffUntil: number;
  lastReason: BackoffReason | null;
}

const DEFAULTS = {
  envAbnormalBaseMs: 1500,
  envAbnormalMaxMs: 20000,
  transientBaseMs: 800,
  transientMaxMs: 8000,
};

export class DownloadBackoffController {
  private currentDelayMs = 0;
  private backoffUntil = 0;
  private lastReason: BackoffReason | null = null;
  private readonly envAbnormalBaseMs: number;
  private readonly envAbnormalMaxMs: number;
  private readonly transientBaseMs: number;
  private readonly transientMaxMs: number;

  constructor(options: DownloadBackoffOptions = {}) {
    this.envAbnormalBaseMs = options.envAbnormalBaseMs ?? DEFAULTS.envAbnormalBaseMs;
    this.envAbnormalMaxMs = options.envAbnormalMaxMs ?? DEFAULTS.envAbnormalMaxMs;
    this.transientBaseMs = options.transientBaseMs ?? DEFAULTS.transientBaseMs;
    this.transientMaxMs = options.transientMaxMs ?? DEFAULTS.transientMaxMs;
  }

  record(reason: BackoffReason, now = Date.now()): void {
    if (reason === 'success') {
      this.currentDelayMs = 0;
      this.backoffUntil = 0;
      this.lastReason = reason;
      return;
    }

    const isEnv = reason === 'env_abnormal' || reason === 'verify' || reason === 'rate_limit';
    const isTransient = reason === 'aborted' || reason === 'network';
    const base = isEnv ? this.envAbnormalBaseMs : this.transientBaseMs;
    const max = isEnv ? this.envAbnormalMaxMs : this.transientMaxMs;
    const sameBucket =
      (isEnv && (this.lastReason === 'env_abnormal' || this.lastReason === 'verify' || this.lastReason === 'rate_limit')) ||
      (isTransient && (this.lastReason === 'aborted' || this.lastReason === 'network')) ||
      this.lastReason === reason;

    if (sameBucket) {
      this.currentDelayMs = this.currentDelayMs > 0 ? Math.min(this.currentDelayMs * 2, max) : base;
    } else {
      this.currentDelayMs = base;
    }

    this.backoffUntil = now + this.currentDelayMs;
    this.lastReason = reason;
  }

  async waitIfNeeded(options: {
    now?: () => number;
    sleepFn?: (ms: number) => Promise<void>;
  } = {}): Promise<void> {
    const nowFn = options.now ?? (() => Date.now());
    const sleepFn = options.sleepFn ?? defaultSleep;
    const remaining = this.backoffUntil - nowFn();
    if (remaining > 0) {
      await sleepFn(remaining);
    }
  }

  getState(): BackoffState {
    return {
      currentDelayMs: this.currentDelayMs,
      backoffUntil: this.backoffUntil,
      lastReason: this.lastReason,
    };
  }
}

async function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const globalDownloadBackoff = new DownloadBackoffController();
