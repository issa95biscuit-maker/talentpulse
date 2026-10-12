# Mise en service du backend TalentPulse

État vérifiable à tout moment : `GET /api/health` (liste des fonctionnalités actives, jamais de secret).

## Déjà configuré sur Vercel (Production + Preview)
- `FT_CLIENT_ID`, `FT_CLIENT_SECRET`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` : sources d'offres.
- `AUTH_SECRET`, `CRON_SECRET` : générés aléatoirement (64 caractères hex), valeurs distinctes Production / Preview.
- `APP_URL` (Production) : `https://talentpulse-topaz.vercel.app`.

## À faire par le propriétaire du compte (une seule fois)
1. **Base de données Neon (gratuit)** : accepter les conditions sur
   https://vercel.com/talentpulse/~/integrations/accept-terms/neon?source=cli
   puis créer la base (plan Free, région Europe – Frankfurt) et la connecter au projet `talentpulse`
   (Production + Preview + Development). Neon ajoute `DATABASE_URL` tout seul.
2. **Créer les tables** (depuis un ordinateur avec le repo) :
   `vercel env pull .env.local && set -a && . ./.env.local && npm run migrate`
3. **E-mails Resend (gratuit, 3 000/mois)** : accepter les conditions sur
   https://vercel.com/talentpulse/~/integrations/accept-terms/resend?source=cli
   puis connecter au projet (ajoute `RESEND_API_KEY`). Vérifier un domaine dans Resend
   (ex. talentpulse.fr, enregistrements DNS chez OVH), puis ajouter
   `ALERTS_FROM_EMAIL="TalentPulse <alertes@talentpulse.fr>"` (et éventuellement `AUTH_FROM_EMAIL`).
   Sans domaine vérifié, Resend n'envoie qu'à l'adresse du titulaire du compte Resend.
4. **Lettre IA (payant à l'usage)** : `AI_LETTER_ENABLED=1` (Production) après avoir fixé un plafond
   de dépense dans Vercel > AI Gateway.
5. **Mentions légales** : `LEGAL_EDITOR`, `LEGAL_STATUS`, `LEGAL_DIRECTOR`, `CONTACT_EMAIL`
   (+ `LEGAL_ADDRESS`, `LEGAL_SIREN` si entreprise), voir `.env.example`.
6. **Redéployer** (Vercel > Deployments > Redeploy) : les variables ne s'appliquent qu'aux nouveaux déploiements.

## Tester en tant que développeur
- `curl https://talentpulse-topaz.vercel.app/api/health` → `auth: true` après les étapes 1, 2 et 6.
- Inscription : `/connexion` > Inscription (prénom, e-mail, mot de passe 10+ caractères), puis `/mon-espace`.
- Confirmation d'adresse / mot de passe oublié : actifs quand `accountEmails: true` (étape 3).
- Alertes : dans les résultats, « Enregistrer cette recherche » puis activer l'alerte dans Mon espace > Alertes.
  Déclencher le cron à la main :
  `curl -H "Authorization: Bearer $CRON_SECRET" https://talentpulse-topaz.vercel.app/api/cron/alerts`
  (valeur de `CRON_SECRET` : `vercel env pull`, ne jamais la publier).
- En local : `npm ci && npm test` (base PGlite en mémoire, aucun service externe), `npm run dev` (http://localhost:4173).

## Postuler depuis TalentPulse (sprint 8)

Le bouton principal de chaque offre est désormais **Postuler** : le candidat prépare sa candidature dans le site (nom, e-mail, téléphone, lettre, CV, consentement), puis la dernière étape dépend de ce que l'offre permet réellement :

| Offre | Ce que fait TalentPulse | Variable |
|---|---|---|
| France Travail avec e-mail de candidature | **Postuler en 1 clic** : lettre + CV envoyés au recruteur via Resend, réponse directe au candidat, copie au candidat | `APPLY_FROM_EMAIL` (domaine vérifié dans Resend) |
| Idem, envoi non activé | E-mail complet pré-rempli dans la messagerie du candidat (`mailto:`) | — |
| France Travail avec lien de candidature (`urlPostulation`) | Lettre copiée + ouverture du formulaire du recruteur | — |
| Autres (Adzuna, la plupart des offres FT) | Lettre copiée + ouverture de l'offre d'origine, mode d'emploi en 4 étapes | — |

Dans tous les cas la candidature est enregistrée (appareil, ou table `applications` du compte) et l'offre passe dans la colonne « J'ai postulé » du suivi. Le statut « envoyée » n'est posé **que** par `/api/candidature`, après acceptation par Resend ; le CV n'est jamais stocké.

La table `applications` est créée automatiquement au premier usage ; `npm run migrate` reste la méthode de référence.

Activer l'envoi réel : vérifier `talentpulse.fr` dans Resend (DNS OVH), puis définir `APPLY_FROM_EMAIL="TalentPulse <candidatures@talentpulse.fr>"` dans Vercel et redéployer.
