import { Command } from 'commander';
import { registerAccountsCommand } from './commands/accounts.js';
import { registerAuthCommand } from './commands/auth.js';
import { registerLoginCommand } from './commands/login.js';
import { registerQueryCommand } from './commands/query.js';
import { registerReportCommand } from './commands/report.js';
import { registerSyncCommand } from './commands/sync.js';
import { ensureRuntimeDirs } from './lib/paths.js';

async function main() {
  ensureRuntimeDirs();

  const program = new Command();
  program
    .name('wechat-mp-monitor')
    .description('微信公众号监控与日报工具')
    .version('0.1.0');

  program
    .command('doctor')
    .description('检查本地运行目录')
    .action(() => {
      console.log('ok');
    });

  registerLoginCommand(program);
  registerAuthCommand(program);
  registerAccountsCommand(program);
  registerSyncCommand(program);
  registerQueryCommand(program);
  registerReportCommand(program);

  await program.parseAsync(process.argv);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
