#!/usr/bin/env node
/**
 * Applique db/schema.sql sur la base DATABASE_URL (Neon).
 *   DATABASE_URL="postgres://…" npm run migrate
 * Le schéma est idempotent (create … if not exists) : relancer la commande est sans risque.
 */
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

export function splitSql(sql) {
  return sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
}

async function main() {
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) { console.error('DATABASE_URL manquant.'); process.exit(1); }
  const sql = neon(url);
  const statements = splitSql(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  for (const s of statements) { await sql.query(s); process.stdout.write('.'); }
  const v = await sql.query('select version, applied_at from schema_migrations order by applied_at');
  console.log(`\n${statements.length} instructions appliquées. Migrations : ${v.map(r => r.version).join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
