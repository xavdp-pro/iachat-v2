# Plan — Stepper Devis NEXUS

> Parcours complet de creation d'un devis, en 4 etapes (stepper), avec assistant IA Gemma.

---

## Vue d'ensemble

```
[Bouton central page] → Stepper
   Step 1: Client & Contexte
   Step 2: Etude IA (analyse + chat)
   Step 3: Editeur de lignes de devis
   Step 4: Generation PDF + HubSpot
```

---

## Step 1 — Client & Contexte

> Objectif : identifier le client, voir l'historique, lancer un nouveau devis.

### Fonctionnalites

- [ ] Bouton central sur la page devis qui ouvre le stepper
- [ ] Recherche client (HubSpot) avec autocompletion
- [ ] Affichage des deals lies au client selectionne
- [ ] Liste des devis deja realises pour ce client (historique)
- [ ] Bouton "Nouveau devis" pour partir de zero
- [ ] Selection du deal cible (pour association finale de la note)

### UI

- [ ] Barre de recherche client
- [ ] Tableau / liste des deals avec statut
- [ ] Indicateur visuel des devis existants par deal
- [ ] Bouton "Suivant" → Step 2

### Backend / BDD

- [ ] Route GET pour rechercher des clients HubSpot
- [ ] Route GET pour lister les deals d'un client
- [ ] Route GET pour lister les devis existants par deal
- [ ] Table `devis` (id, deal_id, client_name, status, created_at, updated_at)

---

## Step 2 — Etude IA (analyse + discussion)

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
- [ ] Bouton "Valider et passer a l'editeur" → Step 3 (transfere les lignes validees)

### UI

- [x] Zone gauche : fichiers + lignes analysees (cartes)
- [x] Zone droite : assistant Gemma + chat
- [ ] Bouton "Valider" par ligne ou global
- [ ] Indicateur de progression (lignes validees / total)
- [ ] Bouton "Suivant" → Step 3

### Backend / BDD

- [x] Route POST /api/devis/analyze (upload + detect_nexus.py)
- [x] Route POST /api/devis/ask (chat Gemma)
- [x] System prompt avec regles de lookup par fourchette
- [ ] Route POST /api/devis/:id/validate — sauvegarde les lignes validees en BDD

---

## Step 3 — Editeur de lignes de devis

> Objectif : editer ligne par ligne le devis, ajouter/supprimer des lignes, echanger avec Gemma.

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
  - Equipements supplementaires
  - Total ligne HT
- [ ] Bouton **+** pour ajouter une nouvelle ligne vide
- [ ] Bouton **supprimer** (icone poubelle) par ligne
- [ ] Edition inline des champs (clic pour editer)
- [ ] Calcul automatique du total par ligne et du total general
- [ ] Persistance en BDD a chaque modification (auto-save ou bouton)
- [ ] Chat Gemma accessible — Gemma a acces au contenu de l'editeur via la BDD
- [ ] Gemma peut suggerer des modifications / alerter sur des incoherences
- [ ] Bouton "Suivant" → Step 4

### UI

- [ ] Zone gauche : tableau editeur (scroll horizontal si beaucoup de colonnes)
- [ ] Zone droite : chat Gemma (conserve)
- [ ] Ligne de total en pied de tableau
- [ ] Drag & drop pour reordonner les lignes (optionnel)
- [ ] Validation visuelle (bordure rouge si champ manquant/incoherent)

### Backend / BDD

- [ ] Table `devis_lines` :
  - id, devis_id, position, designation, gamme, vantail
  - hauteur_mm, largeur_mm, prix_base_ht
  - options_json, serrure_ref, serrure_prix
  - ferme_porte_ref, ferme_porte_prix
  - equipements_json, total_ligne_ht
  - created_at, updated_at
- [ ] Route GET /api/devis/:id/lines — lister les lignes
- [ ] Route POST /api/devis/:id/lines — ajouter une ligne
- [ ] Route PUT /api/devis/:id/lines/:lineId — modifier une ligne
- [ ] Route DELETE /api/devis/:id/lines/:lineId — supprimer une ligne
- [ ] Route POST /api/devis/ask enrichi : Gemma peut lire les lignes en BDD

---

## Step 4 — Generation PDF & HubSpot

> Objectif : generer le devis PDF final et l'associer au deal HubSpot.

### Fonctionnalites

- [ ] Apercu du devis avant generation (preview)
- [ ] Generation PDF (serveur) avec mise en page professionnelle
- [ ] Telechargement du PDF
- [ ] Creation d'une note dans le deal HubSpot selectionne (Step 1)
- [ ] Attachement du PDF a la note HubSpot
- [ ] Mise a jour du statut du devis en BDD (brouillon → genere → envoye)

### UI

- [ ] Apercu PDF integre (iframe ou viewer)
- [ ] Bouton "Generer le PDF"
- [ ] Bouton "Envoyer dans HubSpot" (cree la note + attache le PDF)
- [ ] Confirmation de succes avec lien vers le deal
- [ ] Bouton "Retour a l'editeur" si corrections necessaires

### Backend / BDD

- [ ] Route POST /api/devis/:id/pdf — generer le PDF
- [ ] Route POST /api/devis/:id/hubspot — creer la note + attacher le PDF
- [ ] Stockage du PDF dans /apps/zeruxcom-v1/sav/devis/ (hors git)
- [ ] Mise a jour table `devis` : status, pdf_path, hubspot_note_id

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

---

## Ordre d'implementation recommande

1. **BDD** : creer les tables `devis` et `devis_lines`
2. **Step 1** : UI recherche client + selection deal
3. **Step 2** : adapter la zone existante dans le stepper + bouton validation
4. **Step 3** : editeur de lignes (coeur du travail)
5. **Step 4** : generation PDF + integration HubSpot
6. **Transversal** : enrichir Gemma pour qu'il lise/modifie les lignes en BDD
