CREATE TABLE IF NOT EXISTS auth_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auth_key TEXT NOT NULL,
  token TEXT NOT NULL,
  cookie_json TEXT NOT NULL,
  nickname TEXT,
  avatar TEXT,
  expires_at TEXT,
  last_validated_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_account (
  fakeid TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  alias TEXT,
  signature TEXT,
  service_type INTEGER,
  round_head_img TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  source_keyword TEXT,
  last_sync_at TEXT,
  last_success_sync_at TEXT,
  last_seen_create_time INTEGER,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fakeid TEXT NOT NULL,
  aid TEXT NOT NULL,
  appmsgid INTEGER,
  title TEXT NOT NULL,
  digest TEXT,
  author_name TEXT,
  link TEXT NOT NULL,
  cover TEXT,
  create_time INTEGER NOT NULL,
  update_time INTEGER,
  itemidx INTEGER,
  copyright_stat INTEGER,
  copyright_type INTEGER,
  album_id TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  content_status TEXT NOT NULL DEFAULT 'pending',
  raw_html_path TEXT,
  normalized_html_path TEXT,
  plain_text TEXT,
  fetched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(fakeid, aid),
  UNIQUE(link)
);

CREATE INDEX IF NOT EXISTS idx_article_fakeid_create_time ON article(fakeid, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_article_create_time ON article(create_time DESC);

CREATE TABLE IF NOT EXISTS sync_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  account_count INTEGER NOT NULL DEFAULT 0,
  article_count INTEGER NOT NULL DEFAULT 0,
  content_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sync_run_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  fakeid TEXT NOT NULL,
  nickname TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  new_articles INTEGER NOT NULL DEFAULT 0,
  updated_articles INTEGER NOT NULL DEFAULT 0,
  fetched_contents INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS report_keyword (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS article_fts USING fts5(
  title,
  digest,
  author_name,
  plain_text,
  nickname,
  fakeid UNINDEXED,
  aid UNINDEXED
);

-- 关键词过滤后的文章表
CREATE TABLE IF NOT EXISTS articles_filter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL,
  fakeid TEXT NOT NULL,
  aid TEXT NOT NULL,
  title TEXT NOT NULL,
  digest TEXT,
  author_name TEXT,
  link TEXT NOT NULL,
  cover TEXT,
  create_time INTEGER NOT NULL,
  raw_html TEXT,
  normalized_html TEXT,
  html TEXT,
  html_format TEXT,
  matched_keywords TEXT,
  match_score INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE,
  UNIQUE(fakeid, aid)
);

CREATE INDEX IF NOT EXISTS idx_articles_filter_create_time ON articles_filter(create_time DESC);
CREATE INDEX IF NOT EXISTS idx_articles_filter_match_score ON articles_filter(match_score DESC);
