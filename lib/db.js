/**
 * Accès base de données. En production : Neon (driver HTTP serverless, sans pool à gérer).
 * En test : un adaptateur PGlite est injecté via setDb().
 * Interface unique : db().query(texte, paramètres) -> lignes.
 */
import { neon } from '@neondatabase/serverless';
import { HttpError } from './http.js';

let override = null;
let client = null;

export function setDb(adapter) { override = adapter; client = null; }

export function db() {
  if (override) return override;
  const url = String(process.env.DATABASE_URL || '').trim();
  if (!url) throw new HttpError(503, 'Base de données non configurée.', 'feature_disabled');
  if (!client) {
    const sql = neon(url);
    client = { query: (text, params = []) => sql.query(text, params) };
  }
  return client;
}
