import Database from 'better-sqlite3';
import { databasePath, ensureRuntimeDirs } from '../paths.js';
import type { ArticleRow, SearchBizItem } from '../types.js';
import { runMigrations } from './migrations.js';

export interface QueryFilters {
  account?: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  limit?: number;
}

let dbInstance: Database.Database | null = null;

export function openDatabase(filename = databasePath): Database.Database {
  ensureRuntimeDirs();
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = openDatabase();
  }
  return dbInstance;
}

export function resetDbForTests(filename = ':memory:'): Database.Database {
  dbInstance = openDatabase(filename);
  return dbInstance;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function replaceActiveAuthSession(input: {
  authKey: string;
  token: string;
  cookieJson: string;
  nickname?: string;
  avatar?: string;
  expiresAt?: string;
}): void {
  const db = getDb();
  const now = nowIso();
  db.transaction(() => {
    db.prepare("UPDATE auth_session SET status = 'inactive', updated_at = ? WHERE status = 'active'").run(now);
    db.prepare(
      `
      INSERT INTO auth_session (auth_key, token, cookie_json, nickname, avatar, expires_at, last_validated_at, status, created_at, updated_at)
      VALUES (@authKey, @token, @cookieJson, @nickname, @avatar, @expiresAt, NULL, 'active', @now, @now)
      `
    ).run({
      authKey: input.authKey,
      token: input.token,
      cookieJson: input.cookieJson,
      nickname: input.nickname ?? null,
      avatar: input.avatar ?? null,
      expiresAt: input.expiresAt ?? null,
      now,
    });
  })();
}

export function getActiveAuthSession(): {
  id: number;
  auth_key: string;
  token: string;
  cookie_json: string;
  nickname: string | null;
  avatar: string | null;
  expires_at: string | null;
  last_validated_at: string | null;
  status: string;
} | null {
  const db = getDb();
  return ((
    db
      .prepare(
        `
        SELECT id, auth_key, token, cookie_json, nickname, avatar, expires_at, last_validated_at, status
        FROM auth_session
        WHERE status = 'active'
        ORDER BY id DESC
        LIMIT 1
        `
      )
      .get() ?? null) as {
    id: number;
    auth_key: string;
    token: string;
    cookie_json: string;
    nickname: string | null;
    avatar: string | null;
    expires_at: string | null;
    last_validated_at: string | null;
    status: string;
  } | null);
}

export function touchAuthSessionValidation(): void {
  const db = getDb();
  db.prepare("UPDATE auth_session SET last_validated_at = ?, updated_at = ? WHERE status = 'active'").run(
    nowIso(),
    nowIso()
  );
}

export function expireActiveAuthSession(): void {
  const db = getDb();
  db.prepare("UPDATE auth_session SET status = 'expired', updated_at = ? WHERE status = 'active'").run(nowIso());
}

export function upsertWatchAccount(account: SearchBizItem, sourceKeyword?: string): void {
  const db = getDb();
  const now = nowIso();
  db.prepare(
    `
    INSERT INTO watch_account (
      fakeid, nickname, alias, signature, service_type, round_head_img,
      enabled, source_keyword, created_at, updated_at
    ) VALUES (
      @fakeid, @nickname, @alias, @signature, @service_type, @round_head_img,
      1, @source_keyword, @created_at, @updated_at
    )
    ON CONFLICT(fakeid) DO UPDATE SET
      nickname = excluded.nickname,
      alias = excluded.alias,
      signature = excluded.signature,
      service_type = excluded.service_type,
      round_head_img = excluded.round_head_img,
      source_keyword = COALESCE(excluded.source_keyword, watch_account.source_keyword),
      updated_at = excluded.updated_at
    `
  ).run({
    ...account,
    source_keyword: sourceKeyword ?? null,
    created_at: now,
    updated_at: now,
  });
}

export function listWatchAccounts(): Array<Record<string, unknown>> {
  return getDb().prepare('SELECT * FROM watch_account ORDER BY enabled DESC, nickname ASC').all() as Array<
    Record<string, unknown>
  >;
}

export function removeWatchAccount(identifier: string): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM watch_account WHERE fakeid = ? OR nickname = ?').run(identifier, identifier);
  return result.changes;
}

export function setWatchAccountEnabled(fakeid: string, enabled: boolean): number {
  const result = getDb()
    .prepare('UPDATE watch_account SET enabled = ?, updated_at = ? WHERE fakeid = ?')
    .run(enabled ? 1 : 0, nowIso(), fakeid);
  return result.changes;
}

export function listEnabledWatchAccounts(): Array<Record<string, unknown>> {
  return getDb()
    .prepare('SELECT * FROM watch_account WHERE enabled = 1 ORDER BY nickname ASC')
    .all() as Array<Record<string, unknown>>;
}

export function getWatchAccount(identifier: string): Record<string, unknown> | null {
  return (
    getDb().prepare('SELECT * FROM watch_account WHERE fakeid = ? OR nickname = ? LIMIT 1').get(identifier, identifier) ??
    null
  ) as Record<string, unknown> | null;
}

export function createSyncRun(status = 'running'): number {
  const result = getDb()
    .prepare('INSERT INTO sync_run (started_at, status, notes) VALUES (?, ?, NULL)')
    .run(nowIso(), status);
  return Number(result.lastInsertRowid);
}

export function finalizeSyncRun(runId: number, values: {
  status: string;
  accountCount: number;
  articleCount: number;
  contentCount: number;
  errorCount: number;
  notes?: string | null;
}): void {
  getDb()
    .prepare(
      `
      UPDATE sync_run
      SET finished_at = ?, status = ?, account_count = ?, article_count = ?, content_count = ?, error_count = ?, notes = ?
      WHERE id = ?
      `
    )
    .run(
      nowIso(),
      values.status,
      values.accountCount,
      values.articleCount,
      values.contentCount,
      values.errorCount,
      values.notes ?? null,
      runId
    );
}

export function createSyncRunItem(runId: number, fakeid: string, nickname: string): number {
  const result = getDb()
    .prepare(
      'INSERT INTO sync_run_item (run_id, fakeid, nickname, started_at, status) VALUES (?, ?, ?, ?, ?)'
    )
    .run(runId, fakeid, nickname, nowIso(), 'running');
  return Number(result.lastInsertRowid);
}

export function finalizeSyncRunItem(itemId: number, values: {
  status: string;
  pageCount: number;
  newArticles: number;
  updatedArticles: number;
  fetchedContents: number;
  errorMessage?: string | null;
}): void {
  getDb()
    .prepare(
      `
      UPDATE sync_run_item
      SET finished_at = ?, status = ?, page_count = ?, new_articles = ?, updated_articles = ?, fetched_contents = ?, error_message = ?
      WHERE id = ?
      `
    )
    .run(
      nowIso(),
      values.status,
      values.pageCount,
      values.newArticles,
      values.updatedArticles,
      values.fetchedContents,
      values.errorMessage ?? null,
      itemId
    );
}

export function upsertArticle(article: Omit<ArticleRow, 'created_at' | 'updated_at'>): 'inserted' | 'updated' {
  const db = getDb();
  const existing = db
    .prepare('SELECT id, title, digest, author_name, update_time, is_deleted, link FROM article WHERE fakeid = ? AND aid = ?')
    .get(article.fakeid, article.aid) as { id: number } | undefined;
  const now = nowIso();
  if (!existing) {
    db.prepare(
      `
      INSERT INTO article (
        fakeid, aid, appmsgid, title, digest, author_name, link, cover, create_time, update_time, itemidx,
        copyright_stat, copyright_type, album_id, is_deleted, content_status, raw_html_path, normalized_html_path,
        plain_text, fetched_at, created_at, updated_at
      ) VALUES (
        @fakeid, @aid, @appmsgid, @title, @digest, @author_name, @link, @cover, @create_time, @update_time, @itemidx,
        @copyright_stat, @copyright_type, @album_id, @is_deleted, @content_status, @raw_html_path, @normalized_html_path,
        @plain_text, @fetched_at, @created_at, @updated_at
      )
      `
    ).run({
      ...article,
      created_at: now,
      updated_at: now,
    });
    return 'inserted';
  }

  db.prepare(
    `
    UPDATE article
    SET appmsgid = @appmsgid,
        title = @title,
        digest = @digest,
        author_name = @author_name,
        link = @link,
        cover = @cover,
        create_time = @create_time,
        update_time = @update_time,
        itemidx = @itemidx,
        copyright_stat = @copyright_stat,
        copyright_type = @copyright_type,
        album_id = @album_id,
        is_deleted = @is_deleted,
        content_status = CASE WHEN content_status = 'ready' THEN content_status ELSE @content_status END,
        updated_at = @updated_at
    WHERE fakeid = @fakeid AND aid = @aid
    `
  ).run({
    ...article,
    updated_at: now,
  });
  return 'updated';
}

export function updateArticleContent(
  fakeid: string,
  aid: string,
  values: {
    contentStatus: string;
    rawHtmlPath?: string | null;
    normalizedHtmlPath?: string | null;
    plainText?: string | null;
    fetchedAt?: string | null;
  }
): void {
  const db = getDb();
  db.prepare(
    `
    UPDATE article
    SET content_status = ?,
        raw_html_path = ?,
        normalized_html_path = ?,
        plain_text = ?,
        fetched_at = ?,
        updated_at = ?
    WHERE fakeid = ? AND aid = ?
    `
  ).run(
    values.contentStatus,
    values.rawHtmlPath ?? null,
    values.normalizedHtmlPath ?? null,
    values.plainText ?? null,
    values.fetchedAt ?? null,
    nowIso(),
    fakeid,
    aid
  );
}

export function updateAccountSyncState(fakeid: string, values: {
  lastSyncAt?: string | null;
  lastSuccessSyncAt?: string | null;
  lastSeenCreateTime?: number | null;
  lastError?: string | null;
}): void {
  getDb()
    .prepare(
      `
      UPDATE watch_account
      SET last_sync_at = COALESCE(?, last_sync_at),
          last_success_sync_at = COALESCE(?, last_success_sync_at),
          last_seen_create_time = COALESCE(?, last_seen_create_time),
          last_error = ?,
          updated_at = ?
      WHERE fakeid = ?
      `
    )
    .run(
      values.lastSyncAt ?? null,
      values.lastSuccessSyncAt ?? null,
      values.lastSeenCreateTime ?? null,
      values.lastError ?? null,
      nowIso(),
      fakeid
    );
}

export function getArticlesMissingContent(fakeid?: string): ArticleRow[] {
  const db = getDb();
  const sql = fakeid
    ? "SELECT a.*, w.nickname as nickname FROM article a LEFT JOIN watch_account w ON w.fakeid = a.fakeid WHERE a.fakeid = ? AND a.content_status != 'ready' ORDER BY a.create_time DESC"
    : "SELECT a.*, w.nickname as nickname FROM article a LEFT JOIN watch_account w ON w.fakeid = a.fakeid WHERE a.content_status != 'ready' ORDER BY a.create_time DESC";
  return (fakeid ? db.prepare(sql).all(fakeid) : db.prepare(sql).all()) as ArticleRow[];
}

export function getArticleByKeys(fakeid: string, aid: string): ArticleRow | null {
  return (getDb().prepare('SELECT * FROM article WHERE fakeid = ? AND aid = ? LIMIT 1').get(fakeid, aid) ??
    null) as ArticleRow | null;
}

export function updateArticleFts(fakeid: string, aid: string): void {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT a.title, a.digest, a.author_name, a.plain_text, a.fakeid, a.aid, COALESCE(w.nickname, '') AS nickname
      FROM article a
      LEFT JOIN watch_account w ON w.fakeid = a.fakeid
      WHERE a.fakeid = ? AND a.aid = ?
      LIMIT 1
      `
    )
    .get(fakeid, aid) as Record<string, string> | undefined;
  if (!row) {
    return;
  }
  db.prepare('DELETE FROM article_fts WHERE fakeid = ? AND aid = ?').run(fakeid, aid);
  db.prepare(
    `
    INSERT INTO article_fts (title, digest, author_name, plain_text, nickname, fakeid, aid)
    VALUES (@title, @digest, @author_name, @plain_text, @nickname, @fakeid, @aid)
    `
  ).run({
    title: row.title ?? '',
    digest: row.digest ?? '',
    author_name: row.author_name ?? '',
    plain_text: row.plain_text ?? '',
    nickname: row.nickname ?? '',
    fakeid,
    aid,
  });
}

export function listReportKeywords(): Array<Record<string, unknown>> {
  return getDb().prepare('SELECT * FROM report_keyword ORDER BY enabled DESC, keyword ASC').all() as Array<
    Record<string, unknown>
  >;
}

export function addReportKeyword(keyword: string): void {
  const now = nowIso();
  getDb()
    .prepare(
      `
      INSERT INTO report_keyword (keyword, enabled, created_at, updated_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(keyword) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at
      `
    )
    .run(keyword, now, now);
}

export function removeReportKeyword(keyword: string): number {
  return getDb().prepare('DELETE FROM report_keyword WHERE keyword = ?').run(keyword).changes;
}
