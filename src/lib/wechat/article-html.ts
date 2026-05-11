import fs from 'node:fs';
import { articleNormalizedPath, articleRawPath } from '../paths.js';
import { updateArticleContent, updateArticleFts } from '../storage/db.js';
import type { ArticleRow, StoredCookie } from '../types.js';
import { wechatRequest } from './http.js';
import { globalExporter, type ExportFormat, type EnterpriseInfo } from '../article-exporter.js';
import { getWatchAccount } from '../storage/db.js';
import { globalDownloadBackoff } from './download-backoff.js';
import { globalDownloadRouteController } from './download-route-controller.js';

export type ArticleHtmlState = 'success' | 'deleted' | 'env_abnormal' | 'rate_limit' | 'verify' | 'invalid';

export function classifyArticleHtml(html: string): ArticleHtmlState {
  if (html.includes('id="js_article"') || html.includes("id='js_article'")) {
    return 'success';
  }
  if (html.includes('该内容已被发布者删除') || html.includes('The content has been deleted by the author.')) {
    return 'deleted';
  }
  if (html.includes('环境异常')) {
    return 'env_abnormal';
  }
  if (html.includes('访问过于频繁')) {
    return 'rate_limit';
  }
  if (html.includes('去验证')) {
    return 'verify';
  }
  return 'invalid';
}

export function validateArticleHtml(html: string): 'success' | 'deleted' | 'invalid' {
  const state = classifyArticleHtml(html);
  if (state === 'success' || state === 'deleted') {
    return state;
  }
  return 'invalid';
}

export function classifyDownloadError(error: unknown): 'aborted' | 'network' | 'other' {
  const message = error instanceof Error ? error.message : String(error);
  const causeMessage = error && typeof error === 'object' && 'cause' in error
    ? String((error as { cause?: unknown }).cause)
    : '';
  const text = `${message} ${causeMessage}`;

  if (text.includes('This operation was aborted') || text.includes('AbortError')) {
    return 'aborted';
  }
  if (text.includes('fetch failed') || text.includes('ENOTFOUND') || text.includes('ECONNRESET') || text.includes('ETIMEDOUT')) {
    return 'network';
  }
  return 'other';
}

const TRANSIENT_ERROR_RETRY_LIMIT = 2;
const TRANSIENT_HTML_RETRY_LIMIT = 2;
const RETRY_DELAY_MS = 300;

async function requestArticleHtml(
  link: string,
  cookies?: StoredCookie[]
): Promise<{ html: string; serviceUsed?: string }> {
  await globalDownloadBackoff.waitIfNeeded();
  await globalDownloadRouteController.waitIfNeeded();
  const response = await wechatRequest<string>({
    method: 'GET',
    endpoint: link,
    cookies,
    responseType: 'text',
    useDownloadService: true,
  });
  return {
    html: response.data,
    serviceUsed: response.serviceUsed,
  };
}

export async function fetchArticleHtml(link: string, cookies?: StoredCookie[]): Promise<string> {
  const variants: Array<StoredCookie[] | undefined> = [undefined];
  if (cookies?.length) {
    variants.push(cookies);
  }

  let lastError: unknown;
  let lastHtml = '';

  for (const variantCookies of variants) {
    let transientHtmlAttempts = 0;

    for (let attempt = 0; attempt <= TRANSIENT_ERROR_RETRY_LIMIT; attempt += 1) {
      try {
        const { html, serviceUsed } = await requestArticleHtml(link, variantCookies);
        lastHtml = html;
        const state = classifyArticleHtml(html);

        if (state === 'success' || state === 'deleted') {
          if (serviceUsed) {
            globalDownloadRouteController.recordServiceSuccess();
          }
          globalDownloadBackoff.record('success');
          return html;
        }

        const retryableHtml = state === 'env_abnormal' || state === 'verify' || state === 'rate_limit';
        if (retryableHtml) {
          if (serviceUsed) {
            globalDownloadRouteController.recordServiceRiskHit();
          }
          globalDownloadBackoff.record(state === 'rate_limit' ? 'rate_limit' : state === 'verify' ? 'verify' : 'env_abnormal');
          if (!variantCookies && cookies?.length) {
            break;
          }
          if (transientHtmlAttempts < TRANSIENT_HTML_RETRY_LIMIT) {
            transientHtmlAttempts += 1;
            await sleep(RETRY_DELAY_MS);
            continue;
          }
        }

        break;
      } catch (error) {
        lastError = error;
        const errorType = classifyDownloadError(error);
        if (errorType === 'aborted') {
          globalDownloadBackoff.record('aborted');
        } else if (errorType === 'network') {
          globalDownloadBackoff.record('network');
        }
        if ((errorType === 'aborted' || errorType === 'network') && attempt < TRANSIENT_ERROR_RETRY_LIMIT) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw error;
      }
    }
  }

  if (lastHtml) {
    return lastHtml;
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to fetch article html');
}

export interface IngestOptions {
  /**
   * 是否导出到文件
   */
  export?: boolean;
  /**
   * 导出格式
   */
  exportFormat?: ExportFormat;
  /**
   * 自定义导出目录
   */
  exportPath?: string;
  /**
   * 企业信息（企业下载模式专用）
   */
  enterprise?: EnterpriseInfo;
}

export function mapArticleHtmlStateToContentStatus(state: ArticleHtmlState): string {
  switch (state) {
    case 'success':
      return 'ready';
    case 'deleted':
      return 'deleted';
    case 'env_abnormal':
      return 'failed_env_abnormal';
    case 'verify':
      return 'failed_verify';
    case 'rate_limit':
      return 'failed_rate_limit';
    default:
      return 'failed_invalid';
  }
}

export function mapDownloadErrorToContentStatus(error: unknown): string {
  const type = classifyDownloadError(error);
  switch (type) {
    case 'aborted':
      return 'failed_aborted';
    case 'network':
      return 'failed_network';
    default:
      return 'failed_exception';
  }
}

export async function ingestArticleHtml(
  article: ArticleRow,
  cookies?: StoredCookie[],
  options: IngestOptions = {}
): Promise<{
  status: string;
  rawHtmlPath?: string;
  normalizedHtmlPath?: string;
  exportedMdPath?: string;
  exportedWordPath?: string;
}> {
  try {
    const html = await fetchArticleHtml(article.link, cookies);
    const state = classifyArticleHtml(html);

    if (state === 'deleted') {
      updateArticleContent(article.fakeid, article.aid, {
        contentStatus: 'deleted',
        fetchedAt: new Date().toISOString(),
      });
      updateArticleFts(article.fakeid, article.aid);
      return {
        status: 'deleted',
      };
    }
    if (state !== 'success') {
      updateArticleContent(article.fakeid, article.aid, {
        contentStatus: mapArticleHtmlStateToContentStatus(state),
        fetchedAt: new Date().toISOString(),
      });
      return {
        status: 'failed',
      };
    }

    const rawPath = articleRawPath(article.fakeid, article.aid);
    const normalizedPath = articleNormalizedPath(article.fakeid, article.aid);
    
    // 确保目录存在
    const rawDir = rawPath.substring(0, rawPath.lastIndexOf('/'));
    if (!fs.existsSync(rawDir)) {
      fs.mkdirSync(rawDir, { recursive: true });
    }
    const normDir = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
    if (!fs.existsSync(normDir)) {
      fs.mkdirSync(normDir, { recursive: true });
    }

    const normalizedHtml = normalizeHtml(html, 'html');
    fs.writeFileSync(rawPath, html);
    fs.writeFileSync(normalizedPath, normalizedHtml);

    updateArticleContent(article.fakeid, article.aid, {
      contentStatus: 'ready',
      rawHtmlPath: rawPath,
      normalizedHtmlPath: normalizedPath,
      plainText: normalizeHtml(html, 'text'),
      fetchedAt: new Date().toISOString(),
    });
    updateArticleFts(article.fakeid, article.aid);

    const result: {
      status: string;
      rawHtmlPath?: string;
      normalizedHtmlPath?: string;
      exportedMdPath?: string;
      exportedWordPath?: string;
    } = {
      status: 'ready',
      rawHtmlPath: rawPath,
      normalizedHtmlPath: normalizedPath,
    };

    // 导出到文件
    if (options.export) {
      const account = getWatchAccount(String(article.fakeid));
      const accountName = String(account?.nickname || article.fakeid);
      
      const exported = await globalExporter.export(
        article,
        normalizedHtml,
        accountName,
        options.exportFormat || 'md',
        options.enterprise
      );
      result.exportedMdPath = exported.mdPath;
      result.exportedWordPath = exported.wordPath;
    }

    return result;
  } catch (error) {
    updateArticleContent(article.fakeid, article.aid, {
      contentStatus: mapDownloadErrorToContentStatus(error),
      fetchedAt: new Date().toISOString(),
    });
    const cause = error && typeof error === 'object' && 'cause' in error
      ? ` | cause: ${String((error as { cause?: unknown }).cause)}`
      : '';
    console.error(`下载文章失败 [${article.aid}]:`, error instanceof Error ? error.message : String(error), cause);
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 标准化 HTML
 * 提取文章主体内容
 */
export function normalizeHtml(html: string, format: 'html' | 'text'): string {
  // 简单实现：从 script 中提取内容或直接提取正文 div
  const articleMatch = html.match(/<div[^>]*id="js_article"[^>]*>([\s\S]*?)<\/div>/i);
  if (!articleMatch) {
    // 备用方案：从微信的 cgiData 中提取
    const cgiMatch = html.match(/var\s+msg_title\s*=\s*"([^"]+)"/i);
    const cgiContentMatch = html.match(/var\s+content\s*=\s*"([^"]+)"/i);
    if (cgiContentMatch) {
      try {
        return format === 'text' 
          ? cgiContentMatch[1].replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '')
          : cgiContentMatch[1];
      } catch {
        // ignore
      }
    }
    return html;
  }

  let content = articleMatch[1];
  
  if (format === 'text') {
    // 移除 HTML 标签
    content = content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return content;
}
