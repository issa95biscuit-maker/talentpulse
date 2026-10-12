# « Connecter son compte France Travail » et postuler sans quitter TalentPulse — étude (sprint 10)

## Ce qui existe

| Brique | Ce qu'elle fait | Accès |
|---|---|---|
| **France Travail Connect** (« Se connecter avec France Travail ») | Connexion OpenID Connect avec les identifiants francetravail.fr ; APIs de lecture associées : identité, coordonnées, compétences, expériences, formations, statut | **Accès conditionné** : service en ligne gratuit (ou tarif solidaire), conforme RGPD ; formulaire de demande sur francetravail.io, audit ≤ 10 jours |
| API « Déclaration de démarche » (France Travail Connect, « à venir ») | Signaler à France Travail une démarche faite sur TalentPulse (ex. une candidature) | Même habilitation |
| API « Ajout de compétence » | Pousser des compétences dans le profil FT de l'usager | Même habilitation |
| **La Bonne Alternance – Envoi de candidature** | **Transmet réellement** la candidature (coordonnées + CV + message) au recruteur, sans quitter le site | Habilitation réservée aux services à fort volume ; offres **en alternance** uniquement (`apply.recipient_id`) |
| FranceConnect | Identité de l'État (impots.gouv, Ameli…) — n'a rien à voir avec les candidatures | Habilitation DINUM |

## Ce qui n'existe pas
**Aucune API ne permet de postuler à une offre France Travail « à la place » du candidat.** Sur francetravail.fr,
la candidature passe par l'espace personnel du candidat ou par le site du recruteur. Se connecter avec France Travail
ne donne **pas** ce droit, et automatiser l'espace candidat (identifiants stockés, navigateur piloté) violerait les CGU
et la sécurité du compte. On ne le fera pas.

## Ce qu'on propose (honnête et faisable)
1. **Maintenant (déjà en ligne)** : dossier « Postuler » dans TalentPulse (lettre, CV, suivi), envoi réel par e-mail quand
   l'offre FT publie une adresse, sinon lettre copiée + ouverture du formulaire du recruteur.
2. **Avec France Travail Connect (après habilitation)** : bouton « Se connecter avec France Travail » → dossier
   pré-rempli (nom, e-mail, téléphone, compétences, expériences), puis « Déclaration de démarche » pour que la
   candidature apparaisse dans l'espace FT de l'usager. Code prêt : `lib/ftconnect.js` (non exposé tant que les
   variables `FT_CONNECT_*` n'existent pas). Route à ajouter à ce moment-là : `/api/auth/ft-login` → redirection,
   `/api/auth/ft-callback` → vérif `state`/`nonce`, échange du code, création/liaison du compte.
3. **Alternance : vraie candidature en 1 clic sans quitter le site** via l'API de candidature La Bonne Alternance
   (ou leur widget `/postuler` en iframe) dès que la clé LBA est obtenue.

## Démarches (gratuites, au nom de l'éditeur de TalentPulse)
- francetravail.io → « France Travail Connect » → Demander l'accès (cocher : France Travail Connect, Coordonnées,
  Compétences professionnelles, Expériences professionnelles, Déclaration de démarche). Pré-requis : mentions légales,
  politique de confidentialité (OK), domaine définitif (talentpulse.fr recommandé pour l'URL de retour).
- contact-api@labonnealternance.apprentissage.beta.gouv.fr → clé API + habilitation « Envoi de candidature ».
