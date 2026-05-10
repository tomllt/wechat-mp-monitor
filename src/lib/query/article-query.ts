import { getDb } from '../storage/db.js';
import type { ArticleQueryInput, ArticleQueryResult } from '../types.js';
import { parseDateEnd, parseDateStart, unixSecondsToIso } from '../utils.js';

function toUnixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

export function queryArticles(input: ArticleQueryInput): ArticleQueryResult[] {
  const db = getDb();
  const limit = input.limit ?? 20;

  if (input.keyword?.trim()) {
    const keyword = input.keyword.trim();
    const likeKeyword = `%${keyword}%`;
    const conditions = [
      '(article.title LIKE ? OR COALESCE(article.digest, \'\') LIKE ? OR COALESCE(article.plain_text, \'\') LIKE ?)',
    ];
    const params: Array<string | number> = [likeKeyword, likeKeyword, likeKeyword];
    if (input.account) {
      conditions.push('(article.fakeid = ? OR watch_account.nickname = ?)');
      params.push(input.account, input.account);
    }
    if (input.dateFrom) {
      conditions.push('article.create_time >= ?');
      params.push(toUnixSeconds(parseDateStart(input.dateFrom)));
    }
    if (input.dateTo) {
      conditions.push('article.create_time <= ?');
      params.push(toUnixSeconds(parseDateEnd(input.dateTo)));
    }
    params.push(limit);

    const rows = db
      .prepare(
        `
        SELECT
          article.fakeid,
          COALESCE(watch_account.nickname, '') AS nickname,
          article.aid,
          article.title,
          COALESCE(article.digest, '') AS digest,
          COALESCE(article.author_name, '') AS author_name,
          article.link,
          article.create_time,
          article.content_status,
          COALESCE(article.plain_text, '') AS plain_text
        FROM article
        LEFT JOIN watch_account ON watch_account.fakeid = article.fakeid
        WHERE ${conditions.join(' AND ')}
        ORDER BY article.create_time DESC
        LIMIT ?
        `
      )
      .all(...params) as Array<ArticleQueryResult & { plain_text: string }>;
    return rows.map(row => {
      const snippetSource = row.plain_text || row.digest || row.title;
      const snippet = buildSnippet(snippetSource, keyword);
      return {
        fakeid: row.fakeid,
        nickname: row.nickname,
        aid: row.aid,
        title: row.title,
        digest: row.digest,
        author_name: row.author_name,
        link: row.link,
        create_time: row.create_time,
        content_status: row.content_status,
        snippet,
      };
    });
  }

  const conditions: string[] = ['1 = 1'];
  const params: Array<string | number> = [];
  if (input.account) {
    conditions.push('(article.fakeid = ? OR watch_account.nickname = ?)');
    params.push(input.account, input.account);
  }
  if (input.dateFrom) {
    conditions.push('article.create_time >= ?');
    params.push(toUnixSeconds(parseDateStart(input.dateFrom)));
  }
  if (input.dateTo) {
    conditions.push('article.create_time <= ?');
    params.push(toUnixSeconds(parseDateEnd(input.dateTo)));
  }
  params.push(limit);

  return db
    .prepare(
      `
      SELECT
        article.fakeid,
        COALESCE(watch_account.nickname, '') AS nickname,
        article.aid,
        article.title,
        COALESCE(article.digest, '') AS digest,
        COALESCE(article.author_name, '') AS author_name,
        article.link,
        article.create_time,
        article.content_status
      FROM article
      LEFT JOIN watch_account ON watch_account.fakeid = article.fakeid
      WHERE ${conditions.join(' AND ')}
      ORDER BY article.create_time DESC
      LIMIT ?
      `
    )
    .all(...params) as ArticleQueryResult[];
}

export function renderArticleQuery(rows: ArticleQueryResult[], format: 'table' | 'json' | 'md'): string {
  if (format === 'json') {
    return JSON.stringify(rows, null, 2);
  }

  if (format === 'md') {
    const lines = [
      '| 发布时间 | 公众号 | 标题 | 链接 |',
      '| --- | --- | --- | --- |',
      ...rows.map(row => {
        return `| ${unixSecondsToIso(row.create_time)} | ${escapePipe(row.nickname)} | ${escapePipe(row.title)} | ${row.link} |`;
      }),
    ];
    return lines.join('\n');
  }

  const header = ['发布时间', '公众号', '标题', '状态'];
  const tableRows = rows.map(row => [
    unixSecondsToIso(row.create_time),
    row.nickname,
    row.title,
    row.content_status,
  ]);
  const widths = header.map((item, index) => {
    return Math.max(item.length, ...tableRows.map(row => row[index].length));
  });
  const render = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
  return [render(header), ...tableRows.map(render)].join('\n');
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function buildSnippet(source: string, keyword: string): string {
  if (!source) {
    return '';
  }
  const index = source.indexOf(keyword);
  if (index === -1) {
    return source.slice(0, 80);
  }
  const start = Math.max(0, index - 10);
  const end = Math.min(source.length, index + keyword.length + 20);
  return `${source.slice(start, index)}[${keyword}]${source.slice(index + keyword.length, end)}`;
}
