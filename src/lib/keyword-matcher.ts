import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface KeywordRule {
  andKeywords: string[];  // 同一行的关键词，AND 关系
}

export interface KeywordMatchResult {
  matched: boolean;
  matchedRules: KeywordRule[];
  matchedKeywords: string[];
  score: number;  // 匹配的关键词数量
}

/**
 * 加载关键词文件
 * 格式: 每一行一组关键词，空格分隔表示 AND，不同行表示 OR
 * 
 * 示例:
 *   人工智能 大模型
 *   数字经济 产业
 * 
 * 逻辑: (人工智能 AND 大模型) OR (数字经济 AND 产业)
 */
export function loadKeywords(keywordPath?: string): KeywordRule[] {
  const defaultPath = path.join(__dirname, '../../data/关键词.txt');
  const filePath = keywordPath || defaultPath;
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  关键词文件不存在: ${filePath}`);
    console.log('   创建空的关键词文件...');
    fs.writeFileSync(filePath, '# 每行一组关键词，空格分隔表示 AND，不同行表示 OR\n', 'utf-8');
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  const rules: KeywordRule[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 跳过空行和注释行
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // 按空格分割关键词
    const keywords = trimmed.split(/\s+/).filter(k => k.length > 0);
    
    if (keywords.length > 0) {
      rules.push({ andKeywords: keywords });
    }
  }
  
  console.log(`✅ 已加载 ${rules.length} 组关键词规则`);
  return rules;
}

/**
 * 检查文本是否匹配关键词规则
 * @param text 要检查的文本（标题 + 摘要 + 正文）
 * @param rules 关键词规则
 */
export function matchKeywords(text: string, rules: KeywordRule[]): KeywordMatchResult {
  const lowerText = text.toLowerCase();
  const matchedRules: KeywordRule[] = [];
  const allMatchedKeywords: Set<string> = new Set();
  
  for (const rule of rules) {
    // 检查 AND 逻辑：所有关键词都必须匹配
    let allMatched = true;
    const ruleMatchedKeywords: string[] = [];
    
    for (const keyword of rule.andKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        ruleMatchedKeywords.push(keyword);
      } else {
        allMatched = false;
        break;
      }
    }
    
    if (allMatched && ruleMatchedKeywords.length > 0) {
      matchedRules.push(rule);
      ruleMatchedKeywords.forEach(k => allMatchedKeywords.add(k));
    }
  }
  
  return {
    matched: matchedRules.length > 0,
    matchedRules,
    matchedKeywords: Array.from(allMatchedKeywords),
    score: allMatchedKeywords.size
  };
}

/**
 * 从文章数据构建待匹配文本
 */
export function buildArticleText(article: {
  title: string;
  digest?: string | null;
  authorName?: string | null;
  plainText?: string | null;
}): string {
  const parts: string[] = [];
  if (article.title) parts.push(article.title);
  if (article.digest) parts.push(article.digest);
  if (article.authorName) parts.push(article.authorName);
  if (article.plainText) parts.push(article.plainText);
  return parts.join(' ');
}
