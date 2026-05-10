import fs from 'node:fs';
import path from 'node:path';
import { listReportKeywords } from '../storage/db.js';
import type { DailyReport } from '../types.js';
import { reportOutputDir } from '../paths.js';
import { queryArticles } from '../query/article-query.js';

export function buildDailyReport(input: { date: string; keywords?: string[] }): DailyReport {
  const keywords = input.keywords?.length
    ? input.keywords
    : listReportKeywords()
        .filter(item => Number(item.enabled) === 1)
        .map(item => String(item.keyword));

  const groups = keywords.map(keyword => {
    const articles = queryArticles({
      keyword,
      dateFrom: input.date,
      dateTo: input.date,
      limit: 100,
    });
    return {
      keyword,
      count: articles.length,
      articles,
    };
  });

  const totalSet = new Set<string>();
  for (const group of groups) {
    for (const article of group.articles) {
      totalSet.add(`${article.fakeid}:${article.aid}`);
    }
  }

  return {
    date: input.date,
    generatedAt: new Date().toISOString(),
    keywords: groups,
    totalArticles: totalSet.size,
  };
}

export async function writeDailyReportFiles(
  report: DailyReport,
  options?: {
    format?: 'md' | 'json' | 'both';
    outputDir?: string;
  }
): Promise<{ outputDir: string; files: string[] }> {
  const format = options?.format ?? 'both';
  const outputDir = options?.outputDir ?? reportOutputDir(report.date);
  fs.mkdirSync(outputDir, { recursive: true });

  const files: string[] = [];
  if (format === 'json' || format === 'both') {
    const jsonPath = path.join(outputDir, 'summary.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    files.push(jsonPath);
  }
  if (format === 'md' || format === 'both') {
    const markdownPath = path.join(outputDir, 'summary.md');
    fs.writeFileSync(markdownPath, renderDailyReportMarkdown(report));
    files.push(markdownPath);
  }
  return {
    outputDir,
    files,
  };
}

export function renderDailyReportMarkdown(report: DailyReport): string {
  const lines = [
    `# 微信公众号关键词日报 ${report.date}`,
    '',
    `生成时间：${report.generatedAt}`,
    '',
    `命中文章总数：${report.totalArticles}`,
    '',
  ];

  for (const group of report.keywords) {
    lines.push(`## ${group.keyword}`);
    lines.push('');
    lines.push(`命中数量：${group.count}`);
    lines.push('');
    for (const article of group.articles) {
      lines.push(`- [${article.title}](${article.link})`);
      lines.push(`  公众号：${article.nickname}`);
      lines.push(`  发布时间：${new Date(article.create_time * 1000).toISOString()}`);
      if (article.snippet) {
        lines.push(`  命中片段：${article.snippet}`);
      } else if (article.digest) {
        lines.push(`  摘要：${article.digest}`);
      }
    }
    if (!group.articles.length) {
      lines.push('- 无命中');
    }
    lines.push('');
  }

  return lines.join('\n');
}
