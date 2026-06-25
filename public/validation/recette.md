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

**Lien app :** [Grille CR6 — équipements](https://devis.zerux.com/devis/grid?prompt=BP+1V+CR6)

**Vérification :**
- CR6 judas : menu propose 4450, 4452, 4455, 4456 (pas les oculus vitrage).
- CR5 vitrage : menu propose les oculus CR5 (4516, 4517, 4518, 4521, 4616, 4617, 4621, 4666, 4667, 4671).
- CR4 vitrage : menu propose les oculus CR4 (4511, 4513, 4611, 4661, 4601) — pas mélangés avec CR5.
- CR5 judas : 4455 et 4456 uniquement (séparés du vitrage).
- Trappes CR3-CR5 : 4702 à 1 361 € HT, 4705 à 575 € HT.
- Passe-câble : ref 3998VHB dans la colonne contact / passe-câble.
- Plinthe 2V : quantité ×2 sur refs 4470/4472/4474/4476 au recalcul.
- Garniture int. 4024…4219 : recopiée auto sur garniture ext. si vide.
- Éditer plinthe puis judas : les deux valeurs restent (plus de miroir vitrage).

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
- Anti-bélier seul + EI60 : gamme ANTI-BÉLIER + option EI60 (+1 200 €) — sans avis ni note de calcul.
- Anti-bélier + FB4 : option FB4 (+1 100 €) ; si feu cumulé → avis de chantier.
- CR4 + bélier + EI60 : tarif sur gamme CR4 + options feu (pas table anti-bélier seule).
- FB7 + EI60 sur anti-bélier : alerte incompatible.

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

**Lien app :** [Comparaison face à face (référence vs généré)](https://devis.zerux.com/preview/index.html)

**Vérification :**
- Ouvrir la comparaison côte à côte (lien ci-dessus) : référence Armand à gauche, PDF généré à droite.
- Vérifier en-tête : logo + livraison ligne 1, barres Devis n° / Facturation alignées ligne 2, liserets verticaux fixes.
- Vérifier tableau : colonnes séparées par traits gris fins (pas épais), fond blanc sur les lignes, position alignée avec l’original.
- Totaux CHF : Total HT, TVA déductible 8,1 %, Total TTC sur bandeau foncé ; filler bas de page sur dernière section.

```bash
cd iachat-v2 && npm run test:hive-pdf
```

### B2 — Stepper étape 4 : PDF live à droite

**Lien app :** [Stepper étape 4](https://devis.zerux.com/devis)

**Vérification :**
- Étape 4 : aperçu PDF à droite, libellés mis à jour en direct quand on édite une ligne.

### B3 — Fiches détail : 1/repère, PDF unique

**Lien app :** [Page validation — échantillon PDF](https://devis.zerux.com/validation)

**Vérification :**
- Télécharger le PDF échantillon (lien ci-dessus) — sans parcourir tout le stepper.
- Repère A = 1 vantail CR4 · Repère B = 2 vantaux CR3.
- Comparer mise en page, schémas sens d'ouverture, seuil, poids, avec vos modèles.
- Châssis fixe : modèle provisoire uniquement (F2 en attente).

```bash
cd iachat-v2 && npm run test:detail-pdf
```

### B4 — Poids admin + report détail PDF

**Lien app :** [Admin → Calcul poids](https://devis.zerux.com/admin?tab=data&sub=weight)

**Vérification :**
- Admin → Calcul poids : profils importés.
- Générer un PDF devis : ligne produit avec « Poids approximatif - Vantail nu : … kg - Bâti : … kg » (ou 2 vantaux : service + semi-fixe + bâti).
- Fiche détail PDF : même libellé poids sur la carte Produit.

### B5 — Lignes fin : Total HT, remise, TVA, TTC

**Lien app :** [Grille totaux](https://devis.zerux.com/devis/grid)

**Vérification :**
- Bas de grille : Total HT, geste commercial (€ HT ou %), TVA, TTC — cohérents avec le PDF devis.
- Colonne Actions (mode édition) : une seule icône poubelle par ligne — plus d’icônes IA / réanalyser / reset / règle R&D.
- Zoom ou scroll horizontal : la poubelle reste visible (colonne fixée à droite).
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

### D1 — Mail client : conversations CRM + « Pas d'email »

**Lien app :** [Stepper → étape Client (recette FGS)](https://devis.zerux.com/devis)

**Vérification :**
- Étape 1 : entreprise FGS → contact Florent Renaud.
- Bloc « Conversations email » : les 5 emails les plus récents reçus du contact, sans badge « demande probable ».
- Bouton « + 5 emails plus anciens » pour charger la suite.
- Cliquer un email → toast « Email source enregistré ».
- Cocher « Pas d’email » → bloc masqué.

```bash
cd iachat-v2 && npm run test:mail-validation
```

### D2 — Étape Envoi : conversation, corps, PJ, brouillon Outlook

**Lien app :** [Stepper → étape 5 Envoi](https://devis.zerux.com/devis)

**Vérification :**
- Parcours : Client FGS → grille → PDF → bouton « Envoyer vers HubSpot → ».
- Étape 5 : conversation client visible, choisir le mail source si besoin.
- Rédiger le corps, cocher PJ devis + fiches, cliquer **Préparer brouillon**.
- Vérifier : PDF sur deal HubSpot + brouillon Outlook **en réponse** au fil client (pas un mail neuf).
- Un brouillon test (PDF 605.0103-test) existe déjà sur le fil FGS — contrôler dans Outlook Brouillons.

```bash
cd iachat-v2 && npm run test:mail-validation && npm run test:graph-draft -- --dry-run
```

### D3 — Contact HubSpot demandeur + lien email

**Lien app :** [Stepper → contact demandeur](https://devis.zerux.com/devis)

**Vérification :**
- Étape 1 : liste déroulante **Contact demandeur (HubSpot)** sur l’entreprise sélectionnée.
- Le contact choisi détermine l’email des conversations (ex. f.renaud@fgs-security.ch).

```bash
cd iachat-v2 && npm run test:hubspot
```

### D4 — Deal auto + [n° devis] - [client]

**Lien app :** [Stepper → deal FGS 605.0103](https://devis.zerux.com/devis)

**Vérification :**
- Créer ou ouvrir un devis sur le deal **605.0103 Nexus RC4** (entreprise FGS).
- Créer un nouveau deal : le libellé HubSpot doit être **`605.xxxx - [client]`** dès la création (plus « Nouveau projet »).
- Un devis est créé automatiquement dans le deal avec le numéro attribué.

```bash
cd iachat-v2 && npm run test:hubspot:crm
```

## Fichiers & infos manquantes

### F1 — Fiche de détail 1 vantail.pdf

**Vérification :**
- Repère A = modèle officiel `Fiche de détail 1 vantail.pdf` (PJ mail 10/06) — champs formulaire uniquement.
- Repère B = 2 vantaux CR3 — comparer sens, seuil, dimensions avec votre modèle.

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

### F4 — Credentials MS_GRAPH_* (Entra ID ZERUX)

**Lien app :** [Lab Mail Graph (admin)](https://devis.zerux.com/devis/imap-lab)

**Vérification :**
- MS_GRAPH_* configuré (Entra ID application ZERUX).
- Boîtes commerciales : armand.guilhot@zerux.com et arthur.milz@zerux.com.
- Application en lecture seule — seul « Préparer brouillon » crée un brouillon modifiable dans Outlook.

```bash
cd iachat-v2 && npm run test:mail-validation
```

---

## Jalons à clôturer en priorité

| Jalon | Action | Lignes |
|-------|--------|--------|
| **C** | Bouton « Valider tout le jalon » sur /validation/ | C1, C2, C3 (100 % dev) |
| **A** | Valider en masse puis traiter A3, A5, A10 | 7 lignes dev fait + 3 ouvertes |

Contact Armand : armand.guilhot@zerux.com
