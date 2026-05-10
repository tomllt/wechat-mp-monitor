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

本 skill 当前支持：

- Web UI
- 多用户隔离
- 分布式任务
- 阅读量/评论/转发量等增强抓取
- **并发下载** - 支持可配置并发数，默认 20 并发
- **Cloudflare Worker 代理池** - 多 Worker 轮询负载均衡，支持内置 Workers 和用户自定义私有 Workers
- **Worker 健康检查** - 下载前自动检测 Worker 可用性，过滤不可用 Worker
- **多级分类导出** - 直接导出为 Markdown 和 Word 格式，按 `docs/{年}/{月}/{日}/{公众号}/xx.md` 存储

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

### ✅ 支持并发下载 + Worker 代理池

当前版本已实现**并发下载 + Cloudflare Worker 代理池 + 健康检查**完整功能：

1. **并发下载**：使用 `p-limit` 实现并发池，默认并发数 20，可通过 `--concurrency` 参数配置
2. **Worker 代理池**：内置 96 个 wechat-article-exporter Worker，支持多 Worker 轮询负载均衡，也支持用户自定义私有 Workers
3. **健康检查机制**：下载前自动通过 `/health` 端点检测 Worker 可用性，自动过滤不可用 Worker
4. **代理优先级**：全局禁用代理 (`--no-proxy`) > 强制代理，严格遵守"登录直连、下载走代理"原则

### 性能基准

以"国家电网"公众号实测（4765 篇文章）：

| 指标 | 数值 |
|------|------|
| 默认并发数 | 20 |
| 实际下载速度 | ~400 篇/分钟 |
| 5000 篇预计时间 | ~12.5 分钟 |
| 相比串行提速 | ~20 倍 |

### 新增命令

#### Worker 健康检查

测试所有配置的 Worker 可用性：

```bash
./bin/wechat-mp-monitor sync health-check
```

#### 批量下载待下载文章

下载所有已抓取元数据但未下载正文的文章：

```bash
# 默认配置：并发 20，启用健康检查，自动使用可用 Worker
./bin/wechat-mp-monitor download pending

# 自定义并发数
./bin/wechat-mp-monitor download pending --concurrency 10

# 禁用代理（直连下载，适合住宅 IP 环境）
./bin/wechat-mp-monitor download pending --no-proxy

# 跳过健康检查（直接使用所有配置的 Worker）
./bin/wechat-mp-monitor download pending --no-health-check
```

#### 查看代理状态

```bash
./bin/wechat-mp-monitor sync proxy-status --check
```

### Worker 代理标准实现（严格兼容 wechat-article-exporter）

⚠️ **关键标准：必须使用查询参数驱动，而非路径转发**

**标准 URL 构建格式（v2 实现）**：
```
${proxyBaseUrl}?url=${encodeURIComponent(targetUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}&authorization=${Authorization}
```

**关键实现细节**：
1. ✅ 查询参数驱动（不是路径转发）：`?url=...&headers=...&authorization=...`
2. ✅ 请求头通过 `headers` 参数 JSON 编码传递，Worker 负责还原请求头
3. ✅ 支持私有代理授权 `authorization` 参数
4. ✅ 使用 `referrerPolicy: 'unsafe-url'` 标准设置
5. ✅ Worker 健康检查通过代理实际请求微信 URL 进行验证，而非简单 `/health` 端点

**代理状态追踪机制**：
- 成功/失败计数
- 自动冷却：连续失败 3 次后进入 60 秒冷却
- 轮询负载均衡自动跳过冷却中的代理
- 代理健康检查支持批量并发检测

### Worker 可用性说明

⚠️ **重要发现**：wechat-article-exporter 项目内置的 96 个 `worker-proxy.asia` Worker 目前全部返回 HTTP 403，均不可用。

**推荐解决方案**：

1. **直连下载**：住宅 IP 环境下直接 `--no-proxy` 下载，微信反爬对住宅 IP 较宽松
2. **自定义私有 Worker**：部署自己的 Cloudflare Worker 反向代理，配置到环境变量，需严格按照上述标准 URL 格式实现

### 环境变量配置

```env
# 自定义 Cloudflare Worker 列表（逗号分隔）
WECHAT_WORKERS=https://worker1.workers.dev,https://worker2.workers.dev

# 并发数配置（默认 20）
WECHAT_CONCURRENCY=20

# 导出根目录（默认 ./docs）
WECHAT_EXPORT_ROOT=/path/to/docs
```

### 代理使用原则

| 场景 | 是否走代理 | 说明 |
|------|------------|------|
| **登录请求** | ❌ 始终不走 | 登录需要真实 IP 环境，避免风控 |
| **列表抓取** | ⚠️ 可选 | 已有 1.5s 间隔，风控风险较低 |
| **正文下载** | ✅ 默认走代理 | 大量文章下载最容易触发 IP 封禁 |

### 已知 Bug 修复

- ✅ **修复 `forceProxy` 覆盖 `--no-proxy` 问题**：调整代理优先级为"全局禁用代理 > 强制代理"，确保 `--no-proxy` 参数真正生效

## 文章导出

### 支持格式

- **Markdown** (.md) - 默认格式，适合知识库归档
- **Word** (.docx) - 适合办公文档场景

### 多级分类目录结构

文章自动按日期和公众号分类存储：

```
docs/
└── 2026/
    └── 05/
        └── 10/
            └── 国家电网/
                ├── 文章标题1.md
                ├── 文章标题2.md
                └── ...
```

### 配置导出根目录

通过环境变量自定义导出目录：

```env
WECHAT_EXPORT_ROOT=/path/to/your/docs
```

---

## GitHub 版本管理

## GitHub 版本管理

### 仓库地址

https://github.com/tomllt/wechat-mp-monitor (Private)

### 当前分支状态

| 分支 | 状态 | 说明 |
|------|------|------|
| `main` | 基础版本 | 串行下载，无代理支持 |
| `feature/worker-proxy-concurrency` | ✅ 功能完整，已推送 | 并发下载 + Worker 代理池标准实现 + 健康检查 + 多级导出 |

### 功能分支包含特性

- ✅ Cloudflare Worker 代理池实现（`src/lib/worker-proxy-pool.ts`）
- ✅ 并发下载支持（`src/lib/config.ts` 配置）
- ✅ Worker 健康检查机制
- ✅ Markdown/Word 多级分类导出
- ✅ 新 CLI 命令：`sync health-check`、`download pending`、`sync proxy-status --check`
- ✅ Bug 修复：`--no-proxy` 正确生效，不被 `forceProxy` 覆盖

### 初始化流程

```bash
# 1. 创建 .gitignore
node_modules/
dist/
.env*
data/*.db
data/qrcode/
data/articles/
data/reports/
._*

# 2. 初始化 git
git init
git checkout -b main

# 3. 配置用户信息
git config user.name "Tom Luo"
git config user.email "tomllt@users.noreply.github.com"

# 4. 提交初始版本
git add .
git commit -m "Initial commit: WeChat MP Monitor v0.1.0"

# 5. 创建 GitHub 仓库并推送
gh repo create wechat-mp-monitor --private --source=. --push
```

### 开发工作流

```bash
# 创建功能分支
git checkout -b feature/worker-proxy

# 提交修改
git add .
git commit -m "feat: 添加 Cloudflare Worker 代理支持"

# 推送到远程
git push origin feature/worker-proxy

# 合并到 main
git checkout main
git merge feature/worker-proxy
git push origin main
```

### 注意事项

- 永远不要提交 `data/` 目录下的数据库、二维码、文章数据
- 不要提交 `.env` 等包含敏感信息的文件
- 保持 `package-lock.json` 在版本控制中
- 功能分支 `feature/worker-proxy-concurrency` 需合并到 `main` 后才算正式发布

---

## 项目实践记录：国家电网公众号

### 已完成成果

| 项 | 数值 |
|----|------|
| 公众号 | 国家电网 |
| 抓取文章总数 | 6,484 篇 |
| 元数据抓取进度 | 100% |
| 正文已下载 | 282+ 篇（持续下载中） |
| 导出文件 | `/root/国家电网公众号文章列表.csv` |
| 本地导出目录 | `~/wechat-articles/YYYY/MM/DD/国家电网/` |

### 关键实践发现

**2026-05-10 重要发现**：
- ✅ 8 并发直连下载稳定：~100 篇/分钟
- ✅ 多级目录导出正常：`YYYY/MM/DD/公众号名称/文章标题.md`
- ✅ 国家电网公众号共 6,484 篇历史文章
- ❌ 内置 96 个公共 Worker 全部返回 403 不可用
- ✅ 私有 Worker 格式确认：myproxy3d45da21.workers.dev (9个节点: mp-proxy-00 ~ 08)

### 待完成

1. Worker 代理网络环境调优（私有 Worker 需要特定网络环境）
2. 继续后台批量下载剩余文章
3. 合并功能分支到 main
4. 推送最终代码到 GitHub
