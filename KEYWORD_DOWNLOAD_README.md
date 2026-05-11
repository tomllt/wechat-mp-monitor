# 微信公众号文章关键词下载流水线

## 功能概述

全新的关键词驱动微信公众号文章下载流水线，支持从 Excel 导入企业公众号清单，按规则过滤文章关键词，将匹配文章存入单独的过滤表。

## 核心特性

1. **公众号清单管理**：从 Excel 导入，支持 201 家企业单位，包含排名、单位名称、类型、公众号名称等信息
2. **多维度筛选**：
   - 按企业类型：央企/民企/地方国企
   - 按排名范围：如 1-50 表示前 50 名
3. **关键词规则引擎**：
   - 同一行空格分隔的关键词为 AND 关系
   - 不同行的关键词为 OR 关系
   - 支持 20+ 预设关键词规则
4. **文章正文下载**：支持下载匹配文章的完整 HTML 正文
5. **独立过滤表**：`articles_filter` 表存储过滤结果，不影响原始数据

## 使用方法

### 1. 预览下载计划
```bash
node dist/src/cli.js keyword-download --rank 1-10 --dry-run
```

### 2. 下载国家电网相关文章
```bash
# 只下载前 10 名央企，限定 5 页文章
node dist/src/cli.js keyword-download --rank 1-10 --limit-pages 5
```

### 3. 按类型筛选
```bash
# 只下载央企
node dist/src/cli.js keyword-download --type 央企

# 下载央企和民企
node dist/src/cli.js keyword-download --type 央企,民企
```

### 4. 时间范围过滤
```bash
# 只下载最近 7 天的文章
node dist/src/cli.js keyword-download --time week
```

### 5. 常用参数
- `--rank <range>`: 按排名筛选，如 `1-50`
- `--type <type>`: 按类型筛选，如 `央企`，多类型用逗号分隔
- `--limit-pages <n>`: 限制每个公众号同步的页数
- `--time <range>`: 时间范围：`all/month/week/day`
- `--dry-run`: 预览模式，不实际执行
- `--clear-filter`: 重新过滤所有文章
- `--skip-content`: 只同步列表，不下正文

## 文件结构

```
data/
├── 微信公众号清单.xlsx       # 原始 Excel 文件
├── 微信公众号清单.json        # 转换后的 JSON 格式
├── 关键词.txt                 # 关键词规则文件
└── convert-excel-to-json.py   # Excel 转 JSON 脚本

src/
├── commands/
│   └── keyword-download.ts    # 核心下载命令
├── lib/
│   ├── account-list-loader.ts # 公众号清单加载器
│   ├── keyword-matcher.ts     # 关键词匹配引擎
│   └── filtered-articles.ts   # 过滤文章数据库操作
```

## 关键词规则示例

编辑 `data/关键词.txt`：

```txt
# 每行一组关键词，空格分隔表示 AND，不同行表示 OR
人工智能 大模型
数字经济 产业
数字化转型
科技创新 企业
绿色发展 双碳
智能制造 工业互联网
```

## 数据查询

```bash
# 查询过滤后的文章
node dist/src/cli.js query articles --keyword 人工智能

# 生成日报
node dist/src/cli.js report daily
```

## 数据库表结构

### articles_filter 表
- `id`: 主键
- `article_id`: 关联原始文章 ID
- `fakeid`, `aid`: 公众号和文章标识
- `title`, `digest`, `author_name`: 文章元数据
- `matched_keywords`: 匹配的关键词列表（JSON）
- `match_score`: 匹配分数
- `raw_html`, `normalized_html`: 文章正文 HTML
- `created_at`, `updated_at`: 时间戳

## 工作流程

1. 加载 Excel 公众号清单
2. 按条件筛选公众号
3. 搜索公众号获取微信 fakeid
4. 批量同步文章列表
5. 关键词匹配过滤文章
6. 写入 articles_filter 表
7. 可选下载文章正文
