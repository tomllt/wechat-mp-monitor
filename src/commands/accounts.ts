import type { Command } from 'commander';
import {
  addTestAccounts,
  addWatchAccountByKeyword,
  disableConfiguredAccount,
  enableConfiguredAccount,
  listConfiguredAccounts,
  removeConfiguredAccount,
} from '../lib/wechat/accounts.js';

export function registerAccountsCommand(program: Command): void {
  const accounts = program.command('accounts').description('监控公众号清单管理');

  accounts
    .command('add')
    .argument('<keywords...>', '一个或多个公众号名称关键字')
    .option('--fakeid <fakeid>', '指定 fakeid')
    .action(async (keywords: string[], options: { fakeid?: string }) => {
      if (options.fakeid && keywords.length > 1) {
        throw new Error('--fakeid 仅支持单个公众号名称');
      }

      const accounts = [];
      for (const keyword of keywords) {
        accounts.push(await addWatchAccountByKeyword(keyword, options.fakeid));
      }

      console.log(JSON.stringify(keywords.length === 1 ? accounts[0] : accounts, null, 2));
    });

  accounts
    .command('add-tests')
    .description('添加预设默认公众号清单')
    .action(async () => {
      const result = await addTestAccounts();
      console.log(JSON.stringify(result, null, 2));
    });

  accounts
    .command('list')
    .description('列出监控清单')
    .action(() => {
      console.log(JSON.stringify(listConfiguredAccounts(), null, 2));
    });

  accounts
    .command('remove')
    .argument('<identifier>', 'fakeid 或 nickname')
    .action((identifier: string) => {
      console.log(removeConfiguredAccount(identifier));
    });

  accounts
    .command('enable')
    .argument('<fakeid>', '公众号 fakeid')
    .action((fakeid: string) => {
      console.log(enableConfiguredAccount(fakeid));
    });

  accounts
    .command('disable')
    .argument('<fakeid>', '公众号 fakeid')
    .action((fakeid: string) => {
      console.log(disableConfiguredAccount(fakeid));
    });
}
