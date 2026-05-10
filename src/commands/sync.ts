import type { Command } from 'commander';
import { syncAllAccounts } from '../lib/wechat/articles.js';

export function registerSyncCommand(program: Command): void {
  const sync = program.command('sync').description('执行增量同步');

  sync
    .command('run')
    .description('同步所有或指定公众号文章')
    .option('--account <identifier>', 'fakeid 或 nickname')
    .option('--limit-pages <number>', '每个公众号最多抓取页数')
    .option('--skip-content', '只抓元数据')
    .action(
      async (options: { account?: string; limitPages?: string; skipContent?: boolean }) => {
        const result = await syncAllAccounts({
          account: options.account,
          limitPages: options.limitPages ? Number(options.limitPages) : undefined,
          skipContent: Boolean(options.skipContent),
        });
        console.log(JSON.stringify(result, null, 2));
      }
    );
}
