import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/lib/storage/db.js';

describe('bootstrap', () => {
  it('creates required database tables', () => {
    const db = openDatabase(':memory:');
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    expect(rows.map(row => row.name)).toContain('auth_session');
    expect(rows.map(row => row.name)).toContain('article');
    expect(rows.map(row => row.name)).toContain('watch_account');
  });
});
