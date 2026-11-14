/*
 * TalentPulse — contenus des pages légales (mentions, CGU, contact, à propos, confidentialité).
 * Fichier partagé : chargé tel quel par le navigateur (<script>) ET importé par les fonctions API (ESM).
 * Il n’utilise ni import ni export : il expose globalThis.TP_LEGAL.buildLegalPages({ LEGAL, FEATURES, esc }).
 * Les marqueurs [À COMPLÉTER] restent visibles tant que l’éditeur n’a pas fourni la valeur.
 */
(function (root) {
  const defaultEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function buildLegalPages(ctx) {
    const LEGAL = ctx.LEGAL || {};
    const FEATURES = ctx.FEATURES || {};
    const esc = ctx.esc || defaultEsc;
    const TODO = t => `<span class="todo">[À COMPLÉTER : ${t}]</span>`;
    const LV = (k, t) => (LEGAL[k] ? esc(LEGAL[k]) : TODO(t));
    const contactMail = () => (LEGAL.contactEmail ? `<a href="mailto:${esc(LEGAL.contactEmail)}" style="text-decoration:underline">${esc(LEGAL.contactEmail)}</a>` : TODO('adresse email de contact vérifiée'));
    const isParticulier = () => /particulier|non professionnel/i.test(LEGAL.status || '');

    const LEGAL_PAGES = {
      '/mentions-legales': {
        title: 'Mentions légales',
        description: 'Mentions légales du site TalentPulse : éditeur, hébergeur et contact.',
        body: () => `<h1 id="legalPageTitle">Mentions légales</h1>
    <h2>Éditeur du site</h2>
    <p>Le site TalentPulse (talentpulse-topaz.vercel.app) est édité par ${LV('editor', 'nom et prénom de l’éditeur ou raison sociale')}, ${LV('status', 'statut : particulier, micro-entreprise, SAS…')}.</p>
    <ul>
    ${isParticulier() && !LEGAL.address ? '<li>Adresse : conservée par l’hébergeur, conformément à l’article 6-III-2 de la loi n° 2004-575 du 21 juin 2004 (LCEN) pour les éditeurs non professionnels</li>' : `<li>Adresse : ${LV('address', 'adresse postale')}</li>`}
    ${isParticulier() && !LEGAL.siren ? '' : `<li>SIREN : ${LV('siren', 'numéro SIREN')}</li>`}
    ${LEGAL.siret ? `<li>SIRET : ${esc(LEGAL.siret)}</li>` : ''}
    ${LEGAL.vat ? `<li>${esc(LEGAL.vat)}</li>` : ''}
    <li>Email : ${contactMail()}</li>
    <li>Directeur de la publication : ${LV('director', 'nom du directeur de la publication')}</li>
    </ul>
    <h2>Hébergeur</h2>
    <p>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — <a href="https://vercel.com" rel="noopener" target="_blank" style="text-decoration:underline">vercel.com</a>.</p>
    <h2>Sources des offres</h2>
    <p>Les offres d’emploi affichées proviennent de l’API Offres d’emploi de France Travail, de l’API Adzuna et des données ouvertes « Choisir le Service Public » (fonction publique). Elles restent la propriété et la responsabilité de leurs émetteurs. TalentPulse n’est pas l’employeur et n’envoie pas les candidatures à votre place : vous postulez sur le site d’origine de chaque annonce, ou depuis votre messagerie lorsque l’offre publie une adresse e-mail de candidature.</p>
    <h2>Réutilisation des offres et traitements appliqués</h2>
    <p>Les offres France Travail proviennent de l’API Offres d’emploi et sont réutilisées conformément à la <a href="https://francetravail.io/produits-partages/catalogue/offres-emploi" rel="noopener" target="_blank" style="text-decoration:underline">licence de réutilisation des offres d’emploi de France Travail</a>. Elles sont interrogées en temps réel à chaque recherche ; la date de publication et de dernière mise à jour figure sur chaque offre. Les offres de la fonction publique proviennent du jeu de données « Les offres diffusées sur Choisir le Service Public » (Direction générale de l’administration et de la fonction publique), publié sur <a href="https://www.data.gouv.fr/datasets/les-offres-diffusees-sur-choisir-le-service-public" rel="noopener" target="_blank" style="text-decoration:underline">data.gouv.fr</a> sous Licence Ouverte 2.0 et actualisé régulièrement ; seules les offres dont la date de fin de publication n’est pas passée sont affichées. Les offres Adzuna sont affichées avec la mention « Jobs by Adzuna » exigée par les <a href="https://developer.adzuna.com/docs/terms_of_service" rel="noopener" target="_blank" style="text-decoration:underline">conditions de l’API Adzuna</a>.</p>
    <p>Traitements appliqués, sans modifier le fond des annonces : intitulés et noms d’entreprise écrits en MAJUSCULES remis en casse normale, mention « (H/F) » dédoublonnée, noms de communes rapprochés du référentiel INSEE lorsque c’est possible, libellés d’expérience reformulés (« 2 An(s) » → « 2 ans d’expérience »), salaires convertis dans un format lisible. Les annonces strictement identiques (même intitulé, même entreprise et même ville) sont regroupées quand elles sont détectées ; une même offre peut toutefois rester visible sur plusieurs lieux.</p>
    <h2>Propriété intellectuelle</h2>
    <p>La marque, le logo et l’interface TalentPulse sont la propriété de l’éditeur. Toute reproduction sans autorisation est interdite. France Travail et Adzuna sont des marques de leurs titulaires respectifs ; elles sont citées uniquement pour indiquer la source des annonces.</p>
    <h2 id="credits">Crédits</h2>
    <ul>
    <li>Photographies d’ambiance : Negley Stockman et Centre for Ageing Better via <a href="https://unsplash.com/license" rel="noopener" target="_blank" style="text-decoration:underline">Unsplash</a> (licence Unsplash) ; Joe deSousa, Christina Morillo, Startup Stock Photos, Burst, Direct Media, Janko Ferlic, Michael Browning, Leeroy et Seb Creativo via <a href="https://stocksnap.io/license" rel="noopener" target="_blank" style="text-decoration:underline">StockSnap</a> (CC0).</li>
    <li>Icônes : <a href="https://lucide.dev" rel="noopener" target="_blank" style="text-decoration:underline">Lucide</a> (licence ISC).</li>
    <li>Données géographiques : <a href="https://geo.api.gouv.fr" rel="noopener" target="_blank" style="text-decoration:underline">API Découpage administratif</a> (geo.api.gouv.fr, Licence Ouverte Etalab).</li>
    </ul>`
      },
      '/confidentialite': {
        title: 'Politique de confidentialité',
        description: 'Comment TalentPulse traite vos données : stockage local, compte optionnel, sous-traitants, durées de conservation et droits.',
        body: () => privacyPolicy()
      },
      '/a-propos': {
        title: 'À propos',
        description: 'TalentPulse, agrégateur gratuit d’offres d’emploi France Travail, Adzuna et Choisir le Service Public.',
        body: () => `<h1 id="legalPageTitle">À propos de TalentPulse</h1>
    <p>TalentPulse est un agrégateur gratuit : il rassemble en une seule recherche les offres de France Travail, d’Adzuna et de la fonction publique (Choisir le Service Public), et affiche un lien direct vers l’annonce d’origine.</p>
    <p>TalentPulse n’est pas l’employeur des offres affichées et n’envoie pas les candidatures à votre place. Les informations peuvent évoluer ou disparaître selon les sources d’origine.</p>
    <p>Éditeur : ${LV('editor', 'nom et prénom de l’éditeur ou raison sociale')}. Contact : ${contactMail()}.</p>`
      },
      '/contact': {
        title: 'Contact',
        description: 'Contacter l’éditeur de TalentPulse pour une question, une suggestion ou un problème technique.',
        body: () => `<h1 id="legalPageTitle">Contact</h1>
    <p>Une question, une suggestion ou un problème technique ?</p>
    <p><strong>Email :</strong> ${contactMail()}</p>
    <p>Pour une question sur une offre, contactez directement l’employeur ou la source indiquée dans l’annonce. TalentPulse n’est pas l’employeur.</p>`
      },
      '/cgu': {
        title: 'Conditions générales d’utilisation',
        description: 'Conditions d’utilisation du service gratuit TalentPulse : offres tierces, candidatures, compte, données et droit applicable.',
        body: () => `<h1 id="legalPageTitle">Conditions Générales d’Utilisation</h1>
    <p class="legal-meta">Dernière mise à jour : 10 novembre 2026</p>
    <h2>1. Objet</h2>
    <p>Les présentes conditions encadrent l’utilisation du service gratuit TalentPulse.</p>
    <h2>2. Offres tierces</h2>
    <p>TalentPulse affiche des annonces provenant de France Travail, d’Adzuna et de Choisir le Service Public. Leur contenu, leur disponibilité et les modalités de candidature relèvent de leurs sources d’origine.</p>
    <h2>3. Candidatures</h2>
    <p>« Postuler » prépare votre candidature (coordonnées, lettre, CV) et l’ajoute à votre suivi, enregistré sur votre appareil ou dans votre compte. TalentPulse n’envoie pas lui-même votre lettre ni votre CV au recruteur. Si l’offre publie une adresse e-mail de candidature, le site prépare un e-mail prêt à envoyer depuis votre messagerie. Dans les autres cas, vous copiez la lettre générée et vous postulez directement sur le site d’origine de l’annonce. TalentPulse n’est ni l’employeur ni un intermédiaire de recrutement.</p>
    <h2>4. Données</h2>
    <p>Voir la <a href="/confidentialite" data-route="/confidentialite" style="text-decoration:underline">politique de confidentialité</a>.</p>
    <h2>5. Compte utilisateur</h2>
    <p>La création d’un compte est facultative. Vous êtes responsable de la confidentialité de votre mot de passe. Vous pouvez supprimer votre compte depuis « Mon espace » ; la suppression est définitive.</p>
    <h2>6. Propriété intellectuelle</h2>
    <p>Voir les <a href="/mentions-legales" data-route="/mentions-legales" style="text-decoration:underline">mentions légales</a> (marque TalentPulse, licences des sources et crédits).</p>
    <h2>7. Droit applicable</h2>
    <p>Droit français. ${TODO('tribunal compétent')}.</p>
    <h2>8. Contact</h2>
    <p>Pour toute question relative aux présentes CGU : ${contactMail()}.</p>`
      }
    };
    function privacyPolicy() {
      const F = FEATURES;
      const accounts = F.auth;
      const rows = [
        ['Recherche d’offres', 'Mots-clés, lieu et filtres saisis', 'Intérêt légitime (fournir le service demandé)', 'Non conservés (journaux techniques de l’hébergeur : 30 jours max.)'],
        ['Mon espace sans compte', 'Profil, favoris, suivi, recherches, compétences du CV', 'Stockage local sur votre appareil, sous votre contrôle', 'Jusqu’à ce que vous les effaciez'],
      ];
      if (accounts) {
        rows.push(['Compte TalentPulse', 'Adresse e-mail, prénom, mot de passe (haché avec Argon2id, jamais stocké en clair), date de création', 'Exécution du contrat (art. 6.1.b RGPD)', 'Jusqu’à la suppression du compte ; compte inactif supprimé après 3 ans']);
        rows.push(['Synchronisation', 'Favoris, suivi de candidatures, recherches enregistrées, profil professionnel', 'Exécution du contrat', 'Jusqu’à suppression par vous ou du compte']);
        rows.push(['Sécurité', 'Session (cookie technique httpOnly), empreintes HMAC d’adresse IP et d’e-mail pour limiter les tentatives', 'Intérêt légitime (sécurité du service)', 'Session : 30 jours ; compteurs anti-abus : 48 h']);
      }
      if (F.emailAlerts || F.whatsappAlerts) rows.push(['Alertes', 'Critères de recherche, canal choisi, ' + (F.whatsappAlerts ? 'numéro WhatsApp, ' : '') + 'historique des offres envoyées', 'Consentement (activation de l’alerte, retrait à tout moment)', 'Historique d’envoi : 90 jours']);
      rows.push(['Candidatures préparées', 'Nom, e-mail, téléphone (facultatif), lettre, nom et taille du fichier CV, offre concernée' + (accounts ? '' : ''), 'Consentement (case cochée à chaque candidature)', (accounts ? 'Appareil, ou compte si vous êtes connecté : ' : 'Sur votre appareil : ') + 'jusqu’à suppression par vous' + (accounts ? ' ou du compte' : '') + '. Le fichier CV lui-même n’est jamais stocké par TalentPulse']);
      if (F.applyEmail) rows.push(['Envoi au recruteur', 'Lettre, coordonnées et CV transmis à l’adresse de candidature publiée dans l’offre France Travail, uniquement quand vous cliquez « Envoyer »', 'Exécution du service demandé', 'CV non conservé ; date et destinataire de l’envoi conservés avec la candidature']);
      if (F.aiLetter) rows.push(['Lettre de motivation IA', 'Poste, entreprise, atouts et profil saisis dans le formulaire', 'Exécution du service demandé', 'Non conservés par TalentPulse']);
      const processors = ['<li><strong>Vercel Inc.</strong> (hébergement, États-Unis, clauses contractuelles types / Data Privacy Framework)</li>'];
      if (accounts) processors.push('<li><strong>Neon</strong> (base de données PostgreSQL, hébergée dans l’Union européenne)</li>');
      if (F.emailAlerts || F.accountEmails || F.applyEmail) processors.push('<li><strong>Resend</strong> (sous-traitant d’envoi des e-mails : confirmation d’adresse, réinitialisation du mot de passe, alertes ou candidatures, selon les fonctions activées ; Union européenne / États-Unis, accord de traitement)</li>');
      if (F.whatsappAlerts) processors.push('<li><strong>Twilio</strong> et <strong>Meta (WhatsApp)</strong> (envoi des alertes WhatsApp)</li>');
      if (F.aiLetter) processors.push('<li><strong>Vercel AI Gateway</strong> et le fournisseur du modèle de langage (génération de la lettre ; les données ne servent pas à entraîner les modèles selon leurs conditions)</li>');
      processors.push('<li><strong>France Travail</strong> et <strong>Adzuna</strong> reçoivent uniquement les critères de recherche (via nos serveurs), sans donnée personnelle. Les offres <strong>Choisir le Service Public</strong> viennent d’un fichier ouvert (data.gouv.fr) : aucune donnée personnelle ne leur est transmise.</li>');
      processors.push('<li><strong>geo.api.gouv.fr</strong> (service public de la DINUM) : pour suggérer villes, départements et régions, votre navigateur lui envoie directement les lettres saisies dans le champ « Lieu » ; comme pour tout site web, il voit votre adresse IP. Aucune autre donnée n’est transmise.</li>');
      return `<h1 id="legalPageTitle">Politique de confidentialité</h1>
    <p class="legal-meta">Dernière mise à jour : 7 novembre 2026</p>
    <h2>En résumé</h2>
    <p>TalentPulse fonctionne <strong>sans compte</strong> : vos données restent alors dans votre navigateur.${accounts ? ' Si vous créez un compte (facultatif), nous conservons le strict nécessaire pour synchroniser votre espace entre vos appareils.' : ''} Nous ne déposons <strong>aucun cookie publicitaire ni de mesure d’audience</strong>${accounts ? ' ; le seul cookie est un cookie de session technique, strictement nécessaire, déposé lorsque vous vous connectez' : ''}.</p>
    <h2>Responsable du traitement</h2>
    <p>${LV('editor', 'nom ou raison sociale de l’éditeur')} — contact : ${contactMail()}.</p>
    <h2>Données traitées</h2>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Tableau des traitements"><table><thead><tr><th scope="col">Finalité</th><th scope="col">Données</th><th scope="col">Base légale</th><th scope="col">Durée</th></tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p>Le fichier de votre CV n’est jamais envoyé : il est analysé dans votre navigateur et seules les compétences détectées sont gardées sur votre appareil.</p>
    <p>Vous pouvez effacer les données de cet appareil à tout moment :</p>
    <p><button type="button" class="btn btn-outline" data-action="clear-data">Effacer les données de cet appareil</button></p>
    <h2>Destinataires et sous-traitants</h2>
    <ul>${processors.join('')}</ul>
    <h2>Liens vers les sites d’origine</h2>
    <p>Lorsque vous cliquez sur « Voir l’offre » ou « Copier ma lettre et ouvrir… », vous quittez TalentPulse pour le site de la source (France Travail, Adzuna, Choisir le Service Public ou un partenaire). Leur propre politique de confidentialité s’applique alors.</p>
    <h2>Vos droits</h2>
    <p>Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité.${accounts ? ' Depuis « Mon espace », vous pouvez <strong>exporter</strong> toutes vos données (JSON) et <strong>supprimer votre compte</strong> : la suppression est immédiate et définitive.' : ''} Pour toute demande : ${contactMail()}. Vous pouvez également introduire une réclamation auprès de la CNIL (cnil.fr).</p>
    <h2>Sécurité</h2>
    <p>Connexions chiffrées (HTTPS)${accounts ? ', mots de passe hachés avec Argon2id, sessions stockées sous forme d’empreinte, limitation des tentatives de connexion, protection contre les requêtes intersites (CSRF)' : ''}${accounts && F.accountEmails ? '. Les liens envoyés par e-mail sont à usage unique et stockés sous forme d’empreinte : 1\u00a0heure pour réinitialiser le mot de passe (qui ferme toutes les sessions ouvertes), 48\u00a0heures pour confirmer l’adresse ; les liens expirés sont supprimés automatiquement' : ''}.</p>`;
    }

    return LEGAL_PAGES;
  }

  root.TP_LEGAL = { buildLegalPages };
})(typeof globalThis !== 'undefined' ? globalThis : this);
