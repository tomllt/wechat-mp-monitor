# 微信公众号监控 OpenClaw Skill 设计

## 1. 目标

本项目交付一个可被 OpenClaw 调用的本地 skill，用于：

- 通过二维码登录微信公众号后台，并将登录态持久化到本地
- 维护一个需要持续跟踪的公众号清单
- 增量抓取目标公众号文章的元数据与正文
- 按公众号、日期、关键词查询已抓取内容
- 按关键词生成 Markdown/JSON 日报

本期测试目标公众号固定为：

- 广州白云发布
- 广州黄埔发布

## 2. 非目标

第一版明确不做以下内容：

- Web UI
- 多用户隔离
- 分布式调度或任务队列
- 评论、阅读量、转发量等需要额外 credentials 抓包的增强能力
- 远程数据库或对象存储

## 3. 外部约束

### 3.1 OpenClaw 约束

根据 OpenClaw 官方文档：

- skill 的最小单元是一个目录，目录中包含 `SKILL.md`
- workspace 级 skill 放在 `<workspace>/skills/`
- skill 指令中可使用 `{baseDir}` 引用 skill 根目录下的脚本和资源
- OpenClaw 支持 cron jobs，可用于定时调用本地命令

参考：

- https://docs.openclaw.ai/tools/skills
- https://docs.openclaw.ai/tools/creating-skills
- https://docs.openclaw.ai/automation/cron-jobs

### 3.2 抓取能力来源

`/Volumes/data1/projects/wechat-article-exporter` 已具备以下可复用能力：

- 微信公众号后台二维码登录链路
- `searchbiz` 搜索公众号
- `appmsgpublish` 按 `fakeid` 分页抓取公众号文章列表
- 公众号文章 HTML 规范化与纯文本抽取

第一版的实现策略是“复用原理与关键实现，重写为独立的本地 Node.js CLI”，而不是直接嵌入 Nuxt 服务。

## 4. 总体方案

### 4.1 交付形态

仓库根目录即 skill 根目录，最终包含：

- `SKILL.md`
- `bin/wechat-mp-monitor`
- `dist/` 编译产物
- `src/` TypeScript 源码
- `tests/` 测试
- `docs/` 设计与计划文档

OpenClaw 只负责“在合适的时候调用本地命令”。业务逻辑全部收敛在本地 CLI 中。

### 4.2 技术栈

- Node.js 22
- TypeScript
- `commander` 负责 CLI
- `better-sqlite3` 负责本地数据库
- `cheerio` 负责 HTML 解析与正文纯文本抽取
- `qrcode-terminal` 负责终端二维码输出
- `vitest` 负责单元测试

### 4.3 目录结构

```text
.
├── SKILL.md
├── package.json
├── tsconfig.json
├── bin/
│   └── wechat-mp-monitor
├── src/
│   ├── cli.ts
│   ├── commands/
│   │   ├── login.ts
│   │   ├── auth.ts
│   │   ├── accounts.ts
│   │   ├── sync.ts
│   │   ├── query.ts
│   │   └── report.ts
│   └── lib/
│       ├── config.ts
│       ├── paths.ts
│       ├── logger.ts
│       ├── wechat/
│       │   ├── http.ts
│       │   ├── auth.ts
│       │   ├── accounts.ts
│       │   ├── articles.ts
│       │   └── article-html.ts
│       ├── storage/
│       │   ├── db.ts
│       │   ├── migrations.ts
│       │   └── schema.sql
│       ├── query/
│       │   └── article-query.ts
│       ├── report/
│       │   └── daily-report.ts
│       └── html/
│           └── normalize.ts
└── tests/
    ├── fixtures/
    ├── auth.test.ts
    ├── normalize.test.ts
    ├── query.test.ts
    └── report.test.ts
```

## 5. 数据模型

### 5.1 存储位置

所有运行时数据默认放在：

```text
{skillRoot}/data/
```

包含：

- `data/app.db`：SQLite 主库
- `data/articles/raw/<fakeid>/<aid>.html`：原始 HTML
- `data/articles/normalized/<fakeid>/<aid>.html`：规范化 HTML
- `data/reports/YYYY-MM-DD/*.md|json`：日报输出
- `data/logs/*.log`：运行日志

### 5.2 表设计

#### `auth_session`

保存当前登录态。

- `id` INTEGER PRIMARY KEY
- `auth_key` TEXT NOT NULL
- `token` TEXT NOT NULL
- `cookie_json` TEXT NOT NULL
- `nickname` TEXT
- `avatar` TEXT
- `expires_at` TEXT
- `last_validated_at` TEXT
- `status` TEXT NOT NULL DEFAULT 'active'
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

说明：

- 第一版只支持单用户单活登录态，因此表里只维护 1 条 `active` 记录
- `cookie_json` 直接存解析后的 cookie 数组，避免手写 cookie 文件格式

#### `watch_account`

保存需要跟踪的公众号清单。

- `fakeid` TEXT PRIMARY KEY
- `nickname` TEXT NOT NULL
- `alias` TEXT
- `signature` TEXT
- `service_type` INTEGER
- `round_head_img` TEXT
- `enabled` INTEGER NOT NULL DEFAULT 1
- `source_keyword` TEXT
- `last_sync_at` TEXT
- `last_success_sync_at` TEXT
- `last_seen_create_time` INTEGER
- `last_error` TEXT
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

#### `article`

保存文章元数据与查询所需字段。

- `id` INTEGER PRIMARY KEY
- `fakeid` TEXT NOT NULL
- `aid` TEXT NOT NULL
- `appmsgid` INTEGER
- `title` TEXT NOT NULL
- `digest` TEXT
- `author_name` TEXT
- `link` TEXT NOT NULL
- `cover` TEXT
- `create_time` INTEGER NOT NULL
- `update_time` INTEGER
- `itemidx` INTEGER
- `copyright_stat` INTEGER
- `copyright_type` INTEGER
- `album_id` TEXT
- `is_deleted` INTEGER NOT NULL DEFAULT 0
- `content_status` TEXT NOT NULL DEFAULT 'pending'
- `raw_html_path` TEXT
- `normalized_html_path` TEXT
- `plain_text` TEXT
- `fetched_at` TEXT
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

唯一约束：

- `UNIQUE(fakeid, aid)`
- `UNIQUE(link)`

#### `sync_run`

记录每次同步批次。

- `id` INTEGER PRIMARY KEY
- `started_at` TEXT NOT NULL
- `finished_at` TEXT
- `status` TEXT NOT NULL
- `account_count` INTEGER NOT NULL DEFAULT 0
- `article_count` INTEGER NOT NULL DEFAULT 0
- `content_count` INTEGER NOT NULL DEFAULT 0
- `error_count` INTEGER NOT NULL DEFAULT 0
- `notes` TEXT

#### `sync_run_item`

记录每个公众号在某次同步中的结果。

- `id` INTEGER PRIMARY KEY
- `run_id` INTEGER NOT NULL
- `fakeid` TEXT NOT NULL
- `nickname` TEXT NOT NULL
- `started_at` TEXT NOT NULL
- `finished_at` TEXT
- `status` TEXT NOT NULL
- `page_count` INTEGER NOT NULL DEFAULT 0
- `new_articles` INTEGER NOT NULL DEFAULT 0
- `updated_articles` INTEGER NOT NULL DEFAULT 0
- `fetched_contents` INTEGER NOT NULL DEFAULT 0
- `error_message` TEXT

#### `report_keyword`

保存日报关注关键词。

- `id` INTEGER PRIMARY KEY
- `keyword` TEXT NOT NULL UNIQUE
- `enabled` INTEGER NOT NULL DEFAULT 1
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 5.3 FTS 索引

为了支持正文检索，建立 SQLite FTS5 虚拟表：

- `article_fts(title, digest, author_name, plain_text, nickname)`

同步策略：

- `article` 新增或更新正文后，立即刷新对应 FTS 文档
- 查询只查 FTS，再回表取文章详情

## 6. 命令设计

CLI 名称：

- `wechat-mp-monitor`

### 6.1 登录与认证

#### `wechat-mp-monitor login`

作用：

- 创建微信后台登录会话
- 获取二维码图片
- 在终端显示 ASCII 二维码
- 轮询扫码状态
- 确认后执行登录
- 将 `auth_key`、`token`、cookie 和账号信息写入本地数据库

可选参数：

- `--save-png <path>`：额外保存二维码图片
- `--timeout <seconds>`：轮询超时，默认 180 秒

#### `wechat-mp-monitor auth status`

作用：

- 校验当前登录态是否可用
- 输出登录账号昵称、过期时间、最近验证时间

#### `wechat-mp-monitor auth logout`

作用：

- 将本地登录态标记为失效，不主动远程注销

### 6.2 公众号清单管理

#### `wechat-mp-monitor accounts add "<keyword>"`

行为：

- 调用 `searchbiz`
- 若存在唯一精确匹配 `nickname === keyword`，直接写入 `watch_account`
- 若无唯一精确匹配，则列出候选项并退出，要求显式使用 `--fakeid`

可选参数：

- `--fakeid <fakeid>`
- `--exact`

#### `wechat-mp-monitor accounts add-tests`

行为：

- 自动尝试添加
  - 广州白云发布
  - 广州黄埔发布

#### `wechat-mp-monitor accounts list`

输出已配置的公众号清单。

#### `wechat-mp-monitor accounts remove <fakeid|nickname>`

删除目标公众号，但不删除已抓取文章。

#### `wechat-mp-monitor accounts enable <fakeid>`

启用某个目标。

#### `wechat-mp-monitor accounts disable <fakeid>`

禁用某个目标。

### 6.3 增量抓取

#### `wechat-mp-monitor sync run`

默认行为：

- 对所有 `enabled=1` 的公众号执行增量同步
- 先抓元数据，再抓新增/更新文章正文

可选参数：

- `--account <fakeid|nickname>`：只同步单个公众号
- `--limit-pages <n>`：限制每个账号最多抓取页数，便于调试
- `--skip-content`：只抓元数据，不抓正文
- `--verbose`

### 6.4 查询

#### `wechat-mp-monitor query articles`

支持参数：

- `--account <fakeid|nickname>`
- `--date-from <YYYY-MM-DD>`
- `--date-to <YYYY-MM-DD>`
- `--keyword <text>`
- `--limit <n>`
- `--format table|json|md`

查询逻辑：

- 无关键词时按时间过滤
- 有关键词时走 FTS 检索，匹配 `title`、`digest`、`plain_text`

### 6.5 日报

#### `wechat-mp-monitor report keywords add "<keyword>"`

添加日报关注关键词。

#### `wechat-mp-monitor report keywords list`

列出当前关键词。

#### `wechat-mp-monitor report keywords remove "<keyword>"`

删除关键词。

#### `wechat-mp-monitor report daily`

按关键词生成日报。

参数：

- `--date <YYYY-MM-DD>`，默认昨天
- `--keyword <text>`，可多次传入；未传时使用 `report_keyword` 表中的启用关键词
- `--format md|json|both`，默认 `both`
- `--output <dir>`，默认 `data/reports/<date>/`

输出内容：

- 关键词摘要
- 命中文章数
- 每篇文章的标题、公众号、发布时间、链接
- 摘要与命中片段

## 7. 核心流程

### 7.1 二维码登录流程

复用 `wechat-article-exporter` 的链路：

1. 生成随机 `sid`
2. `POST /cgi-bin/bizlogin?action=startlogin`
3. 获取 `uuid` cookie
4. `GET /cgi-bin/scanloginqrcode?action=getqrcode`
5. 将二维码图片渲染为终端 ASCII
6. 轮询 `GET /cgi-bin/scanloginqrcode?action=ask`
7. 状态为“已确认”后，`POST /cgi-bin/bizlogin?action=login`
8. 从返回结果解析 `redirect_url` 中的 `token`
9. 保存 cookie + token + 登录账号昵称头像

CLI 内部会维护两类 cookie：

- 临时 `uuid` cookie：只用于扫码流程
- 持久 `mp` cookie：用于 `searchbiz`、`appmsgpublish` 等后台接口

### 7.2 公众号添加流程

1. 先校验登录态
2. 调用 `searchbiz`
3. 用用户输入的名称优先做精确匹配
4. 命中唯一结果则写入 `watch_account`
5. 多结果时打印候选项并要求显式确认

### 7.3 增量同步流程

对每个公众号执行：

1. 读取 `watch_account`
2. 使用 `fakeid` 调用 `appmsgpublish`
3. 每页解析 `publish_page.publish_list[].publish_info.appmsgex`
4. 对每篇文章执行 upsert
5. 标记新增文章与元数据变更文章
6. 当满足以下任一条件时停止当前公众号分页：
   - 当前页返回 0 篇文章
   - 当前页全部文章都已存在，且最老文章发布时间小于等于 `last_seen_create_time`
   - 达到 `--limit-pages`
7. 对新增/变更文章补抓正文
8. 更新 `watch_account.last_seen_create_time` 与最近同步时间

### 7.4 正文抓取流程

对每篇需要抓正文的文章：

1. 直接请求文章 `link`
2. 若返回内容缺少 `#js_article`，使用保存的后台 cookie 再试一次
3. 校验 HTML 是否为有效文章页面
4. 保存原始 HTML
5. 运行 `normalizeHtml(raw, 'html')` 生成规范化 HTML
6. 运行 `normalizeHtml(raw, 'text')` 生成正文纯文本
7. 更新 `article.raw_html_path`、`normalized_html_path`、`plain_text`、`content_status`
8. 刷新 FTS 索引

### 7.5 查询流程

1. 解析过滤条件
2. 若无关键词，则直接查 `article`
3. 若有关键词，则先查 `article_fts`
4. 回表拼接公众号名称
5. 输出为表格、JSON 或 Markdown

### 7.6 日报流程

1. 解析日期范围，默认“昨天 00:00:00 到 23:59:59”
2. 获取关键词列表
3. 对每个关键词执行一次查询
4. 聚合文章并去重
5. 生成：
   - `summary.json`
   - `summary.md`
6. 输出到日期目录

## 8. OpenClaw Skill 设计

`SKILL.md` 不负责实现逻辑，只负责把用户请求映射为本地命令。

它需要覆盖的典型请求：

- “登录微信公众号后台”
- “把广州白云发布加入监控”
- “同步所有公众号文章”
- “查最近 7 天黄埔发布里关于低空经济的文章”
- “生成今天的关键词日报”

`SKILL.md` 里的核心约定：

- 优先检查 `node` 是否可用
- 所有命令通过 `{baseDir}/bin/wechat-mp-monitor ...` 执行
- 当用户提到“定时”时，优先建议 OpenClaw cron job 调用 `sync run`
- 当用户提到“日报”时，优先调用 `report daily`

## 9. 错误处理

### 9.1 登录态失效

表现：

- `searchbiz` / `appmsgpublish` 返回 session 失效

处理：

- 将 `auth_session.status` 更新为 `expired`
- CLI 直接报错并提示重新执行 `login`

### 9.2 公众号搜索结果不唯一

处理：

- 不自动落库
- 打印候选公众号列表
- 要求显式指定 `--fakeid`

### 9.3 文章正文下载失败

处理：

- 标记 `content_status='failed'`
- 写入日志
- 后续同步时允许重试

### 9.4 文章被删除

处理：

- 标记 `is_deleted=1`
- 保留已有历史记录

### 9.5 微信接口限流或异常

处理：

- 对元数据接口和正文下载都使用指数退避重试
- 默认单账号串行抓取，避免放大风控

## 10. 测试策略

### 10.1 自动化测试

- `normalizeHtml` 的 HTML/文本输出测试
- `searchbiz` 响应解析测试
- `appmsgpublish` 响应解析测试
- 数据库迁移测试
- FTS 查询测试
- 日报聚合与去重测试

### 10.2 手工验证

使用测试公众号：

- 广州白云发布
- 广州黄埔发布

验证场景：

1. 二维码登录成功
2. `accounts add-tests` 能写入两个公众号
3. `sync run` 能抓到文章元数据
4. 新文章能抓到正文并生成纯文本
5. `query articles --keyword` 可返回命中结果
6. `report daily` 可输出 Markdown/JSON

## 11. 风险与缓解

### 11.1 微信后台登录态不稳定

缓解：

- 单独保存 `token` 与 cookie
- 每次同步前做轻量校验
- 失效后快速失败，避免空跑

### 11.2 抓正文时的反爬或页面异常

缓解：

- 先公共访问，失败后带 cookie 重试
- 校验 `#js_article` 是否存在
- 失败记录在案并允许重试

### 11.3 查询质量依赖纯文本抽取

缓解：

- 第一版统一使用 `normalizeHtml(raw, 'text')`
- 不在第一版引入复杂的 JS 执行解析

### 11.4 技术实现过重

缓解：

- 第一版不做服务化
- 不做 Web UI
- 不做远程任务系统

## 12. 实施建议

实施顺序建议为：

1. 搭好 CLI、数据库和测试基座
2. 打通二维码登录
3. 打通公众号清单管理
4. 打通元数据增量同步
5. 打通正文抓取与纯文本索引
6. 打通查询与日报
7. 最后再写 `SKILL.md`，把 OpenClaw 调用入口绑定到稳定命令

## 13. 结论

第一版最合理的形态是：

- 一个轻量的 OpenClaw skill
- 一个独立的本地 Node.js CLI
- 一个本地 SQLite + 文件缓存存储层

这样既能复用 `wechat-article-exporter` 的关键能力，又不会把 Nuxt 服务整套搬进来，复杂度和可维护性都更可控。
