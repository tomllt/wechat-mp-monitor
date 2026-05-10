import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addReportKeyword,
  resetDbForTests,
  updateArticleContent,
  updateArticleFts,
  upsertArticle,
  upsertWatchAccount,
} from '../src/lib/storage/db.js';
import { buildDailyReport, renderDailyReportMarkdown, writeDailyReportFiles } from '../src/lib/report/daily-report.js';

const dbFile = path.resolve('tests/tmp-report.db');
const outputDir = path.resolve('tests/tmp-report-output');

function cleanupDatabaseFiles(file: string) {
  [file, `${file}-shm`, `${file}-wal`].forEach(target => {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  });
}

describe('daily report', () => {
  beforeEach(() => {
    cleanupDatabaseFiles(dbFile);
    fs.rmSync(outputDir, { recursive: true, force: true });
    resetDbForTests(dbFile);
    upsertWatchAccount({
      fakeid: 'fakeid-2',
      nickname: '广州黄埔发布',
      alias: 'gzhp',
      round_head_img: '',
      service_type: 1,
      signature: '黄埔',
    });
    upsertArticle({
      fakeid: 'fakeid-2',
      aid: 'aid-2',
      appmsgid: 2,
      title: '广州黄埔发布：人工智能产业日报',
      digest: '提到人工智能产业布局',
      author_name: '编辑部',
      link: 'https://example.com/2',
      cover: '',
      create_time: Math.floor(new Date('2026-03-30T08:00:00Z').getTime() / 1000),
      update_time: Math.floor(new Date('2026-03-30T08:00:00Z').getTime() / 1000),
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
    updateArticleContent('fakeid-2', 'aid-2', {
      contentStatus: 'ready',
      plainText: '这里提到了人工智能产业和政策方向。',
    });
    updateArticleFts('fakeid-2', 'aid-2');
    addReportKeyword('人工智能');
  });

  afterEach(() => {
    cleanupDatabaseFiles(dbFile);
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it('builds grouped report data', () => {
    const report = buildDailyReport({ date: '2026-03-30' });
    expect(report.keywords[0].keyword).toBe('人工智能');
    expect(report.keywords[0].articles).toHaveLength(1);
  });

  it('writes markdown and json files', async () => {
    const report = buildDailyReport({ date: '2026-03-30' });
    const result = await writeDailyReportFiles(report, {
      format: 'both',
      outputDir,
    });
    expect(result.files).toHaveLength(2);
    expect(fs.readFileSync(path.join(outputDir, 'summary.md'), 'utf8')).toContain('人工智能');
    expect(renderDailyReportMarkdown(report)).toContain('广州黄埔发布');
  });
});
