import fs from 'node:fs';
import { articleNormalizedPath, articleRawPath } from '../paths.js';
import { updateArticleContent, updateArticleFts } from '../storage/db.js';
import type { ArticleRow, StoredCookie } from '../types.js';
import { wechatRequest } from './http.js';
import { globalExporter, type ExportFormat } from '../article-exporter.js';
import { getWatchAccount } from '../storage/db.js';

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
  // 文章正文下载优先使用代理
  const first = await wechatRequest<string>({
    method: 'GET',
    endpoint: link,
    responseType: 'text',
    forceProxy: true, // 强制使用代理下载正文
  });
  if (validateArticleHtml(first.data) === 'success' || !cookies?.length) {
    return first.data;
  }
  const second = await wechatRequest<string>({
    method: 'GET',
    endpoint: link,
    cookies,
    responseType: 'text',
    forceProxy: true,
  });
  return second.data;
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
    const state = validateArticleHtml(html);

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
        contentStatus: 'failed',
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
        options.exportFormat || 'md'
      );
      result.exportedMdPath = exported.mdPath;
      result.exportedWordPath = exported.wordPath;
    }

    return result;
  } catch (error) {
    console.error(`下载文章失败 [${article.aid}]:`, error instanceof Error ? error.message : String(error));
    throw error;
  }
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
