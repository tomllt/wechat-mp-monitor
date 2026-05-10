import { describe, expect, it } from 'vitest';
import { TEST_ACCOUNT_NAMES } from '../src/lib/wechat/accounts.js';

describe('default test accounts', () => {
  it('includes the default Guangzhou watchlist', () => {
    expect(TEST_ACCOUNT_NAMES).toEqual([
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
    ]);
  });
});
