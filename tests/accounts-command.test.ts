import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { addWatchAccountByKeyword } = vi.hoisted(() => ({
  addWatchAccountByKeyword: vi.fn(),
}));

vi.mock('../src/lib/wechat/accounts.js', () => ({
  addWatchAccountByKeyword,
  addTestAccounts: vi.fn(),
  disableConfiguredAccount: vi.fn(),
  enableConfiguredAccount: vi.fn(),
  listConfiguredAccounts: vi.fn(),
  removeConfiguredAccount: vi.fn(),
}));

import { registerAccountsCommand } from '../src/commands/accounts.js';

describe('accounts add command', () => {
  afterEach(() => {
    addWatchAccountByKeyword.mockReset();
    vi.restoreAllMocks();
  });

  it('adds multiple keywords in one command', async () => {
    addWatchAccountByKeyword.mockImplementation(async (keyword: string) => ({
      fakeid: `fakeid-${keyword}`,
      nickname: keyword,
    }));

    const program = new Command();
    registerAccountsCommand(program);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'test', 'accounts', 'add', '广州越秀发布', '广州越秀政府网']);

    expect(addWatchAccountByKeyword).toHaveBeenCalledTimes(2);
    expect(addWatchAccountByKeyword).toHaveBeenNthCalledWith(1, '广州越秀发布', undefined);
    expect(addWatchAccountByKeyword).toHaveBeenNthCalledWith(2, '广州越秀政府网', undefined);
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        [
          { fakeid: 'fakeid-广州越秀发布', nickname: '广州越秀发布' },
          { fakeid: 'fakeid-广州越秀政府网', nickname: '广州越秀政府网' },
        ],
        null,
        2
      )
    );
  });

  it('rejects using fakeid with multiple keywords', async () => {
    const program = new Command();
    registerAccountsCommand(program);

    await expect(
      program.parseAsync(['node', 'test', 'accounts', 'add', '广州越秀发布', '广州越秀政府网', '--fakeid', '123'])
    ).rejects.toThrow('--fakeid 仅支持单个公众号名称');
  });
});
