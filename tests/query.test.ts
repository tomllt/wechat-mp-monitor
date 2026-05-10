import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, resetDbForTests, upsertArticle, updateArticleContent, updateArticleFts, upsertWatchAccount } from '../src/lib/storage/db.js';
import { queryArticles, renderArticleQuery } from '../src/lib/query/article-query.js';

const dbFile = path.resolve('tests/tmp-query.db');

function cleanupDatabaseFiles(file: string) {
  [file, `${file}-shm`, `${file}-wal`].forEach(target => {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  });
}

describe('queryArticles', () => {
  beforeEach(() => {
    cleanupDatabaseFiles(dbFile);
    resetDbForTests(dbFile);
    upsertWatchAccount({
      fakeid: 'fakeid-1',
      nickname: '广州白云发布',
      alias: 'gzby',
      round_head_img: '',
      service_type: 1,
      signature: '白云',
    });
    upsertArticle({
      fakeid: 'fakeid-1',
      aid: 'aid-1',
      appmsgid: 1,
      title: '广州白云发布：低空经济专题',
      digest: '低空经济政策摘要',
      author_name: '编辑部',
      link: 'https://example.com/1',
      cover: '',
      create_time: 1_711_936_000,
      update_time: 1_711_936_000,
      itemidx: 1,
      copyright_stat: 0,
      copyright_type: 0,
      album_id: '',
      is_deleted: 0,
      content_status: 'pending',
      raw_html_path: null,
      normalized_html_path: null,
      plain_text: null,
      fetched_at: null,
    });
    updateArticleContent('fakeid-1', 'aid-1', {
      contentStatus: 'ready',
      plainText: '这里提到了低空经济和产业政策。',
    });
    updateArticleFts('fakeid-1', 'aid-1');
  });

  afterEach(() => {
    cleanupDatabaseFiles(dbFile);
    resetDbForTests(':memory:');
  });

  it('queries by keyword through fts', () => {
    const rows = queryArticles({ keyword: '低空经济' });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain('低空经济');
    expect(rows[0].snippet).toBeTruthy();
  });

  it('renders markdown output', () => {
    const output = renderArticleQuery(queryArticles({ keyword: '低空经济' }), 'md');
    expect(output).toContain('| 发布时间 |');
    expect(output).toContain('广州白云发布');
  });
});
