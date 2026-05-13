# Plan — Stepper Devis NEXUS

> Parcours complet de creation d'un devis NEXUS. Le stepper ne doit pas etre un tunnel lineaire : il doit devenir un poste de pilotage versionne, avec boucle de travail sur chaque version, assistants Gemma 4 contextuels, checks de regles, pre-edition PDF et copie HubSpot tracee apres choix humain de l'affaire.

---

## Vue d'ensemble

```
[Bouton central page] → Stepper
   Step 1: Client & Contexte
  Step 2: Versions du devis (arbre, variantes, commentaires)
  Step 3: Etude IA (analyse + chat) ou depart de zero
  Step 4: Grid devis complet (nouvelle grille editable)
  Step 5: Pre-edition PDF (libelles commerciaux)
  Step 6: Check final + Generation PDF
  Step 7: Choix affaire HubSpot dans Prospect + copie PDF API + archivage
```

Le commercial doit pouvoir boucler sur une version tant qu'elle n'est pas finalisee :

```
Version choisie
  ↓
Grid devis
  ↓
Pre-edition PDF
  ↓
Check regles / assistant Gemma 4
  ↓
PDF brouillon ou final
  ↓
Commentaire + decision
  ↓
Revenir sur la meme version OU creer une nouvelle version / branche
```

---

## Principes transverses — versionnage, regles, IA

### Etat implemente au fil de l'integration

- [x] Page d'accueil `/home` creee comme tableau de bord : Nouveau devis, Recherche devis, Recherche client, Chatbot IA, Experiences chiffrage, Chiffrage rapide.
- [x] Page `/devis/search` ajoutee pour lister les devis chronologiquement avec numero, affaire, client, montant et acces PDF rapide.
- [x] Le nom complet devis/version suit le format `numero.version - Client`, par exemple `605.0104.2.1.1 - Client` pour la version `2.1.1`.
- [x] Les anciens raccourcis techniques de la sidebar sont regroupes dans l'onglet `Modules` de l'administration.
- [x] Table `devis_rules` creee par `ensureDbSchema`.
- [x] API `/api/rules` creee pour lister, creer, modifier, activer, rendre obsolete et supprimer les regles.
- [x] Page `/rules` creee, separee de `/knowledge` et accessible depuis le stepper devis.
- [x] Le check `/api/devis/:id/validate-rules` persiste un rapport par version dans `devis_rule_checks`.
- [x] Le moteur de validation lit les regles actives de `devis_rules` en plus des experiences approuvees historiques.
- [x] L'import XLSX dans la grille lance un controle automatique ligne par ligne via `/api/devis/validate-lines` et affiche uniquement les regles/experiences pertinentes pour chaque row, avec violations/avertissements par reference de regle.
- [x] L'import XLSX et la relance IA utilisent une validation progressive multi-worker : plusieurs lignes sont controlees en parallele, chaque row affiche son etat en cours, puis un bilan final vert/rouge recapitule les regles/experiences appliquees, les lignes validees et les lignes a corriger.
- [x] Le bilan final IA de la grille embedded est rattache a la version via `devis_rule_checks` pour ne pas rester seulement dans le navigateur de l'utilisateur qui a lance le controle.
- [x] Le pre-editeur PDF sauvegarde les libelles dans `devis_version_lines.designation_pdf` pour la version active.
- [x] La pre-edition PDF relance le controle regles + experiences apres generation IA des libelles et avant le telechargement du PDF final.
- [x] La pre-edition PDF affiche les alertes detaillees par ligne avec reference de regle (`R001`, `R002`, etc.), raison et correctif propose.
- [x] Indexer les regles actives dans Qdrant avec un type de payload dedie `devis_rule`.
- [x] API `/api/rules/search` et `/api/rules/reindex` ajoutees pour recherche semantique et reindexation admin.
- [ ] Ajouter extraction automatique de regles depuis les Markdown source.

### Versionnage en arbre

- [ ] Une version de devis est un snapshot complet : entete, lignes grid, reglages, libelles PDF, commentaires, checks, PDF genere, statut HubSpot.
- [ ] Les versions doivent fonctionner en arbre, pas seulement en sequence lineaire : `V1` peut produire `V2`, `V2B`, `V3B`, etc.
- [ ] Chaque version conserve son parent (`parent_version_id`) pour permettre les branches et variantes.
- [ ] Tant qu'une version est en brouillon (`draft`, `editing`, `prepdf`, `checked`), le commercial peut boucler dessus.
- [ ] Une version devient verrouillee apres generation finale ou envoi HubSpot (`pdf_generated`, `sent_hubspot`, `archived`). Toute correction apres envoi cree une nouvelle version ou branche.
- [ ] La barre du stepper doit toujours afficher la version active et proposer : `Commenter`, `Checkpoint`, `Dupliquer`, `Creer branche`, `Comparer`, `Finaliser PDF`.

### Commentaires et checkpoints

- [ ] Un commentaire peut etre laisse a tout moment : entree dans la grid, sauvegarde de checkpoint, pre-edition PDF, check final, generation PDF, envoi HubSpot.
- [ ] Les commentaires sont internes : ils apparaissent dans le versionneur, jamais dans le PDF client.
- [ ] Chaque checkpoint trace : auteur, date, step courant, action, commentaire, total HT, resume des alertes/checks.

### Donnees persistantes en base

- [ ] Aucune donnee importante du grid, du pre-editeur PDF ou du PDF final ne doit rester uniquement en `localStorage`.
- [ ] Le grid doit persister toutes les donnees structurees : lignes, performances, equipements, references, prix, remises, quantites, overrides utilisateur, alertes et sources.
- [ ] Le pre-editeur PDF doit persister les libelles commerciaux multi-lignes par version.
- [ ] Les resultats de checks doivent etre rattaches a la version auditee.

### Assistants Gemma 4 par step

- [ ] Step Client : aide a comprendre l'historique client/deal et les devis precedents.
- [ ] Step Versions : aide a choisir, comparer, nommer ou brancher une version.
- [ ] Step Analyse : aide a lire l'Excel, expliquer les detections et corriger les ambiguïtés.
- [ ] Step Grid : aide technique/tarifaire ligne par ligne, avec contexte complet de la grille.
- [ ] Step Pre-PDF : aide redactionnelle pour les libelles commerciaux, style anciens devis Doortal/Zerux via Qdrant.
- [ ] Step Check/PDF : audit qualite, synthese des risques, preparation de la version finale.
- [ ] Step HubSpot : aide a rediger la note CRM et confirmer ce qui a ete envoye.

### Regles, Knowledge, Experiences

- [ ] Creer une page `Regles`, proche de `/experiences`, pour exposer les regles atomiques qui ne sont pas de simples experiences terrain.
- [ ] Les regles doivent etre filtrables par categorie, source, severite, statut, gamme, tag et fichier markdown source.
- [ ] Les regles peuvent venir des markdowns `ressources/XLSX/*.md`, d'une creation humaine, ou d'une experience promue en regle.
- [ ] Les regles actives doivent etre indexees dans Qdrant et utilisables par Gemma 4.
- [ ] Chaque regle operationnelle doit avoir une reference stable `R001`, `R002`, etc., affichable dans `/rules`, recherchable et reprise dans les prompts de validation.
- [ ] Le check doit combiner : regles humaines actives, experiences approuvees, knowledge markdown, et contexte de la version.
- [ ] La page `/knowledge` reste la vision documentaire ; la page `Regles` devient la vision operationnelle et auditable.

---

## Step 1 — Client & Contexte

> Objectif : identifier le client, voir l'historique, lancer un nouveau devis.

### Fonctionnalites

- [ ] Bouton central sur la page devis qui ouvre le stepper
- [ ] Recherche client (HubSpot) avec autocompletion
- [ ] Affichage des deals lies au client selectionne
- [ ] Liste des devis deja realises pour ce client (historique)
- [ ] Bouton "Nouveau devis" pour partir de zero
- [ ] Si le client n'a aucun deal, bouton de creation rapide du deal HubSpot puis selection automatique du nouveau deal
- [ ] Selection du deal cible (pour association finale de la note)

### UI

- [ ] Barre de recherche client
- [ ] Tableau / liste des deals avec statut
- [ ] Indicateur visuel des devis existants par deal
- [ ] Bouton "Suivant" → Step 2 (Versions du devis)

### Backend / BDD

- [ ] Route GET pour rechercher des clients HubSpot
- [ ] Route GET pour lister les deals d'un client
- [ ] Route POST pour creer un deal HubSpot lie a la societe selectionnee quand aucun deal n'existe
- [ ] Route GET pour lister les devis existants par deal
- [ ] Table `devis` (id, deal_id, client_name, status, created_at, updated_at)

---

## Step 2 — Versions du devis

> Objectif : choisir la version de travail avant d'entrer dans l'analyse ou la grille, et donner au commercial une vision claire des variantes.

### Fonctionnalites

- [ ] Afficher l'arbre des versions du devis pour le deal/client selectionne.
- [ ] Creer un nouveau devis avec `V1` initiale.
- [ ] Ouvrir une version existante.
- [ ] Dupliquer une version en nouvelle version fille.
- [ ] Creer une branche / variante depuis n'importe quelle version.
- [ ] Comparer deux versions : total HT, lignes ajoutees/supprimees, differences de libelles PDF, checks, statut PDF/HubSpot.
- [ ] Ajouter un commentaire avant d'entrer dans la grid ou avant de finaliser une version.
- [ ] Voir rapidement : statut, total HT, auteur, dernier commentaire, dernier check, PDF genere/envoye ou non.

### UI

- [ ] Timeline/arbre des versions avec branches visuelles.
- [ ] Panneau detail version : meta, commentaires, checkpoints, checks, PDF, HubSpot.
- [ ] Actions visibles : `Ouvrir`, `Dupliquer`, `Creer branche`, `Comparer`, `Commenter`, `Archiver`.
- [ ] Badge de verrouillage sur les versions `pdf_generated`, `sent_hubspot`, `archived`.

### Backend / BDD

- [ ] Table `devis_versions` : snapshot complet et meta de version.
- [ ] Table `devis_version_lines` : copie immuable ou editable selon statut de toutes les lignes de la version.
- [ ] Table `devis_version_comments` : commentaires et checkpoints.
- [ ] Routes : lister arbre, creer version, dupliquer, commenter, verrouiller, comparer.

---

## Step 3 — Etude IA (analyse + discussion)

> Objectif : uploader un Excel, analyser via detect_nexus.py, discuter avec Gemma pour valider/ajuster.

### Fonctionnalites

- [x] Upload fichier Excel (.xlsx)
- [x] Analyse automatique via `detect_nexus.py` (route POST /api/devis/analyze)
- [x] Affichage des resultats : cartes repliables par ligne (gamme, dimensions, prix, options, alertes)
- [x] Total general estime
- [x] Chat avec Gemma (route POST /api/devis/ask) — contexte markdowns + experiences
- [x] Suggestions de questions pre-remplies
- [x] Gemma applique la regle de lookup par fourchette (ceiling) pour les prix
- [ ] Gemma peut proposer des corrections sur les resultats d'analyse
- [ ] Le commercial peut valider/refuser chaque suggestion de Gemma
- [ ] Bouton "Valider et passer a l'editeur" → Step 4 (transfere les lignes validees dans la version active)

### UI

- [x] Zone gauche : fichiers + lignes analysees (cartes)
- [x] Zone droite : assistant Gemma + chat
- [ ] Bouton "Valider" par ligne ou global
- [ ] Indicateur de progression (lignes validees / total)
- [ ] Bouton "Suivant" → Step 4

### Backend / BDD

- [x] Route POST /api/devis/analyze (upload + detect_nexus.py)
- [x] Route POST /api/devis/ask (chat Gemma)
- [x] System prompt avec regles de lookup par fourchette
- [ ] Route POST /api/devis/:id/validate — sauvegarde les lignes validees en BDD

---

## Step 4 — Grid devis complet

> Objectif : remplacer l'ancien editeur par la nouvelle grille modifiable, editer ligne par ligne le devis, ajouter/supprimer des lignes, echanger avec Gemma 4 et persister toutes les donnees en base.

### Fonctionnalites

- [ ] Tableau editable avec les colonnes cles :
  - Reference / designation
  - Gamme (BASE, CR3, CR4, CR5, CR6, FB6, EI60, EI120...)
  - Vantail (1V / 2V)
  - Hauteur HT (mm)
  - Largeur HT (mm)
  - Prix de base HT
  - Options (liste avec prix)
  - Serrure (ref + prix)
  - Ferme-porte (ref + prix)
  - Colonnes dédiées par équipement : serrure, garnitures, vitrage, ferme-porte, crémone, autres équipements
  - Les équipements structurés doivent afficher référence et prix dans leur colonne dédiée et ne doivent jamais être rendus en sous-lignes "Options supplémentaires"
  - Acoustique 30/35/40/45 dB affichée dans les performances, jamais dans la colonne vitrage
  - Anti-explosion : le select Blast doit refléter la perf même si la valeur source n'est pas au format exact (normalisation vers 2t/m², 4t/m², 5t/m²)
  - Colonnes finales produit dans cet ordre : PU HT, Remise, Q., Total HT
  - Les options ou alertes produit de calcul (`Avis de chantier`, `Note de calcul explosion`) sont mutualisées en une ligne par type (pas de doublons, pas de ligne à 0 €)
  - Dimensions hors tarif : alerte dédiée et prix de base vide, sauf expérience approuvée `Validations individuelles R&D` prioritaire sur le tarif
  - Total ligne HT
- [ ] Bouton **+** pour ajouter une nouvelle ligne vide
- [ ] Bouton **supprimer** (icone poubelle) par ligne
- [ ] Edition inline des champs (clic pour editer)
- [ ] Calcul automatique du total par ligne et du total general
- [ ] Persistance en BDD a chaque modification (auto-save ou bouton) dans la version active.
- [ ] Chat Gemma accessible — Gemma a acces au contenu de l'editeur via la BDD
- [ ] Gemma peut suggerer des modifications / alerter sur des incoherences
- [ ] Bouton "Checkpoint" avec commentaire interne.
- [ ] Bouton "Suivant" → Step 5 (pre-edition PDF)

### UI

- [ ] Zone gauche : tableau editeur (scroll horizontal si beaucoup de colonnes)
- [ ] Zone droite : chat Gemma (conserve)
- [ ] Ligne de total en pied de tableau
- [ ] Drag & drop pour reordonner les lignes (optionnel)
- [ ] Validation visuelle (bordure rouge si champ manquant/incoherent)

### Backend / BDD

- [ ] Table `devis_lines` :
  - id, devis_id, position, designation, gamme, vantail
  - hauteur_mm, largeur_mm, prix_base_ht, ref_base (référence module catalogue, ex: 3100.02)
  - options_json, serrure_ref, serrure_prix
  - ferme_porte_ref, ferme_porte_prix
  - equipements_json, total_ligne_ht
  - created_at, updated_at
- [ ] Route GET /api/devis/:id/lines — lister les lignes
- [ ] Route POST /api/devis/:id/lines — ajouter une ligne
- [ ] Route PUT /api/devis/:id/lines/:lineId — modifier une ligne
- [ ] Route DELETE /api/devis/:id/lines/:lineId — supprimer une ligne
- [ ] Route POST /api/devis/ask enrichi : Gemma peut lire les lignes en BDD

### Tarification — markdowns métier ↔ code

- Les tableaux catalogue NEXUS (bloc-porte par gamme / vantail) sont portés dans **Python** : `../../ressources/XLSX/detect_nexus.py` (`TABLES`, `CATALOG_LIMITS`). La même information est aussi publiée en **Markdown** dans `../../ressources/XLSX/*.md` (CR3.md, FB6-7.md, GUIDE-DEVIS.md, …) pour la doc métier et l’assistant IA (`POST /api/devis/ask` charge ces fichiers).
- **`../knowledge_tables.json`** (à la racine du projet `iachat-v2/`) : export structuré (grilles, options) utilisé par l’API (`GET /api/devis/types-options`) et aligné sur le même référentiel ; toute évolution du classeur tarif doit d’abord mettre à jour `detect_nexus.py`, puis régénérer ce JSON si nécessaire.
- **Hors grille** (`POST /api/devis/recompute-row`) : l’alerte indique désormais clairement quelle borne l’écarter (min/max H ou L par rapport au tableau).
- **BP 2 V avec largeur &lt; pas minimum du tableau 2 V** : le moteur retombe sur la **grille 1 V** (convention catalogue `tariff_floor_lookup`), avec une alerte explicite quand une ligne « BP 2 V » est ainsi tarifée en 1 V.

---

## Step 5 — Pre-edition PDF

> Objectif : retravailler les libelles commerciaux multi-lignes avant generation PDF, sans melanger cette redaction avec les donnees techniques de la grid.

### Fonctionnalites

- [ ] Editeur de libelles PDF par ligne (textarea multi-lignes).
- [ ] Ligne 1 = titre commercial ; lignes suivantes = corps de designation PDF.
- [ ] Suggestion IA via Qdrant a partir des anciens devis Doortal/Zerux.
- [ ] Les exemples Qdrant proviennent des 161 PDFs `ressources/Bulk` et doivent rester nettoyes : pas de pied de page, pas de note type `SUITE PAGE SUIVANTE`, pas de prix/delai/montant.
- [ ] Style attendu : titre en majuscules avec `"NEXUS"`, performances feu (`Performances coupe-feu EI² XX minutes recto/verso`, avec `sur avis de chantier` seulement si explicite), CR selon EN 1627-1630, FB majoritairement en `Performances pare-balle FBX selon norme EN 1522` sauf attestation explicite, dimensions, poids/finition uniquement si explicites, bloc `Equipement fourni-posé :` avec items `-`, puis `Localisation` si connue.
- [ ] Gemma ne doit pas inventer Uw, poids, hors-tout, reservation ou equipement depuis les exemples historiques ; ces valeurs doivent etre presentes dans la ligne cible.
- [ ] Suggestion globale de tous les libelles PDF.
- [ ] Sauvegarde en base dans la version active, pas uniquement en localStorage.
- [ ] Commentaire/checkpoint possible avant passage au check final.
- [ ] Apercu PDF web ou markdown proche du rendu final.

### UI

- [ ] Colonne gauche : cartes/textarea par ligne.
- [ ] Colonne droite : preview PDF ou preview web fidele.
- [ ] Boutons : `Suggestion IA`, `Suggestion globale`, `Enregistrer`, `Checkpoint`, `Retour grid`, `Check final`.

### Backend / BDD

- [ ] Stocker les libelles PDF dans `devis_version_lines.designation_pdf` ou champ equivalent.
- [ ] Route de suggestion IA enrichie avec contexte version + lignes voisines.
- [ ] Historiser les changements importants via commentaires/checkpoints.

---

## Step 6/7 — Check final, Generation PDF & HubSpot

> Objectif : auditer la version, generer le PDF final, le stocker, puis laisser l'utilisateur humain choisir l'affaire en cours dans la fiche prospect avant de copier/attacher le PDF via l'API HubSpot. Une version envoyee est verrouillee.

> En environnement de test HubSpot, seuls les prospects `Client_IA_1` et `Client_IA_2` peuvent etre utilises. Ne pas creer, modifier, copier de PDF ou attacher de note sur d'autres clients HubSpot pendant les tests.

### Fonctionnalites

- [ ] Apercu du devis avant generation (preview)
- [ ] Check final avec regles actives, experiences approuvees et knowledge markdown.
- [ ] Rapport de check persiste sur la version.
- [ ] Generation PDF (serveur) avec mise en page professionnelle
- [ ] Telechargement du PDF
- [ ] Redirection vers le prospect pour choix humain de l'affaire HubSpot en cours.
- [ ] Creation d'une note dans l'affaire HubSpot choisie explicitement par l'utilisateur.
- [ ] Attachement/copie du PDF a la note HubSpot via API.
- [ ] Mise a jour du statut de version en BDD (brouillon → checke → pdf_genere → envoye)
- [ ] Verrouillage de la version apres PDF final/envoye ; correction ulterieure via nouvelle version/branche.

### UI

- [ ] Apercu PDF integre (iframe ou viewer)
- [ ] Synthese des checks : bloquants, avertissements, OK, sources.
- [ ] Bouton "Generer le PDF"
- [ ] Bouton "Choisir l'affaire HubSpot" qui ouvre le prospect avec le devis/version en contexte.
- [ ] Confirmation de l'affaire cible avant copie API.
- [ ] Confirmation de succes avec lien vers l'affaire HubSpot
- [ ] Bouton "Retour a l'editeur" si corrections necessaires

### Backend / BDD

- [ ] Route POST /api/devis/:id/pdf — generer le PDF
- [ ] Route POST /api/devis/:id/hubspot — recoit le `deal_id` choisi dans Prospect, cree la note et attache/copier le PDF via API HubSpot
- [ ] Stockage du PDF dans /apps/zeruxcom-v1/sav/devis/ (hors git)
- [ ] Mise a jour version : status, pdf_path, hubspot_note_id, hubspot_file_id si disponible
- [ ] Table de rapports de checks rattachee a la version.

---

## Schema BDD

```sql
-- Table devis (en-tete)
CREATE TABLE devis (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  deal_id       VARCHAR(50),          -- HubSpot deal ID
  client_name   VARCHAR(255),
  status        ENUM('draft','validated','generated','sent') DEFAULT 'draft',
  source_file   VARCHAR(255),         -- nom du fichier Excel source
  total_ht      DECIMAL(12,2),
  pdf_path      VARCHAR(500),
  hubspot_note_id VARCHAR(50),
  created_by    INT,                  -- user ID
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Table devis_lines (lignes du devis)
CREATE TABLE devis_lines (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  devis_id      INT NOT NULL,
  position      INT DEFAULT 0,
  designation   VARCHAR(500),
  gamme         VARCHAR(50),          -- BASE, CR3, CR4, CR5, CR6, FB6, EI60, EI120...
  vantail       VARCHAR(5),           -- 1V, 2V
  hauteur_mm    INT,
  largeur_mm    INT,
  prix_base_ht  DECIMAL(12,2),
  ref_base      VARCHAR(50),         -- référence module catalogue (ex: 3100.02, 4742.10)
  options_json  JSON,                 -- [{label, prix, note}]
  serrure_ref   VARCHAR(255),
  serrure_prix  DECIMAL(12,2),
  ferme_porte_ref   VARCHAR(255),
  ferme_porte_prix  DECIMAL(12,2),
  equipements_json  JSON,             -- [{label, ref, prix}]
  total_ligne_ht    DECIMAL(12,2),
  alertes_json  JSON,                 -- ["alerte 1", "alerte 2"]
  docs_json     JSON,                 -- ["CR4.md", "EI60.md"]
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE
);
```

### Extensions BDD cible — versions, commentaires, regles

```sql
CREATE TABLE devis_versions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  devis_id          INT NOT NULL,
  parent_version_id INT DEFAULT NULL,
  version_label     VARCHAR(50) NOT NULL, -- V1, V2, V2B...
  branch_label      VARCHAR(100) DEFAULT NULL,
  status            ENUM('draft','editing','prepdf','checked','pdf_generated','sent_hubspot','archived') DEFAULT 'draft',
  snapshot_json     JSON DEFAULT NULL,
  total_ht          DECIMAL(12,2) DEFAULT NULL,
  pdf_path          VARCHAR(500) DEFAULT NULL,
  hubspot_note_id   VARCHAR(50) DEFAULT NULL,
  hubspot_file_id   VARCHAR(50) DEFAULT NULL,
  locked_at         DATETIME DEFAULT NULL,
  created_by        INT DEFAULT NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE devis_version_lines (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  version_id        INT NOT NULL,
  source_line_id    INT DEFAULT NULL,
  position          INT NOT NULL DEFAULT 0,
  line_section      ENUM('products','calculations','transport') DEFAULT 'products',
  grid_json         JSON NOT NULL,
  designation_pdf   TEXT DEFAULT NULL,
  total_ligne_ht    DECIMAL(12,2) DEFAULT NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE devis_version_comments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  version_id  INT NOT NULL,
  step_key    VARCHAR(50) DEFAULT NULL,
  kind        ENUM('comment','checkpoint','check','pdf','hubspot') DEFAULT 'comment',
  content     TEXT NOT NULL,
  meta_json   JSON DEFAULT NULL,
  created_by  INT DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE devis_rules (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(255) NOT NULL,
  content        TEXT NOT NULL,
  category       VARCHAR(100) DEFAULT NULL,
  severity       ENUM('info','warning','blocking') DEFAULT 'warning',
  source_type    ENUM('markdown','human','experience','pdf','xlsx') DEFAULT 'human',
  source_ref     VARCHAR(255) DEFAULT NULL,
  tags_json      JSON DEFAULT NULL,
  status         ENUM('draft','active','obsolete') DEFAULT 'draft',
  qdrant_id      VARCHAR(128) DEFAULT NULL,
  created_by     INT DEFAULT NULL,
  approved_by    INT DEFAULT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE devis_rule_checks (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  version_id     INT NOT NULL,
  report_json    JSON NOT NULL,
  summary_json   JSON DEFAULT NULL,
  created_by     INT DEFAULT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Ordre d'implementation recommande

1. **BDD versionnage** : ajouter `devis_versions`, commentaires/checkpoints, checks, regles.
2. **Step 1** : UI recherche client + selection deal.
3. **Step 2 Versions** : arbre de versions, duplication, branche, ouverture, commentaire.
4. **Step 3 Analyse** : import Excel ou depart de zero vers la version active.
5. **Step 4 Grid** : integrer la nouvelle grille comme editeur principal, avec persistance versionnee.
6. **Step 5 Pre-PDF** : editeur de libelles PDF persistant + suggestion Qdrant.
7. **Step 6 Check/PDF** : check regles + generation PDF stockee.
8. **Step 7 HubSpot** : choix humain de l'affaire dans Prospect, note CRM + copie PDF API + verrouillage version.
9. **Page Regles** : extraire/gerer les regles atomiques, filtres humains, index Qdrant.
10. **Transversal** : assistants Gemma 4 specialises par step avec contexte de version.
