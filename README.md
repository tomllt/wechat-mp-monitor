# WeChat MP Monitor

微信公众号文章监控与导出工具。

## 功能特性

- ✅ 扫码登录微信公众平台
- ✅ 批量监控多个公众号
- ✅ 自动同步文章元数据与正文
- ✅ 全文搜索支持（SQLite FTS5）
- ✅ 原始 HTML 与标准化 HTML 双格式存储
- 🚧 Cloudflare Workers 代理支持（开发中）
- 🚧 并发下载支持（开发中）

## 安装

```bash
npm install
npm run build
```

## 使用方法

### 登录

```bash
./bin/wechat-mp-monitor login
```

扫码完成登录。

### 添加监控公众号

```bash
./bin/wechat-mp-monitor accounts add <fakeid 或 名称>
```

### 同步文章

```bash
# 同步所有公众号
./bin/wechat-mp-monitor sync run

# 仅同步指定公众号
./bin/wechat-mp-monitor sync run --account "国家电网"

# 仅抓取元数据，不下载正文
./bin/wechat-mp-monitor sync run --skip-content
```

### 查询文章

```bash
./bin/wechat-mp-monitor query articles --account "国家电网" --limit 10
```

## 配置

可选环境变量：

```env
# Cloudflare Worker 代理地址（用于文章下载绕过 IP 限制）
WECHAT_PROXY_URL=https://your-worker.workers.dev

# 代理模式: all|content|none
# all: 所有请求走代理
# content: 仅文章正文下载走代理
# none: 不走代理
WECHAT_PROXY_MODE=content
```

## 数据存储

- SQLite 数据库: `data/app.db`
- 原始 HTML: `data/articles/raw/<fakeid>/<aid>.html`
- 标准化 HTML: `data/articles/normalized/<fakeid>/<aid>.html`

## 技术栈

- TypeScript
- Node.js >= 22
- better-sqlite3 (高性能 SQLite)
- cheerio (HTML 解析)
- commander (CLI 框架)

## License

MIT
