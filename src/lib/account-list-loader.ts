import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WeChatAccount {
  rank: number | null;
  unitName: string;
  type: string;
  officialAccount: string | null;
  serviceAccount: string | null;
  miniProgram: string | null;
}

/**
 * 从 Excel 加载公众号清单
 * 注意：需要先将 Excel 转换为 JSON 格式，或者使用 xlsx 库
 * 当前实现：先读取 data/微信公众号清单.json（由 Excel 转换而来）
 */
export async function loadAccountList(excelPath?: string): Promise<WeChatAccount[]> {
  // 默认路径：data/微信公众号清单.json
  const dataPath = excelPath || path.join(__dirname, '../../data/微信公众号清单.json');
  
  if (!fs.existsSync(dataPath)) {
    throw new Error(`公众号清单不存在: ${dataPath}，请先将 Excel 转换为 JSON 格式`);
  }
  
  const content = fs.readFileSync(dataPath, 'utf-8');
  const accounts = JSON.parse(content) as WeChatAccount[];
  
  console.log(`✅ 已加载 ${accounts.length} 个公众号清单`);
  return accounts;
}

/**
 * 筛选有公众号名称的账号
 */
export function filterAccountsWithOfficialName(accounts: WeChatAccount[]): WeChatAccount[] {
  return accounts.filter(acc => acc.officialAccount && acc.officialAccount.trim() !== '' && acc.officialAccount !== 'None');
}

/**
 * 按类型筛选
 */
export function filterAccountsByType(accounts: WeChatAccount[], types: string[]): WeChatAccount[] {
  return accounts.filter(acc => types.includes(acc.type));
}

/**
 * 按排名筛选
 */
export function filterAccountsByRank(accounts: WeChatAccount[], minRank: number, maxRank: number): WeChatAccount[] {
  return accounts.filter(acc => {
    if (acc.rank === null) return false;
    return acc.rank >= minRank && acc.rank <= maxRank;
  });
}
