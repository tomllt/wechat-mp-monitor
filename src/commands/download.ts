import type { Command } from 'commander';
import { getArticleByKeys, getArticlesMissingContent, getWatchAccount } from '../lib/storage/db.js';
import { validateActiveSession, getSessionCookies } from '../lib/wechat/auth.js';
import { ingestArticleHtml } from '../lib/wechat/article-html.js';
import { getConcurrency, getAllWorkerServices } from '../lib/config.js';
import { ConcurrentDownloader } from '../lib/concurrent-downloader.js';
import { globalServicePool } from '../lib/worker-proxy-pool.js';

export function registerDownloadCommand(program: Command): void {
  const download = program.command('download').description('批量下载文章正文');

  download
    .command('pending')
    .description('下载所有待下载的正文')
    .option('--account <identifier>', 'fakeid 或 公众号名称')
    .option('--concurrency <number>', '下载并发数，默认 3')
    .option('--limit <number>', '最多下载数量')
    .option('--export', '导出文章到本地文件')
    .option('--export-format <format>', '导出格式: md, word, both (默认: md)')
    .option('--export-path <path>', '自定义导出目录')
    .option('--health-check', '下载前执行 Worker 健康检查')
    .action(async (options: {
      account?: string;
      concurrency?: string;
      limit?: string;
      export?: boolean;
      exportFormat?: 'md' | 'word' | 'both';
      exportPath?: string;
      healthCheck?: boolean;
    }) => {
      // 设置环境变量
      if (options.concurrency) {
        process.env.DOWNLOAD_CONCURRENCY = options.concurrency;
      }
      if (options.exportPath) {
        process.env.STORAGE_ROOT = options.exportPath;
      }

      // 执行健康检查
      if (options.healthCheck) {
        await globalServicePool.healthCheckAll();
        console.log();
      }

      const session = await validateActiveSession();
      if (!session) {
        console.error('❌ 登录态无效，请先执行 login');
        process.exit(1);
      }

      const fakeid = options.account 
        ? (getWatchAccount(options.account)?.fakeid as string | undefined)
        : undefined;
      
      const pending = getArticlesMissingContent(fakeid);
      const limit = options.limit ? Number(options.limit) : Infinity;
      const toDownload = pending.slice(0, limit);

      console.log('🚀 开始批量下载...');
      console.log('📋 配置:');
      console.log(`   并发数: ${options.concurrency ?? getConcurrency()}`);
      console.log(`   Worker 服务数量: ${getAllWorkerServices().length}`);
      console.log(`   导出文章: ${options.export ? '是' : '否'}`);
      if (options.export) {
        console.log(`   导出格式: ${options.exportFormat ?? 'md'}`);
      }
      console.log();
      console.log(`📊 待下载: ${pending.length} 篇`);
      console.log(`📥 本次下载: ${toDownload.length} 篇`);
      console.log();

      const concurrency = options.concurrency ? Number(options.concurrency) : undefined;
      const downloader = concurrency && concurrency > 0
        ? new ConcurrentDownloader(concurrency)
        : { submit: <T>(fn: () => Promise<T>) => fn() };

      let success = 0;
      let failed = 0;
      let exported = 0;

      const cookies = getSessionCookies(session);
      const ingestOptions = {
        export: options.export,
        exportFormat: options.exportFormat,
        exportPath: options.exportPath,
      };

      const promises = toDownload.map(row =>
        downloader.submit(async () => {
          try {
            const result = await ingestArticleHtml(row, cookies, ingestOptions);
            if (result.status === 'ready' || result.status === 'deleted') {
              success++;
              if (result.exportedMdPath || result.exportedWordPath) {
                exported++;
              }
            } else {
              failed++;
            }
          } catch (error) {
            failed++;
          }

          // 显示进度
          if ((success + failed) % 10 === 0) {
            console.log(`   进度: ${success + failed}/${toDownload.length} (成功: ${success}, 失败: ${failed})`);
          }
        })
      );

      await Promise.all(promises);

      console.log();
      console.log('✅ 下载完成!');
      console.log(`   成功: ${success}`);
      console.log(`   失败: ${failed}`);
      if (options.export) {
        console.log(`   已导出: ${exported}`);
      }
    });
}
