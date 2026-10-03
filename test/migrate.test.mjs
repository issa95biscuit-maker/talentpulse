import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { splitSql } from '../scripts/migrate.mjs';

test('migration : chaque instruction passe seule (driver HTTP Neon) et le schéma est rejouable', async () => {
  const pg = new PGlite();
  const stmts = splitSql(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  assert.ok(stmts.length >= 15);
  for (let run = 0; run < 2; run++) for (const s of stmts) await pg.query(s);
  const t = (await pg.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`)).rows.map(r => r.table_name);
  assert.deepEqual(t, ['alert_deliveries', 'alerts', 'favorites', 'pipeline_items', 'rate_limits', 'schema_migrations', 'sessions', 'users']);
});
