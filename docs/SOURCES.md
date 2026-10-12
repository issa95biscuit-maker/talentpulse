# Sources d'offres — état au 12/10/2026 (sprint 9)

| Source | Accès | Coût | Inscription | Statut TalentPulse |
|---|---|---|---|---|
| France Travail – API Offres v2 | Public, clé gratuite | Gratuit | https://francetravail.io | ✅ Branchée (inclut des offres partenaires) |
| Adzuna | Public, clé gratuite | Gratuit (quota) | https://developer.adzuna.com | ✅ Branchée — contient déjà Adecco (~670 offres Paris), Manpower, Randstad… |
| La Bonne Alternance (gouv) | Clé sandbox immédiate, prod sur demande | Gratuit | https://api.apprentissage.beta.gouv.fr/fr/explorer — habilitation : contact-api@labonnealternance.apprentissage.beta.gouv.fr | 🟡 Stub `fetchLBA` prêt (`LBA_API_KEY`) |
| Careerjet | Compte éditeur, clé API | Gratuit (éditeur rémunéré au clic) | https://www.careerjet.com/partners/api (locale fr_FR) | 🟡 Stub `fetchCareerjet` prêt (`CAREERJET_API_KEY`) — exige IP + user-agent de l'internaute et Referer |
| Jooble | Formulaire, clé par pays | Gratuit : 500 requêtes au total par clé, au-delà sur devis | https://fr.jooble.org/api/about | 🟡 Stub `fetchJooble` prêt — trop limité pour la prod |
| Adecco | Pas d'API publique. Flux RSS carrière (siège), API interne non documentée | — | Partenariat à demander à Adecco France | ❌ Ne pas scraper. Offres déjà via Adzuna |
| Manpower / Randstad | Pas d'API publique | — | Partenariat direct | ❌ Offres déjà via Adzuna |
| Indeed Publisher | Fermé (inscriptions stoppées 2020, endpoint mort 2024) | — | — | ❌ Indisponible ; scrapers tiers = contraire aux CGU d'Indeed |
| HelloWork | Pas d'API de recherche ; flux réservés aux recruteurs/ATS | — | Partenariat jobboard | ❌ |
| Remotive | API publique, télétravail tech (anglais) | Gratuit | https://remotive.com/api | ❌ Hors cible ; CGU interdisent de reverser les offres vers d'autres sites d'emploi |
