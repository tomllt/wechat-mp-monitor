export interface BaseResp {
  ret: number;
  err_msg: string;
}

export interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expires?: string | number | Date;
}

export interface LoginAccount {
  nickname: string;
  avatar: string;
  expires: string;
}

export interface SearchBizItem {
  alias: string;
  fakeid: string;
  nickname: string;
  round_head_img: string;
  service_type: number;
  signature: string;
}

export interface SearchBizResponse {
  base_resp: BaseResp;
  list: SearchBizItem[];
  total: number;
}

export interface AppMsgEx {
  aid: string;
  album_id: string;
  appmsgid: number;
  author_name: string;
  copyright_stat: number;
  copyright_type: number;
  cover: string;
  create_time: number;
  digest: string;
  is_deleted: boolean;
  itemidx: number;
  link: string;
  title: string;
  update_time: number;
}

export interface PublishListItem {
  publish_info: string;
}

export interface PublishPage {
  publish_list: PublishListItem[];
  total_count: number;
}

export interface AppMsgPublishResponse {
  base_resp: BaseResp;
  publish_page: string;
}

export interface ScanLoginResult {
  base_resp: BaseResp;
  status: number;
  acct_size: number;
  binduin: string;
}

export interface ActiveAuthSession {
  id: number;
  auth_key: string;
  token: string;
  cookie_json: string;
  nickname: string | null;
  avatar: string | null;
  expires_at: string | null;
  last_validated_at: string | null;
  status: string;
}

export interface ArticleRow {
  id?: number;
  fakeid: string;
  nickname?: string;
  aid: string;
  appmsgid?: number | null;
  title: string;
  digest?: string | null;
  author_name?: string | null;
  link: string;
  cover?: string | null;
  create_time: number;
  update_time?: number | null;
  itemidx?: number | null;
  copyright_stat?: number | null;
  copyright_type?: number | null;
  album_id?: string | null;
  is_deleted: number;
  content_status: string;
  raw_html_path?: string | null;
  normalized_html_path?: string | null;
  plain_text?: string | null;
  fetched_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArticleQueryInput {
  account?: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  limit?: number;
}

export interface ArticleQueryResult {
  fakeid: string;
  nickname: string;
  aid: string;
  title: string;
  digest: string;
  author_name: string;
  link: string;
  create_time: number;
  content_status: string;
  snippet?: string;
}

export interface DailyReportKeywordGroup {
  keyword: string;
  count: number;
  articles: ArticleQueryResult[];
}

export interface DailyReport {
  date: string;
  generatedAt: string;
  keywords: DailyReportKeywordGroup[];
  totalArticles: number;
}
