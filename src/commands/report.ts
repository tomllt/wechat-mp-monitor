import type { Command } from 'commander';
import { addReportKeyword, listReportKeywords, removeReportKeyword } from '../lib/storage/db.js';
import { buildDailyReport, writeDailyReportFiles } from '../lib/report/daily-report.js';
import { isoDate } from '../lib/utils.js';

export function registerReportCommand(program: Command): void {
  const report = program.command('report').description('关键词日报');
  const keyword = report.command('keywords').description('日报关键词管理');

  keyword
    .command('add')
    .argument('<value>', '关键词')
    .action((value: string) => {
      addReportKeyword(value);
      console.log('ok');
    });

  keyword
    .command('list')
    .action(() => {
      console.log(JSON.stringify(listReportKeywords(), null, 2));
    });

  keyword
    .command('remove')
    .argument('<value>', '关键词')
    .action((value: string) => {
      console.log(removeReportKeyword(value));
    });

  report
    .command('daily')
    .option('--date <date>', 'YYYY-MM-DD 日期', isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000)))
    .option('--keyword <keyword...>', '一个或多个关键词')
    .option('--format <format>', 'md|json|both', 'both')
    .option('--output <dir>', '输出目录')
    .action(
      async (options: {
        date: string;
        keyword?: string[];
        format: 'md' | 'json' | 'both';
        output?: string;
      }) => {
        const reportData = buildDailyReport({
          date: options.date,
          keywords: options.keyword,
        });
        const result = await writeDailyReportFiles(reportData, {
          format: options.format,
          outputDir: options.output,
        });
        console.log(JSON.stringify(result, null, 2));
      }
    );
}
