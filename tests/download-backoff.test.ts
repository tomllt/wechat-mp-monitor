import { describe, expect, it, vi } from 'vitest';

import { DownloadBackoffController } from '../src/lib/wechat/download-backoff.js';

describe('DownloadBackoffController', () => {
  it('does not wait when no backoff is active', async () => {
    const controller = new DownloadBackoffController();
    const sleepFn = vi.fn(async () => {});
    await controller.waitIfNeeded({ now: () => 1000, sleepFn });
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('applies escalating backoff for env_abnormal and resets on success', async () => {
    const controller = new DownloadBackoffController({
      envAbnormalBaseMs: 1000,
      envAbnormalMaxMs: 8000,
    });

    controller.record('env_abnormal', 1000);
    expect(controller.getState().currentDelayMs).toBe(1000);
    expect(controller.getState().backoffUntil).toBe(2000);

    controller.record('env_abnormal', 2000);
    expect(controller.getState().currentDelayMs).toBe(2000);
    expect(controller.getState().backoffUntil).toBe(4000);

    controller.record('success', 5000);
    expect(controller.getState().currentDelayMs).toBe(0);
    expect(controller.getState().backoffUntil).toBe(0);
  });

  it('waits for the remaining backoff window', async () => {
    const controller = new DownloadBackoffController({ envAbnormalBaseMs: 1200 });
    const sleepFn = vi.fn(async () => {});

    controller.record('env_abnormal', 1000);
    await controller.waitIfNeeded({ now: () => 1500, sleepFn });

    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(700);
  });

  it('applies shorter backoff for aborted/network and caps growth', () => {
    const controller = new DownloadBackoffController({
      transientBaseMs: 500,
      transientMaxMs: 2000,
    });

    controller.record('aborted', 1000);
    expect(controller.getState().currentDelayMs).toBe(500);

    controller.record('network', 2000);
    expect(controller.getState().currentDelayMs).toBe(1000);

    controller.record('network', 3000);
    expect(controller.getState().currentDelayMs).toBe(2000);

    controller.record('network', 4000);
    expect(controller.getState().currentDelayMs).toBe(2000);
  });
});
