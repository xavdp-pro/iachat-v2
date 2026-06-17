Salut Xavier,

Comme je t'avais dit sur Whatsapp, j'aimerai avancer sur tout ce qu'il reste à faire sur devis.zerux.com pour que ce soit 100 % fonctionnel. Pour l'instant c'est un outil utile mais pas au max de ses capacités. Ci-dessous ce que j'aimerai que tu me chiffres stp :

Changement template PDF > ci-joint un exemple de devis comme il doit apparaitre (605.0106 - The Hive), l'idée c'est de s'en rapprocher à 99 % pour qu'un client ayant reçu un devis comme ça ne remarque pas de changement avec les nouveaux. On peaufinera ensemble la conception. Et du coup dans le stepper quand on en est à l'étape 4, il faut garder la partie de gauche qui est bien mais à droite il faut qu'on voie le PDF directement, qui se remplit avec le texte à droite.

Production des fiches de détails > ci-joint les deux "fiches de détail" qu'on remplit au max et qu'on envoi avec le devis. On en reparlera, mais pour chaque repère du devis il faut faire une fiche comme ça, la préremplir avec autant d'information qu'on a, et les assembler bout-à-bout en un seul PDF. Et il y en aura une troisième que j'ai pas encore produite pour les chassis fixe.

Intégration de calculs de poids > pour chaque perf, on a un poids au m² pour calculer le poids du vantail et un poids au mètre pour le bâti. Il faut une vue admin où on peut renseigner ces valeurs et ajouter autant de ligne qu'on veut pour les différents cumuls de performances. Et puis après ça vient se renseigner dans le détail des lignes de PDF.

Choix des équipements de portes > notre commercial Arthur qui travaille sur te faire un récap de tous les équipements qu'on devrait avoir disponible sur la Nexus RC4 et dans quelle colonne chacun devrait s'afficher : à parti de ça j'espère qu'on pourra finalement avoir quelque chose de précis pour les équipements ! C'est assez clair, on regarde dans quelle catégorie du tarif on a pris le prix de base (si c'est une Nexus RC4 par exemple on a pris l'onglet RC4 de l'excel, pages 14 à 19 de la version PDF) et puis on sait qu'on doit proposer uniquement des équipements de ces pages sauf mention explicite. Donc Arthur va faire ce travail pour qu'on ai un exemple de ce qui devrait s'afficher en Nexus RC4, il faudra se baser sur ça pour les autres perfs mais au moins on aura un exemple concret à se mettre sous la dent.

Remettre en place les lignes de fin avec Total général HT, Geste commercial, TVA, et Total TTC > t'avais déjà fait ce travail mais à priori ça a été écrasé car je ne le vois plus. Se référencer à l'onglet "colonnes fin" de l'excel feuille de route.

Gestion multi-devise > pour l'instant tout en euro, mais il faut qu'on puisse sélectionner EUR, CHF, GBP, ou USD, avec pour chacun un taux de conversion précis à une décimale prêt (0.9 pour CHF, 0.9 pour GBP, 1.2 pour USD). Et il faudrait une alerte deux fois par an (1er janvier, 1er juin) qui reste en rouge jusqu'à qu'un admin n'ai pas validé les taux de conversion, soit sans les changer car ok, soit en les mettant à jour pour suivre l'évolution réelle.

Intégration IMAP > tout au début du process, quand on sélectionne le contact client, il faudrait qu'on ai la liste des 5 derniers emails qu'il nous a envoyés (avec option pour en afficher 5 de plus etc) affichés par connexion IMAP, et dans cette liste on va choisir l'email du client où il nous demandait le devis. On a aussi une case "Pas d'email" à cocher si c'était une demande sans email associé. Et une fois qu'on est à l'étape 5 du stepper (à renommer "Envoi" plutôt que "HubSpot", et pas besoin de l'affichage actuel avec "Document à envoyer", "Teste de la note Hubspot", et "Destination HubSpot") on a la prévisualisation de cet email, une zone de texte avec le corps de texte de l'email qu'on envoi au client en réponse, la sélection des différentes pièces jointes qu'on va lui envoyer dans cet email (devis PDF, fiches de détails, et plus tard on intégrera aussi les fiches techiques et brochures), et un bouton "Préparer brouillon" qui injecte dans Hubspot le PDF + ouvre un brouillon outlook avec le texte qu'on vient de rédiger, les PJ, et qui est pas juste un nouveau email mais qui répond à celui du client pour qu'il s'y retrouve.

Sélection du contact client Hubspot > comme tu verras dans le devis, on marque le nom de la personne qui nous a demandé le devis parmi les différents contacts Hubspot qu'on a pour l'entreprise.

Plus de contrôle sur la numérotation > une vue admin assez simple qui permet de voir les numéros de devis utilisés chaque mois (menus dépliants) et qui permet de changer la composition de ce numéro pour quand on aura utilisé tous les numéros possibles (AMM.9999).

Organisation deals > quand on fait un nouveau deal dans le stepper Devis Nexus, il faudrait que ça créé automatiquement le devis qui va dedans, comme ça on a le numéro du devis, et il faut que ce numéro remonte dans le nom de l'affaire. Pour l'instant le nom de l'affaire par défaut c'est "Nouveau projet - [nom du client]" alors que ça devrait être "[numéro de devis] - [nom du client]".

Quelques erreurs de compréhension du tarif à corriger :

CR6 + EI60 : chiffrage d'un avis de chantier alors que non obligatoire normalement

Si on choisit porte bélier le tarif pour le cumul d’autres performances ne fonctionne pas

Rendre impossible la sélection anti-bélier lorsque BP 2V est choisi (pas au tarif)

Rajouter option joint acoustique

Vérifier les compatibilités CR/FB/EI

Rajouter un recalcul automatique lorsqu’une case d’équipement est vidée

Toujours arrondir à l’unité les prix qui viennent du tarif (dans l’excel ça doit être arrondi visuellement seulement et du coup sur certaines réf comme 4476 c’est un prix avec des centimes)

Bien vérifier l’application de la règle ‘si perf inférieure demandée qui n’est pas dispo au tarif, chiffrer la perf au-dessus’ par exemple : je choisis FB5, comme on n’a pas de tarif ça devrait chiffrer en FB6 et non pas laisser vide comme actuellement.

Et finalement, la bonne prise en compte des règles de chiffrage : j'ai créé la règle R061 qui est sensé demandé de chiffrer un ferme-porte + une plinthe automatique encastrée par défaut sur tout les devis (en plus des autres équipements par défaut qu'on a déjà) mais elle n'est pas prise en compte par l'IA. C'est essentiel qu'on puisse créer/éditer ces règles et que l'IA les prenne systématiquement en compte.

Je suis en train de mettre tout ça dans l'excel de feuille de route pour que ça soit écrit au clair, et en même temps je définirai les jalons de règlements. Mais du coup ça ne devrait pas t'empécher de faire ton devis, comme ça on peut rapidement le signer et lancer tout ça !

Dans l'attente de ton retour,
Cordialement,

Zerux France
Armand Guilhot