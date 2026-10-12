/**
 * « Se connecter avec France Travail » (API France Travail Connect) — PRÊT À BRANCHER, NON ACTIVÉ.
 * Voir docs/FRANCE-TRAVAIL-CONNECT.md.
 *
 * Ce que ça permet (après habilitation de France Travail, accès conditionné, audit ≤ 10 jours) :
 *   - connexion avec les identifiants francetravail.fr (OpenID Connect, Authorization Code Flow) ;
 *   - pré-remplir le dossier « Postuler » (nom, e-mail, coordonnées, compétences, expériences) avec l'accord de l'usager ;
 *   - plus tard, « Déclaration de démarche » : signaler à France Travail une candidature faite sur TalentPulse.
 * Ce que ça NE permet PAS : déposer une candidature sur une offre France Travail à la place du candidat.
 * Aucune API France Travail ne fait ça ; la seule API de candidature transmise est celle de La Bonne Alternance
 * (offres en alternance, habilitation séparée, services à fort volume).
 *
 * Variables : FT_CONNECT_CLIENT_ID, FT_CONNECT_CLIENT_SECRET, FT_CONNECT_REDIRECT_URI, FT_CONNECT_SCOPES (optionnel).
 * Les URL ci-dessous suivent la documentation France Travail ; à revérifier dans l'espace partenaire après habilitation.
 */
import crypto from 'node:crypto';

const AUTH_BASE = 'https://authentification-candidat.francetravail.fr/connexion/oauth2';
const REALM = '/individu';
const DEFAULT_SCOPES = 'openid profile email api_peconnect-individuv1 api_peconnect-coordonneesv1 coordonnees';
const env = k => (process.env[k] || '').trim();

export function ftConnectEnabled() {
  return !!(env('FT_CONNECT_CLIENT_ID') && env('FT_CONNECT_CLIENT_SECRET') && env('FT_CONNECT_REDIRECT_URI'));
}

/** Étape 1 : URL d'autorisation. state (anti-CSRF) et nonce (anti-rejeu) sont à stocker en cookie signé httpOnly. */
export function buildAuthorizeUrl({ state = crypto.randomBytes(16).toString('hex'), nonce = crypto.randomBytes(16).toString('hex') } = {}) {
  if (!ftConnectEnabled()) return null;
  const p = new URLSearchParams({
    realm: REALM, response_type: 'code', client_id: env('FT_CONNECT_CLIENT_ID'), redirect_uri: env('FT_CONNECT_REDIRECT_URI'),
    scope: env('FT_CONNECT_SCOPES') || DEFAULT_SCOPES, state, nonce,
  });
  return { url: `${AUTH_BASE}/authorize?${p}`, state, nonce };
}

/** Étape 2 : échange du code contre les jetons (côté serveur uniquement). */
export async function exchangeCode(code, fetchImpl = fetch) {
  if (!ftConnectEnabled()) throw new Error('France Travail Connect non configuré');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: env('FT_CONNECT_CLIENT_ID'), client_secret: env('FT_CONNECT_CLIENT_SECRET'), redirect_uri: env('FT_CONNECT_REDIRECT_URI') });
  const r = await fetchImpl(`${AUTH_BASE}/access_token?realm=${encodeURIComponent(REALM)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error('FT Connect token ' + r.status);
  return r.json(); // { access_token, id_token, expires_in, ... } — vérifier le nonce de l'id_token avant usage
}

/** Étape 3 : identité de l'usager (prénom, nom, e-mail) pour pré-remplir le dossier de candidature. */
export async function fetchUserinfo(accessToken, fetchImpl = fetch) {
  const r = await fetchImpl('https://api.francetravail.io/partenaire/peconnect-individu/v1/userinfo', { headers: { Authorization: 'Bearer ' + accessToken, Accept: 'application/json' } });
  if (!r.ok) throw new Error('FT Connect userinfo ' + r.status);
  const u = await r.json();
  return { firstName: u.given_name || '', lastName: u.family_name || '', email: u.email || '', ftSub: u.sub || '' };
}
