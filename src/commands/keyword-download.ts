import type { Command } from 'commander';
import {
  loadAccountList,
  filterAccountsWithOfficialName,
  filterAccountsByType,
  filterAccountsByRank,
  type WeChatAccount
} from '../lib/account-list-loader.js';
import { loadKeywords, matchKeywords, buildArticleText } from '../lib/keyword-matcher.js';
import {
  batchUpsertFilteredArticles,
  getFilteredArticlesCount,
  clearFilteredArticles,
  type FilteredArticle
} from '../lib/filtered-articles.js';
import { searchAccounts, pickBestAccount } from '../lib/wechat/accounts.js';
import { syncAllAccounts } from '../lib/wechat/articles.js';
import { getDb } from '../lib/storage/db.js';
import * as path from 'path';

export interface KeywordDownloadOptions {
  concurrency?: number;
  clearFilter?: boolean;
  time?: string;
  dryRun?: boolean;
}

export function registerKeywordDownloadCommand(program: Command): void {
  const cmd = program.command('keyword-download')
    .description('关键词驱动的微信公众号文章下载流水线')
    .option('-c, --concurrency <number>', '并发数', parseInt, 5)
    .option('--clear-filter', '重新过滤所有文章（清空过滤表）')
    .option('--time <range>', '时间范围: year/month/week/day (一年内/一个月内/一周内/一天内)', 'day')
    .option('--dry-run', '预览下载计划，不实际执行');

  cmd.action(async (options: KeywordDownloadOptions) => {
    console.log('='.repeat(100));
    console.log('📊 微信公众号文章关键词下载流水线');
    console.log('='.repeat(100));

    // Step 1: 加载公众号清单
    console.log('\n📋 Step 1: 加载公众号清单...');
    const allAccounts = await loadAccountList();
    console.log(`   总计: ${allAccounts.length} 个单位`);

    // 筛选有公众号名称的账号
    let accounts = filterAccountsWithOfficialName(allAccounts);
    console.log(`   有公众号名称: ${accounts.length} 个`);

    if (accounts.length === 0) {
      console.log('❌ 没有符合条件的公众号');
      return;
    }

    // 显示预览
    console.log('\n📝 公众号清单（前10个）:');
    accounts.slice(0, 10).forEach((acc, i) => {
      const rankStr = acc.rank ? `#${acc.rank}` : '   -';
      console.log(`   ${rankStr} [${acc.type}] ${acc.unitName} -> ${acc.officialAccount}`);
    });
    if (accounts.length > 10) {
      console.log(`   ... 还有 ${accounts.length - 10} 个`);
    }

    // Step 2: 加载关键词
    console.log('\n🔑 Step 2: 加载关键词规则...');
    const keywordRules = loadKeywords();
    if (keywordRules.length === 0) {
      console.log('❌ 没有关键词规则，请编辑 data/关键词.txt');
      return;
    }
    console.log(`   关键词规则:`);
    keywordRules.slice(0, 10).forEach((rule, i) => {
      console.log(`     ${i + 1}. ${rule.andKeywords.join(' AND ')}`);
    });
    if (keywordRules.length > 10) {
      console.log(`     ... 还有 ${keywordRules.length - 10} 组规则`);
    }

    // Dry-run 模式
    if (options.dryRun) {
      console.log('\n📋 预览模式，不执行实际下载');
      console.log(`   待处理公众号: ${accounts.length} 个`);
      console.log(`   关键词规则: ${keywordRules.length} 组`);
      console.log(`   并发数: ${options.concurrency}`);
      const timeLabel = options.time === 'year' ? '一年内' : 
                        options.time === 'month' ? '一个月内' : 
                        options.time === 'week' ? '一周内' : '一天内';
      console.log(`   时间范围: ${timeLabel}`);
      return;
    }

    // Step 3: 搜索公众号获取 fakeid
    console.log('\n🔍 Step 3: 搜索公众号获取 fakeid...');
    const watchAccounts: Array<{ fakeid: string; nickname: string; account: WeChatAccount }> = [];
    
    for (const acc of accounts) {
      try {
        const results = await searchAccounts(acc.officialAccount!);
        if (results && results.length > 0) {
          const best = pickBestAccount(results, acc.officialAccount!);
          if (best) {
            watchAccounts.push({
              fakeid: best.fakeid,
              nickname: best.nickname,
              account: acc
            });
            console.log(`   ✅ ${acc.officialAccount} -> ${best.nickname} (fakeid: ${best.fakeid.substring(0, 10)}...)`);
          } else {
            console.log(`   ⚠️  ${acc.officialAccount} 未找到匹配结果`);
          }
        } else {
          console.log(`   ⚠️  ${acc.officialAccount} 无搜索结果`);
        }
      } catch (error: any) {
        console.log(`   ❌ ${acc.officialAccount} 搜索失败: ${error.message}`);
      }
      
      // 避免请求太快
      await new Promise(r => setTimeout(r, 500));
    }

    if (watchAccounts.length === 0) {
      console.log('❌ 没有可同步的公众号');
      return;
    }
    console.log(`   成功匹配 ${watchAccounts.length} 个公众号`);

    // Step 4: 同步文章列表
    console.log('\n📥 Step 4: 同步文章列表...');
    
    // 先添加公众号到 watch 列表
    const db = getDb();
    const now = new Date().toISOString();
    
    for (const wa of watchAccounts) {
      // 检查是否已存在
      const exists = db.prepare(`SELECT 1 FROM watch_account WHERE fakeid = ?`).get(wa.fakeid);
      if (!exists) {
        db.prepare(`
          INSERT INTO watch_account (fakeid, nickname, enabled, created_at, updated_at)
          VALUES (?, ?, 1, ?, ?)
        `).run(wa.fakeid, wa.nickname, now, now);
        console.log(`   ✅ 已添加 watch 列表: ${wa.nickname}`);
      }
    }
    
    // 同步文章 - 无页数限制，默认下载正文
    const syncResult = await syncAllAccounts({
      concurrency: options.concurrency,
    });
    console.log(`   同步完成: ${syncResult.articleCount} 篇文章`);

    // Step 5: 关键词过滤文章
    console.log('\n🔬 Step 5: 关键词过滤文章...');
    
    if (options.clearFilter) {
      await clearFilteredArticles();
    }

    // 计算时间范围
    const fakeids = watchAccounts.map(w => w.fakeid);
    let startTime = 0;
    const currentTime = Math.floor(Date.now() / 1000);
    if (options.time === 'year') {
      startTime = currentTime - 365 * 24 * 3600;
    } else if (options.time === 'month') {
      startTime = currentTime - 30 * 24 * 3600;
    } else if (options.time === 'week') {
      startTime = currentTime - 7 * 24 * 3600;
    } else if (options.time === 'day') {
      startTime = currentTime - 24 * 3600;
    }

    // 从数据库获取已同步的文章
    let sql = `
      SELECT id, fakeid, aid, title, digest, author_name, link, cover, create_time, plain_text
      FROM article
      WHERE fakeid IN (${fakeids.map(() => '?').join(',')})
    `;
    const params: any[] = [...fakeids];
    
    if (startTime > 0) {
      sql += ` AND create_time >= ?`;
      params.push(startTime);
    }
    
    const articles = db.prepare(sql).all(...params) as any[];
    console.log(`   待检查文章: ${articles.length} 篇`);

    // 过滤文章
    const matchedArticles: FilteredArticle[] = [];
    
    for (const article of articles) {
      const text = buildArticleText({
        title: article.title,
        digest: article.digest,
        authorName: article.author_name,
        plainText: article.plain_text
      });
      
      const result = matchKeywords(text, keywordRules);
      
      if (result.matched) {
        matchedArticles.push({
          articleId: article.id,
          fakeid: article.fakeid,
          aid: article.aid,
          title: article.title,
          digest: article.digest,
          authorName: article.author_name,
          link: article.link,
          cover: article.cover,
          createTime: article.create_time,
          matchedKeywords: result.matchedKeywords,
          matchScore: result.score
        });
      }
    }

    console.log(`   匹配成功: ${matchedArticles.length} 篇`);
    
    if (matchedArticles.length > 0) {
      console.log(`   匹配分数分布:`);
      const scoreStats: Record<number, number> = {};
      matchedArticles.forEach(a => {
        scoreStats[a.matchScore] = (scoreStats[a.matchScore] || 0) + 1;
      });
      Object.entries(scoreStats).sort((a, b) => Number(b[0]) - Number(a[0])).forEach(([score, count]) => {
        console.log(`     ${score} 个关键词: ${count} 篇`);
      });

      // 写入过滤表
      await batchUpsertFilteredArticles(matchedArticles);
      console.log(`   ✅ 已写入 articles_filter 表`);
    }

    // Step 6: 正文下载 - 默认同步已下载正文
    console.log('\\n⚠️  正文已在同步阶段下载完成');
    console.log(`   已匹配 ${matchedArticles.length} 篇文章`);

    // Step 7: 统计结果
    console.log('\n📊 Step 7: 结果统计...');
    const totalFiltered = await getFilteredArticlesCount();
    console.log(`   articles_filter 表总计: ${totalFiltered} 篇`);

    console.log('\n' + '='.repeat(100));
    console.log('✅ 流水线执行完成！');
    console.log('='.repeat(100));
    console.log('');
    console.log('📋 常用命令:');
    console.log('   node dist/src/cli.js query articles --keyword 人工智能');
    console.log('   node dist/src/cli.js report daily');
    console.log('');
  });
}
