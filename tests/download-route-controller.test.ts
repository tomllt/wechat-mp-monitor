import { describe, expect, it, vi } from 'vitest';

import { DownloadRouteController } from '../src/lib/wechat/download-route-controller.js';

describe('DownloadRouteController', () => {
  it('switches to direct mode after consecutive service risk hits', () => {
    const controller = new DownloadRouteController();
    controller.recordServiceRiskHit();
    controller.recordServiceRiskHit();
    controller.recordServiceRiskHit();
    expect(controller.getState().mode).toBe('service');

    controller.recordServiceRiskHit();
    expect(controller.getState().mode).toBe('direct');
  });

  it('switches to direct mode after consecutive service network failures', () => {
    const controller = new DownloadRouteController();
    for (let i = 0; i < 6; i += 1) {
      controller.recordServiceNetworkFailure();
    }
    expect(controller.getState().mode).toBe('direct');
  });

  it('applies throttling while in direct mode', async () => {
    const controller = new DownloadRouteController();
    controller.activateDirectMode(10_000);
    const sleepFn = vi.fn(async () => {});

    await controller.waitIfNeeded({ now: () => 1000, sleepFn });
    await controller.waitIfNeeded({ now: () => 1500, sleepFn });

    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(2500);
  });
});
