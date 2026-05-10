import crypto from 'node:crypto';

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomId(length = 12): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

export function createLocalAuthKey(): string {
  return `auth_${randomId(24)}`;
}

export function parseDateStart(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

export function parseDateEnd(date: string): string {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

export function unixSecondsToIso(value: number): string {
  return new Date(value * 1000).toISOString();
}

export function isoDate(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
