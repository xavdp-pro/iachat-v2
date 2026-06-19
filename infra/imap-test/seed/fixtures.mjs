/**
 * Fictional client → Zerux commercial inbox threads (dev / Dovecot test).
 * Each item is one message; use messageId + inReplyTo to chain conversations.
 */
export const FIXTURE_THREADS = [
  // ── Armand AJEX — real IMAP test mails (17 Jun 2026, Zimbra → xavier@xavdp.pro) ──
  {
    from: 'armand.guilhot@ajex-holding.fr',
    fromName: 'Armand Guilhot | AJEX',
    subject: 'Demande de prix réf 1706TEST01',
    date: 'Tue, 17 Jun 2026 17:42:00 +0200',
    messageId: '<ajex-1706test01@ajex-holding.fr>',
    body: `Xavier,

Email test pour la mise en place IMAP sur devis.zerux.com.

Pièce jointe : 03.16 Demande façade RC4 et pare-balles.pdf

Cordialement,

AJEX
Armand Guilhot — Associé
550 Montée de la Ruelle
69270 Fontaines-Saint-Martin
armand.guilhot@ajex-holding.fr`,
  },
  {
    from: 'armand.guilhot@ajex-holding.fr',
    fromName: 'Armand Guilhot | AJEX',
    subject: 'Deuxième demande de prix réf 1706TEST02',
    date: 'Tue, 17 Jun 2026 17:43:00 +0200',
    messageId: '<ajex-1706test02@ajex-holding.fr>',
    inReplyTo: '<ajex-1706test01@ajex-holding.fr>',
    body: `Xavier,

Deuxième email test, sait-on jamais !

Cordialement,

AJEX
Armand Guilhot — Associé
armand.guilhot@ajex-holding.fr`,
  },

  // ── The Hive (3) ──────────────────────────────────────────────────────────
  {
    from: 'sophie.martin@thehive-paris.fr',
    fromName: 'Sophie Martin',
    subject: 'Demande de devis — portes coupe-feu The Hive (lot 605)',
    date: 'Mon, 02 Jun 2025 09:14:22 +0200',
    messageId: '<thehive-001@thehive-paris.fr>',
    body: `Bonjour Armand,

Suite à notre échange téléphonique, pourriez-vous nous transmettre un devis pour la fourniture de blocs-portes coupe-feu pour le projet THE HIVE — tour B, niveaux R+2 à R+5.

Repères prévisionnels :
- BP-01 à BP-08 : CR4 + EI60, 2 vantaux
- BP-09 : guichet FB4 avec interphone

Cordialement,
Sophie Martin — The Hive Paris`,
  },
  {
    from: 'sophie.martin@thehive-paris.fr',
    fromName: 'Sophie Martin',
    subject: 'RE: Demande de devis — portes coupe-feu The Hive (lot 605)',
    date: 'Wed, 04 Jun 2025 11:02:05 +0200',
    messageId: '<thehive-002@thehive-paris.fr>',
    inReplyTo: '<thehive-001@thehive-paris.fr>',
    body: `Bonjour,

Complément : finition RAL 7016 sur l’ensemble des BP (hors zones inox RDC).

Sophie`,
  },
  {
    from: 'sophie.martin@thehive-paris.fr',
    fromName: 'Sophie Martin',
    subject: 'RE: Demande de devis — portes coupe-feu The Hive (lot 605)',
    date: 'Fri, 06 Jun 2025 16:45:18 +0200',
    messageId: '<thehive-003@thehive-paris.fr>',
    inReplyTo: '<thehive-002@thehive-paris.fr>',
    body: `Armand,

Dernière précision : acoustique 45 dB sur BP-03 à BP-06.

Merci,
Sophie`,
  },

  // ── Demo Logistics (3) ────────────────────────────────────────────────────
  {
    from: 'achats@demo-logistics.fr',
    fromName: 'Service Achats — Demo Logistics',
    subject: 'Appel d’offres portes techniques entrepôt Lyon',
    date: 'Tue, 10 Jun 2025 08:30:00 +0200',
    messageId: '<demo-001@demo-logistics.fr>',
    body: `Bonjour,

Extension entrepôt Lyon-Feyzin :
- 4 BP CR3 1 vantail 1150 x 2300
- 2 portes anti-bélier 960 x 2180

Offre attendue avant le 20/06.

Service Achats — Demo Logistics`,
  },
  {
    from: 'achats@demo-logistics.fr',
    fromName: 'Service Achats — Demo Logistics',
    subject: 'RE: Appel d’offres portes techniques entrepôt Lyon',
    date: 'Thu, 12 Jun 2025 14:11:33 +0200',
    messageId: '<demo-002@demo-logistics.fr>',
    inReplyTo: '<demo-001@demo-logistics.fr>',
    body: `Bonjour,

Merci pour l’accusé. Pouvez-vous inclure le transport jusqu’à Lyon ?

Achats Demo Logistics`,
  },
  {
    from: 'achats@demo-logistics.fr',
    fromName: 'Service Achats — Demo Logistics',
    subject: 'RE: Appel d’offres portes techniques entrepôt Lyon',
    date: 'Mon, 16 Jun 2025 09:05:00 +0200',
    messageId: '<demo-003@demo-logistics.fr>',
    inReplyTo: '<demo-002@demo-logistics.fr>',
    body: `Bonjour,

Le comité technique valide le CR3. Pouvez-vous ajouter une variante CR4 sur les 4 BP 1 vantail pour comparaison budget ?

Cordialement,
Achats`,
  },

  // ── Hôtel Riviera (2) ───────────────────────────────────────────────────
  {
    from: 'direction@hotel-riviera.fr',
    fromName: 'Marc Dupont',
    subject: 'Devis rénovation palier — Hôtel Riviera Nice',
    date: 'Mon, 09 Jun 2025 10:05:44 +0200',
    messageId: '<riviera-001@hotel-riviera.fr>',
    body: `Bonjour,

Devis pour 6 blocs-portes EI60 1 vantail (paliers 3 et 4).

Marc Dupont — Hôtel Riviera Nice`,
  },
  {
    from: 'direction@hotel-riviera.fr',
    fromName: 'Marc Dupont',
    subject: 'RE: Devis rénovation palier — Hôtel Riviera Nice',
    date: 'Wed, 11 Jun 2025 15:30:00 +0200',
    messageId: '<riviera-002@hotel-riviera.fr>',
    inReplyTo: '<riviera-001@hotel-riviera.fr>',
    body: `Bonjour Armand,

Les chambres côté mer doivent être en garniture inox brossé. Merci de l’intégrer au chiffrage.

Marc`,
  },

  // ── Architecte Bellevue (2) ───────────────────────────────────────────────
  {
    from: 'jean.bernard@cabinet-archi.fr',
    fromName: 'Jean Bernard',
    subject: 'Consultation Zerux — projet résidence Bellevue',
    date: 'Sun, 08 Jun 2025 18:22:10 +0200',
    messageId: '<archi-001@cabinet-archi.fr>',
    body: `Bonsoir,

Fourchette budgétaire pour 12 BP CR4 — plans en cours.

Jean Bernard — Architecte DPLG`,
  },
  {
    from: 'jean.bernard@cabinet-archi.fr',
    fromName: 'Jean Bernard',
    subject: 'RE: Consultation Zerux — projet résidence Bellevue',
    date: 'Tue, 10 Jun 2025 08:00:00 +0200',
    messageId: '<archi-002@cabinet-archi.fr>',
    inReplyTo: '<archi-001@cabinet-archi.fr>',
    body: `Bonjour,

Le promoteur souhaite passer en CR5 sur les entrées principales uniquement (4 portes). Le reste reste CR4.

Jean`,
  },

  // ── CHU Strasbourg — prison / sécurité (4) ───────────────────────────────
  {
    from: 'marie.leroy@chu-strasbourg.fr',
    fromName: 'Marie Leroy',
    subject: 'Consultation portes PRISON — secteur psychiatrie CHU',
    date: 'Thu, 05 Jun 2025 11:20:00 +0200',
    messageId: '<chu-001@chu-strasbourg.fr>',
    body: `Madame, Monsieur,

Dans le cadre de la rénovation du secteur protégé, nous recherchons un chiffrage pour :
- 8 BP PRISON 1 vantail
- 2 BP PRISON + EI60

Merci de préciser les délais usine.

Marie Leroy — Achats CHU Strasbourg`,
  },
  {
    from: 'marie.leroy@chu-strasbourg.fr',
    fromName: 'Marie Leroy',
    subject: 'RE: Consultation portes PRISON — secteur psychiatrie CHU',
    date: 'Fri, 06 Jun 2025 14:00:00 +0200',
    messageId: '<chu-002@chu-strasbourg.fr>',
    inReplyTo: '<chu-001@chu-strasbourg.fr>',
    body: `Bonjour,

Le service sécurité impose des serrures avec contact de position sur toutes les portes. À intégrer.

Marie Leroy`,
  },
  {
    from: 'marie.leroy@chu-strasbourg.fr',
    fromName: 'Marie Leroy',
    subject: 'RE: Consultation portes PRISON — secteur psychiatrie CHU',
    date: 'Mon, 09 Jun 2025 10:15:00 +0200',
    messageId: '<chu-003@chu-strasbourg.fr>',
    inReplyTo: '<chu-002@chu-strasbourg.fr>',
    body: `Bonjour,

Pouvez-vous chiffrer aussi la pose sur site (équipe locale) ou fourniture seule uniquement ?

Merci,
Marie`,
  },
  {
    from: 'marie.leroy@chu-strasbourg.fr',
    fromName: 'Marie Leroy',
    subject: 'RE: Consultation portes PRISON — secteur psychiatrie CHU',
    date: 'Wed, 11 Jun 2025 16:40:00 +0200',
    messageId: '<chu-004@chu-strasbourg.fr>',
    inReplyTo: '<chu-003@chu-strasbourg.fr>',
    body: `Dernier point : visite de repérage souhaitée le 20/06. Disponibilités ?

Marie Leroy`,
  },

  // ── École Jean Moulin (2) ─────────────────────────────────────────────────
  {
    from: 'proviseur@ecole-jeanmoulin-lyon.fr',
    fromName: 'Philippe Garnier',
    subject: 'Marché public — remplacement portes EI30 groupe scolaire',
    date: 'Mon, 03 Jun 2025 07:45:00 +0200',
    messageId: '<ecole-001@ecole-jeanmoulin-lyon.fr>',
    body: `Bonjour,

La commune nous mandate pour un devis estimatif avant publication DCE :
- 14 BP EI30 1 vantail
- 2 BP EI30 2 vantaux

Réponse souhaitée sous 10 jours.

Philippe Garnier — Proviseur`,
  },
  {
    from: 'proviseur@ecole-jeanmoulin-lyon.fr',
    fromName: 'Philippe Garnier',
    subject: 'RE: Marché public — remplacement portes EI30 groupe scolaire',
    date: 'Thu, 06 Jun 2025 12:00:00 +0200',
    messageId: '<ecole-002@ecole-jeanmoulin-lyon.fr>',
    inReplyTo: '<ecole-001@ecole-jeanmoulin-lyon.fr>',
    body: `Bonjour,

Précision ERP : thermolaquage RAL 9002 obligatoire sur l’ensemble du lot.

Philippe`,
  },

  // ── Banque Helvétia Genève (3) ────────────────────────────────────────────
  {
    from: 'thomas.weber@banque-helvetia.ch',
    fromName: 'Thomas Weber',
    subject: 'RFQ — Security doors Geneva HQ renovation',
    date: 'Tue, 03 Jun 2025 13:00:00 +0200',
    messageId: '<helvetia-001@banque-helvetia.ch>',
    body: `Dear Armand,

Please quote for FB6 + CR4 doors for our Geneva headquarters (12 units).
Delivery to Switzerland required — quote in CHF if possible.

Best regards,
Thomas Weber
Procurement — Banque Helvétia`,
  },
  {
    from: 'thomas.weber@banque-helvetia.ch',
    fromName: 'Thomas Weber',
    subject: 'RE: RFQ — Security doors Geneva HQ renovation',
    date: 'Thu, 05 Jun 2025 09:30:00 +0200',
    messageId: '<helvetia-002@banque-helvetia.ch>',
    inReplyTo: '<helvetia-001@banque-helvetia.ch>',
    body: `Hello,

Security audit requires RC5 on main entrance doors (3 units). Please update quote.

Thomas`,
  },
  {
    from: 'thomas.weber@banque-helvetia.ch',
    fromName: 'Thomas Weber',
    subject: 'RE: RFQ — Security doors Geneva HQ renovation',
    date: 'Mon, 09 Jun 2025 11:00:00 +0200',
    messageId: '<helvetia-003@banque-helvetia.ch>',
    inReplyTo: '<helvetia-002@banque-helvetia.ch>',
    body: `Armand,

Can you include acoustic 40 dB on meeting room doors (4 units) ?

Regards,
Thomas Weber`,
  },

  // ── Equinix datacenter (2) ──────────────────────────────────────────────────
  {
    from: 'projets@equinix-france.fr',
    fromName: 'Équipe Projets Equinix',
    subject: 'Devis portes anti-explosion — salle PA6 PA8',
    date: 'Wed, 04 Jun 2025 16:00:00 +0200',
    messageId: '<equinix-001@equinix-france.fr>',
    body: `Bonjour,

Consultation pour portes Blast 4 t/m² sur extension PA8 :
- 6 BP 2 vantaux
- Note de calcul à prévoir

Équipe Projets — Equinix France`,
  },
  {
    from: 'projets@equinix-france.fr',
    fromName: 'Équipe Projets Equinix',
    subject: 'RE: Devis portes anti-explosion — salle PA6 PA8',
    date: 'Fri, 06 Jun 2025 10:30:00 +0200',
    messageId: '<equinix-002@equinix-france.fr>',
    inReplyTo: '<equinix-001@equinix-france.fr>',
    body: `Bonjour,

Le bureau de contrôle demande une variante Blast 2 t/m² sur 2 portes seulement (accès technique).

Equinix Projets`,
  },

  // ── Mairie Bordeaux (1) ───────────────────────────────────────────────────
  {
    from: 'marches-publics@bordeaux-metropole.fr',
    fromName: 'Service Marchés Publics',
    subject: 'DCE à venir — portes coupe-feu médiathèque Bastide',
    date: 'Fri, 07 Jun 2025 08:00:00 +0200',
    messageId: '<bordeaux-001@bordeaux-metropole.fr>',
    body: `Bonjour,

Avant publication du marché, nous consultons pour une estimation :
- 9 BP EI60
- 1 guichet EI60

Réponse sous 15 jours.

Service Marchés Publics — Bordeaux Métropole`,
  },

  // ── Syndic copropriété (3) ────────────────────────────────────────────────
  {
    from: 'gestion@syndic-parcimpérial.fr',
    fromName: 'Syndic Parc Impérial',
    subject: 'Remplacement portes palier — copropriété 24 rue de la Paix',
    date: 'Sat, 07 Jun 2025 10:00:00 +0200',
    messageId: '<syndic-001@syndic-parcimpérial.fr>',
    body: `Bonjour,

L’AG a voté le remplacement de 4 portes palier EI30. Merci de nous envoyer un devis.

Syndic Parc Impérial`,
  },
  {
    from: 'gestion@syndic-parcimpérial.fr',
    fromName: 'Syndic Parc Impérial',
    subject: 'RE: Remplacement portes palier — copropriété 24 rue de la Paix',
    date: 'Mon, 09 Jun 2025 14:20:00 +0200',
    messageId: '<syndic-002@syndic-parcimpérial.fr>',
    inReplyTo: '<syndic-001@syndic-parcimpérial.fr>',
    body: `Bonjour,

Les copropriétaires souhaitent des portes avec judas et serrure 3 points minimum.

Syndic`,
  },
  {
    from: 'gestion@syndic-parcimpérial.fr',
    fromName: 'Syndic Parc Impérial',
    subject: 'RE: Remplacement portes palier — copropriété 24 rue de la Paix',
    date: 'Wed, 11 Jun 2025 09:00:00 +0200',
    messageId: '<syndic-003@syndic-parcimpérial.fr>',
    inReplyTo: '<syndic-002@syndic-parcimpérial.fr>',
    body: `Urgent : fuite d’eau au 4e — une porte est bloquée. Devis express + délai le plus court possible svp.

Syndic Parc Impérial`,
  },

  // ── Newsletter (noise) ────────────────────────────────────────────────────
  {
    from: 'newsletter@fournisseur-industrie.fr',
    fromName: 'Newsletter Industrie',
    subject: 'Votre digest hebdomadaire — normes incendie 2025',
    date: 'Mon, 09 Jun 2025 06:00:00 +0200',
    messageId: '<news-001@fournisseur-industrie.fr>',
    body: `Newsletter automatique — ne pas utiliser pour sélection devis.`,
  },
]

/** Unique contact emails for test contact picker */
export const FIXTURE_CONTACTS = [...new Set(FIXTURE_THREADS.map(m => m.from))].sort()
