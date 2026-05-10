import type { Command } from 'commander';
import { queryArticles, renderArticleQuery } from '../lib/query/article-query.js';

export function registerQueryCommand(program: Command): void {
  const query = program.command('query').description('查询文章内容');

  query
    .command('articles')
    .option('--account <identifier>', 'fakeid 或 nickname')
    .option('--date-from <date>', '开始日期 YYYY-MM-DD')
    .option('--date-to <date>', '结束日期 YYYY-MM-DD')
    .option('--keyword <keyword>', '关键词')
    .option('--limit <number>', '结果数', '20')
    .option('--format <format>', 'table|json|md', 'table')
    .action(
      async (options: {
        account?: string;
        dateFrom?: string;
        dateTo?: string;
        keyword?: string;
        limit: string;
        format: 'table' | 'json' | 'md';
      }) => {
        const result = queryArticles({
          account: options.account,
          dateFrom: options.dateFrom,
          dateTo: options.dateTo,
          keyword: options.keyword,
          limit: Number(options.limit),
        });
        console.log(renderArticleQuery(result, options.format));
      }
    );
}
