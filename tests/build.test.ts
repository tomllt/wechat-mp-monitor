import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('build output', () => {
  it('copies storage schema into dist', () => {
    execFileSync('npm', ['run', 'build'], {
      cwd: path.resolve('.'),
      stdio: 'pipe',
    });

    const sourcePath = path.resolve('src/lib/storage/schema.sql');
    const distPath = path.resolve('dist/src/lib/storage/schema.sql');

    expect(fs.existsSync(distPath)).toBe(true);
    expect(fs.readFileSync(distPath, 'utf8')).toBe(fs.readFileSync(sourcePath, 'utf8'));
  });
});
