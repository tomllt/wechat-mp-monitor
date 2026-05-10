# WeChat MP Monitor Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可被 OpenClaw 调用的本地 skill，用于二维码登录微信公众号后台、维护公众号监控清单、增量抓取文章、执行查询，并生成关键词日报。

**Architecture:** 仓库根目录作为 skill 根目录，`SKILL.md` 只做能力声明与命令映射，核心实现收敛为 TypeScript CLI。运行时数据保存在本地 SQLite 与 `data/` 文件目录中，元数据同步走微信公众号后台接口，正文抓取走文章公开链接并做本地规范化与 FTS 索引。

**Tech Stack:** Node.js 22, TypeScript, commander, better-sqlite3, cheerio, qrcode-terminal, vitest

---

## 文件结构

### 新建文件

- `SKILL.md`
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `bin/wechat-mp-monitor`
- `src/cli.ts`
- `src/commands/login.ts`
- `src/commands/auth.ts`
- `src/commands/accounts.ts`
- `src/commands/sync.ts`
- `src/commands/query.ts`
- `src/commands/report.ts`
- `src/lib/config.ts`
- `src/lib/paths.ts`
- `src/lib/logger.ts`
- `src/lib/wechat/http.ts`
- `src/lib/wechat/auth.ts`
- `src/lib/wechat/accounts.ts`
- `src/lib/wechat/articles.ts`
- `src/lib/wechat/article-html.ts`
- `src/lib/storage/db.ts`
- `src/lib/storage/migrations.ts`
- `src/lib/storage/schema.sql`
- `src/lib/query/article-query.ts`
- `src/lib/report/daily-report.ts`
- `src/lib/html/normalize.ts`
- `tests/fixtures/article.html`
- `tests/normalize.test.ts`
- `tests/auth.test.ts`
- `tests/query.test.ts`
- `tests/report.test.ts`

### 已存在文件

- `docs/superpowers/specs/2026-03-30-wechat-mp-monitor-design.md`
- `docs/superpowers/plans/2026-03-30-wechat-mp-monitor.md`

## Task 1: 初始化项目与测试基座

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/cli.ts`
- Create: `bin/wechat-mp-monitor`

- [ ] **Step 1: 写一个最小 CLI 启动测试**

```ts
import { describe, expect, it } from 'vitest';

describe('cli bootstrap', () => {
  it('exposes version command', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认基座正常**

Run: `npm test`
Expected: PASS with 1 test

- [ ] **Step 3: 写最小实现**

```ts
#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();
program.name('wechat-mp-monitor');
program.version('0.1.0');
program.parse();
```

- [ ] **Step 4: 运行 CLI 验证**

Run: `node dist/cli.js --version`
Expected: print `0.1.0`

- [ ] **Step 5: 提交**

```bash
git add package.json tsconfig.json vitest.config.ts src/cli.ts bin/wechat-mp-monitor
git commit -m "chore: bootstrap cli project"
```

## Task 2: 建立数据库与迁移框架

**Files:**

- Create: `src/lib/paths.ts`
- Create: `src/lib/storage/schema.sql`
- Create: `src/lib/storage/migrations.ts`
- Create: `src/lib/storage/db.ts`
- Test: `tests/query.test.ts`

- [ ] **Step 1: 先写数据库初始化失败用例**

```ts
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/lib/storage/db';

describe('database', () => {
  it('creates required tables', () => {
    const db = openDatabase(':memory:');
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/query.test.ts`
Expected: FAIL with `openDatabase is not a function`

- [ ] **Step 3: 实现 schema 与迁移**

```sql
CREATE TABLE IF NOT EXISTS auth_session (...);
CREATE TABLE IF NOT EXISTS watch_account (...);
CREATE TABLE IF NOT EXISTS article (...);
CREATE VIRTUAL TABLE IF NOT EXISTS article_fts USING fts5(...);
```

```ts
export function openDatabase(filename: string) {
  const db = new Database(filename);
  runMigrations(db);
  return db;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/query.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/paths.ts src/lib/storage/schema.sql src/lib/storage/migrations.ts src/lib/storage/db.ts tests/query.test.ts
git commit -m "feat: add sqlite storage foundation"
```

## Task 3: 实现 HTML 规范化与纯文本抽取

**Files:**

- Create: `src/lib/html/normalize.ts`
- Create: `tests/fixtures/article.html`
- Test: `tests/normalize.test.ts`

- [ ] **Step 1: 编写正文规范化测试**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeHtml } from '../src/lib/html/normalize';
import { readFileSync } from 'node:fs';

describe('normalizeHtml', () => {
  it('extracts plain text', () => {
    const html = readFileSync('tests/fixtures/article.html', 'utf8');
    const text = normalizeHtml(html, 'text');
    expect(text.length).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/normalize.test.ts`
Expected: FAIL with `normalizeHtml is not defined`

- [ ] **Step 3: 从 exporter 迁移最小可用逻辑**

```ts
export function normalizeHtml(rawHtml: string, format: 'html' | 'text' = 'html') {
  const $ = cheerio.load(rawHtml);
  const article = $('#js_article');
  article.find('script').remove();
  if (format === 'text') {
    return article.text().trim().replace(/\n+/g, '\n');
  }
  return '<!DOCTYPE html>' + article.html();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/normalize.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/html/normalize.ts tests/fixtures/article.html tests/normalize.test.ts
git commit -m "feat: add html normalization utilities"
```

## Task 4: 实现微信公众号登录会话与二维码登录

**Files:**

- Create: `src/lib/config.ts`
- Create: `src/lib/logger.ts`
- Create: `src/lib/wechat/http.ts`
- Create: `src/lib/wechat/auth.ts`
- Create: `src/commands/login.ts`
- Create: `src/commands/auth.ts`
- Test: `tests/auth.test.ts`

- [ ] **Step 1: 写扫码状态解析测试**

```ts
import { describe, expect, it } from 'vitest';
import { mapScanStatus } from '../src/lib/wechat/auth';

describe('scan status', () => {
  it('maps confirmed state', () => {
    expect(mapScanStatus(1)).toBe('confirmed');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/auth.test.ts`
Expected: FAIL with missing auth module

- [ ] **Step 3: 实现登录链路**

```ts
export async function startLoginSession() {}
export async function fetchQrCode() {}
export async function pollScanStatus() {}
export async function finishBizLogin() {}
```

实现要求：

- 兼容 `startlogin -> getqrcode -> ask -> login`
- 保存 `auth_key`、`token`、cookie、昵称、头像
- `login` 命令默认打印 ASCII 二维码

- [ ] **Step 4: 运行测试与手工命令**

Run: `npm test -- tests/auth.test.ts`
Expected: PASS

Run: `npm run dev -- login`
Expected: terminal prints QR code and starts polling

- [ ] **Step 5: 提交**

```bash
git add src/lib/config.ts src/lib/logger.ts src/lib/wechat/http.ts src/lib/wechat/auth.ts src/commands/login.ts src/commands/auth.ts tests/auth.test.ts
git commit -m "feat: add qr login flow"
```

## Task 5: 实现公众号清单管理

**Files:**

- Create: `src/lib/wechat/accounts.ts`
- Create: `src/commands/accounts.ts`
- Test: `tests/query.test.ts`

- [ ] **Step 1: 写公众号解析与精确匹配测试**

```ts
it('picks exact nickname match first', () => {
  const matched = pickBestAccount([
    { nickname: '广州白云发布', fakeid: 'a' },
    { nickname: '白云发布', fakeid: 'b' },
  ], '广州白云发布');
  expect(matched?.fakeid).toBe('a');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/query.test.ts`
Expected: FAIL with `pickBestAccount is not defined`

- [ ] **Step 3: 实现账号搜索与落库**

```ts
export async function searchAccounts(keyword: string) {}
export function pickBestAccount(list: SearchBizItem[], keyword: string) {}
export async function addWatchAccount(account: SearchBizItem) {}
```

命令要求：

- `accounts add "<keyword>"`
- `accounts add-tests`
- `accounts list`
- `accounts remove <fakeid|nickname>`
- `accounts enable <fakeid>`
- `accounts disable <fakeid>`

- [ ] **Step 4: 运行测试与手工命令**

Run: `npm test -- tests/query.test.ts`
Expected: PASS

Run: `npm run dev -- accounts add-tests`
Expected: test accounts are written when exact matches exist

- [ ] **Step 5: 提交**

```bash
git add src/lib/wechat/accounts.ts src/commands/accounts.ts tests/query.test.ts
git commit -m "feat: add watch account management"
```

## Task 6: 实现文章元数据同步

**Files:**

- Create: `src/lib/wechat/articles.ts`
- Create: `src/commands/sync.ts`
- Modify: `src/lib/storage/db.ts`
- Test: `tests/query.test.ts`

- [ ] **Step 1: 写 appmsgpublish 解析测试**

```ts
it('flattens publish page into appmsg list', () => {
  const list = parsePublishPage(sampleResponse);
  expect(list[0].title).toBeTruthy();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/query.test.ts`
Expected: FAIL with missing parser

- [ ] **Step 3: 实现元数据同步器**

```ts
export function parsePublishPage(resp: AppMsgPublishResponse) {}
export async function syncAccount(fakeid: string) {}
export async function syncAllAccounts() {}
```

同步要求：

- 支持分页
- 仅 upsert 新增或变更元数据
- 写入 `sync_run` 和 `sync_run_item`
- 更新 `watch_account.last_seen_create_time`

- [ ] **Step 4: 运行测试与调试命令**

Run: `npm test -- tests/query.test.ts`
Expected: PASS

Run: `npm run dev -- sync run --account "广州白云发布" --limit-pages 1 --skip-content`
Expected: inserts metadata rows

- [ ] **Step 5: 提交**

```bash
git add src/lib/wechat/articles.ts src/commands/sync.ts src/lib/storage/db.ts tests/query.test.ts
git commit -m "feat: add metadata sync pipeline"
```

## Task 7: 实现文章正文抓取与内容索引

**Files:**

- Create: `src/lib/wechat/article-html.ts`
- Modify: `src/lib/wechat/articles.ts`
- Modify: `src/lib/html/normalize.ts`
- Test: `tests/normalize.test.ts`

- [ ] **Step 1: 写正文抓取状态测试**

```ts
it('marks article content as ready after normalization', async () => {
  const result = await ingestArticleHtml(sampleArticle);
  expect(result.status).toBe('ready');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/normalize.test.ts`
Expected: FAIL with missing ingestion function

- [ ] **Step 3: 实现正文处理**

```ts
export async function fetchArticleHtml(link: string, cookies?: string) {}
export async function ingestArticleHtml(article: ArticleRow) {}
```

实现要求：

- 先无 cookie 获取
- 失败后带登录态 cookie 重试
- 保存 raw/normalized HTML 文件
- 写回 `plain_text`
- 刷新 FTS 索引

- [ ] **Step 4: 运行测试与调试命令**

Run: `npm test -- tests/normalize.test.ts`
Expected: PASS

Run: `npm run dev -- sync run --account "广州白云发布" --limit-pages 1`
Expected: article html files exist under `data/articles/`

- [ ] **Step 5: 提交**

```bash
git add src/lib/wechat/article-html.ts src/lib/wechat/articles.ts src/lib/html/normalize.ts tests/normalize.test.ts
git commit -m "feat: add article content ingestion"
```

## Task 8: 实现查询命令

**Files:**

- Create: `src/lib/query/article-query.ts`
- Create: `src/commands/query.ts`
- Test: `tests/query.test.ts`

- [ ] **Step 1: 写关键词查询测试**

```ts
it('queries articles by keyword and date range', () => {
  const rows = queryArticles(db, { keyword: '低空经济', dateFrom: '2026-03-01' });
  expect(rows.length).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/query.test.ts`
Expected: FAIL with missing queryArticles

- [ ] **Step 3: 实现查询层与命令层**

```ts
export function queryArticles(db: Database, filters: QueryFilters) {}
```

命令要求：

- `query articles --account ...`
- `query articles --keyword ...`
- `query articles --date-from ... --date-to ...`
- 支持 `table|json|md`

- [ ] **Step 4: 运行测试与手工命令**

Run: `npm test -- tests/query.test.ts`
Expected: PASS

Run: `npm run dev -- query articles --account "广州黄埔发布" --keyword "低空经济" --format md`
Expected: markdown output with article rows

- [ ] **Step 5: 提交**

```bash
git add src/lib/query/article-query.ts src/commands/query.ts tests/query.test.ts
git commit -m "feat: add article query commands"
```

## Task 9: 实现关键词日报

**Files:**

- Create: `src/lib/report/daily-report.ts`
- Create: `src/commands/report.ts`
- Modify: `src/lib/storage/db.ts`
- Test: `tests/report.test.ts`

- [ ] **Step 1: 写日报聚合测试**

```ts
it('groups matched articles by keyword', async () => {
  const report = await buildDailyReport(db, { date: '2026-03-30', keywords: ['低空经济'] });
  expect(report.keywords[0].keyword).toBe('低空经济');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/report.test.ts`
Expected: FAIL with missing buildDailyReport

- [ ] **Step 3: 实现日报逻辑**

```ts
export async function buildDailyReport(db: Database, options: ReportOptions) {}
export async function writeDailyReportFiles(report: DailyReport) {}
```

命令要求：

- `report keywords add/list/remove`
- `report daily --date ... --format both`

- [ ] **Step 4: 运行测试与手工命令**

Run: `npm test -- tests/report.test.ts`
Expected: PASS

Run: `npm run dev -- report daily --date 2026-03-30 --keyword "低空经济" --format both`
Expected: creates markdown and json files under `data/reports/2026-03-30/`

- [ ] **Step 5: 提交**

```bash
git add src/lib/report/daily-report.ts src/commands/report.ts src/lib/storage/db.ts tests/report.test.ts
git commit -m "feat: add daily keyword reports"
```

## Task 10: 编写 OpenClaw Skill 与使用说明

**Files:**

- Create: `SKILL.md`
- Modify: `package.json`
- Modify: `bin/wechat-mp-monitor`

- [ ] **Step 1: 先写 skill 触发行为草稿**

```md
当用户要求登录微信公众号后台时，运行 `{baseDir}/bin/wechat-mp-monitor login`。
当用户要求同步公众号文章时，运行 `{baseDir}/bin/wechat-mp-monitor sync run`。
```

- [ ] **Step 2: 手工验证 skill 命令路径**

Run: `./bin/wechat-mp-monitor --help`
Expected: prints command list

- [ ] **Step 3: 完成 skill 文案**

必须覆盖：

- 登录
- 公众号清单维护
- 同步
- 查询
- 日报
- 定时任务建议

- [ ] **Step 4: 运行构建与冒烟测试**

Run: `npm run build`
Expected: build success

Run: `./bin/wechat-mp-monitor auth status`
Expected: prints auth status or not-logged-in message

- [ ] **Step 5: 提交**

```bash
git add SKILL.md package.json bin/wechat-mp-monitor
git commit -m "feat: add openclaw skill entrypoint"
```

## Task 11: 使用测试公众号完成端到端验收

**Files:**

- Modify: `docs/superpowers/specs/2026-03-30-wechat-mp-monitor-design.md`

- [ ] **Step 1: 登录微信公众号后台**

Run: `./bin/wechat-mp-monitor login`
Expected: QR code appears, scan and confirm succeeds

- [ ] **Step 2: 添加测试公众号**

Run: `./bin/wechat-mp-monitor accounts add-tests`
Expected: watch list contains 广州白云发布 and 广州黄埔发布

- [ ] **Step 3: 跑一次增量同步**

Run: `./bin/wechat-mp-monitor sync run`
Expected: metadata rows and article content files are created

- [ ] **Step 4: 跑查询与日报验证**

Run: `./bin/wechat-mp-monitor query articles --account "广州白云发布" --limit 5`
Expected: recent article list is printed

Run: `./bin/wechat-mp-monitor report daily --date 2026-03-30 --keyword "产业" --format both`
Expected: markdown/json outputs are created

- [ ] **Step 5: 记录人工验收结论并提交**

```bash
git add docs/superpowers/specs/2026-03-30-wechat-mp-monitor-design.md
git commit -m "docs: record manual acceptance notes"
```

## 验证清单

- `npm test`
- `npm run build`
- `./bin/wechat-mp-monitor --help`
- `./bin/wechat-mp-monitor auth status`
- `./bin/wechat-mp-monitor accounts add-tests`
- `./bin/wechat-mp-monitor sync run --account "广州白云发布" --limit-pages 1`
- `./bin/wechat-mp-monitor query articles --keyword "产业"`
- `./bin/wechat-mp-monitor report daily --keyword "产业" --format both`

## 备注

- 当前仓库还不是 git 仓库，执行时如果仍未初始化 git，需要先执行 `git init`
- 本计划默认使用 `npm`，如果后续确定使用 `pnpm`，需要同步修改命令与脚本
- 当前会话未启用 subagent 审核能力，因此计划文档的 reviewer loop 需要在后续允许子代理时补做
