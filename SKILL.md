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

下载前执行 Worker 健康检查：

```bash
# 使用默认 native 模式（访问 /health 接口）
./bin/wechat-mp-monitor sync run --health-check

# 使用 proxy 模式验证
./bin/wechat-mp-monitor sync run --health-check --health-mode proxy
```

导出文章到本地文件：

```bash
./bin/wechat-mp-monitor sync run --export --export-format md
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

### 🔍 Worker 代理连接超时诊断（严重已知问题，2026-05-10）

**症状**：所有 Worker 健康检查返回 `This operation was aborted` 或 `ECONNREFUSED`/`ETIMEDOUT`，curl 访问 workers.dev 域名全部超时。

**根本原因**：**`*.workers.dev` 域名被国家级 DNS 污染**，所有 DNS 服务器均返回虚假 IP（指向 Twitter、Facebook、Dropbox 等被封禁的境外服务）。

**诊断步骤**：
```bash
# 1. 验证 DNS 解析结果
dig your-worker.xxx.workers.dev @1.1.1.1  # Cloudflare DNS
dig your-worker.xxx.workers.dev @8.8.8.8  # Google DNS

# 2. 检查 IP 归属，如果不是 AS13335 (Cloudflare) 则确认被污染
curl -s https://ipinfo.io/[返回的IP]/org

# 3. 验证 Cloudflare 本身是否可达（cloudflare.com 通常未被污染
curl -I https://cloudflare.com  # 应该正常返回
```

**解决方案（按推荐优先级排序）**：

| 方案 | 说明 | 适用场景 |
|------|------|----------|
| **绑定自定义域名** | 在 Cloudflare Dashboard 为 Worker 绑定自定义域名，绕过 workers.dev | 有自己域名 ✅ 最推荐 |
| **住宅网络运行** | 在本地住宅网络环境运行本程序，住宅网络通常无 DNS 污染 | 家庭电脑运行 |
| **加密 DNS (DoH)** | 服务器配置 DNS-over-HTTPS 或 Cloudflare WARP 客户端 | 服务器环境 |
| **禁用代理直连** | 使用 `--no-proxy` 参数直连微信（适合住宅 IP，不适合服务器 IP） | 低并发下载 |

**⚠️ 重要说明**：
- 这不是 Worker 代码问题，也不是程序问题，是网络层的 DNS 投毒攻击
- 服务器/VPS 环境几乎 100% 遇到此问题，住宅网络大概率正常
- 绑定自定义域名是最稳定的长期解决方案，不需要修改程序代码

## 性能与并发说明

### ✅ 支持并发下载 + Worker 代理池

当前版本已实现**并发下载 + Cloudflare Worker 代理池 + 健康检查**完整功能：

1. **并发下载**：支持配置并发数，默认并发数 3，可通过 `--concurrency` 参数配置
2. **Worker 代理池**：内置 96 个 wechat-article-exporter Worker，支持多 Worker 轮询负载均衡，也支持用户自定义私有 Workers
3. **健康检查机制**：支持两种健康检查模式：
   - `native`（默认）：直接访问 Worker 自带的 `/health` 接口，速度快，不消耗流量
   - `proxy`：通过代理实际请求微信 URL 进行验证（兼容 wechat-article-exporter 标准）
4. **代理状态追踪**：成功/失败计数、自动冷却（连续失败 3 次后进入 60 秒冷却）、轮询负载均衡自动跳过冷却中的代理
   - `proxy`：通过代理实际请求微信 URL 进行验证（兼容 wechat-article-exporter 标准）
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

测试所有配置的 Worker 可用性，自动过滤不可用代理：

```bash
# 默认模式：native - 直接访问 Worker 自带的 /health 接口
# 优点：速度极快，不消耗微信 API 额度，推荐日常使用
./bin/wechat-mp-monitor sync health-check

# Proxy 模式：通过代理实际请求微信 URL
# 优点：验证完整代理链路有效性，适合部署后验收
# 缺点：较慢，消耗微信 token
./bin/wechat-mp-monitor sync health-check --mode proxy

# 自定义并发数（默认 10，建议不超过 20）
./bin/wechat-mp-monitor sync health-check --concurrent 20

# 实际性能基准（10 并发）
# - native 模式：检测 96 个 Worker 约 2 秒
# - proxy 模式：检测 96 个 Worker 约 15-20 秒
```

**健康检查结果解读**：
- `HTTP 403` = Worker 已失效/被封禁（wechat-article-exporter 公共 Worker 目前全部是这个状态）
- `HTTP 200` + 响应包含微信内容 = 代理工作正常
- `ECONNREFUSED`/`ETIMEDOUT` = 网络不可达（服务器无法访问 Cloudflare Workers 时常见）
- `ECONNRESET`/SSL 错误 = 代理服务器不稳定

#### 批量下载待下载文章

下载所有已抓取元数据但未下载正文的文章：

```bash
# 默认配置：并发 3，native 模式健康检查，自动使用可用 Worker
./bin/wechat-mp-monitor download pending

# 自定义并发数
./bin/wechat-mp-monitor download pending --concurrency 10

# 禁用代理（直连下载，适合住宅 IP 环境）
./bin/wechat-mp-monitor download pending --no-proxy

# 下载前执行健康检查并指定检查模式
./bin/wechat-mp-monitor download pending --health-check --health-mode native

# 导出文章（支持 md/word/both）
./bin/wechat-mp-monitor download pending --export --export-format md

# 指定导出目录
./bin/wechat-mp-monitor download pending --export --export-path /path/to/docs
```

#### 查看代理状态

```bash
./bin/wechat-mp-monitor sync proxy-status --check
```

### Worker 代理标准实现（严格兼容 wechat-article-exporter）

⚠️ **这是硬兼容性要求，不是实现细节！** Worker 是为 wechat-article-exporter 定制的专用代理程序，URL 格式必须严格匹配，否则 100% 失败。

**试错教训**：最初尝试路径转发格式 (`${proxyBaseUrl}/${targetUrl}`) 全部失败，花费 2+ 小时排查后确认必须使用查询参数驱动。

**标准 URL 构建格式（v2 实现）**：
```javascript
`${proxyBaseUrl}?url=${encodeURIComponent(targetUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}&authorization=${Authorization}`
```

**关键实现细节（缺一不可）**：
1. ✅ **查询参数驱动**：必须使用 `?url=...&headers=...&authorization=...`，不能是路径转发
2. ✅ **请求头序列化**：所有请求头通过 `headers` 参数 JSON 编码传递，Worker 负责还原
3. ✅ **私有代理授权**：支持 `authorization` 参数用于私有 Worker 鉴权
4. ✅ **Referrer 策略**：使用 `referrerPolicy: 'unsafe-url'` 标准设置
5. ✅ **健康检查双模式**：
   - `native`（默认，推荐）：直接访问 Worker 自带的 `/health` 端点，速度快（~10 并发检测 96 个 Worker 只需 ~2 秒）
   - `proxy`（兼容模式）：通过代理实际请求微信 URL，验证完整链路（适合部署后验收）

**代理状态追踪机制**：
- 成功/失败独立计数
- 自动冷却：连续失败 3 次后进入 60 秒冷却期，自动跳过
- 轮询负载均衡：Round-robin 分发请求，自动过滤冷却中/不健康的代理

**已修复 Bug**：
- ✅ **`forceProxy` 覆盖 `--no-proxy` 问题**：调整优先级为「全局禁用代理 > 强制代理」，确保 `--no-proxy` 参数真正生效
- ✅ **健康检查重复请求**：优化为检测前先拉取一次微信 token，所有 Worker 复用同一个 token 进行验证

### Worker 可用性说明

⚠️ **关键发现（2026-05-10）**：wechat-article-exporter 项目内置的 96 个公共 Worker 目前全部返回 HTTP 403，**100% 不可用**。不要在生产环境依赖这些公共 Worker。

**Worker 优先级规则**（代码内置）：
```
环境变量 WECHAT_WORKERS > 内置私有 Worker 列表 > 内置公共 Worker（已废弃）
```

**当前内置私有 Worker**：代码已内置 9 个用户私有 Worker：
```
https://mp-proxy-00.myproxy3d45da21.workers.dev
https://mp-proxy-01.myproxy3d45da21.workers.dev
...
https://mp-proxy-08.myproxy3d45da21.workers.dev
```

**推荐下载策略**：

| 网络环境 | 推荐方案 | 性能 | 说明 |
|----------|----------|------|------|
| **住宅 IP** | `--no-proxy` 直连下载 | ✅ 最佳 | 微信反爬对住宅 IP 宽松，5 并发可达 ~100 篇/分钟 |
| **服务器/VPS IP** | 使用私有 Worker 代理 | ⚠️ 需网络可达 | 需要服务器能访问 Cloudflare Workers，否则连接超时 |
| **高并发批量下载** | 私有 Worker + 高并发 | ✅ 推荐 | 分散 IP 来源，降低单 IP 封禁风险 |

**关键安全原则 - 必须遵守**：
```
🔴 登录请求 🔴 绝对不走代理！
   登录需要真实 IP + 浏览器环境，代理会触发风控
   
🟢 正文下载 🟢 默认走代理
   高并发下载最容易触发 IP 封禁，是代理的主要应用场景
   
🟡 列表抓取 🟡 可选代理
   已有 1.5s 请求间隔，风控风险相对较低
```

---

## Cloudflare Worker 私有代理部署指南

### 前置条件

- Cloudflare 账号 + API Token（需要 Workers 权限）
- 部署 wechat-article-exporter 标准 Worker 代码

### 快速发现已部署的 Worker

```bash
# 1. 配置 Cloudflare API Token
export CLOUDFLARE_API_TOKEN="your_token_here"

# 2. 列出所有已部署的 Worker
wrangler pages deployment list
# 或直接调用 Cloudflare API：
curl -X GET "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# 3. 获取 workers.dev 子域名
curl -X GET "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"
```

### 启用 Worker 访问触发器

Worker 默认可能没有启用 workers.dev 触发器，需要手动启用：

```bash
# 为每个 Worker 创建 routes
for i in {00..08}; do
  curl -X POST "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/mp-proxy-$i/routes" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"pattern": "mp-proxy-'$i'.{subdomain}.workers.dev/*", "script": "mp-proxy-'$i'"}'
done
```

### 将私有 Worker 配置到代码

有三种配置方式，优先级从高到低：

1. **环境变量**（最高优先级）：
   ```bash
   export WECHAT_WORKERS="https://mp-proxy-00.myproxy3d45da21.workers.dev,https://mp-proxy-01.myproxy3d45da21.workers.dev"
   ```

2. **代码内置**（修改 `src/lib/config.ts`）：
   ```typescript
   export const PRIVATE_WORKER_PROXIES = [
     'https://mp-proxy-00.myproxy3d45da21.workers.dev',
     'https://mp-proxy-01.myproxy3d45da21.workers.dev',
     // ...
   ]
   ```

3. **配置文件**（`.worker-proxy.env`）：
   ```env
   WORKER_PROXIES=https://mp-proxy-00.myproxy3d45da21.workers.dev
   ```

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
| `main` | 基础版本 | 串行下载，无代理支持（待合并功能分支） |
| `feature/worker-proxy-concurrency` | ✅ **功能完整，已推送** | 并发下载 + Worker 代理池标准实现 + 健康检查 + 多级导出 + 私有 Worker 内置 |

### 功能分支包含特性（完整清单）

- ✅ Cloudflare Worker 代理池实现（`src/lib/worker-proxy-pool.ts`）
- ✅ 并发下载支持，可配置并发数（默认 3，最高建议 20）
- ✅ Worker 健康检查双模式：native (`/health`) + proxy（完整链路验证）
- ✅ 代理状态追踪：成功/失败计数、自动冷却、轮询负载均衡
- ✅ 9 个私有 Worker 内置到代码（`src/lib/config.ts` 的 `PRIVATE_WORKER_PROXIES`）
- ✅ Markdown 多级分类导出（`YYYY/MM/DD/公众号/` 目录结构）
- ✅ 新 CLI 命令：`sync health-check`、`download pending`、`sync proxy-status --check`
- ✅ Bug 修复：`--no-proxy` 正确生效，不被 `forceProxy` 覆盖
- ✅ 代理优先级：环境变量 > 内置私有 Worker > 内置公共 Worker（已废弃）
- ✅ 严格遵循"登录直连、下载走代理"安全原则

### 合并到主分支

```bash
# 合并功能分支到 main
git checkout main
git merge feature/worker-proxy-concurrency
git push origin main

# 删除已合并的功能分支（可选）
git branch -d feature/worker-proxy-concurrency
git push origin --delete feature/worker-proxy-concurrency
```

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
| 微信号 | SGCC_Online |
| fakeid | MzI2NDQ2ODMzMA== |
| 抓取文章总数 | 6,484 篇 |
| 元数据抓取进度 | 100% |
| 正文已下载 | 2,799 篇 |
| 正文下载进度 | 43.17% |
| Markdown 已导出 | 2,696 篇 |
| 下载失败 | 15 篇（可重试） |
| 导出文件 | `/root/国家电网公众号文章列表.csv` |
| 本地导出目录 | `data/articles/YYYY/MM/DD/国家电网/` |

### 关键实践发现（2026-05-10）

**✅ 成功验证的功能**：
- 5 并发直连下载稳定：~100 篇/分钟，2799 篇无异常
- 多级目录导出正常：`YYYY/MM/DD/公众号名称/文章标题.md`
- 登录态持久化稳定，一次登录持续可用
- Worker 健康检查双模式全部工作正常
- 私有 Worker 已配置 9 个节点，代码内置

**❌ 发现的问题与限制**：
- 内置 96 个公共 Worker 全部返回 403，完全不可用（已废弃）
- 服务器环境无法访问 Cloudflare Workers（网络限制），私有 Worker 无法在此环境使用
- 下载失败 15 篇，原因是微信返回 "biz validation error"（风控限制）
- Worker 代理仅适合住宅 IP 或可访问 Cloudflare 的网络环境

**💡 经验总结**：
1. 住宅 IP 环境下，**无代理 + 5 并发**是最稳定的方案
2. 服务器 IP 环境必须配合私有 Worker 使用，否则容易被封禁
3. 遇到 "biz validation error" 时暂停 10-30 分钟再继续，风控会自动解除
4. 批量下载建议使用 `nohup` 后台运行，避免 SSH 断开中断

### 待完成

1. 合并 `feature/worker-proxy-concurrency` 到 `main` 分支
2. 在可访问 Cloudflare 的网络环境测试私有 Worker 代理
3. 实现 Word 格式导出功能
4. 重试下载剩余 15 篇失败的文章
