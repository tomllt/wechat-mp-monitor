import type { Command } from 'commander';
import { syncAllAccounts } from '../lib/wechat/articles.js';
import { getConcurrency, getProxyAuthorization, getProxyMode, getAllWorkerProxies } from '../lib/config.js';
import { WorkerProxyPool, globalProxyPool } from '../lib/worker-proxy-pool.js';

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
    .option('--no-proxy', '禁用代理')
    .option('--proxy-mode <mode>', '代理模式: none, content, all (默认: content)')
    .option('--health-check', '下载前执行 Worker 健康检查')
    .option('--health-mode <mode>', '健康检查模式: native (默认), proxy')
    .action(async (options: {
      account?: string;
      limitPages?: string;
      skipContent?: boolean;
      concurrency?: string;
      export?: boolean;
      exportFormat?: 'md' | 'word' | 'both';
      exportPath?: string;
      proxy?: boolean;
      proxyMode?: 'none' | 'content' | 'all';
      healthCheck?: boolean;
      healthMode?: 'native' | 'proxy';
    }) => {
      // 设置环境变量
      if (options.proxyMode) {
        process.env.PROXY_MODE = options.proxyMode;
      }
      if (!options.proxy) {
        process.env.PROXY_MODE = 'none';
      }
      if (options.concurrency) {
        process.env.DOWNLOAD_CONCURRENCY = options.concurrency;
      }
      if (options.exportPath) {
        process.env.STORAGE_ROOT = options.exportPath;
      }

      // 如果指定了健康检查模式，重新初始化代理池
      if (options.healthMode && options.healthMode !== 'native') {
        // @ts-ignore - 使用私有构造参数
        globalProxyPool = new WorkerProxyPool(undefined, '/health', options.healthMode);
      }

      // 执行健康检查
      if (options.healthCheck && getProxyMode() !== 'none') {
        await globalProxyPool.checkAllWorkers();
        console.log();
      }

      console.log('🚀 开始同步...');
      console.log('📋 配置:');
      console.log(`   代理模式: ${getProxyMode()}`);
      console.log(`   并发数: ${options.concurrency ?? getConcurrency()}`);
      
      if (getProxyMode() !== 'none') {
        console.log(`   健康 Worker 数量: ${globalProxyPool.healthyCount}/${globalProxyPool.totalCount}`);
      } else {
        console.log(`   可用 Worker 数量: ${getAllWorkerProxies().length} (已禁用)`);
      }
      
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
    .command('proxy-status')
    .description('查看代理池状态')
    .option('--check', '执行健康检查')
    .action(async (options: { check?: boolean }) => {
      console.log('📊 代理池状态');
      console.log(`   代理模式: ${getProxyMode()}`);
      console.log(`   总代理数量: ${globalProxyPool.totalCount}`);
      console.log(`   当前健康数量: ${globalProxyPool.healthyCount}`);
      
      if (options.check) {
        console.log();
        await globalProxyPool.checkAllWorkers();
      }
      
      console.log();
      console.log('🔗 前 10 个代理:');
      globalProxyPool.getAll().slice(0, 10).forEach((p, i) => {
        const isHealthy = globalProxyPool.getHealthy().includes(p);
        console.log(`   ${i + 1}. ${p} ${isHealthy ? '✅' : '❌'}`);
      });
      
      if (globalProxyPool.totalCount > 10) {
        console.log(`   ... 还有 ${globalProxyPool.totalCount - 10} 个代理`);
      }
    });

  sync
    .command('health-check')
    .description('执行 Worker 健康检查')
    .option('--concurrent <number>', '并发检查数量，默认 10')
    .option('--mode <mode>', '健康检查模式: native (默认), proxy')
    .option('--save', '保存健康检查结果到配置')
    .action(async (options: { concurrent?: string; mode?: 'native' | 'proxy'; save?: boolean }) => {
      const concurrent = options.concurrent ? parseInt(options.concurrent) : 10;
      
      // 如果指定了模式，重新初始化代理池
      let proxyPool = globalProxyPool;
      if (options.mode && options.mode !== 'native') {
        proxyPool = new WorkerProxyPool({
          privateProxies: getAllWorkerProxies(),
          authorization: getProxyAuthorization(),
        });
      }
      
      const checkResult = await proxyPool.healthCheckAll();
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
          console.log(`   ${i + 1}. ${r.proxy} - ${r.error || `检查失败`}`);
        });
      }
      
      if (options.save) {
        console.log();
        console.log('💡 提示: 健康的 Worker 已自动更新到内存代理池');
      }
    });
}
