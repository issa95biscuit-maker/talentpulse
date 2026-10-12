# Sources d'offres — état au 12/10/2026 (sprint 10)

Règle : on ne branche que ce qui est **gratuit et autorisé** (API ou données ouvertes dont les conditions
permettent la réutilisation par un agrégateur). Pas de scraping, pas de flux « trouvés » sans accord.

## Branchées en production

| Source | Accès | Coût | Volume | Statut |
|---|---|---|---|---|
| France Travail – API Offres v2 | Clé gratuite (francetravail.io) | Gratuit | ~800 000 offres, partenaires inclus | ✅ |
| Adzuna | Clé gratuite (developer.adzuna.com) | Gratuit (quota) | inclut Adecco, Manpower, Randstad… | ✅ (« Jobs by Adzuna » obligatoire) |
| **Choisir le Service Public** (DGAFP) | Données ouvertes data.gouv.fr, **Licence Ouverte 2.0** | Gratuit, sans clé | **~7 700 offres en cours** (État, territoriale, hospitalière) | ✅ **Nouveau (sprint 10)** — index `lib/data/csp-offres.json` reconstruit par `node scripts/build-csp.mjs` (workflow hebdo prêt : `docs/ci/csp-refresh.yml`, à copier dans `.github/workflows/`), recherche en mémoire, lien vers la fiche officielle |

Limites CSP : le jeu de données n'a ni description complète ni salaire (grille indiciaire) ; data.gouv.fr publie
l'extraction de façon irrégulière (dernière : 13/09/2026, mise en ligne le 05/10). Les offres dont la date de fin de
publication est passée sont filtrées à la volée ; une offre peut toutefois avoir été dépubliée plus tôt par l'employeur
(la page CSP l'indique alors).

## Prêtes à brancher (code écrit, clé ou accord à obtenir)

| Source | Ce qu'il faut | Variable | Code |
|---|---|---|---|
| La Bonne Alternance (gouv) | Clé gratuite ; habilitation pour la prod | `LBA_API_KEY` | `fetchLBA` |
| Careerjet | Compte éditeur gratuit (rémunéré au clic) | `CAREERJET_API_KEY` | `fetchCareerjet` |
| Jooble | Formulaire ; 500 requêtes au total → test seulement | `JOOBLE_API_KEY` | `fetchJooble` |
| API Engagement (Service civique) | Compte diffuseur via un chargé de déploiement ; tracking des vues obligatoire | `API_ENGAGEMENT_KEY` | `fetchEngagement` |
| Sites carrières employeurs (SmartRecruiters) | **Accord écrit de chaque employeur.** L'API publique SmartRecruiters est faite pour le site carrière du client, pas pour l'agrégation par des tiers. Testé : Accor 207 offres FR, Kiabi 112, Primark 46, Alten 688, Devoteam 333, Assystem 419, Ubisoft 121 | `EMPLOYER_FEEDS=smartrecruiters:Accor,…` | `fetchEmployerFeeds` |

## Pas d'accès possible sans partenariat commercial

| Acteur | Situation |
|---|---|
| Adecco, Manpower, Randstad (en direct) | Pas d'API publique ; flux RSS non licenciés pour un tiers → ne pas scraper. Déjà présents via Adzuna. |
| Welcome to the Jungle | API « Solutions » : l'endpoint « toutes les offres » exige un **partenariat dédié** (scope `su_jobs_r`). |
| HelloWork / RegionsJob, Cadremploi, Monster, Apec | Pas d'API de recherche publique ; flux XML réservés aux partenaires (multidiffusion côté recruteur). |
| Taleez, Beetween, Flatchr, Jobaffinity (ATS / multidiffuseurs) | Ils **envoient** des flux XML aux jobboards partenaires. Pour TalentPulse : devenir « support de diffusion » (contrat), puis recevoir le flux. Gratuit pour le jobboard en général, mais c'est l'employeur qui choisit d'y diffuser. |
| Talent.com, Jobijoba, WhatJobs | Programmes éditeurs (flux XML rémunérés au clic) sur candidature. |
| Indeed | Publisher fermé ; scraper = contraire aux CGU. |
| Remotive / Arbeitnow | Hors cible (tech à distance, Allemagne) ; Remotive interdit la rediffusion vers d'autres sites d'emploi. |

## Prochaines démarches (gratuites, à faire par Ry)
1. Demander la clé La Bonne Alternance (contact-api@labonnealternance.apprentissage.beta.gouv.fr) → +alternance, et candidature en 1 clic (voir FRANCE-TRAVAIL-CONNECT.md).
2. Ouvrir un compte éditeur Careerjet (5 min) → ajoute des agrégats d'agences et de sites carrières.
3. Écrire à 2–3 employeurs locaux sur SmartRecruiters / Taleez pour l'accord de diffusion (modèle d'e-mail dans le rapport du sprint 10).
