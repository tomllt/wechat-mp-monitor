import fs from 'node:fs';
import { articleNormalizedPath, articleRawPath } from '../paths.js';
import { updateArticleContent, updateArticleFts } from '../storage/db.js';
import type { ArticleRow, StoredCookie } from '../types.js';
import { nowIso } from '../storage/db.js';
import { normalizeHtml } from '../html/normalize.js';
import { wechatRequest } from './http.js';

export function validateArticleHtml(html: string): 'success' | 'deleted' | 'invalid' {
  if (html.includes('id="js_article"') || html.includes("id='js_article'")) {
    return 'success';
  }
  if (html.includes('该内容已被发布者删除') || html.includes('The content has been deleted by the author.')) {
    return 'deleted';
  }
  return 'invalid';
}

export async function fetchArticleHtml(link: string, cookies?: StoredCookie[]): Promise<string> {
  const first = await wechatRequest<string>({
    method: 'GET',
    endpoint: link,
    responseType: 'text',
  });
  if (validateArticleHtml(first.data) === 'success' || !cookies?.length) {
    return first.data;
  }
  const second = await wechatRequest<string>({
    method: 'GET',
    endpoint: link,
    cookies,
    responseType: 'text',
  });
  return second.data;
}

export async function ingestArticleHtml(article: ArticleRow, cookies?: StoredCookie[]): Promise<{
  status: string;
  rawHtmlPath?: string;
  normalizedHtmlPath?: string;
}> {
  const html = await fetchArticleHtml(article.link, cookies);
  const state = validateArticleHtml(html);
  if (state === 'deleted') {
    updateArticleContent(article.fakeid, article.aid, {
      contentStatus: 'deleted',
      fetchedAt: nowIso(),
    });
    updateArticleFts(article.fakeid, article.aid);
    return {
      status: 'deleted',
    };
  }
  if (state !== 'success') {
    updateArticleContent(article.fakeid, article.aid, {
      contentStatus: 'failed',
      fetchedAt: nowIso(),
    });
    return {
      status: 'failed',
    };
  }

  const rawPath = articleRawPath(article.fakeid, article.aid);
  const normalizedPath = articleNormalizedPath(article.fakeid, article.aid);
  fs.writeFileSync(rawPath, html);
  fs.writeFileSync(normalizedPath, normalizeHtml(html, 'html'));
  updateArticleContent(article.fakeid, article.aid, {
    contentStatus: 'ready',
    rawHtmlPath: rawPath,
    normalizedHtmlPath: normalizedPath,
    plainText: normalizeHtml(html, 'text'),
    fetchedAt: nowIso(),
  });
  updateArticleFts(article.fakeid, article.aid);
  return {
    status: 'ready',
    rawHtmlPath: rawPath,
    normalizedHtmlPath: normalizedPath,
  };
}
