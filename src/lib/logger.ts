import fs from 'node:fs';
import path from 'node:path';
import { logsDir } from './paths.js';

function line(level: string, message: string): string {
  return `${new Date().toISOString()} [${level}] ${message}`;
}

export function logInfo(message: string): void {
  log('INFO', message);
}

export function logWarn(message: string): void {
  log('WARN', message);
}

export function logError(message: string): void {
  log('ERROR', message);
}

function log(level: string, message: string): void {
  const output = line(level, message);
  console.error(output);
  fs.mkdirSync(logsDir, { recursive: true });
  const filename = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(filename, `${output}\n`);
}
