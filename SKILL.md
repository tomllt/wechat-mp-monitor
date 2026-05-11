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
- **Cloudflare Worker 文章下载服务池** - 多 Worker 轮询负载均衡，支持内置 Workers 和用户自定义私有 Workers
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

### 6. 关键词驱动企业文章下载（最新推荐）

```bash
# 预览模式 - 先看下载计划
./bin/wechat-mp-monitor keyword-download --time week --dry-run

# 执行下载
./bin/wechat-mp-monitor keyword-download --time month
./bin/wechat-mp-monitor keyword-download --time year --concurrency 5

# 53 组预设关键词：省市领导会见企业专题
# 默认下载全部有效公众号，不按 rank/type 过滤
# 默认不限制页数，默认下载正文，不支持 --rank/--limit-pages/--skip-content
# 结果存入 articles_filter 独立表
```

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

**健康检查设计原则（严格对齐 wechat-article-exporter 标准）**：
- 🔴 **预检查不阻塞下载**：健康检查结果仅用于诊断展示，**不影响运行时的服务选择**
- 🟢 **getBestService() 永不失败**：即使所有服务都返回 403/超时，也始终返回一个服务，由 HTTP 请求层处理失败重试
- ⚡ **失败驱动的冷却机制**：基于实际请求的成功/失败计数自动调整服务优先级
- 📊 **诊断和运行分离**：`healthCheckAll()` 只输出诊断报告，**不修改服务状态**
- ✅ **直连回退透明**：当 Worker 连续失败达到阈值时，自动回退到直连模式下载正文

**已修复的关键 Bug（2026-05-10）**：
- ✅ 修复 `getBestService()` 在无健康服务时返回 `undefined` 导致下载阻塞的严重问题
- ✅ 移除基于预检查结果的服务过滤逻辑，改为纯失败驱动的运行时调整
- ✅ 统一 health-check 和 healthCheckAll 输出格式，明确标注诊断性质

**健康检查结果解读（更新）**：
- `HTTP 403` = Worker 已失效/被封禁（wechat-article-exporter 公共 Worker 目前全部是这个状态）
- `HTTP 200` = 服务端点响应正常（不等于代理链路可用）
- `ECONNREFUSED`/`ETIMEDOUT` = 网络不可达（服务器无法访问 Cloudflare Workers 时常见）
- `DNS 解析到非 Cloudflare IP` = workers.dev 域名被 DNS 污染，需要绑定自定义域名

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

#### 查看服务状态

```bash
./bin/wechat-mp-monitor sync service-status --check
```

### Worker 文章下载服务标准实现（严格兼容 wechat-article-exporter）

⚠️ **这是硬兼容性要求，不是实现细节！** Worker 是为 wechat-article-exporter 定制的**专用文章下载服务**，URL 格式必须严格匹配，否则 100% 失败。

**重要概念纠正（2026-05-10 重构完成）**：
- ❌ **错误理解**：Worker 是通用 HTTP 代理
- ✅ **正确理解**：Worker 是专门用于下载 `mp.weixin.qq.com` 文章内容的**定制化服务**

**架构原则**：
- 🔴 **登录请求**：始终直连微信服务器（不走 Worker）
- 🟢 **文章正文下载**：通过 Worker 下载服务（分散 IP，规避封禁）
- 🟡 **列表抓取**：可配置，但默认直连（当前固定 2s 请求间隔，并对重复文章做运行内去重）
- 🔍 **公众号搜索**：当前固定 2s 请求间隔；优先复用 `watch_account.source_keyword` 已缓存映射，再用 Bloom Filter 做运行内去重，避免重复搜索同名公众号


**试错教训**：最初尝试路径转发格式 (`${serviceBaseUrl}/${targetUrl}`) 全部失败，花费 2+ 小时排查后确认必须使用查询参数驱动。

**标准 URL 构建格式（v2 实现）**：
```javascript
`${serviceBaseUrl}?url=${encodeURIComponent(targetUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}&authorization=${Authorization}`
```

**authorization 参数说明（对齐 wechat-article-exporter 标准）**：
- 公共 Worker：**不需要 authorization**，留空字符串即可（wechat-article-exporter 默认值）
- 私有 Worker：支持 authorization 参数用于私有服务鉴权，由用户在 preferences 配置
- URL 构建格式：`${serviceBaseUrl}?url=${encodedUrl}&headers=${encodedHeaders}&authorization=${Authorization}`

**服务状态追踪机制**：
- 成功/失败独立计数
- 自动冷却：连续失败 3 次后进入 60 秒冷却期，自动跳过
- 轮询负载均衡：Round-robin 分发请求，自动过滤冷却中/不健康的服务

**已修复 Bug**：
- ✅ **`useDownloadService` 参数逻辑**：仅用于文章正文下载，登录和列表请求始终直连
- ✅ **健康检查重复请求**：优化为检测前先拉取一次微信 token，所有 Worker 复用同一个 token 进行验证

### 统一命名规范（重构后）

| 旧术语 | 新术语 | 说明 |
|--------|--------|------|
| WorkerProxyPool | ArticleDownloadServicePool | 服务池类名 |
| globalProxyPool | globalServicePool | 全局单例 |
| forceProxy | useDownloadService | 请求参数 |
| proxyUsed | serviceUsed | 响应字段 |
| proxy-status | service-status | CLI 命令 |
| getAllWorkerProxies | getAllWorkerServices | 配置函数 |
| getProxyAuthorization | getServiceAuthorization | 配置函数 |

**Worker 服务可用性说明**

⚠️ **关键发现（2026-05-10 最终验证）**：wechat-article-exporter 项目内置的全部 **96 个公共 Worker 100% 不可用**，均返回 Cloudflare 403 Forbidden 拦截页面。**不要在任何环境依赖这些公共 Worker**。

**推荐方案**：
1. ✅ **部署私有 Worker**（推荐 20 个节点，见上面的部署指南）
2. ✅ **配置 HTTP 代理**访问私有 Worker
3. ✅ **住宅 IP 环境**可直接直连下载，无需 Worker

**公共 Worker 失效原因诊断**：
返回的是 Cloudflare 的 `Attention Required! | Cloudflare` 拦截页面，不是 Worker 实际响应。响应特征：
- Status: 403 Forbidden
- Server: cloudflare
- 页面标题: `Attention Required! | Cloudflare`
- `authorization` 参数无任何影响（带不带都是 403）

**Worker 服务优先级规则**（代码内置）：
```
环境变量 WECHAT_WORKERS > 内置私有 Worker 列表 > 内置公共 Worker（已废弃）
```

**当前内置私有 Worker**：代码已内置 20 个用户私有 Worker（mp-proxy-00 ~ mp-proxy-19），绑定自定义域名 ontonexus.cn 待 DNS NS 传播完成后启用。

---

**健康检查标准对齐（对齐 wechat-article-exporter）**

**设计原则（严格对齐 wechat-article-exporter）**：
- 🔴 **预检查不阻塞下载**：健康检查结果仅用于诊断展示，**不影响运行时的服务选择**
- 🟢 **getBestService() 永不失败**：即使所有服务都返回 403/超时，也始终返回一个服务，由 HTTP 请求层处理失败重试
- ⚡ **失败驱动的冷却机制**：基于实际请求的成功/失败计数自动调整服务优先级
- 📊 **诊断和运行分离**：`healthCheckAll()` 只输出诊断报告，**不修改服务状态**
- ✅ **直连回退透明**：当 Worker 连续失败达到阈值时，自动回退到直连模式下载正文

**已修复的关键 Bug（2026-05-10）**：
- ✅ 修复 `getBestService()` 在无健康服务时返回 `undefined` 导致下载阻塞的严重问题
- ✅ 移除基于预检查结果的服务过滤逻辑，改为纯失败驱动的运行时调整
- ✅ 统一 health-check 和 healthCheckAll 输出格式，明确标注诊断性质

**健康检查结果解读（更新）**：
- `HTTP 403` = Worker 已失效/被封禁（wechat-article-exporter 公共 Worker 目前全部是这个状态）
- `HTTP 200` = 服务端点响应正常（不等于代理链路可用）
- `ECONNREFUSED`/`ETIMEDOUT` = 网络不可达（服务器无法访问 Cloudflare Workers 时常见）
- `DNS 解析到非 Cloudflare IP` = workers.dev 域名被 DNS 污染，需要绑定自定义域名

---

**🏭 企业公众号文章下载流水线实测数据（2026-05-10）**

**下载任务完成统计**：
| 指标 | 数值 | 说明 |
|------|------|------|
| 总企业数 | 195 家 | 中国 200 强企业清单 |
| 成功匹配公众号 | 143 个 | 73.3% 匹配率 |
| 未找到公众号 | 52 个 | 名称错误或未开通 |
| 近一个月新增文章 | 96 篇 | 企业公众号更新频率普遍较低 |

**执行命令**：
```bash
node dist/src/cli.js enterprise --download --time month --concurrency 10
```

**关键发现**：
- ✅ 企业公众号整体更新频率较低（平均 0.7 篇/月/号）
- ✅ 无代理直连模式在 10 并发下运行稳定
- ✅ 所有公共 Worker 不可用，但系统自动回退到直连下载
- ✅ 多级分类存储结构工作正常
- ✅ enterprise 命令默认同时导出 Markdown 和 Word 格式

**导出格式配置**：
修改位置：`src/commands/enterprise.ts` 中的 `syncOptions`
```typescript
exportFormat: 'both' as const  // 同时导出 md 和 docx
// 可选值：'md' | 'word' | 'both'
```

---

**🌐 DNS NS 传播状态检查方法**

**域名激活诊断步骤**：
```bash
# 使用多种 DNS 服务器检查 NS 记录
# Cloudflare DNS (1.1.1.1) - 通常最先更新
dig @1.1.1.1 NS yourdomain.com

# Google DNS (8.8.8.8)
dig @8.8.8.8 NS yourdomain.com

# 阿里云 DNS (223.5.5.5) - 国内缓存更新较慢
dig @223.5.5.5 NS yourdomain.com

# 114 DNS (114.114.114.114) - 国内主流公共 DNS
dig @114.114.114.114 NS yourdomain.com
```

**激活判断标准**：
- ✅ **国际 DNS** 返回 Cloudflare NS（如 monika.ns.cloudflare.com）
- ✅ **国内 DNS** 返回 Cloudflare NS（不是旧的万网 NS）
- ✅ Cloudflare Dashboard 中 Zone 状态变为 `active`

**典型传播时间**：
- 国际 DNS：10 分钟 ~ 1 小时
- 国内 DNS：6 小时 ~ 24 小时（阿里云/114 DNS 缓存时间较长）

---

**推荐下载策略更新**

| 网络环境 | 推荐方案 | 性能 | 说明 |
|----------|----------|------|------|
| **住宅 IP** | `--no-proxy` 直连下载 | ✅ 最佳 | 微信反爬对住宅 IP 宽松，5 并发可达 ~100 篇/分钟 |
| **服务器/VPS IP** | 使用**自定义域名绑定的私有 Worker** | ⚠️ 需网络可达 | workers.dev 可能被 DNS 污染，必须绑定自定义域名 |
| **高并发批量下载** | 私有 Worker + 高并发 | ✅ 推荐 | 分散 IP 来源，降低单 IP 封禁风险 |

**关键安全原则 - 必须遵守**：
```
🔴 登录请求 🔴 绝对不走代理！
   登录需要真实 IP + 浏览器环境，代理会触发风控
   
🟢 正文下载 🟢 默认走代理
   高并发下载最容易触发 IP 封禁，是代理的主要应用场景
   
🟡 列表抓取 🟡 可选代理
   当前固定 2s 请求间隔，风控风险相对较低；重复文章会在运行内先去重再处理
   搜索公众号时也会优先复用本地 `source_keyword -> fakeid` 映射，并用 Bloom Filter 跳过同轮重复关键词

```

---

## Cloudflare Worker 私有代理部署指南

### 前置条件

- Cloudflare 账号 + API Token（需要 Workers 权限）
- 部署 wechat-article-exporter 标准 v2.0 Worker 代码

### ✅ 官方 v2.0 Worker 协议标准（已验证）

**参考官方文档**: https://docs.mptext.top/get-started/private-proxy

**标准 URL 构建格式**：
```javascript
`${serviceBaseUrl}?url=${encodeURIComponent(targetUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}&authorization=${Authorization}`
```

**支持的调用方式**：
- GET 方式（推荐）：查询参数传递
- POST 方式：JSON payload 传递

**Worker 代码 v2.0 标准模板**：
```javascript
const VERSION = "2.0.0";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 健康检查接口
    if (url.pathname === '/health' || url.pathname === '/healthz') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        version: VERSION,
        timestamp: Date.now() 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 解析请求参数
    const targetUrl = url.searchParams.get('url');
    const headersParam = url.searchParams.get('headers');
    
    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }
    
    // 仅允许转发微信域名
    if (!targetUrl.includes('mp.weixin.qq.com')) {
      return new Response('Invalid target domain', { status: 403 });
    }
    
    // 构建转发请求
    const headers = headersParam ? JSON.parse(decodeURIComponent(headersParam)) : {};
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...headers
      }
    });
    
    // CORS 支持
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    });
  }
};
```

### 快速批量部署 20 个 Worker

```bash
# 1. 配置 Cloudflare API Token
export CLOUDFLARE_API_TOKEN="your_token_here"
export CLOUDFLARE_ACCOUNT_ID="your_account_id"

# 2. 创建 Worker 代码文件
cat > worker-v2.js << 'EOF'
// 粘贴上面的 v2.0 标准代码
EOF

# 3. 批量部署 20 个 Worker
for i in {00..19}; do
  echo "Deploying mp-proxy-${i}..."
  wrangler deploy --name "mp-proxy-${i}" --compatibility-date 2026-05-10 worker-v2.js
done
```

### 🔧 HTTP 代理支持（官方推荐方案）

**环境变量自动检测**：程序自动读取标准代理环境变量
```bash
export http_proxy=http://10.0.0.2:7890
export https_proxy=http://10.0.0.2:7890
# 大写也支持
export HTTP_PROXY=http://10.0.0.2:7890
export HTTPS_PROXY=http://10.0.0.2:7890
```

**实现原理**：使用 Node.js 内置 `undici` 模块的 `ProxyAgent`
```typescript
// src/lib/wechat/http.ts 中的实现
import { ProxyAgent, setGlobalDispatcher } from 'undici';

function setupProxy() {
  const proxyUrl = 
    process.env.https_proxy || 
    process.env.HTTPS_PROXY || 
    process.env.http_proxy || 
    process.env.HTTP_PROXY;
  
  if (proxyUrl) {
    const proxyAgent = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(proxyAgent);
    console.log(`✅ HTTP 代理已启用: ${proxyUrl}`);
  }
}

// 模块加载时自动配置
setupProxy();
```

### Worker 根路径健康检查结果解读（自定义域名方案）

- `HTTP 400` = **正常在线**。对 Worker 根路径直接发请求但未携带 `?url=` 参数时，返回 400 说明 Worker 已部署并在正常处理请求。
- `HTTP 200` = 在线，通常是 `/health` 或自定义健康接口。
- `HTTP 403` = 协议不匹配、域名限制或服务被拦截，需要进一步排查。
- `HTTP 000` / 连接超时 = DNS、SSL 或网络连通性问题。

**实践结论（wechat-art.xyz 自定义域名池）**：
- 根路径返回 `400 Bad Request` 不应判定为故障。
- 20/20 节点返回 400 代表 20 个节点在线可用。
- 若正文下载偶发 `TypeError: fetch failed`，仍要继续查看底层 `cause`，避免把单次网络抖动误判为整池不可用。

### 正文下载异常诊断：`fetch failed` vs 微信“环境异常”页

当后台任务持续打印：

```bash
下载文章失败 [AID]: fetch failed
```

不要只看表层报错。应按下面步骤区分真实原因：

1. 从 `article` 表取失败样本的 `aid` / `link`
2. 用 `fetchArticleHtml(link)` 单独复现
3. 打印异常的 `cause.message` / `cause.code`
4. 若请求成功返回 HTML，再用 `validateArticleHtml()` 判断是否为正文
5. 额外检查 HTML 是否包含：`环境异常`、`去验证`

**已验证的两类根因**：

- **节点级网络失败**：
  - 典型表现：`TypeError: fetch failed`
  - 深层原因示例：`getaddrinfo ENOTFOUND 17.wechat-art.xyz`
  - 结论：单个自定义域名节点可能因 DNS 传播未完成而临时失效，应先单点验证；若根路径恢复返回 `HTTP 400`，即可重新加入内置池

- **微信风控验证页**：
  - 典型表现：请求返回 HTML，长度正常，但 `validateArticleHtml()` = `invalid`
  - 页面特征：
    - `<h2 class="weui-msg__title">环境异常</h2>`
    - `当前环境异常，完成验证后即可继续访问。`
    - `去验证`
  - 结论：这不是 Worker 挂了，也不是代码语法问题，而是微信把当前下载环境拦成了验证页

**抽样经验（pending 文章样本）**：
- 50 篇样本里，49 篇是“环境异常”验证页，1 篇是 `ENOTFOUND 17.wechat-art.xyz`
- 在 17 号节点恢复、20/20 Worker 全部在线后，再次重启 `keyword-download --time day --concurrency 5`，对最新 12 篇 pending 文章复现，12/12 仍然是“环境异常”验证页
- 因此当进程还在运行但 `articles_filter` 长时间为 0 时，往往是**风控导致无有效正文产出**，不是单纯卡住，也不是 Worker 池整体故障

- **请求超时被中止**：
  - 典型表现：`This operation was aborted`
  - 根因：`wechatRequest()` 内部 `AbortController` 到达超时时间后主动中止请求
  - 结论：这通常不是进程崩溃，而是单次正文请求超时；要结合 Worker 健康状态和微信是否返回“环境异常”页一起判断

**处理优先级**：
1. 先排除坏节点（如单个域名 DNS 未生效）
2. 再判断是否大面积命中微信“环境异常”页
3. 再区分是否为超时中止（`This operation was aborted`）
4. 若是风控主因，不要盲目继续高并发重试；应降低请求密度或换更稳环境/策略

### 共享节流 / 退避策略（2026-05-11 更新）

当正文下载大面积命中 `failed_env_abnormal` 时，仅仅降低并发通常不够。为此，本地代码新增了**共享退避控制器**：

- 文件：`src/lib/wechat/download-backoff.ts`
- 集成位置：`src/lib/wechat/article-html.ts`

**行为**：
- 在每次 Worker 正文请求前，先检查是否处于退避窗口，并根据下载路由控制器判断继续走代理还是临时退回直连
- 命中以下信号时，会提升全局退避：
  - `env_abnormal`
  - `verify`
  - `rate_limit`
  - `aborted`
  - `network`
- `env_abnormal / verify / rate_limit` 归为同一“风控类桶”，连续命中时指数退避
- `aborted / network` 归为同一“瞬时失败桶”，连续命中时指数退避
- 请求成功后，退避状态清零

**默认思路**：
- 风控类退避更重
- 瞬时网络类退避较轻
- 连续代理网络失败或连续代理风控命中达到阈值时，临时切换为直连慢速下载
- 当前实现阈值：连续代理网络失败 6 次，或连续代理风控命中（`env_abnormal` / `verify` / `rate_limit`）4 次
- 当前直连回退策略：进入直连后首个请求立即放行，后续按 3 秒间隔降频，持续 10 分钟后再尝试恢复代理
- 这样既不会一直高频撞微信风控，也不会因为偶发网络抖动过度降速

**回归测试**：
- `tests/download-backoff.test.ts`
- `tests/article-html-backoff.test.ts`
- `tests/download-route-controller.test.ts`
- 已验证：
  - `env_abnormal` 会抬高全局退避
  - `aborted/network` 连续命中会共享同一退避桶并指数增长
  - 连续代理风控/网络失败会切到直连模式
  - 直连模式会首个请求立即放行，后续按降频间隔节流
  - 成功后会重置退避状态


如果更换了 Node.js 主版本后，后台下载任务出现：

```bash
Module did not self-register: better_sqlite3.node
```

先在 skill 根目录执行：

```bash
npm rebuild better-sqlite3
```

然后验证：

```bash
node dist/src/cli.js doctor
node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"
```

该问题常见于 Node 版本升级后原生模块 ABI 不匹配。修复后再重启下载任务。


有三种配置方式，优先级从高到低：

1. **环境变量**（最高优先级）：
   ```bash
   export WECHAT_WORKERS="https://mp-proxy-00.myproxy3d45da21.workers.dev,https://mp-proxy-01.myproxy3d45da21.workers.dev,...,https://mp-proxy-19.myproxy3d45da21.workers.dev"
   ```

2. **代码内置**（修改 `src/lib/private-proxy.ts`）：
   ```typescript
   export default [
     'https://mp-proxy-00.myproxy3d45da21.workers.dev',
     'https://mp-proxy-01.myproxy3d45da21.workers.dev',
     // ... 共 20 个
   ];
   ```

3. **配置文件**（`.worker-proxy.env`）：
   ```env
   WORKER_PROXIES=https://mp-proxy-00.myproxy3d45da21.workers.dev
   ```

### 完整功能验证

```bash
# 1. 设置代理
export http_proxy=http://10.0.0.2:7890
export https_proxy=http://10.0.0.2:7890

# 2. 运行 Worker 健康检查
./bin/wechat-mp-monitor sync health-check

# 3. 验证下载功能（使用国家电网测试）
./bin/wechat-mp-monitor download pending --concurrency 10 --export --export-format md
```

### 代理使用原则（必须遵守）

| 场景 | 是否走代理 | 说明 |
|------|------------|------|
| **登录请求** | ❌ 始终不走 | 登录需要真实 IP 环境，避免风控 |
| **列表抓取** | ⚠️ 可选 | 当前固定 2s 间隔，并做运行内去重，风控风险较低 |
| **正文下载** | ✅ 默认走代理 | 大量文章下载最容易触发 IP 封禁 |

---

## 📊 官方架构对齐验证（vs docs.mptext.top）

| 官方要求 | 我们的实现 | 符合性 |
|---------|-----------|--------|
| Worker 协议：`?url=<encoded>&headers=<json>` | ✅ v2.0 版本完全实现 | ✅ 100% |
| 代理访问 workers.dev | ✅ 环境变量自动检测 + undici 集成 | ✅ 100% |
| 失败自动冷却重试 | ✅ 与官方逻辑一致 | ✅ 100% |
| 负载均衡（轮询） | ✅ 与官方逻辑一致 | ✅ 100% |
| 20+ 节点高可用 | ✅ 20 个独立 Worker | ✅ 100% |

---

## 🏭 典型部署方案对比

### 方案 A：服务器环境 + HTTP 代理
```
wechat-mp-monitor → HTTP Proxy → Cloudflare Workers → 微信服务器
```
- ✅ 优点：稳定可靠，绕过 DNS 污染
- ❌ 缺点：需要代理服务器
- 🎯 适用：VPS/服务器环境

### 方案 B：住宅网络 + 直连
```
wechat-mp-monitor → 直连 → 微信服务器
```
- ✅ 优点：最简单，微信风控对住宅 IP 宽松
- ❌ 缺点：高并发时可能被封禁
- 🎯 适用：家庭电脑，低并发下载

### 方案 C：自定义域名 Worker
```
wechat-mp-monitor → 自定义域名 → Cloudflare Workers → 微信服务器
```
- ✅ 优点：无 DNS 污染，访问速度快
- ❌ 缺点：需要域名和 Cloudflare 配置
- 🎯 适用：生产环境，高可用要求

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

## 🔑 关键词驱动文章下载流水线（新版推荐）

**2026-05-11 更新：替代旧的 enterprise 命令，功能更强大，53 组关键词规则，默认时间范围改为一天内**

### 核心特性

| 功能 | 说明 |
|------|------|
| 📊 **Excel 清单导入** | 201 家企业单位，含排名、类型、公众号名称等 |
| 🔍 **多维度筛选** | 按排名范围、企业类型、时间范围过滤 |
| 🎯 **关键词引擎** | 同行 AND / 跨行 OR 智能匹配，53 组预设规则 |
| 📋 **独立过滤表** | `articles_filter` 存储匹配结果，不影响原始数据 |
| 👀 **预览模式** | `--dry-run` 先看下载计划，不实际执行 |
| ⏱️ **时间范围优化** | 默认「一天内」，支持 year/month/week/day |
| 👔 **领导会见专题** | 预设 53 组「省市领导会见企业」关键词规则 |

### 准备工作

#### 1. 公众号清单文件

```bash
data/
├── 微信公众号清单.xlsx       # 原始 Excel (201 家企业)
├── 微信公众号清单.json        # 转换后的 JSON 格式
└── 关键词.txt                 # 关键词规则配置（53 组）
```

#### 2. Excel 转 JSON 脚本

```bash
cd /root/.hermes/profiles/productline/skills/social-media/wechat-mp-monitor/data
python3 convert-excel-to-json.py
```

#### 3. 关键词规则配置（领导会见专题）

编辑 `data/关键词.txt`，已预设 53 组规则：

```txt
# ========== 省级领导会见企业 ==========
省委书记 会见 企业
省委书记 接见 公司
省长 会见 企业
省长 接见 公司
省委书记 调研 企业
省长 调研 公司
常务副省长 会见 企业
副省长 接见 公司
# ... 共 53 组规则，含市级、厅局级、招商签约等场景
```

### 使用命令

#### 🔍 预览模式（推荐先用）

```bash
# 预览近一周的下载计划
node dist/src/cli.js keyword-download --time week --dry-run

# 预览近一年内的文章
node dist/src/cli.js keyword-download --time year --dry-run
```

#### ⚡ 执行下载

```bash
# 全量有效公众号，一年内，5 并发
node dist/src/cli.js keyword-download --time year --concurrency 5

# 下载近一个月文章
node dist/src/cli.js keyword-download --time month

# 默认下载正文；不支持 --skip-content
# 默认不限制页数；不支持 --limit-pages
# 默认不按企业类型/排名过滤；不支持 --type/--rank
```

#### 📋 查询过滤结果

```bash
node dist/src/cli.js query articles --keyword 人工智能
```

### 完整参数说明

```bash
Options:
  -c, --concurrency <number>  并发数 (default: 5)
  --clear-filter              重新过滤所有文章（清空过滤表）
  --time <range>              时间范围: year/month/week/day (default: day)
  --dry-run                   预览下载计划，不实际执行
  -h, --help                  显示帮助
```

### 数据库表结构

#### articles_filter 表

| 字段 | 说明 |
|------|------|
| `id` | 主键 |
| `article_id` | 关联原始文章 ID |
| `fakeid`, `aid` | 公众号和文章标识 |
| `title`, `digest`, `author_name` | 文章元数据 |
| `matched_keywords` | 匹配的关键词列表 (JSON) |
| `match_score` | 匹配分数（关键词数量） |
| `raw_html`, `normalized_html`, `html` | 文章正文 HTML |
| `html_format` | 正文格式标识 |
| `fetched_at`, `created_at`, `updated_at` | 时间戳 |

### 工作流程

```
1. 加载 Excel 公众号清单
      ↓
2. 按条件筛选（排名/类型）
      ↓
3. 搜索公众号获取微信 fakeid
      ↓
4. 批量同步文章列表元数据
      ↓
5. 关键词匹配过滤文章（同行 AND / 跨行 OR）
      ↓
6. 写入 articles_filter 表（含匹配关键词和分数）
      ↓
7. 可选：下载匹配文章的正文 HTML
```

---

## 🏭 旧版企业下载流水线（已废弃）

⚠️ **`enterprise` 命令已被 `keyword-download` 替代，功能更完整**

旧版功能：
- 支持 195 家企业公众号批量下载
- 按排名/类型/时间范围筛选

迁移建议：
- 使用 `keyword-download` 替代 `enterprise`
- 新命令包含所有旧功能 + 关键词过滤 + 独立结果表

### 旧版企业公众号文章下载流水线

### 功能特性

- 📊 **Excel 清单读取**: 自动读取企业名称、类型、公众号信息
- 🔐 **登录流程集成**: 自动检测登录态，引导用户登录
- ⚡ **并行批量下载**: 支持配置并发数（默认 20）
- 📅 **时间范围选择**: 全量 / 近一月 / 近一周 / 近一天
- 🔄 **重复覆盖机制**: 默认覆盖已下载文件，可配置跳过
- 📂 **分层存储路径**: 采用绝对路径确保读写可靠

### 存储路径结构

```
{输出根路径}/
├── markdown/
│   └── 2026/
│       └── 05/
│           └── 10/
│               └── {企业名称}/
│                   └── {公众号名称}/
│                       ├── 文章标题1.md
│                       ├── 文章标题2.md
│                       └── images/
│                           ├── pic1.jpg
│                           └── pic2.jpg
└── html/
    └── 2026/
        └── 05/
            └── 10/
                └── {企业名称}/
                    └── {公众号名称}/
                        ├── 文章标题1.html
                        └── 文章标题2.html
```

### 企业公众号批量下载实测结果（2026-05-10）

**下载任务完成统计**：
| 指标 | 数值 | 说明 |
|------|------|------|
| 总企业数 | 195 家 | 中国 200 强企业清单 |
| 成功匹配公众号 | 143 个 | 73.3% 匹配率 |
| 未找到公众号 | 52 个 | 名称错误或未开通 |
| 近一个月新增文章 | 96 篇 | 企业公众号更新频率普遍较低 |

**执行命令**：
```bash
node dist/src/cli.js enterprise --download --time month --concurrency 10
```

**关键发现**：
- ✅ 企业公众号整体更新频率较低（平均 0.7 篇/月/号）
- ✅ 无代理直连模式在 10 并发下运行稳定
- ✅ 所有公共 Worker 不可用，但系统自动回退到直连下载
- ✅ 多级分类存储结构工作正常

### 使用命令

```bash
# 1. 显示企业公众号清单
wechat-mp-monitor enterprise --list

# 2. 按类型筛选显示
wechat-mp-monitor enterprise --type 央企 --list
wechat-mp-monitor enterprise --type 央企,民企 --list

# 3. 按排名筛选显示
wechat-mp-monitor enterprise --rank 1-10 --list
wechat-mp-monitor enterprise --rank 1-50 --list

# 4. 预览下载计划（不实际下载）
wechat-mp-monitor enterprise --dry-run
wechat-mp-monitor enterprise --rank 1-20 --time week --dry-run

# 5. 执行下载
wechat-mp-monitor enterprise --rank 1-50 --download

# 6. 导出格式控制（2026-05-10 更新）
# enterprise 命令默认同时导出 Markdown 和 Word 格式
# 修改位置：src/commands/enterprise.ts 中的 syncOptions
# exportFormat: 'both' as const - 同时导出 md 和 docx
# 可选值：'md' | 'word' | 'both'

# 6. 指定时间范围下载
wechat-mp-monitor enterprise --download --time all     # 全量（默认）
wechat-mp-monitor enterprise --download --time month   # 近一月
wechat-mp-monitor enterprise --download --time week    # 近一周
wechat-mp-monitor enterprise --download --time day     # 近一天

# 7. 控制并发数
wechat-mp-monitor enterprise --download --concurrency 30

# 8. 跳过已下载文件（不覆盖）
wechat-mp-monitor enterprise --download --no-overwrite

# 9. 指定输出根路径（绝对路径）
wechat-mp-monitor enterprise --download --output /data/wechat-articles/
```

### 登录流程

首次使用需要登录微信公众号后台：

#### 登录二维码格式兼容性问题（已定位）

现象：
- 聊天平台里看到二维码正常
- 但扫码后进入白屏，或平台兼容性异常
- 日志可能出现：`终端二维码渲染跳过: unrecognised content at end of stream`

根因：
- 微信登录二维码接口返回的图片有时是 **JPEG/JFIF**，不是 PNG
- 旧实现错误地统一按 `.png` 保存，并尝试用 `pngjs` 解码
- 扩展名与真实格式不一致后，某些平台/查看器/扫码链路会异常

修正：
- 先根据 magic bytes 检测真实格式
- JPEG 则保存为 `.jpg`
- 只有真实 PNG 才尝试终端渲染
- 通过 Telegram/聊天平台发送时，优先发送真实格式；必要时可放大后再发送

操作建议：
- 扫码时优先使用 **微信 App 内扫一扫**
- 不要优先依赖系统相机或聊天平台内置扫码


```bash
# 执行登录
wechat-mp-monitor login

# 或在浏览器登录后复制 Cookie
```

登录成功后，Cookie 会自动保存，后续下载无需重复登录。

### 数据来源

企业公众号清单文件: `data/enterprise-accounts.json`

支持从 Excel 导入，格式要求：
- 排名
- 企业名称
- 企业类型（央企/民企/地方国企）
- 公众号名称
- 服务号名称（可选）
- 小程序名称（可选）

---

## 📝 TypeScript/ESM 开发经验总结（试错记录）

在开发 `enterprise` 命令过程中遇到的问题与解决方案：

### 1. ESM 模块 `__dirname` 未定义问题

**问题**：TypeScript 编译为 ESM 模块后，运行时 `__dirname` 未定义，导致数据文件路径解析失败。

**错误信息**：
```
ReferenceError: __dirname is not defined
```

**解决方案**：
```typescript
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

**注意**：这是 ESM 模块标准，必须使用 `import.meta.url`，CommonJS 的 `__dirname` 不可用。

### 2. 数据文件构建时复制

**问题**：`data/enterprise-accounts.json` 在源码目录，但运行时从 `dist/` 目录加载，文件不存在。

**解决方案**：更新 `package.json` 的 build 脚本：
```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json && mkdir -p dist/src/lib/storage && cp src/lib/storage/schema.sql dist/src/lib/storage/schema.sql && mkdir -p dist/data && cp data/*.json dist/data/ 2>/dev/null || true"
  }
}
```

### 3. Commander.js 命令注册模式

**正确的 ESM 命令注册模式**：

```typescript
import type { Command } from 'commander';

export function registerEnterpriseCommand(program: Command): void {
  const enterprise = program.command('enterprise').description('企业公众号文章下载流水线');

  enterprise
    .option('-l, --list', '显示企业公众号清单')
    .option('-t, --type <type>', '按企业类型筛选')
    .action(async (options) => {
      // 业务逻辑
    });
}
```

然后在 `cli.ts` 中导入并注册：
```typescript
import { registerEnterpriseCommand } from './commands/enterprise.js';
// ...
registerEnterpriseCommand(program);
```

### 4. 正确查找模块导出

**教训**：开发新命令前，先查看现有模块的实际导出，不要假设函数名：

```bash
# 查看 articles.ts 的导出
grep "export function\|export const" src/lib/wechat/articles.ts

# 查看 accounts.ts 的导出  
grep "export function\|export const" src/lib/wechat/accounts.ts
```

**实际导出 vs 假设**：
| 假设的函数名 | 实际导出的函数名 |
|-------------|----------------|
| `exportArticles` | `syncAllAccounts` (包含导出功能) |
| `getAccountArticles` | 不存在，需使用 `syncAllAccounts` |
| `searchAccount` | `searchAccounts` (复数) + `pickBestAccount` |

### 5. 开发调试流程

**推荐调试步骤**：
1. 修改 TypeScript 源码
2. 执行 `npm run build` 编译
3. 运行命令测试：`./bin/wechat-mp-monitor enterprise --list`
4. 如果报错，根据错误信息定位问题
5. 重复 1-4 直到功能正常

**常见错误速查**：
| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `__dirname is not defined` | ESM 模块问题 | 使用 `import.meta.url` |
| `Cannot find module 'xxx.js'` | 导入路径错误 | 检查相对路径，确保 `.js` 后缀 |
| 数据文件找不到 | dist 目录缺少数据文件 | 更新 build 脚本复制数据 |
| 运行时无输出 | 登录态失效 | 先执行 `login` 命令 |
| `--export` 不生成文件 | 文章已下载过 | 导出仅在首次下载正文时触发 |

### 6. 导出功能的关键行为（重要！）

**⚠️ 非直观行为，多次踩坑总结**：

`--export` 标志**仅在首次下载文章正文时触发导出**，不会对已下载的文章生效。

**触发条件**：
```typescript
// 在 syncAllAccounts 中
if (!options.skipContent) {
  const row = getArticleByKeys(fakeid, article.aid);
  // 只有 content_status 不是 ready 的文章才会进入下载队列
  if (row && row.content_status !== 'ready') {
    contentQueue.push(row);
  }
}

// 只有下载队列中的文章才会触发导出
// 导出逻辑在 ingestArticleHtml 中，仅被下载队列调用
```

**后果**：
- 已下载的文章（`content_status = 'ready'`）重新运行 sync 时不会重新下载
- 因此也不会触发导出
- 即使加上 `--export` 标志也无效

**解决方案**：

| 场景 | 方案 |
|------|------|
| **新文章首次下载** | 直接使用 `--export` 标志 |
| **已下载文章批量导出** | 编写独立的批量导出脚本，直接读取数据库和 HTML 文件 |

**批量导出脚本模板（Python）**：
```python
import sqlite3
import os
from datetime import datetime

db_path = "data/app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 获取所有已下载正文的文章
cursor.execute("""
    SELECT a.title, a.create_time, a.normalized_html_path, w.nickname
    FROM article a
    JOIN watch_account w ON a.fakeid = w.fakeid
    WHERE a.normalized_html_path IS NOT NULL
    ORDER BY a.create_time DESC
""")

for title, create_time, html_path, nickname in cursor.fetchall():
    if not html_path or not os.path.exists(html_path):
        continue
    # 读取 HTML 并转换为 Markdown...
    # 按日期目录存储...
```

**验证方法**：
```bash
# 查看数据库中 content_status 分布
sqlite3 data/app.db "SELECT content_status, COUNT(*) FROM article GROUP BY content_status;"
```
