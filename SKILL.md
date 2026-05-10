---
name: wechat-mp-monitor
description: 用于微信公众号监控场景：二维码登录公众号后台、维护公众号监控清单、增量抓取指定公众号文章、按公众号/日期/关键词查询内容、生成关键词日报。适合需要定时跟踪公众号文章更新并输出本地 Markdown/JSON 报告时使用。
---

# WeChat MP Monitor

当用户需要监控一个或多个微信公众号、同步其历史/增量文章、查询本地抓取结果、或生成关键词日报时，使用这个 skill。

## 能力边界

本 skill 当前支持：

- 二维码登录微信公众号后台并将登录态持久化到本地
- 维护公众号监控清单
- 增量抓取公众号文章元数据与正文
- 按公众号、日期、关键词查询已抓取文章
- 按关键词生成 Markdown/JSON 日报

本 skill 当前不支持：

- Web UI
- 多用户隔离
- 分布式任务
- 阅读量/评论/转发量等增强抓取
- **并发下载** - 完全串行实现，无并发支持

## 运行前提

- Node.js 22+
- 在 skill 根目录执行命令
- 首次使用前先执行一次 `npm install` 与 `npm run build`

## 常用命令

### 1. 登录

```bash
./bin/wechat-mp-monitor login
```

默认会：

- 在终端打印 ASCII 二维码
- 把二维码 PNG 保存到 `data/qrcode/`
- 轮询扫码状态
- 登录成功后把登录态保存到本地 SQLite

可选：

```bash
./bin/wechat-mp-monitor login --save-png ./tmp/qrcode.png --timeout 180
```

查看当前登录状态：

```bash
./bin/wechat-mp-monitor auth status
```

退出本地登录态：

```bash
./bin/wechat-mp-monitor auth logout
```

### 2. 管理公众号清单

添加预设默认账号清单：

```bash
./bin/wechat-mp-monitor accounts add-tests
```

手工添加公众号：

```bash
./bin/wechat-mp-monitor accounts add "广州白云发布"
./bin/wechat-mp-monitor accounts add "广州黄埔发布"
```

查看监控清单：

```bash
./bin/wechat-mp-monitor accounts list
```

禁用/启用：

```bash
./bin/wechat-mp-monitor accounts disable <fakeid>
./bin/wechat-mp-monitor accounts enable <fakeid>
```

删除：

```bash
./bin/wechat-mp-monitor accounts remove <fakeid-or-nickname>
```

### 3. 增量同步

同步所有启用中的公众号：

```bash
./bin/wechat-mp-monitor sync run
```

只同步指定公众号：

```bash
./bin/wechat-mp-monitor sync run --account "广州白云发布"
```

限制同步页数：

```bash
./bin/wechat-mp-monitor sync run --limit-pages 2
```

只抓元数据，不抓正文：

```bash
./bin/wechat-mp-monitor sync run --skip-content
```

### 4. 查询文章

```bash
./bin/wechat-mp-monitor query articles --keyword "低空经济"
./bin/wechat-mp-monitor query articles --account "广州白云发布" --date-from 2026-03-01 --date-to 2026-03-30
./bin/wechat-mp-monitor query articles --keyword "人工智能" --format md
./bin/wechat-mp-monitor query articles --keyword "产业政策" --format json
```

### 5. 关键词日报

管理日报关键词：

```bash
./bin/wechat-mp-monitor report keywords add "人工智能"
./bin/wechat-mp-monitor report keywords list
./bin/wechat-mp-monitor report keywords remove "人工智能"
```

生成日报：

```bash
./bin/wechat-mp-monitor report daily --date 2026-03-30
./bin/wechat-mp-monitor report daily --date 2026-03-30 --keyword 人工智能 低空经济
./bin/wechat-mp-monitor report daily --date 2026-03-30 --format md
```

输出文件默认在：

- `data/reports/<YYYY-MM-DD>/summary.md`
- `data/reports/<YYYY-MM-DD>/summary.json`

## OpenClaw 使用建议

如果用户想做“定时监控微信公众号并生成日报”，优先采用这个流程：

1. 先执行一次登录：`./bin/wechat-mp-monitor login`
2. 添加目标公众号：`./bin/wechat-mp-monitor accounts add ...` 或 `accounts add-tests`
3. 执行一次手动同步验证抓取链路：`./bin/wechat-mp-monitor sync run`
4. 配置 OpenClaw cron 定时执行：
   - 白天同步：`./bin/wechat-mp-monitor sync run`
   - 夜间产出日报：`./bin/wechat-mp-monitor report daily --date <date>`

## 数据位置

运行时数据保存在：

- `data/app.db`
- `data/articles/raw/`
- `data/articles/normalized/`
- `data/reports/`
- `data/qrcode/`
- `data/logs/`

## 故障排查

- 如果出现 `better-sqlite3` 模块加载错误：重新执行 `npm install` 重新编译原生模块
- 如果 `auth status` 提示登录态无效：重新执行 `login`
- 如果 `accounts add` 搜不到公众号：确认登录态有效后重试
- 如果 `sync run` 失败：先查看是否登录过期，再缩小到单个公众号重试
- 如果 `query` 或 `report` 无结果：先确认已经执行过 `sync run` 且抓到了正文

## 性能与并发说明

### 重要：不支持并发下载

当前版本采用**完全串行**实现，无任何并发机制：

1. **文章列表抓取**：每页串行，页间间隔 `DEFAULT_SYNC_DELAY_MS = 1500ms`
2. **正文下载**：每篇串行，篇间硬编码间隔 `300ms`
3. **无连接池**：每篇文章独立建立 HTTP 连接

### 性能基准

以"国家电网"公众号实测（6484 篇文章）：

| 指标 | 数值 |
|------|------|
| 实际下载速度 | ~20 篇/分钟 |
| 理论上限（仅间隔） | 200 篇/分钟 |
| 5000 篇预计时间 | ~4.2 小时 |

### 提速建议

考虑到微信反爬策略，当前串行实现虽然慢但更安全。如需提速：

1. **改造代码**：使用 `p-limit` / `p-queue` 实现并发池，推荐并发数 5-10
2. **配合代理**：配置 IP 代理池是真正有效的提速方案
3. **后台运行**：大量历史文章抓取建议后台无人值守运行
