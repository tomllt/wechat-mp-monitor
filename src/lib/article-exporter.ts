import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import TurndownService from 'turndown';
import { getStorageRoot } from './paths.js';
import type { ArticleRow } from './types.js';

/**
 * 导出格式
 */
export type ExportFormat = 'md' | 'word' | 'both';

/**
 * 文章导出器
 * 支持多级目录存储: md/YYYY/MM/DD/{企业类型}/{企业名称}/xx.md
 * 兼容普通模式: md/YYYY/MM/DD/{公众号}/xx.md
 */
export interface EnterpriseInfo {
  type: string;    // 企业类型: 央企/民企/地方国企
  company: string; // 企业名称
}

export class ArticleExporter {
  private storageRoot: string;
  private turndownService: TurndownService;

  constructor(customRoot?: string) {
    this.storageRoot = customRoot || getStorageRoot();
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
  }

  /**
   * 导出文章
   */
  async export(
    article: ArticleRow,
    html: string,
    accountName: string,
    format: ExportFormat = 'md',
    enterprise?: EnterpriseInfo
  ): Promise<{ mdPath?: string; wordPath?: string }> {
    const dirPath = this.buildDirectoryPath(article, accountName, enterprise);
    await this.ensureDirectory(dirPath);

    const safeTitle = this.sanitizeFilename(article.title);
    const result: { mdPath?: string; wordPath?: string } = {};

    // 导出 Markdown
    if (format === 'md' || format === 'both') {
      const mdPath = path.join(dirPath, `${safeTitle}.md`);
      const markdown = this.htmlToMarkdown(html);
      const frontmatter = this.buildFrontmatter(article, accountName);
      await fs.writeFile(mdPath, frontmatter + '\n\n' + markdown, 'utf-8');
      result.mdPath = mdPath;
    }

    // 导出 Word (HTML 直接保存为 doc，Word 可直接打开)
    if (format === 'word' || format === 'both') {
      const wordPath = path.join(dirPath, `${safeTitle}.doc`);
      const wordContent = this.buildWordHtml(article, accountName, html);
      await fs.writeFile(wordPath, wordContent, 'utf-8');
      result.wordPath = wordPath;
    }

    return result;
  }

  /**
   * 构建目录路径
   * 企业模式: {storageRoot}/md/YYYY/MM/DD/{企业类型}/{企业名称}/
   * 普通模式: {storageRoot}/md/YYYY/MM/DD/{公众号}/
   */
  private buildDirectoryPath(
    article: ArticleRow,
    accountName: string,
    enterprise?: EnterpriseInfo
  ): string {
    const date = new Date(article.create_time * 1000);
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (enterprise) {
      // 企业下载模式: md/YYYY/MM/DD/{企业类型}/{企业名称}/
      const safeType = this.sanitizeFilename(enterprise.type);
      const safeCompany = this.sanitizeFilename(enterprise.company);
      return path.join(this.storageRoot, 'md', year, month, day, safeType, safeCompany);
    } else {
      // 普通模式: md/YYYY/MM/DD/{公众号}/
      const safeAccountName = this.sanitizeFilename(accountName);
      return path.join(this.storageRoot, 'md', year, month, day, safeAccountName);
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * 清理文件名中的非法字符
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  /**
   * HTML 转 Markdown
   */
  private htmlToMarkdown(html: string): string {
    return this.turndownService.turndown(html);
  }

  /**
   * 构建 Markdown Frontmatter
   */
  private buildFrontmatter(article: ArticleRow, accountName: string): string {
    const date = new Date(article.create_time * 1000).toISOString();
    const lines = [
      '---',
      `title: "${article.title.replace(/"/g, '\"')}"`,
      `author: "${article.author_name || accountName}"`,
      `account: "${accountName}"`,
      `date: "${date}"`,
      `source: "${article.link}"`,
      `digest: "${(article.digest || '').replace(/"/g, '\"').replace(/\n/g, ' ')}"`,
      `aid: "${article.aid}"`,
      `fakeid: "${article.fakeid}"`,
      '---',
    ];
    return lines.join('\n');
  }

  /**
   * 构建 Word 兼容的 HTML
   */
  private buildWordHtml(article: ArticleRow, accountName: string, contentHtml: string): string {
    const date = new Date(article.create_time * 1000).toLocaleString('zh-CN');
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${article.title}</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; padding: 20px; }
    .meta { color: #666; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
    .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .author { font-size: 14px; color: #888; }
    .content { line-height: 1.8; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="title">${article.title}</div>
  <div class="meta">
    <div class="author">公众号：${accountName}</div>
    <div class="author">作者：${article.author_name || accountName}</div>
    <div class="author">发布时间：${date}</div>
    <div class="author">原文链接：<a href="${article.link}">${article.link}</a></div>
  </div>
  <div class="content">
    ${contentHtml}
  </div>
</body>
</html>`;
  }

  /**
   * 获取存储根目录
   */
  get root(): string {
    return this.storageRoot;
  }
}

/**
 * 全局单例导出器
 */
export const globalExporter = new ArticleExporter();

export default globalExporter;
