# Recette validation Partie 2 — devis.zerux.com

> MAJ 2026-06-19 · Page interactive : [https://devis.zerux.com/validation/](https://devis.zerux.com/validation/)

## Démarrage rapide

1. Se connecter : [https://devis.zerux.com/login](https://devis.zerux.com/login)
2. Ouvrir la page validation (lien avec token pour Armand)
3. Sur chaque ligne : **Lien app** → tester → cocher **Validé** ou **Retour** + commentaire

## Recette automatique (Xavier / CI)

```bash
cd iachat-v2
npm run test:recette-all
```

Couvre : compatibilités perf, matrices équipements, version tree, transport Suisse, PDF Hive, PDF détail.

---

## Jalon A — Équipements & corrections tarifaires

### A1 — Matrices équipements 14 perfs + filtrage onglet tarif

**Lien app :** [Admin → Équipements](https://devis.zerux.com/admin?tab=data&sub=equipements)

**Vérification :**
- Admin → Données métier → Équipements : sélectionner une perf (ex. CR4, EI60).
- Vérifier que la matrice affiche les refs filtrées (pas toutes les perfs mélangées).
- Grille : ouvrir un devis RC4, onglet tarif équipement → options cohérentes avec la perf ligne.

```bash
cd iachat-v2 && npm run test:equipment-matrix && npm run test:equipment-cr4
```

### A2 — CR6+EI60 : pas d'avis de chantier si non obligatoire

**Lien app :** [Grille CR6+EI60](https://devis.zerux.com/devis/grid?prompt=BP+1V+CR6+EI60)

**Vérification :**
- Grille : ligne BP 1V CR6 + EI60 sans combinaison obligeant un avis de chantier si non requis.
- Panneau contrôles statiques : pas d’alerte bloquante abusive.

```bash
cd iachat-v2 && npm run test:performance-compat
```

### A3 — Porte bélier : cumul autres performances

**Lien app :** [Grille anti-bélier](https://devis.zerux.com/devis/grid?prompt=BP+1V+ANTI-BELIER)

**Vérification :**
- Grille : porte anti-bélier + option EI60 / FB4 / 45 dB selon devis pilote Armand.
- Vérifier cumul tarif + alertes avis de chantier (feu + pare-balles).
- Comparer montants avec tarif ANTI-BELIER.md.

### A4 — Anti-bélier bloqué si BP 2 vantaux

**Lien app :** [Grille BP 2V + bélier](https://devis.zerux.com/devis/grid?prompt=BP+2V+ANTI-BELIER)

**Vérification :**
- Grille : BP 2 vantaux + perf anti-bélier → blocage ou alerte explicite.

```bash
cd iachat-v2 && npm run test:performance-compat
```

### A5 — Option joint acoustique

**Lien app :** [Grille joint acoustique](https://devis.zerux.com/devis/grid?prompt=BP+1V+CR4+joint+acoustique)

**Vérification :**
- Grille : saisir « joint acoustique » dans options / autres.
- Vérifier ligne option + montant (provisoire 175 € 1V / 280 € 2V jusqu’à validation tarif).

### A6 — Compatibilités CR / FB / EI

**Lien app :** [Grille compatibilités](https://devis.zerux.com/devis/grid?prompt=BP+1V+CR4+FB4+EI60)

**Vérification :**
- Tester combinaisons CR + FB + EI sur la grille.
- Contrôles statiques CR/FB/EI visibles en bas de grille.

```bash
cd iachat-v2 && npm run test:performance-compat
```

### A7 — Recalcul auto si case équipement vidée

**Lien app :** [Grille chiffrage](https://devis.zerux.com/devis/grid)

**Vérification :**
- Renseigner un équipement (serrure, FP…), puis vider la case.
- Le prix ligne doit se recalculer sans laisser l’ancien montant.

### A8 — Arrondi prix tarif à l'unité (ex. 4476)

**Lien app :** [Grille — ref 4476](https://devis.zerux.com/devis/grid)

**Vérification :**
- Ligne avec plinthe ref 4476 : prix unitaire arrondi (ex. 4476 € pas 4476.32).

### A9 — FB5 → FB6 si perf indispo

**Lien app :** [Grille FB5](https://devis.zerux.com/devis/grid?prompt=BP+1V+FB5)

**Vérification :**
- Si FB5 indisponible pour la gamme : bascule automatique FB6 ou alerte claire.

### A10 — Règle R061 (FP + plinthe) prise en compte IA

**Lien app :** [Grille + règle R061](https://devis.zerux.com/devis/grid)

**Vérification :**
- Règles actives : /rules → chercher R061 (FP TS-5000 + plinthe encastrée).
- Grille : ligne vierge → ferme-porte + plinthe ajoutés par défaut.
- Chat grille : demander une modif sans supprimer FP/plinthe → l’IA ne doit pas les retirer.
- Bouton validation lignes → audit R061 sans violation.

```bash
cd iachat-v2 && npm run test:performance-compat
```

## Jalon B — PDF devis & fiches détail

### B1 — PDF devis ~99 % (The Hive)

**Lien app :** [Stepper → étape PDF](https://devis.zerux.com/devis)

**Vérification :**
- Nouveau devis ou devis test → étape 4 « Préparer PDF ».
- Télécharger PDF et comparer visuellement avec 605.0106 The Hive.pdf.

```bash
cd iachat-v2 && npm run test:hive-pdf /tmp/hive-sample.pdf
```

### B2 — Stepper étape 4 : PDF live à droite

**Lien app :** [Stepper étape 4](https://devis.zerux.com/devis)

**Vérification :**
- Étape 4 : aperçu PDF à droite, libellés mis à jour en direct quand on édite une ligne.

### B3 — Fiches détail : 1/repère, PDF unique

**Lien app :** [Stepper → fiches détail](https://devis.zerux.com/devis)

**Vérification :**
- Étape 4 : générer fiche détail par repère (2V OK).
- Comparer avec PDF Armand ; 1V et châssis fixe bloqués sans F1/F2.

```bash
cd iachat-v2 && npm run test:detail-pdf /tmp/detail-sample.pdf
```

### B4 — Poids admin + report détail PDF

**Lien app :** [Admin → Calcul poids](https://devis.zerux.com/admin?tab=data&sub=weight)

**Vérification :**
- Admin → Calcul poids : profils importés.
- Fiche détail PDF : poids approximatif reporté sur la ligne.

### B5 — Lignes fin : Total HT, remise, TVA, TTC

**Lien app :** [Grille totaux](https://devis.zerux.com/devis/grid)

**Vérification :**
- Grille : section calculs — Total HT, remise, TVA, TTC cohérents.
- PDF devis : mêmes totaux en bas de page.

## Jalon C — Multi-devise & numérotation

### C1 — EUR, CHF (0,9), GBP (0,9), USD (1,2)

**Lien app :** [Admin → Taux de change](https://devis.zerux.com/admin?tab=data&sub=taux-change)

**Vérification :**
- Vérifier EUR, CHF (0,9), GBP (0,9), USD (1,2).
- Grille / devis : changer devise → montants recalculés.

### C2 — Alerte taux 2×/an (janv. / juin)

**Lien app :** [Admin → Taux de change](https://devis.zerux.com/admin?tab=data&sub=taux-change)

**Vérification :**
- Si dernier semestre non validé : bandeau rouge en haut de l’admin.

### C3 — Admin numérotation mensuelle

**Lien app :** [Admin → Numérotation](https://devis.zerux.com/admin?tab=data&sub=numerotation)

**Vérification :**
- Format mensuel configurable, gestion des trous de séquence.
- Nouveau devis → numéro conforme au format admin.

## Jalon D — HubSpot, IMAP, Envoi

### D1 — IMAP : 5 mails + « Pas d'email »

**Lien app :** [Lab IMAP](https://devis.zerux.com/devis/imap-lab)

**Vérification :**
- Lab IMAP : 5 mails seed + option « Pas d’email » sur stepper.

```bash
cd iachat-v2 && npm run test:imap
```

### D2 — Étape Envoi : aperçu, corps, PJ, brouillon

**Lien app :** [Stepper → étape Envoi](https://devis.zerux.com/devis)

**Vérification :**
- Étape 5 Envoi : aperçu mail, corps éditable, PJ devis + fiches.
- Brouillon Outlook réel nécessite MS_GRAPH_* (F4).

```bash
cd iachat-v2 && npm run test:graph-draft
```

### D3 — Contact HubSpot dans l'entreprise

**Lien app :** [Stepper → client](https://devis.zerux.com/devis)

**Vérification :**
- Étape 1 : sélection entreprise HubSpot → contacts de l’entreprise listés.

```bash
cd iachat-v2 && npm run test:hubspot
```

### D4 — Deal auto + [n° devis] - [client]

**Lien app :** [Prospects HubSpot](https://devis.zerux.com/prospects)

**Vérification :**
- Créer / ouvrir devis lié deal HubSpot.
- Titre deal auto : [n° devis] - [client].

```bash
cd iachat-v2 && npm run test:hubspot:crm
```

## Fichiers & infos manquantes

### F1 — Fiche de détail 1 vantail.pdf

**Vérification :**
- Déposer Fiche de détail 1 vantail.pdf dans ressources/ ou confirmer chemin OneDrive.
- Puis retester B3 génération 1V.

### F2 — Modèle PDF fiche châssis fixe

**Vérification :**
- Fournir modèle PDF châssis fixe (mise en page + champs obligatoires).

### F3 — Matrice RC4 Arthur colonne par colonne

**Lien app :** [Admin → Équipements CR4](https://devis.zerux.com/admin?tab=data&sub=equipements)

**Vérification :**
- Arthur valide colonne par colonne la matrice RC4.
- Comparer avec devis pilote 605.xxxx sur la grille.

```bash
cd iachat-v2 && npm run test:equipment-cr4
```

### F4 — Credentials MS_GRAPH_* boîte commerciale

**Lien app :** [Admin (config IT)](https://devis.zerux.com/admin?tab=maintenance)

**Vérification :**
- IT Zerux : renseigner MS_GRAPH_TENANT_ID, CLIENT_ID, CLIENT_SECRET, MAILBOX dans .env.
- Puis retester D2 brouillon Outlook.

```bash
cd iachat-v2 && npm run test:graph-draft
```

---

## Jalons à clôturer en priorité

| Jalon | Action | Lignes |
|-------|--------|--------|
| **C** | Bouton « Valider tout le jalon » sur /validation/ | C1, C2, C3 (100 % dev) |
| **A** | Valider en masse puis traiter A3, A5, A10 | 7 lignes dev fait + 3 ouvertes |

Contact Armand : armand.guilhot@zerux.com
