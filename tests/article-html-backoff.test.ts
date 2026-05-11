import { beforeEach, describe, expect, it, vi } from 'vitest';

const wechatRequestMock = vi.fn();

vi.mock('../src/lib/wechat/http.js', () => ({
  wechatRequest: wechatRequestMock,
}));

describe('article-html backoff integration', () => {
  beforeEach(() => {
    vi.resetModules();
    wechatRequestMock.mockReset();
  });

  it('records env abnormal into global backoff controller', async () => {
    const { fetchArticleHtml } = await import('../src/lib/wechat/article-html.js');
    const { globalDownloadBackoff } = await import('../src/lib/wechat/download-backoff.js');

    wechatRequestMock.mockResolvedValue({
      data: '<h2 class="weui-msg__title">环境异常</h2><a id="js_verify">去验证</a>',
    });

    const html = await fetchArticleHtml('https://mp.weixin.qq.com/s/test');
    expect(html).toContain('环境异常');

    const state = globalDownloadBackoff.getState();
    expect(state.currentDelayMs).toBeGreaterThan(0);
    expect(state.lastReason).toBe('env_abnormal');
  });
});
