import { beforeEach, describe, expect, it, vi } from 'vitest';

const wechatRequestMock = vi.fn();

vi.mock('../src/lib/wechat/http.js', () => ({
  wechatRequest: wechatRequestMock,
}));

describe('article-html classification and retry behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    wechatRequestMock.mockReset();
  });

  it('classifies success, deleted, env abnormal and rate limit pages', async () => {
    const { classifyArticleHtml } = await import('../src/lib/wechat/article-html.js');

    expect(classifyArticleHtml('<div id="js_article">正文</div>')).toBe('success');
    expect(classifyArticleHtml('该内容已被发布者删除')).toBe('deleted');
    expect(classifyArticleHtml('<h2 class="weui-msg__title">环境异常</h2><a id="js_verify">去验证</a>')).toBe('env_abnormal');
    expect(classifyArticleHtml('访问过于频繁，请稍后再试')).toBe('rate_limit');
    expect(classifyArticleHtml('<html>something else</html>')).toBe('invalid');
  });

  it('retries transient request failures and eventually succeeds', async () => {
    const { fetchArticleHtml } = await import('../src/lib/wechat/article-html.js');

    const abortedError = new Error('This operation was aborted');
    wechatRequestMock
      .mockRejectedValueOnce(abortedError)
      .mockResolvedValueOnce({ data: '<div id="js_article">ok</div>' });

    const html = await fetchArticleHtml('https://mp.weixin.qq.com/s/test');

    expect(html).toContain('js_article');
    expect(wechatRequestMock).toHaveBeenCalledTimes(2);
  });

  it('retries with cookies after env abnormal page', async () => {
    const { fetchArticleHtml } = await import('../src/lib/wechat/article-html.js');

    wechatRequestMock
      .mockResolvedValueOnce({ data: '<h2 class="weui-msg__title">环境异常</h2><a id="js_verify">去验证</a>' })
      .mockResolvedValueOnce({ data: '<div id="js_article">ok</div>' });

    const html = await fetchArticleHtml('https://mp.weixin.qq.com/s/test', [
      { name: 'foo', value: 'bar' },
    ]);

    expect(html).toContain('js_article');
    expect(wechatRequestMock).toHaveBeenCalledTimes(2);
    expect(wechatRequestMock.mock.calls[1]?.[0]?.cookies).toEqual([{ name: 'foo', value: 'bar' }]);
  });
});
