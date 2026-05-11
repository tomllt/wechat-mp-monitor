import { getDb } from './storage/db.js';

export interface FilteredArticle {
  id?: number;
  articleId: number;
  fakeid: string;
  aid: string;
  title: string;
  digest?: string | null;
  authorName?: string | null;
  link: string;
  cover?: string | null;
  createTime: number;
  rawHtml?: string | null;
  normalizedHtml?: string | null;
  html?: string | null;
  htmlFormat?: string | null;
  matchedKeywords: string[];
  matchScore: number;
  fetchedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 插入或更新过滤后的文章
 */
export async function upsertFilteredArticle(article: FilteredArticle): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    INSERT INTO articles_filter (
      article_id, fakeid, aid, title, digest, author_name, link, cover,
      create_time, raw_html, normalized_html, html, html_format,
      matched_keywords, match_score, fetched_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fakeid, aid) DO UPDATE SET
      title = excluded.title,
      digest = excluded.digest,
      author_name = excluded.author_name,
      link = excluded.link,
      cover = excluded.cover,
      create_time = excluded.create_time,
      raw_html = COALESCE(excluded.raw_html, raw_html),
      normalized_html = COALESCE(excluded.normalized_html, normalized_html),
      html = COALESCE(excluded.html, html),
      html_format = COALESCE(excluded.html_format, html_format),
      matched_keywords = excluded.matched_keywords,
      match_score = excluded.match_score,
      fetched_at = COALESCE(excluded.fetched_at, fetched_at),
      updated_at = excluded.updated_at
    RETURNING id
  `).get(
    article.articleId,
    article.fakeid,
    article.aid,
    article.title,
    article.digest,
    article.authorName,
    article.link,
    article.cover,
    article.createTime,
    article.rawHtml,
    article.normalizedHtml,
    article.html,
    article.htmlFormat,
    JSON.stringify(article.matchedKeywords),
    article.matchScore,
    article.fetchedAt,
    now,
    now
  ) as { id: number };
  
  return result.id;
}

/**
 * 批量插入过滤后的文章
 */
export async function batchUpsertFilteredArticles(articles: FilteredArticle[]): Promise<number[]> {
  const db = getDb();
  const now = new Date().toISOString();
  const ids: number[] = [];
  
  const insert = db.prepare(`
    INSERT INTO articles_filter (
      article_id, fakeid, aid, title, digest, author_name, link, cover,
      create_time, raw_html, normalized_html, html, html_format,
      matched_keywords, match_score, fetched_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fakeid, aid) DO UPDATE SET
      title = excluded.title,
      digest = excluded.digest,
      author_name = excluded.author_name,
      link = excluded.link,
      cover = excluded.cover,
      create_time = excluded.create_time,
      raw_html = COALESCE(excluded.raw_html, raw_html),
      normalized_html = COALESCE(excluded.normalized_html, normalized_html),
      html = COALESCE(excluded.html, html),
      html_format = COALESCE(excluded.html_format, html_format),
      matched_keywords = excluded.matched_keywords,
      match_score = excluded.match_score,
      fetched_at = COALESCE(excluded.fetched_at, fetched_at),
      updated_at = excluded.updated_at
    RETURNING id
  `);
  
  const transaction = db.transaction((articleList: FilteredArticle[]) => {
    for (const article of articleList) {
      const result = insert.get(
        article.articleId,
        article.fakeid,
        article.aid,
        article.title,
        article.digest,
        article.authorName,
        article.link,
        article.cover,
        article.createTime,
        article.rawHtml,
        article.normalizedHtml,
        article.html,
        article.htmlFormat,
        JSON.stringify(article.matchedKeywords),
        article.matchScore,
        article.fetchedAt,
        now,
        now
      ) as { id: number };
      ids.push(result.id);
    }
    return ids;
  });
  
  return transaction(articles);
}

/**
 * 获取过滤后的文章列表
 */
export async function getFilteredArticles(options: {
  limit?: number;
  offset?: number;
  minScore?: number;
  startTime?: number;
  endTime?: number;
} = {}): Promise<FilteredArticle[]> {
  const db = getDb();
  
  let sql = `
    SELECT 
      id, article_id as articleId, fakeid, aid, title, digest, author_name as authorName,
      link, cover, create_time as createTime, raw_html as rawHtml,
      normalized_html as normalizedHtml, html, html_format as htmlFormat,
      matched_keywords as matchedKeywords, match_score as matchScore,
      fetched_at as fetchedAt, created_at as createdAt, updated_at as updatedAt
    FROM articles_filter
    WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (options.minScore !== undefined) {
    sql += ` AND match_score >= ?`;
    params.push(options.minScore);
  }
  
  if (options.startTime !== undefined) {
    sql += ` AND create_time >= ?`;
    params.push(options.startTime);
  }
  
  if (options.endTime !== undefined) {
    sql += ` AND create_time <= ?`;
    params.push(options.endTime);
  }
  
  sql += ` ORDER BY create_time DESC`;
  
  if (options.limit !== undefined) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }
  
  if (options.offset !== undefined) {
    sql += ` OFFSET ?`;
    params.push(options.offset);
  }
  
  const rows = db.prepare(sql).all(...params) as any[];
  
  return rows.map(row => ({
    ...row,
    matchedKeywords: JSON.parse(row.matchedKeywords || '[]')
  }));
}

/**
 * 获取过滤文章数量
 */
export async function getFilteredArticlesCount(options: {
  minScore?: number;
  startTime?: number;
  endTime?: number;
} = {}): Promise<number> {
  const db = getDb();
  
  let sql = `SELECT COUNT(*) as count FROM articles_filter WHERE 1=1`;
  const params: any[] = [];
  
  if (options.minScore !== undefined) {
    sql += ` AND match_score >= ?`;
    params.push(options.minScore);
  }
  
  if (options.startTime !== undefined) {
    sql += ` AND create_time >= ?`;
    params.push(options.startTime);
  }
  
  if (options.endTime !== undefined) {
    sql += ` AND create_time <= ?`;
    params.push(options.endTime);
  }
  
  const result = db.prepare(sql).get(...params) as { count: number };
  return result.count;
}

/**
 * 更新文章 HTML 内容（下载正文后更新）
 */
export async function updateFilteredArticleHtml(
  fakeid: string,
  aid: string,
  rawHtml: string,
  normalizedHtml: string,
  htmlFormat: string = 'html'
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE articles_filter
    SET raw_html = ?, normalized_html = ?, html = ?, html_format = ?, fetched_at = ?, updated_at = ?
    WHERE fakeid = ? AND aid = ?
  `).run(rawHtml, normalizedHtml, normalizedHtml, htmlFormat, now, now, fakeid, aid);
}

/**
 * 清空过滤表（用于重新过滤）
 */
export async function clearFilteredArticles(): Promise<void> {
  const db = getDb();
  db.prepare(`DELETE FROM articles_filter`).run();
  console.log('✅ 已清空 articles_filter 表');
}
