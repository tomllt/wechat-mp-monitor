import { WORK_DIR } from './config.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(currentDir, '../../..');
export const dataDir = path.join(projectRoot, 'data');
export const logsDir = path.join(dataDir, 'logs');
export const rawArticlesDir = path.join(dataDir, 'articles', 'raw');
export const normalizedArticlesDir = path.join(dataDir, 'articles', 'normalized');
export const reportsDir = path.join(dataDir, 'reports');
export const qrCodeDir = path.join(dataDir, 'qrcode');
export const databasePath = path.join(dataDir, 'app.db');

export function ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function ensureRuntimeDirs(): void {
  [dataDir, logsDir, rawArticlesDir, normalizedArticlesDir, reportsDir, qrCodeDir].forEach(ensureDir);
}

export function articleRawPath(fakeid: string, aid: string): string {
  const dir = ensureDir(path.join(rawArticlesDir, fakeid));
  return path.join(dir, `${aid}.html`);
}

export function articleNormalizedPath(fakeid: string, aid: string): string {
  const dir = ensureDir(path.join(normalizedArticlesDir, fakeid));
  return path.join(dir, `${aid}.html`);
}

export function reportOutputDir(date: string): string {
  return ensureDir(path.join(reportsDir, date));
}

/**
 * 获取存储根目录（与 article-exporter 兼容）
 */
export function getStorageRoot(): string {
  return WORK_DIR;
}
