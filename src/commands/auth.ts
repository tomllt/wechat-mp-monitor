import type { Command } from 'commander';
import { expireActiveAuthSession } from '../lib/storage/db.js';
import { printSessionStatus, validateActiveSession } from '../lib/wechat/auth.js';

export function registerAuthCommand(program: Command): void {
  const auth = program.command('auth').description('认证状态管理');
  auth
    .command('status')
    .description('检查当前登录态')
    .action(async () => {
      const session = await validateActiveSession();
      printSessionStatus(session);
    });

  auth
    .command('logout')
    .description('使本地登录态失效')
    .action(() => {
      expireActiveAuthSession();
      console.log('ok');
    });
}
