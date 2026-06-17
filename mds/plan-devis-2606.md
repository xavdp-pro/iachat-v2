# Plan devis.zerux.com — lot 2606 (Armand)

> Source demande : [`new-devis.md`](./new-devis.md)  
> Dossier de référence : `ressources/XLSX/2606/NEW/`  
> Dernière mise à jour : 2026-06-17

---

## Documents de référence dans ce dossier

| Fichier | Rôle |
|---------|------|
| [`new-devis.md`](./new-devis.md) | Cahier des charges fonctionnel (email Armand) |
| `605.0106 - The Hive.pdf` | **Cible visuelle PDF devis** — rendu client attendu (~99 %) |
| `XXX.0000 - Template.indd` | Maquette InDesign source (référence graphique) |
| `Calcul poids.xlsx` | Coefficients kg/m² vantail + kg/m bâti par cumul de performances |
| `Equipements de portes - CR3.xlsx` | Matrice équipements attendue pour Nexus RC3 |
| `Equipements de portes - CR4.xlsx` | Matrice équipements attendue pour Nexus RC4 (exemple pilote Arthur) |
| `Fiche de détail 2 vantaux.pdf` | **Modèle fiche de détail** à produire par repère de devis |

Documents liés hors dossier NEW :
- `ressources/XLSX/*.md` — tarif NEXUS (CR3–CR6, EI, FB, Blast, équipements…)
- `mds/devis-grid-checklist.md` — checklist technique grille
- `iachat-v2/mds/devis-stepper-plan.md` — plan stepper versionné

---

## Objectif global

Passer de **outil utile** à **outil 100 % opérationnel** pour les commerciaux Zerux : PDF client indiscernable de l’existant, fiches détail automatiques, poids/transport fiables, équipements filtrés par performance, envoi email/HubSpot fluide, règles métier (ex. R061) respectées par l’IA.

---

## Jalons proposés (ordre de livraison)

| Jalon | Thème | Priorité |
|-------|--------|----------|
| **J1** | Corrections tarif urgentes + pied de grille (Total HT / TVA / TTC) | 🔴 Critique |
| **J2** | Calcul poids → détail lignes PDF + transport | 🟠 Haute |
| **J3** | Template PDF The Hive + preview live step 4 | 🟠 Haute |
| **J4** | Équipements par performance (CR4 pilote → généralisation) | 🟠 Haute |
| **J5** | Fiches de détail PDF (BP + châssis fixe) | 🟡 Moyenne |
| **J6** | Multi-devise + alertes semestrielles taux | 🟡 Moyenne |
| **J7** | IMAP + étape Envoi (ex-HubSpot) | 🟡 Moyenne |
| **J8** | Numérotation admin + deals HubSpot auto | 🟢 Normale |
| **J9** | Règles IA systématiques (R061 et suivantes) | 🔴 Critique transverse |

---

## Checklist — demandes `new-devis.md`

### 1. Template PDF devis (The Hive)

Référence : `605.0106 - The Hive.pdf`, `XXX.0000 - Template.indd`

- [ ] Auditer écarts entre PDF généré actuel et The Hive (typos, espacements, colonnes, pied de page)
- [ ] Mettre à jour `server/devis-pdf.js` pour coller à ~99 % au modèle client
- [ ] **Stepper étape 4 (pré-PDF)** : conserver panneau gauche (libellés) + **preview PDF live à droite** qui se met à jour avec les textes
- [ ] Valider avec Armand sur 2–3 devis réels (605.xxxx)

### 2. Fiches de détail

Référence : `Fiche de détail 2 vantaux.pdf`

- [ ] Définir le schéma de données par repère (dimensions, perfs, équipements, localisation, notes)
- [ ] Générer **une fiche par repère** du devis, préremplie depuis la grille
- [ ] Assembler toutes les fiches en **un seul PDF** joint au devis
- [ ] Modèle **châssis fixe** (3ᵉ variante — pas encore fournie par Armand)
- [ ] Bouton / option d’inclusion dans l’étape Envoi (PJ email)

### 3. Calcul de poids

Référence : `Calcul poids.xlsx`

- [x] Table `door_weight_profiles` + seed 33 lignes (BP/CF, kg/m², kg/m)
- [x] Admin **Données métier → Calcul poids** (`/admin?tab=data&sub=weight`)
- [x] API `/api/weight-profiles` (CRUD + calculate)
- [x] Calcul poids total devis branché sur **matching transport** (grille)
- [ ] Afficher le **poids estimé par ligne** dans le détail PDF (corps de ligne)
- [ ] Afficher le **poids total devis** dans le PDF (bloc récap ou transport)
- [ ] Gérer formule CF « vitrage × surface −100 mm » avec saisie kg/m² vitrage (admin ou ligne)
- [ ] Recalcul auto poids quand H/L/perfs/quantité changent (sans ressaisir adresse transport)

### 4. Choix des équipements de portes

Références : `Equipements de portes - CR3.xlsx`, `Equipements de portes - CR4.xlsx`

- [ ] Intégrer la matrice Arthur **RC4** comme référence pilote (colonne par colonne grille)
- [ ] Généraliser la logique : onglet tarif = performance de base → équipements autorisés uniquement depuis les pages tarif correspondantes
- [ ] Admin **Données métier → Équipements** (import XLSX, édition, mapping colonne grille)
- [ ] Vérifier menus déroulants grille + stepper après import matrice CR4
- [ ] Étendre CR3 puis autres perfs (EI, FB, Blast…) sur le même modèle

### 5. Pied de grille — Total général HT, Geste commercial, TVA, Total TTC

Référence : onglet « colonnes fin » excel feuille de route

- [ ] **Restaurer** les lignes de fin dans `/devis/grid` et grille stepper (régression signalée par Armand)
- [ ] Lignes : `+ Ligne blanche`, `Total général HT`, `Geste commercial`, `TVA`, `Total TTC`
- [ ] Alignement montants colonne `Total HT` (cf. checklist `3.7k` — marquée faite mais à revalider en prod)
- [ ] Persistance en base par version (`devis_version_lines` section footer)

### 6. Gestion multi-devise

- [ ] Sélection devise devis : **EUR**, **CHF**, **GBP**, **USD**
- [ ] Taux configurables à **1 décimale** (défaut indicatif : CHF 0.9, GBP 0.9, USD 1.2 — à confirmer)
- [ ] TVA par devise (EUR 20 %, CHF 8.1 %, …)
- [ ] Alerte admin **1er janvier** et **1er juin** : bannière rouge tant que taux non validés
- [ ] Écran admin validation / mise à jour des taux
- [ ] Conversion affichée dans grille + PDF

### 7. Intégration IMAP + étape Envoi

- [ ] **Step 1 (client)** : liste des **5 derniers emails** du contact (IMAP), pagination +5
- [ ] Case **« Pas d’email »** si demande hors email
- [ ] Sélection de l’email source (demande client de devis)
- [ ] Renommer step 7 : **« Envoi »** (plus « HubSpot »)
- [ ] Retirer UI actuelle : Document à envoyer / Test note HubSpot / Destination HubSpot (trop technique)
- [ ] **Preview email** client sélectionné
- [ ] Zone édition **corps de réponse**
- [ ] Sélection PJ : devis PDF, fiches détail (+ fiches techniques / brochures plus tard)
- [ ] Bouton **« Préparer brouillon »** : inject PDF HubSpot + **brouillon Outlook en réponse** au mail client (threading)

### 8. Contact client HubSpot

Référence : The Hive PDF (personne demandeur)

- [ ] Permettre de marquer **qui a demandé le devis** parmi les contacts de l’entreprise HubSpot
- [ ] Afficher ce contact sur le PDF / métadonnées devis
- [ ] Lier au flux IMAP (email ↔ contact)

### 9. Numérotation devis (admin)

- [ ] Vue admin : numéros utilisés **par mois** (accordéons)
- [ ] Édition du schéma de numérotation (avant épuisement format `AMM.9999`)
- [ ] Traçabilité des trous / réservations

### 10. Organisation deals HubSpot

- [ ] Création deal stepper → **créer automatiquement le devis** associé
- [ ] Nom affaire par défaut : **`[numéro devis] - [nom client]`** (plus `Nouveau projet - …`)
- [ ] Numéro devis remonte dans le nom de l’affaire HubSpot

---

## Checklist — corrections tarif (bugs Armand)

- [ ] **CR6 + EI60** : ne pas chiffrer avis de chantier si non obligatoire
- [ ] **Anti-bélier + autres perfs** : corriger cumul tarifaire
- [ ] **BP 2V + anti-bélier** : interdire la sélection (hors tarif)
- [ ] Ajouter option **joint acoustique**
- [ ] Vérifier compatibilités **CR / FB / EI** (matrice complète)
- [ ] **Recalcul auto** quand une case équipement est vidée
- [ ] **Arrondir à l’unité** les prix tarif (ex. ref 4476 — centimes Excel vs affichage)
- [ ] Règle **perf inférieure indisponible → chiffrer perf supérieure** (ex. FB5 → FB6, pas vide)
- [ ] **Règle R061** : ferme-porte + plinthe encastrée par défaut — l’IA doit l’appliquer systématiquement
- [ ] Pipeline règles : création/édition admin → injection obligatoire IA (grid-intent, ask, validate-rules)

---

## Checklist — Admin « Données métier » (sous-menus)

| Sous-menu | Source | Statut |
|-----------|--------|--------|
| Calcul poids | `Calcul poids.xlsx` | ✅ Interface + API + transport |
| Tarif NEXUS | `ressources/XLSX/*.md` | ⬜ À faire |
| Équipements | `Equipements de portes - CR*.xlsx` | ⬜ En attente matrice Arthur |
| Thermolaquage | `THERMOLAQUAGE.md` | ⬜ À faire |
| Taux de change | Feuille de route | ⬜ À faire |
| Numérotation | Feuille de route | ⬜ À faire |

---

## Checklist — reprise `devis-grid-checklist.md` (items encore ouverts)

- [ ] **3.8** Styles cellules jaune / gris / bleu
- [ ] **3.9** Freeze 3 premières colonnes + scroll horizontal
- [ ] **3.10–3.11** Formule Total HT ligne + total général (avec change)
- [ ] **Phase 4** Édition cellules jaunes complète + undo
- [ ] **Phase 5** Taux de change (recoupe J6)
- [ ] **Phase 6** Persistance état grille 100 % serveur

---

## Checklist — reprise `devis-stepper-plan.md` (extraits critiques)

- [ ] Persistance grid / PDF / checks **100 % base** (pas localStorage seul)
- [ ] Versionnage arbre complet (branches, comparaison, verrouillage post-envoi)
- [ ] Assistants IA par step (client, versions, analyse, check, envoi)
- [ ] Extraction auto règles depuis Markdown source

---

## Tests de recette avant mise en prod

- [ ] Devis test type The Hive : PDF visuellement conforme
- [ ] 3 lignes produits + transport Suisse : poids + zone + prix cohérents
- [ ] RC4 avec matrice équipements Arthur : aucun équipement hors onglet tarif
- [ ] R061 appliquée sur devis vierge (FP + plinthe)
- [ ] FB5 → monte en FB6 automatiquement
- [ ] Footer Total HT / TVA / TTC présent grille + PDF
- [ ] Parcours IMAP → brouillon Outlook (mock ou compte test)
- [ ] Nouveau deal → numéro devis dans nom affaire HubSpot

---

## Notes / dépendances

- **Arthur** : livraison matrice équipements RC4 (fichier XLSX déjà dans NEW).
- **Armand** : feuille de route Excel (jalons règlements) — ne bloque pas le chiffrage dev.
- **Fiche châssis fixe** : modèle PDF à recevoir.
- Fichier `XXX.0000 - Template.indd` (~11 Mo) : référence design uniquement, ne pas versionner en git.

---

## Liens utiles application

| Interface | URL |
|-----------|-----|
| Admin données — Calcul poids | `/admin?tab=data&sub=weight` |
| Stepper devis | `/devis` |
| Grille chiffrage | `/devis/grid` |
| Tarifs transport | `/devis/transport` |
| Règles métier | `/rules` |
