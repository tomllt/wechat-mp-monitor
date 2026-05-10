import { DEFAULT_SYNC_DELAY_MS, SYNC_PAGE_SIZE, getConcurrency, getProxyMode } from '../config.js';
import {
  createSyncRun,
  createSyncRunItem,
  finalizeSyncRun,
  finalizeSyncRunItem,
  getArticleByKeys,
  getArticlesMissingContent,
  getWatchAccount,
  listEnabledWatchAccounts,
  updateAccountSyncState,
  upsertArticle,
} from '../storage/db.js';
import type { ActiveAuthSession, AppMsgEx, AppMsgPublishResponse, ArticleRow } from '../types.js';
import { globalDownloader } from '../concurrent-downloader.js';
import { validateActiveSession, getSessionCookies } from './auth.js';
import { ingestArticleHtml, type IngestOptions } from './article-html.js';
import { wechatRequest } from './http.js';

export function parsePublishPage(response: AppMsgPublishResponse): AppMsgEx[] {
  if (response.base_resp.ret !== 0) {
    throw new Error(`${response.base_resp.ret}:${response.base_resp.err_msg}`);
  }
  const page = JSON.parse(response.publish_page) as { publish_list: Array<{ publish_info?: string }> };
  return page.publish_list
    .filter(item => item.publish_info)
    .flatMap(item => {
      const publishInfo = JSON.parse(item.publish_info!) as { appmsgex?: AppMsgEx[] };
      return publishInfo.appmsgex ?? [];
    });
}

export async function fetchArticlePage(
  session: ActiveAuthSession,
  fakeid: string,
  begin = 0,
  keyword = ''
): Promise<AppMsgEx[]> {
  const response = await wechatRequest<AppMsgPublishResponse>({
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
    query: {
      sub: keyword ? 'search' : 'list',
      search_field: keyword ? '7' : 'null',
      begin,
      count: SYNC_PAGE_SIZE,
      query: keyword,
      fakeid,
      type: '101_1',
      free_publish_type: 1,
      sub_action: 'list_ex',
      token: session.token,
      lang: 'zh_CN',
      f: 'json',
      ajax: 1,
    },
    cookies: getSessionCookies(session),
  });
  return parsePublishPage(response.data);
}

function toArticleRow(fakeid: string, item: AppMsgEx): Omit<ArticleRow, 'created_at' | 'updated_at'> {
  return {
    fakeid,
    aid: item.aid,
    appmsgid: item.appmsgid,
    title: item.title,
    digest: item.digest,
    author_name: item.author_name,
    link: item.link,
    cover: item.cover,
    create_time: item.create_time,
    update_time: item.update_time,
    itemidx: item.itemidx,
    copyright_stat: item.copyright_stat,
    copyright_type: item.copyright_type,
    album_id: item.album_id,
    is_deleted: item.is_deleted ? 1 : 0,
    content_status: 'pending',
    raw_html_path: null,
    normalized_html_path: null,
    plain_text: null,
    fetched_at: null,
  };
}

export interface SyncOptions {
  runId?: number;
  limitPages?: number;
  skipContent?: boolean;
  concurrency?: number;
  account?: string;
  /**
   * 导出选项
   */
  export?: boolean;
  exportFormat?: 'md' | 'word' | 'both';
  exportPath?: string;
}

export async function syncAccount(identifier: string, options: SyncOptions = {}): Promise<{
  pages: number;
  inserted: number;
  updated: number;
  fetchedContents: number;
  failedContents: number;
}> {
  const account = getWatchAccount(identifier);
  if (!account) {
    throw new Error(`未找到公众号: ${identifier}`);
  }
  const session = await validateActiveSession();
  if (!session) {
    throw new Error('登录态无效，请先执行 login');
  }

  const fakeid = String(account.fakeid);
  const nickname = String(account.nickname);
  const runId = options.runId ?? createSyncRun('running');
  const itemId = createSyncRunItem(runId, fakeid, nickname);

  const concurrency = options.concurrency ?? getConcurrency();
  const downloader = concurrency > 0 
    ? globalDownloader 
    : { submit: <T>(fn: () => Promise<T>) => fn() };

  let begin = 0;
  let pages = 0;
  let inserted = 0;
  let updated = 0;
  let lastSeenCreateTime = Number(account.last_seen_create_time ?? 0);
  let latestSeenCreateTime = lastSeenCreateTime;
  let pageHasNewer = true;
  const contentQueue: ArticleRow[] = [];

  try {
    // Step 1: 抓取文章元数据（串行，避免风控）
    while (pageHasNewer) {
      if (options.limitPages && pages >= options.limitPages) {
        break;
      }
      const articles = await fetchArticlePage(session, fakeid, begin);
      pages += 1;
      if (!articles.length) {
        break;
      }
      pageHasNewer = false;

      for (const article of articles) {
        if (article.create_time > latestSeenCreateTime) {
          latestSeenCreateTime = article.create_time;
        }
        if (article.create_time > lastSeenCreateTime) {
          pageHasNewer = true;
        }
        const result = upsertArticle(toArticleRow(fakeid, article));
        if (result === 'inserted') {
          inserted += 1;
        } else {
          updated += 1;
        }

        if (!options.skipContent) {
          const row = getArticleByKeys(fakeid, article.aid);
          if (row && row.content_status !== 'ready') {
            contentQueue.push(row);
          }
        }
      }
      begin += SYNC_PAGE_SIZE;
      await sleep(DEFAULT_SYNC_DELAY_MS);
      if (!pageHasNewer) {
        break;
      }
    }

    // Step 2: 并发下载正文
    let fetchedContents = 0;
    let failedContents = 0;

    if (!options.skipContent && contentQueue.length > 0) {
      const ingestOptions: IngestOptions = {
        export: options.export,
        exportFormat: options.exportFormat,
        exportPath: options.exportPath,
      };

      const promises = contentQueue.map(row =>
        downloader.submit(async () => {
          try {
            const result = await ingestArticleHtml(row, getSessionCookies(session), ingestOptions);
            if (result.status === 'ready' || result.status === 'deleted') {
              fetchedContents += 1;
            } else {
              failedContents += 1;
            }
          } catch {
            failedContents += 1;
          }
        })
      );

      await Promise.all(promises);
    }

    updateAccountSyncState(fakeid, {
      lastSyncAt: new Date().toISOString(),
      lastSuccessSyncAt: new Date().toISOString(),
      lastSeenCreateTime: latestSeenCreateTime || lastSeenCreateTime,
      lastError: null,
    });

    finalizeSyncRunItem(itemId, {
      status: 'success',
      pageCount: pages,
      newArticles: inserted,
      updatedArticles: updated,
      fetchedContents,
      failedContents,
    });

    return {
      pages,
      inserted,
      updated,
      fetchedContents,
      failedContents,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateAccountSyncState(fakeid, {
      lastSyncAt: new Date().toISOString(),
      lastError: message,
    });
    finalizeSyncRunItem(itemId, {
      status: 'failed',
      pageCount: pages,
      newArticles: inserted,
      updatedArticles: updated,
      fetchedContents: 0,
      failedContents: 0,
      errorMessage: message,
    });
    throw error;
  }
}

export async function syncAllAccounts(options: SyncOptions = {}): Promise<{
  accountCount: number;
  articleCount: number;
  contentCount: number;
  failedContentCount: number;
  errorCount: number;
}> {
  const runId = createSyncRun('running');
  const accounts = options.account ? [getWatchAccount(options.account)] : listEnabledWatchAccounts();
  const validAccounts = accounts.filter(Boolean) as Array<Record<string, unknown>>;
  let articleCount = 0;
  let contentCount = 0;
  let failedContentCount = 0;
  let errorCount = 0;

  for (const account of validAccounts) {
    try {
      const result = await syncAccount(String(account.fakeid), {
        ...options,
        runId,
      });
      articleCount += result.inserted + result.updated;
      contentCount += result.fetchedContents;
      failedContentCount += result.failedContents;
    } catch {
      errorCount += 1;
    }
  }

  finalizeSyncRun(runId, {
    status: errorCount ? 'partial' : 'success',
    accountCount: validAccounts.length,
    articleCount,
    contentCount,
    failedContentCount,
    errorCount,
  });

  return {
    accountCount: validAccounts.length,
    articleCount,
    contentCount,
    failedContentCount,
    errorCount,
  };
}

export function findPendingContent(fakeid?: string): ArticleRow[] {
  return getArticlesMissingContent(fakeid);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
