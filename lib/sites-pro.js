/**
 * Page /sites-pro — offre « site vitrine en 7 jours ».
 * Document autonome (hors shell de l’accueil) pour rester léger.
 * Aucune coordonnée inventée : le seul contact est le formulaire.
 */
import { cacheHeaders } from './http.js';

export const SITES_PRO_PATH = '/sites-pro';
export const SITES_PRO_TITLE = 'Votre site pro en ligne en 7 jours — TalentPulse';
export const SITES_PRO_DESCRIPTION = 'Site vitrine pour votre commerce, mis en ligne en 7 jours. Essentiel 490 €, Pro 790 €, Premium 990 €. TalentPulse sert de démonstration.';
const SITE = 'https://talentpulse-topaz.vercel.app';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fr = s => String(s).replace(/ ([:;?!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0').replace(/(\d) (?=(?:€|jours|pages)\b)/g, '$1\u00a0');
const tx = s => esc(fr(s));

const OK_MSG = 'Votre demande est enregistrée. Vous serez recontacté à l’adresse indiquée. Aucun e-mail automatique n’a été envoyé.';
const ERRORS = {
  validation: 'Certains champs sont invalides ou incomplets. Vérifiez le formulaire, puis renvoyez-le.',
  limite: 'Trop de demandes ont été envoyées. Réessayez dans quelques minutes.',
  indisponible: 'Le formulaire est momentanément indisponible. Réessayez plus tard.',
};

const PLANS = [
  {
    id: 'essentiel',
    name: 'Essentiel',
    price: 490,
    kicker: 'Une page',
    items: [
      'Une page : activité, horaires, accès et contact',
      'Lisible sur téléphone, tablette et ordinateur',
      'Mise en ligne en 7 jours',
      'Un aller-retour de corrections',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 790,
    kicker: 'Recommandé',
    recommended: true,
    items: [
      'Jusqu’à 5 pages, dont les mentions légales',
      'Formulaire de contact',
      'Titre et description pour chaque page',
      'Mise en ligne en 7 jours',
      'Deux aller-retours de corrections',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 990,
    kicker: 'Textes inclus',
    items: [
      'Jusqu’à 8 pages',
      'Formulaire de contact',
      'Textes rédigés à partir de vos informations',
      'Titre, description et plan du site',
      'Mise en ligne en 7 jours',
      'Trois aller-retours de corrections et une prise en main',
    ],
  },
];

function plansHtml() {
  return PLANS.map(p => `<article class="plan${p.recommended ? ' plan-reco' : ''}" aria-labelledby="plan-${p.id}">
    <p class="kicker">${tx(p.kicker)}</p>
    <h3 id="plan-${p.id}">${tx(p.name)}</h3>
    <p class="price">${p.price}\u00a0€</p>
    <p class="price-note">Forfait, sans abonnement</p>
    <ul>${p.items.map(item => `<li>${tx(item)}</li>`).join('')}</ul>
    <a class="btn ${p.recommended ? 'btn-primary' : 'btn-outline'} btn-block" href="#contact" data-plan="${p.id}">Choisir ${tx(p.name)}</a>
  </article>`).join('');
}

function noticeHtml(sent, errKey) {
  if (sent) return `<p class="notice notice-ok" id="leadStatus" role="status" tabindex="-1">${tx(OK_MSG)}</p>`;
  if (ERRORS[errKey]) return `<p class="notice notice-err" id="leadStatus" role="alert" tabindex="-1">${tx(ERRORS[errKey])}</p>`;
  return '<p class="notice" id="leadStatus" role="status" tabindex="-1" hidden></p>';
}

const DARK_BOOT = `try{var t=localStorage.getItem('tp_dark');if(t==='1'||(t===null&&matchMedia('(prefers-color-scheme: dark)').matches))document.body.classList.add('dark')}catch(e){}`;

export function renderSitesPro({ envoye, erreur } = {}) {
  const sent = String(envoye || '') === '1';
  const errKey = sent ? '' : (ERRORS[String(erreur || '')] ? String(erreur) : '');
  const privateView = sent || !!errKey;
  const robots = privateView ? 'noindex,follow' : 'index,follow';
  const canonical = SITE + SITES_PRO_PATH;
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'TalentPulse', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Site pro', item: canonical },
    ],
  }).replace(/</g, '\\u003c');

  const body = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(SITES_PRO_TITLE)}</title>
<meta name="description" content="${esc(SITES_PRO_DESCRIPTION)}">
<meta name="robots" content="${robots}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#07090F" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="TalentPulse">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(SITES_PRO_TITLE)}">
<meta property="og:description" content="${esc(SITES_PRO_DESCRIPTION)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(SITES_PRO_TITLE)}">
<meta name="twitter:description" content="${esc(SITES_PRO_DESCRIPTION)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/inter-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<script type="application/ld+json">${ld}</script>
<style>
@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/inter-latin-var.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
:root{color-scheme:light;--font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--bg:#F6F7F9;--surface:#fff;--surface-2:#F1F4F8;--border:#E3E8EF;--border-strong:#CBD3DE;--text:#0F172A;--text-2:#334155;--text-3:#5B6476;--brand:#FF6A00;--brand-btn:#C2410C;--brand-btn-hover:#9A3412;--brand-ink:#B93D0A;--brand-50:#FFF4EC;--ok:#047857;--ok-bg:#ECFDF5;--danger:#B91C1C;--danger-bg:#FEF2F2;--focus:#C2410C;--sh:0 1px 2px rgba(15,23,42,.06)}
body.dark{color-scheme:dark;--bg:#07090F;--surface:#0D121C;--surface-2:#141B28;--border:#1E2736;--border-strong:#2B3648;--text:#F1F5F9;--text-2:#CBD5E1;--text-3:#9AA8BD;--brand-ink:#FF9A57;--brand-50:#2A1606;--ok:#6EE7B7;--ok-bg:#064E3B;--danger:#FCA5A5;--danger-bg:#450A0A;--focus:#FF9A57;--sh:0 1px 2px rgba(0,0,0,.4)}
*,*::before,*::after{box-sizing:border-box}
html{scroll-padding-top:80px;overflow-x:clip}
body{margin:0;font-family:var(--font);font-size:1rem;line-height:1.6;color:var(--text);background:var(--bg);overflow-x:clip;overflow-wrap:break-word}
img,svg{display:block;max-width:100%}
a{color:var(--brand-ink);text-underline-offset:3px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.skip{position:absolute;left:16px;top:-48px;z-index:10;background:var(--brand-btn);color:#fff;padding:10px 16px;border-radius:8px;font-weight:600;text-decoration:none}
.skip:focus{top:12px}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 16px}
@media(max-width:360px){.wrap{padding:0 12px}}
.site-header{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--border)}
.nav{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 12px;min-height:64px;padding:8px 16px;max-width:1120px;margin:0 auto}
@media(max-width:360px){.nav{padding:8px 12px}}
.logo{display:inline-flex;align-items:center;gap:10px;min-height:48px;color:var(--text);font-weight:800;font-size:1.125rem;letter-spacing:-.02em;text-decoration:none}
.logo b{color:var(--brand-ink);font-weight:inherit}
.logo-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--brand);color:#fff}
.logo-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.nav-link{display:inline-flex;align-items:center;justify-content:center;min-height:48px;min-width:48px;padding:0 12px;border-radius:8px;color:var(--text-2);font-weight:600;font-size:.875rem;text-decoration:none}
.nav-link:hover{background:var(--surface-2);color:var(--text);text-decoration:none}
.hero{padding:32px 0 8px}
.crumbs{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 16px;color:var(--text-3);font-size:.875rem}
.crumbs a{display:inline-flex;align-items:center;min-height:48px;color:var(--text-2);text-decoration:underline}
.eyebrow{margin:0 0 8px;color:var(--brand-ink);font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
h1{margin:0 0 12px;font-size:clamp(1.75rem,1.2rem + 2.2vw,2.5rem);line-height:1.15;letter-spacing:-.025em}
h2{margin:0 0 12px;font-size:clamp(1.35rem,1.1rem + 1vw,1.75rem);line-height:1.25;letter-spacing:-.02em}
h3{margin:0;font-size:1.25rem;line-height:1.3}
.lead,.prose{max-width:42rem;margin:0 0 12px;color:var(--text-2)}
.block{padding:36px 0}
@media(min-width:1024px){.block{padding:56px 0}}
.plans{display:grid;gap:16px}
@media(min-width:1024px){.plans{grid-template-columns:repeat(3,minmax(0,1fr));align-items:stretch}}
.plan{display:flex;flex-direction:column;min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh);padding:20px 18px 18px}
.plan-reco{border-color:var(--brand-btn);box-shadow:0 0 0 1px var(--brand-btn)}
.kicker{display:inline-flex;align-items:center;align-self:flex-start;min-height:26px;margin:0 0 12px;padding:0 10px;border-radius:999px;background:var(--surface-2);color:var(--text-2);font-size:.75rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.plan-reco .kicker{background:var(--brand-50);color:var(--brand-ink)}
.price{margin:8px 0 0;font-size:2rem;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.1}
.price-note{margin:6px 0 0;font-size:.875rem;font-weight:600;color:var(--text-2);letter-spacing:0}
.plan ul{margin:16px 0 20px;padding:0 0 0 1.15rem;color:var(--text-2);display:grid;gap:8px}
.plan li{padding-left:2px}
.plan li::marker{color:var(--brand-ink)}
.plan .btn{margin-top:auto}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 18px;border-radius:8px;border:1px solid transparent;background:transparent;color:inherit;font:inherit;font-size:.9375rem;font-weight:600;line-height:1.2;text-align:center;text-decoration:none;cursor:pointer;white-space:normal}
.btn:hover{text-decoration:none}
.btn:active:not(:disabled){transform:translateY(1px)}
.btn:disabled,.btn[aria-disabled="true"]{opacity:.55;cursor:not-allowed;transform:none}
.btn-primary{background:var(--brand-btn);color:#fff}
.btn-primary:hover:not(:disabled){background:var(--brand-btn-hover);color:#fff}
.btn-outline{background:var(--surface);color:var(--text);border-color:var(--border-strong)}
.btn-outline:hover{background:var(--surface-2);border-color:var(--text-3);color:var(--text)}
.btn-block{width:100%}
.demo{display:grid;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px 18px}
@media(min-width:768px){.demo{grid-template-columns:minmax(0,1fr) auto;align-items:center;padding:24px}}
.steps{display:grid;gap:12px;list-style:none;margin:0;padding:0}
@media(min-width:1024px){.steps{grid-template-columns:repeat(3,minmax(0,1fr))}}
.steps li{min-width:0;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px 18px}
.step-n{display:inline-grid;place-items:center;width:28px;height:28px;margin-right:8px;border-radius:999px;background:var(--brand-50);color:var(--brand-ink);font-size:.875rem;vertical-align:-4px}
.steps p{margin:6px 0 0;color:var(--text-2)}
.form-card{max-width:40rem;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--sh);padding:20px 18px 8px}
@media(min-width:768px){.form-card{padding:28px 28px 12px}}
.form-row{display:grid;gap:16px}
@media(min-width:700px){.form-row.two{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.field{margin:0 0 16px;min-width:0}
label{display:block;margin:0 0 6px;font-size:.875rem;font-weight:600;color:var(--text)}
input,select,textarea{width:100%;min-height:48px;padding:12px 14px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:1rem}
textarea{min-height:128px;resize:vertical;line-height:1.5}
input::placeholder,textarea::placeholder{color:var(--text-3);opacity:1}
input:hover,select:hover,textarea:hover{border-color:var(--text-3)}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-color:var(--brand-btn)}
input[aria-invalid="true"],select[aria-invalid="true"],textarea[aria-invalid="true"]{border-color:var(--danger)}
select{padding-right:40px;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235B6476' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
body.dark select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23CBD5E1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")}
.hint{margin:6px 0 0;font-size:.75rem;color:var(--text-3)}
.hint:empty{display:none}
.hint.err{display:block;color:var(--danger)}
.check{display:flex;align-items:flex-start;gap:10px;min-height:48px;margin:0;font-size:.875rem;font-weight:500;color:var(--text-2);line-height:1.45}
.check input{width:24px;height:24px;min-height:24px;margin-top:1px;padding:0;accent-color:var(--brand-btn);flex:none}
.gdpr{margin:8px 0 16px;color:var(--text-2);font-size:.875rem}
.gdpr a,.prose a{display:inline-flex;align-items:center;min-height:48px;font-weight:600}
.notice{margin:0 0 16px;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--text)}
.notice-ok{background:var(--ok-bg);border-color:transparent;box-shadow:inset 3px 0 0 var(--ok)}
.notice-err{background:var(--danger-bg);border-color:transparent;box-shadow:inset 3px 0 0 var(--danger)}
.hp{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.fine{margin:16px 0 0;color:var(--text-2);font-size:.875rem;max-width:46rem}
.site-footer{background:#05070D;color:#CBD5E1;margin-top:24px}
.foot{max-width:1120px;margin:0 auto;padding:28px 16px 20px}
@media(max-width:360px){.foot{padding:28px 12px 16px}}
.footer-credit{margin:0}
.footer-credit a{display:inline-block;max-width:100%;min-height:48px;padding:12px 0;color:#E2E8F0;font-weight:600;font-size:.875rem;line-height:1.5;text-decoration:underline;text-underline-offset:3px}
.footer-credit a:hover{color:#fff}
.foot-links{display:flex;flex-wrap:wrap;gap:0 8px;margin-top:8px}
.foot-links a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;min-width:48px;padding:8px 10px;color:#E2E8F0;font-size:.875rem;text-decoration:underline;text-underline-offset:3px}
.foot-links a:hover{color:#fff}
.foot-copy{margin:8px 0 0;color:#A3B1C6;font-size:.75rem}
.site-footer :focus-visible{outline-color:#FF9A57}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{scroll-behavior:auto!important;transition:none!important}
  .btn:active{transform:none}
}
</style>
</head>
<body>
<script>${DARK_BOOT}</script>
<a class="skip" href="#main">Aller au contenu</a>
<header class="site-header">
  <nav class="nav" aria-label="Navigation principale">
    <a class="logo" href="/" aria-label="TalentPulse, accueil"><span class="logo-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z"/></svg></span><span>Talent<b>Pulse</b></span></a>
    <a class="nav-link" href="/offres/emploi">Offres d’emploi</a>
  </nav>
</header>
<main id="main">
  <div class="wrap hero">
    <nav class="crumbs" aria-label="Fil d’Ariane"><a href="/">TalentPulse</a><span aria-hidden="true">/</span><span aria-current="page">Site pro</span></nav>
    <p class="eyebrow">Pour votre commerce</p>
    <h1>Votre site pro en ligne en 7&nbsp;jours</h1>
    <p class="lead">Un site vitrine clair pour présenter votre activité, vos horaires et comment vous joindre. TalentPulse, le site d’offres d’emploi que vous consultez, a été conçu et mis en ligne par Ryadh Issa Klaa&nbsp;: il sert de démonstration.</p>
    <p class="prose">La recherche d’emploi reste sur TalentPulse. Cette page s’adresse aux commerçants, artisans et professions libérales.</p>
    <p class="prose"><a href="/offres/emploi">Rechercher une offre d’emploi</a></p>
  </div>
  <section class="block" id="formules" aria-labelledby="plansTitle">
    <div class="wrap">
      <h2 id="plansTitle">Trois forfaits, sans abonnement</h2>
      <p class="prose">Le délai de 7&nbsp;jours commence à la réception de vos textes et de vos photos. Le nom de domaine et l’hébergement restent à votre charge, ou se précisent avant de commencer.</p>
      <div class="plans">${plansHtml()}</div>
      <p class="fine">TVA non applicable, article 293&nbsp;B du CGI. Cette offre couvre un site vitrine. Une boutique en ligne ou une application mobile ne sont pas incluses.</p>
    </div>
  </section>
  <section class="block" aria-labelledby="demoTitle" style="padding-top:0">
    <div class="wrap">
      <div class="demo">
        <div>
          <h2 id="demoTitle">La démonstration&nbsp;: TalentPulse</h2>
          <p class="prose">TalentPulse n’est pas une maquette. C’est un site réel&nbsp;: pages, recherche, formulaire et mise en ligne. Le même soin est appliqué à un site de commerce, dans un format plus simple.</p>
        </div>
        <p style="margin:0"><a class="btn btn-outline" href="/">Voir TalentPulse</a></p>
      </div>
    </div>
  </section>
  <section class="block" aria-labelledby="stepsTitle" style="padding-top:0">
    <div class="wrap">
      <h2 id="stepsTitle">Comment ça se passe</h2>
      <ol class="steps">
        <li><h3><span class="step-n" aria-hidden="true">1</span> Vous décrivez</h3><p>Votre activité, la formule choisie et ce que le site doit montrer.</p></li>
        <li><h3><span class="step-n" aria-hidden="true">2</span> Le site est préparé</h3><p>À partir de vos textes et de vos photos, sans promesse au-delà du forfait.</p></li>
        <li><h3><span class="step-n" aria-hidden="true">3</span> Il est mis en ligne</h3><p>Dans les 7&nbsp;jours qui suivent la réception de ces éléments.</p></li>
      </ol>
    </div>
  </section>
  <section class="block" id="contact" aria-labelledby="contactTitle" style="padding-top:0">
    <div class="wrap">
      <h2 id="contactTitle">Être recontacté</h2>
      <p class="prose">Décrivez votre besoin. La demande est enregistrée pour être traitée&nbsp;: aucun e-mail n’est envoyé automatiquement.</p>
      <div class="form-card">
        ${noticeHtml(sent, errKey)}
        <form id="leadForm" action="/api/sites-pro" method="post" accept-charset="UTF-8">
          <div class="hp" aria-hidden="true">
            <label for="leadHp">Ne pas remplir</label>
            <input id="leadHp" name="website" type="text" tabindex="-1" autocomplete="off" value="">
          </div>
          <div class="form-row two">
            <div class="field">
              <label for="leadName">Nom</label>
              <input id="leadName" name="name" type="text" autocomplete="name" required minlength="2" maxlength="80" aria-describedby="err-name">
              <p class="hint" id="err-name"></p>
            </div>
            <div class="field">
              <label for="leadEmail">Adresse e-mail</label>
              <input id="leadEmail" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254" aria-describedby="err-email">
              <p class="hint" id="err-email"></p>
            </div>
          </div>
          <div class="field">
            <label for="leadActivity">Activité</label>
            <input id="leadActivity" name="activity" type="text" required minlength="2" maxlength="120" placeholder="Boulangerie, coiffure, cabinet…" aria-describedby="err-activity">
            <p class="hint" id="err-activity"></p>
          </div>
          <div class="field">
            <label for="leadPlan">Formule souhaitée</label>
            <select id="leadPlan" name="plan" aria-describedby="err-plan">
              <option value="">Je ne sais pas encore</option>
              <option value="essentiel">Essentiel — 490&nbsp;€</option>
              <option value="pro">Pro — 790&nbsp;€</option>
              <option value="premium">Premium — 990&nbsp;€</option>
            </select>
            <p class="hint" id="err-plan"></p>
          </div>
          <div class="field">
            <label for="leadMessage">Message</label>
            <textarea id="leadMessage" name="message" required minlength="10" maxlength="2000" aria-describedby="err-message"></textarea>
            <p class="hint" id="err-message"></p>
          </div>
          <div class="field">
            <label class="check" for="leadConsent"><input id="leadConsent" name="consent" type="checkbox" value="true" required aria-describedby="err-consent"> <span>J’accepte que ces informations soient enregistrées pour être recontacté.</span></label>
            <p class="hint" id="err-consent"></p>
          </div>
          <p class="gdpr">Nom, adresse e-mail, activité et message sont enregistrés uniquement pour vous recontacter au sujet de cette demande. Aucun e-mail n’est envoyé automatiquement.</p>
          <p class="gdpr"><a href="/confidentialite">Politique de confidentialité</a></p>
          <button class="btn btn-primary btn-block" id="leadSubmit" type="submit">Envoyer ma demande</button>
        </form>
      </div>
    </div>
  </section>
</main>
<footer class="site-footer">
  <div class="foot">
    <p class="footer-credit"><a href="#formules">Créé par Ryadh Issa Klaa — besoin d’un site pro pour votre commerce&nbsp;?</a></p>
    <nav class="foot-links" aria-label="Informations">
      <a href="/mentions-legales">Mentions légales</a>
      <a href="/confidentialite">Confidentialité</a>
      <a href="/cgu">CGU</a>
    </nav>
    <p class="foot-copy">© 2026 TalentPulse</p>
  </div>
</footer>
<script src="/assets/sites-pro.js?v=1" defer></script>
</body>
</html>`;

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': robots.replace(/,\s*/g, ', '),
      ...cacheHeaders(privateView ? 'no-store' : 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'),
    },
    body,
  };
}
