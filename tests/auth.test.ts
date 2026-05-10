import { describe, expect, it } from 'vitest';
import { mapScanStatus, renderQrPngToTerminal } from '../src/lib/wechat/auth.js';

describe('mapScanStatus', () => {
  it('maps confirmed status', () => {
    expect(mapScanStatus(1)).toBe('confirmed');
  });

  it('maps scanned but not confirmed status', () => {
    expect(mapScanStatus(4)).toBe('scanned');
  });

  it('does not throw when qr image is not png', () => {
    const jpegLikeBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    expect(() => renderQrPngToTerminal(jpegLikeBuffer)).not.toThrow();
  });
});
