import { getWatchAccount, listWatchAccounts, removeWatchAccount, setWatchAccountEnabled, upsertWatchAccount } from '../storage/db.js';
import type { SearchBizItem, SearchBizResponse } from '../types.js';
import { validateActiveSession, getSessionCookies } from './auth.js';
import { wechatRequest } from './http.js';

export const TEST_ACCOUNT_NAMES = [
  '广州越秀发布',
  '广州越秀政府网',
  '广州荔湾发布',
  '广州荔湾政府网',
  '广州海珠发布',
  '海珠投资investHZ',
  '广州天河发布',
  '投资天河',
  '广州白云发布',
  '白云区投促会',
  '广州黄埔发布',
  '广州番禺发布',
  '番禺政府网',
  '投资番禺',
  '广州花都发布',
  '广州市花都区中小企业文化促进会',
  '广州南沙发布',
  '南沙投资',
  '广州从化发布',
  '广州从化政府网',
  '广州增城发布',
  '广州增城政府网',
  '增城招商',
];

export async function searchAccounts(keyword: string, begin = 0, size = 5): Promise<SearchBizItem[]> {
  const session = await validateActiveSession();
  if (!session) {
    throw new Error('登录态无效，请先执行 login');
  }

  const response = await wechatRequest<SearchBizResponse>({
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/searchbiz',
    query: {
      action: 'search_biz',
      begin,
      count: size,
      query: keyword,
      token: session.token,
      lang: 'zh_CN',
      f: 'json',
      ajax: 1,
    },
    cookies: getSessionCookies(session),
  });

  if (response.data.base_resp.ret !== 0) {
    throw new Error(`${response.data.base_resp.ret}:${response.data.base_resp.err_msg}`);
  }

  return response.data.list ?? [];
}

export function pickBestAccount(list: SearchBizItem[], keyword: string, fakeid?: string): SearchBizItem | null {
  if (fakeid) {
    return list.find(item => item.fakeid === fakeid) ?? null;
  }

  const exact = list.find(item => item.nickname === keyword);
  if (exact) {
    return exact;
  }

  const alias = list.find(item => item.alias === keyword);
  if (alias) {
    return alias;
  }

  return list.length === 1 ? list[0] : null;
}

export async function addWatchAccountByKeyword(keyword: string, fakeid?: string): Promise<SearchBizItem> {
  const list = await searchAccounts(keyword, 0, 20);
  const account = pickBestAccount(list, keyword, fakeid);
  if (!account) {
    throw new Error(`未找到唯一匹配公众号，请改用 --fakeid。候选: ${list.map(item => `${item.nickname}(${item.fakeid})`).join(', ')}`);
  }
  upsertWatchAccount(account, keyword);
  return account;
}

export async function addTestAccounts(): Promise<SearchBizItem[]> {
  const results: SearchBizItem[] = [];
  for (const name of TEST_ACCOUNT_NAMES) {
    results.push(await addWatchAccountByKeyword(name));
  }
  return results;
}

export function listConfiguredAccounts(): Array<Record<string, unknown>> {
  return listWatchAccounts();
}

export function removeConfiguredAccount(identifier: string): number {
  return removeWatchAccount(identifier);
}

export function enableConfiguredAccount(fakeid: string): number {
  return setWatchAccountEnabled(fakeid, true);
}

export function disableConfiguredAccount(fakeid: string): number {
  return setWatchAccountEnabled(fakeid, false);
}

export function resolveConfiguredAccount(identifier: string): Record<string, unknown> | null {
  return getWatchAccount(identifier);
}
