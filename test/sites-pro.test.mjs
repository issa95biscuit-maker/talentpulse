import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import handler from '../api/sites-pro.js';
import seo from '../api/seo.js';
import { freshDb, call, setEnv, ENV_BASE } from './helpers.mjs';
import { SITES_PRO_TITLE, SITES_PRO_DESCRIPTION } from '../lib/sites-pro.js';
import { startDevServer } from '../scripts/dev-server.mjs';

const valid = {
  name: 'Ada Lovelace',
  email: 'Ada@Exemple.fr',
  activity: 'Boulangerie',
  message: 'Je souhaite un site pour la boutique.',
  plan: 'pro',
  consent: true,
  website: '',
};

describe('sites-pro', { concurrency: 1 }, () => {
  let pg;
  beforeEach(async () => { setEnv(ENV_BASE); pg = await freshDb(); });

  test('page indexable : titre, description, canonical, forfaits, formulaire, un seul h1', async () => {
    const r = await call(seo, { query: { page: 'sites-pro' } });
    const html = r.text;
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'text/html; charset=utf-8');
    assert.match(r.headers['x-robots-tag'], /index/);
    assert.match(r.headers['cache-control'], /s-maxage=/);
    assert.match(html, new RegExp('<title>' + SITES_PRO_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</title>'));
    assert.match(html, new RegExp('name="description" content="' + SITES_PRO_DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    assert.match(html, /rel="canonical" href="https:\/\/talentpulse-topaz\.vercel\.app\/sites-pro"/);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
    assert.match(html, /Votre site pro en ligne en 7/);
    for (const price of ['490', '790', '990']) assert.match(html, new RegExp(price + '\u00a0€'));
    assert.match(html, /id="leadForm"/);
    assert.match(html, /name="name"/);
    assert.match(html, /name="email"/);
    assert.match(html, /name="activity"/);
    assert.match(html, /name="message"/);
    assert.match(html, /name="website"/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /href="\/confidentialite"/);
    assert.match(html, /[Pp]olitique de confidentialité/);
    const visible = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
    assert.ok(!visible.includes('@'), 'aucune adresse e-mail');
    assert.ok(!/mailto:|tel:|\[À COMPLÉTER\]|\+33/.test(visible));
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(inline.length, 1);
    const hash = createHash('sha256').update(inline[0][1]).digest('base64');
    const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    const csp = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
    assert.ok(csp.includes(`'sha256-${hash}'`), hash);
    assert.match(html, /Aucun e-mail n’est envoyé automatiquement/);
  });

  test('variante de confirmation non indexée, paramètre inconnu ignoré', async () => {
    const ok = await call(seo, { query: { page: 'sites-pro', envoye: '1' } });
    assert.match(ok.headers['x-robots-tag'], /noindex/);
    assert.match(ok.headers['cache-control'], /no-store/);
    assert.match(ok.text, /Votre demande est enregistrée/);
    assert.match(ok.text, /rel="canonical" href="https:\/\/talentpulse-topaz\.vercel\.app\/sites-pro"/);
    const bad = await call(seo, { query: { page: 'sites-pro', erreur: '<script>alert(1)</script>' } });
    assert.ok(!bad.text.includes('<script>alert(1)</script>'));
    assert.ok(!bad.text.includes('&lt;script&gt;alert'));
    assert.match(bad.text, /id="leadStatus"[^>]*hidden/);
  });

  test('sitemap et réécriture', async () => {
    const r = await call(seo, { query: { sitemap: 'pages' } });
    const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    assert.equal(locs.filter(u => u.endsWith('/sites-pro')).length, 1);
    const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    const rw = vercel.rewrites.find(x => x.source === '/sites-pro');
    assert.equal(rw.destination, '/api/seo?page=sites-pro');
  });

  test('encart en bas de l’accueil et dans le pied de page, pas dans les résultats', async () => {
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    const sentence = 'Créé par Ryadh Issa Klaa — besoin d’un site pro pour votre commerce';
    const home = html.slice(html.indexOf('id="page-home"'), html.indexOf('id="page-jobs"'));
    const jobs = html.slice(html.indexOf('id="page-jobs"'), html.indexOf('id="page-lettre"'));
    const footer = html.slice(html.indexOf('<footer'));
    assert.match(home, /id="makerNote"/);
    assert.ok(home.includes(sentence));
    assert.match(home, /href="\/sites-pro"/);
    assert.ok(!jobs.includes('sites-pro'), 'pas d’encart dans les résultats');
    assert.ok(!jobs.includes('Ryadh Issa Klaa'));
    assert.match(footer, /class="footer-credit"/);
    assert.ok(footer.includes(sentence));
    assert.match(footer, /href="\/sites-pro"/);
  });

  test('enregistrement : e-mail normalisé, formule, pas d’écho du message', async () => {
    const r = await call(handler, { method: 'POST', body: { ...valid, name: `Robert'); drop table site_leads;--` } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.ok, true);
    assert.equal(r.body.email, undefined);
    const rows = await pg.query('select name, email, activity, message, plan from site_leads');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'ada@exemple.fr');
    assert.equal(rows[0].plan, 'pro');
    assert.match(rows[0].name, /drop table/);
    const still = await pg.query(`select count(*)::int n from information_schema.tables where table_name = 'site_leads'`);
    assert.equal(still[0].n, 1);
  });

  test('validation : champs, consentement, formule, aucune ligne', async () => {
    assert.equal((await call(handler, { method: 'POST', body: { ...valid, email: 'pas-un-email' } })).status, 400);
    const short = await call(handler, { method: 'POST', body: { ...valid, message: 'court' } });
    assert.equal(short.status, 400);
    assert.match(short.body.error.message, /10 caractères/);
    assert.equal((await call(handler, { method: 'POST', body: { ...valid, consent: false } })).status, 400);
    assert.equal((await call(handler, { method: 'POST', body: { ...valid, plan: 'ultra' } })).status, 400);
    assert.equal((await call(handler, { method: 'POST', body: { ...valid, name: 'A' } })).status, 400);
    assert.equal((await pg.query('select count(*)::int n from site_leads'))[0].n, 0);
  });

  test('champ piège : succès affiché, rien n’est enregistré', async () => {
    const r = await call(handler, { method: 'POST', body: { ...valid, website: 'https://spam.example' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal((await pg.query('select count(*)::int n from site_leads'))[0].n, 0);
  });

  test('limite de débit par adresse puis par IP', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await call(handler, { method: 'POST', body: { ...valid, message: 'Message numéro ' + i + ' pour le site.' } });
      assert.equal(r.status, 200, i + ' ' + JSON.stringify(r.body));
    }
    const mail = await call(handler, { method: 'POST', body: { ...valid, message: 'Encore une demande pour le même mail.' } });
    assert.equal(mail.status, 429);
    assert.ok(mail.headers['retry-after']);
    assert.match(mail.body.error.message, /adresse/);
    for (let i = 0; i < 4; i++) {
      const r = await call(handler, { method: 'POST', body: { ...valid, email: `autre${i}@exemple.fr`, message: 'Demande distincte numéro ' + i + '.' } });
      assert.equal(r.status, 200, 'ip ' + i);
    }
    const ip = await call(handler, { method: 'POST', body: { ...valid, email: 'dernier@exemple.fr', message: 'Cette demande dépasse la limite.' } });
    assert.equal(ip.status, 429);
    assert.match(ip.body.error.message, /quelques minutes/);
  });

  test('formulaire HTML, origine, méthode, base absente', async () => {
    const posted = await call(handler, {
      method: 'POST',
      body: 'name=Camille+Martin&email=camille@exemple.fr&activity=Coiffure&message=Bonjour%2C+je+veux+un+site.&plan=essentiel&consent=true',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(posted.status, 303);
    assert.equal(posted.headers.location, '/sites-pro?envoye=1');
    assert.equal((await pg.query('select plan from site_leads'))[0].plan, 'essentiel');
    const trap = await call(handler, {
      method: 'POST',
      body: 'name=Bot&email=bot@exemple.fr&activity=Spam&message=Achetez+vite+ceci+maintenant&consent=true&website=http%3A%2F%2Fspam',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(trap.status, 303);
    assert.equal(trap.headers.location, '/sites-pro?envoye=1');
    assert.equal((await pg.query('select count(*)::int n from site_leads'))[0].n, 1);
    const bad = await call(handler, {
      method: 'POST',
      body: 'name=&email=x&activity=&message=&consent=',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assert.equal(bad.status, 303);
    assert.equal(bad.headers.location, '/sites-pro?erreur=validation');
    assert.equal((await call(handler, { method: 'POST', body: valid, headers: { origin: 'https://evil.example' } })).status, 403);
    assert.equal((await call(handler, { method: 'GET' })).status, 405);
    assert.equal((await call(handler, { method: 'POST', body: 'x', headers: { 'content-type': 'text/plain' } })).status, 415);
    setEnv({});
    const down = await call(handler, { method: 'POST', body: { ...valid, email: 'sans-base@exemple.fr' } });
    assert.equal(down.status, 503);
    assert.match(down.body.error.message, /indisponible/);
  });

  test('serveur de dev : la page et le formulaire répondent', async () => {
    const server = await startDevServer({ port: 0, demo: true, quiet: true });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const page = await fetch(base + '/sites-pro');
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /<title>Votre site pro en ligne en 7 jours — TalentPulse<\/title>/);
      assert.match(html, /Essentiel/);
      const post = await fetch(base + '/api/sites-pro', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify(valid),
      });
      assert.equal(post.status, 200);
      assert.equal((await post.json()).ok, true);
      const home = await fetch(base + '/');
      const homeHtml = await home.text();
      assert.match(homeHtml, /id="makerNote"/);
      assert.match(homeHtml, /href="\/sites-pro"/);
    } finally {
      server.close();
    }
  });
});
