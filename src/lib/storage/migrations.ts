import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}
