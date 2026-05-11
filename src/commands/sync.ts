import type { Command } from 'commander';
import { syncAllAccounts } from '../lib/wechat/articles.js';
import { getConcurrency, getServiceAuthorization, getAllWorkerServices } from '../lib/config.js';
import { ArticleDownloadServicePool, globalServicePool } from '../lib/worker-proxy-pool.js';

export function registerSyncCommand(program: Command): void {
  const sync = program.command('sync').description('执行增量同步');

  sync
    .command('run')
    .description('同步所有或指定公众号文章')
    .option('--account <identifier>', 'fakeid 或 公众号名称')
    .option('--limit-pages <number>', '每个公众号最多抓取页数')
    .option('--skip-content', '只抓元数据，不下载正文')
    .option('--concurrency <number>', '下载并发数，默认 3')
    .option('--export', '导出文章到本地文件')
    .option('--export-format <format>', '导出格式: md, word, both (默认: md)')
    .option('--export-path <path>', '自定义导出目录')
    .option('--health-check', '下载前执行 Worker 健康检查')
    .action(async (options: {
      account?: string;
      limitPages?: string;
      skipContent?: boolean;
      concurrency?: string;
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

      console.log('🚀 开始同步...');
      console.log('📋 配置:');
      console.log(`   并发数: ${options.concurrency ?? getConcurrency()}`);
      console.log(`   Worker 服务数量: ${globalServicePool.healthyCount}/${globalServicePool.totalCount}`);
      console.log(`   导出文章: ${options.export ? '是' : '否'}`);
      if (options.export) {
        console.log(`   导出格式: ${options.exportFormat ?? 'md'}`);
      }
      console.log();

      const result = await syncAllAccounts({
        account: options.account,
        limitPages: options.limitPages ? Number(options.limitPages) : undefined,
        skipContent: Boolean(options.skipContent),
        concurrency: options.concurrency ? Number(options.concurrency) : undefined,
        export: options.export,
        exportFormat: options.exportFormat,
        exportPath: options.exportPath,
      });

      console.log('✅ 同步完成!');
      console.log(JSON.stringify(result, null, 2));
    });

  sync
    .command('service-status')
    .description('查看 Worker 文章下载服务状态')
    .option('--check', '执行健康检查')
    .action(async (options: { check?: boolean }) => {
      console.log('📊 Worker 下载服务状态');
      console.log(`   总服务数量: ${globalServicePool.totalCount}`);
      console.log(`   当前健康数量: ${globalServicePool.healthyCount}`);
      
      if (options.check) {
        console.log();
        await globalServicePool.healthCheckAll();
      }
      
      console.log();
      console.log('🔗 前 10 个服务:');
      globalServicePool.getAll().slice(0, 10).forEach((p, i) => {
        const isHealthy = globalServicePool.getHealthy().includes(p);
        console.log(`   ${i + 1}. ${p} ${isHealthy ? '✅' : '❌'}`);
      });
      
      if (globalServicePool.totalCount > 10) {
        console.log(`   ... 还有 ${globalServicePool.totalCount - 10} 个服务`);
      }
    });

  sync
    .command('health-check')
    .description('执行 Worker 健康检查')
    .option('--concurrent <number>', '并发检查数量，默认 10')
    .option('--save', '保存健康检查结果到配置')
    .action(async (options: { concurrent?: string; save?: boolean }) => {
      const concurrent = options.concurrent ? parseInt(options.concurrent) : 10;
      
      const checkResult = await globalServicePool.healthCheckAll();
      const results = checkResult.results;
      
      const healthy = results.filter(r => r.healthy);
      const unhealthy = results.filter(r => !r.healthy);
      
      console.log();
      console.log('📈 详细统计:');
      console.log(`   健康: ${healthy.length}`);
      console.log(`   不健康: ${unhealthy.length}`);
      
      if (unhealthy.length > 0) {
        console.log();
        console.log('❌ 不可用的 Worker (前 10):');
        unhealthy.slice(0, 10).forEach((r, i) => {
          console.log(`   ${i + 1}. ${r.service} - ${r.error || `检查失败`}`);
        });
      }
      
      if (options.save) {
        console.log();
        console.log('💡 提示: 健康的 Worker 已自动更新到内存服务池');
      }
    });
}
