import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeHtml } from '../src/lib/html/normalize.js';

const fixturePath = path.resolve('tests/fixtures/article.html');

describe('normalizeHtml', () => {
  it('extracts plain text content', () => {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const text = normalizeHtml(html, 'text');
    expect(text).toContain('广州黄埔发布今天发布了产业政策。');
    expect(text).not.toContain('window.x = 1');
  });

  it('returns a complete normalized html document', () => {
    const html = fs.readFileSync(fixturePath, 'utf8');
    const result = normalizeHtml(html, 'html');
    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('id="js_article"');
    expect(result).not.toContain('window.x = 1');
  });
});
