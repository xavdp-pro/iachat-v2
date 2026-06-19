import '../server/env.js'
import db from '../server/db/index.js'
import { storeDevisRule } from '../server/services/memory.js'

const IMPORT_TAG = 'nexus-audit-2026-05'

const rules = [
  {
    title: 'Prix de base sans serrure ni équipement',
    content: 'Pour toutes les gammes NEXUS, le prix de base doit être considéré comme finition acier galvanisé, sans serrure, sans garniture et sans équipement, sauf mention contraire explicite. Les serrures, garnitures, ferme-portes, crémones, oculus, plinthes, CEM et autres accessoires doivent être ajoutés séparément.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'markdown', source_ref: 'GUIDE-DEVIS.md:5 + BASE/CR/EI/FB fiches', tags: ['base', 'equipement'],
  },
  {
    title: 'Bloc-porte : sélection tarifaire au plancher',
    content: 'Pour un bloc-porte, sélectionner le plus grand seuil tarifaire inférieur ou égal aux dimensions demandées. Ne pas utiliser la convention plafond des châssis pour les portes.',
    category: 'Dimensions', severity: 'blocking', source_type: 'markdown', source_ref: 'GUIDE-DEVIS.md:83-93', tags: ['dimensions', 'floor'],
  },
  {
    title: 'Châssis : sélection tarifaire au plafond',
    content: 'Pour un châssis vitré, sélectionner le plus petit seuil tarifaire supérieur ou égal à la cote demandée afin que le module couvre l’ouverture. Ne pas appliquer la convention plancher des bloc-portes aux châssis.',
    category: 'Dimensions', severity: 'blocking', source_type: 'markdown', source_ref: 'CHASSIS.md:28-35 + GUIDE-DEVIS.md:89-91', tags: ['chassis', 'dimensions', 'ceiling'],
  },
  {
    title: 'Dépassement catalogue : ne jamais reprendre la dernière référence',
    content: 'Si la hauteur ou la largeur demandée dépasse le maximum de la table tarifaire applicable, laisser le prix de base vide et signaler hors tarif / validation R&D ou nous consulter. Ne jamais reprendre automatiquement la dernière référence tarifaire disponible.',
    category: 'Dimensions', severity: 'blocking', source_type: 'markdown', source_ref: 'GUIDE-DEVIS.md:141-146 + TABLEAUX-ADDITIONNELS.md:8-14', tags: ['hors-catalogue', 'validation-rd'],
  },
  {
    title: 'Validation R&D individuelle prioritaire seulement si exacte',
    content: 'Une validation individuelle R&D approuvée prime sur le tarif standard uniquement si elle correspond exactement à la gamme, au nombre de vantaux, aux dimensions et aux performances de la ligne. Dans ce cas, afficher la référence validation individuelle n°XX et le prix de l’expérience.',
    category: 'Validations individuelles R&D', severity: 'blocking', source_type: 'markdown', source_ref: 'GUIDE-DEVIS.md:145-146 + CR6.md:21', tags: ['validation-rd'],
  },
  {
    title: 'Avis de chantier mutualisé une seule fois',
    content: 'Un avis de chantier déclenché par dimensions hors zone ou option feu doit générer une seule ligne globale dans la section Calculs du devis, jamais une ligne par produit ni une ligne supplémentaire à 0 €. Tarif non remisable : <5 BP = 3 700 €, 5 à 25 BP = 6 200 €, >25 BP = 8 200 €.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'markdown', source_ref: 'SERRURES-GARNITURES.md:77-80 + EI60.md:96-103 + EI120.md:11-18', tags: ['avis-chantier', 'mutualisation'],
  },
  {
    title: 'Avis de chantier dimension hors zone uniquement pour performance EI',
    content: 'Un dépassement de dimension catalogue ne doit déclencher un avis de chantier que si la ligne comporte une performance coupe-feu EI30, EI60, EI90 ou EI120. Une porte sans performance EI ne doit pas recevoir automatiquement un avis de chantier pour simple dépassement.',
    category: 'Feu', severity: 'blocking', source_type: 'markdown', source_ref: 'GUIDE-DEVIS.md:143-144', tags: ['avis-chantier', 'feu'],
  },
  {
    title: 'Équipements structurés : pas de doublon en options',
    content: 'Les équipements structurés doivent rester dans leurs colonnes dédiées : serrure, garniture, vitrage, ferme-porte, crémone, oculus et autres équipements. Ils ne doivent pas être répétés comme sous-lignes d’options supplémentaires.',
    category: 'Règle métier', severity: 'warning', source_type: 'markdown', source_ref: 'GUIDE-DEVIS.md:133-137', tags: ['grid', 'equipement'],
  },
  {
    title: 'Référence serrure explicite prioritaire',
    content: 'Si la cellule Serrure contient une référence tarif précise, cette référence prime sur le mot-clé générique et sur la serrure par défaut de la gamme.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'SERRURES-GARNITURES.md:57-60', tags: ['serrure'],
  },
  {
    title: 'Serrure et garnitures par défaut selon gamme',
    content: 'Si aucune serrure ou garniture n’est explicitement demandée, compléter selon la table par défaut : BASE 3301/4024, CR3 4070/4026, CR4 4120/4181/4032, CR5 4150/4181/extérieurs inclus, CR6 4172/4181/extérieurs inclus, FB 4070/4026, EI60/EI120 4074/4024, Blast 4132/4181/4032, Anti-bélier/Prison 4304/4030, EF2 4150/4181/4032.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'SERRURES-GARNITURES.md:9-22', tags: ['serrure', 'garniture', 'defaut'],
  },
  {
    title: 'Ferme-porte : la cellule Excel fait foi',
    content: 'Ne pas ajouter automatiquement de ferme-porte si la cellule Excel est vide. Ajouter un TS-4000 bras compas argent réf. 3640 si la cellule contient Oui, X ou équivalent ; utiliser la référence correspondante si un type explicite est demandé.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'SERRURES-GARNITURES.md:68-75', tags: ['ferme-porte'],
  },
  {
    title: 'Portes 2 vantaux : crémone séparée selon sortie libre',
    content: 'Sur une porte 2 vantaux, ne pas convertir automatiquement 4070 en 4072. La serrure du vantail de service reste celle demandée ou par défaut, et la crémone du semi-fixe est ajoutée séparément : 4402 si serrure sans sortie libre, 4401 si serrure avec sortie libre ou Blast.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'SERRURES-GARNITURES.md:59-60', tags: ['2V', 'cremone', 'serrure'],
  },
  {
    title: 'Acoustique : performance, pas vitrage',
    content: 'Une demande acoustique 30/35/40/45 dB doit être affichée comme performance et ne doit pas être répétée dans le vitrage. Elle est détectée depuis la demande et appliquée comme option acoustique.',
    category: 'Acoustique', severity: 'warning', source_type: 'markdown', source_ref: 'GUIDE-DEVIS.md:119 + 136', tags: ['acoustique'],
  },
  {
    title: 'Acoustique 45 dB 1 vantail : plinthes 4472/4476',
    content: 'Pour une option acoustique 45 dB sur 1 vantail, appliquer +350 € HT TG sur attestation et ajouter les plinthes automatiques encastrée + en applique réf. 4472 ou 4476 selon largeur de vantail.',
    category: 'Acoustique', severity: 'blocking', source_type: 'pdf', source_ref: 'TARIF NEXUS 2026-01 - V2.pdf lignes 27-31, 287-292', tags: ['acoustique', '45db', 'plinthe'],
  },
  {
    title: 'Acoustique 45 dB 2 vantaux : seuil de prix',
    content: 'Pour une option acoustique 45 dB sur 2 vantaux, appliquer +630 € HT TG jusqu’à L3470 H3575, et +1 260 € HT TG au-dessus lorsque la source tarifaire le précise. Ajouter les plinthes adaptées si exigées par la configuration.',
    category: 'Acoustique', severity: 'blocking', source_type: 'pdf', source_ref: 'TARIF NEXUS 2026-01 - V2.pdf lignes 64-68 + EI60.md:50-56', tags: ['acoustique', '45db'],
  },
  {
    title: 'Joints blindage CEM au vantail',
    content: 'L’option joints de blindage électromagnétique CEM se chiffre à 990 € HT TG par vantail. Sur une porte 2 vantaux, appliquer deux fois la plus-value.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'pdf', source_ref: 'TARIF NEXUS 2026-01 - V2.pdf lignes 28,65 + fiches gammes', tags: ['CEM', 'option'],
  },
  {
    title: 'Coupe-feu : ferme-porte obligatoire',
    content: 'Toute performance coupe-feu EI60 ou EI120 impose un ferme-porte. Si la ligne porte une performance feu et aucun ferme-porte, signaler une violation ou demander ajout/validation.',
    category: 'Feu', severity: 'blocking', source_type: 'markdown', source_ref: 'EI60.md:96-103 + EI120.md:102-108', tags: ['feu', 'ferme-porte'],
  },
  {
    title: 'Coupe-feu avec serrure mécanique : mode 0',
    content: 'Si une porte coupe-feu utilise une serrure mécanique, indiquer que le fonctionnement est en mode 0, porte normalement fermée, et recommander une serrure automatique / sortie libre / DAS.',
    category: 'Feu', severity: 'warning', source_type: 'markdown', source_ref: 'EQUIP-EI.md:8-12 + EI60.md:64-66', tags: ['feu', 'serrure'],
  },
  {
    title: 'Coupe-feu avec serrure motorisée : AES obligatoire',
    content: 'Si une porte coupe-feu utilise une serrure motorisée, le devis doit mentionner une alimentation AES et les mesures garantissant le reverrouillage en cas de coupure d’alimentation.',
    category: 'Feu', severity: 'blocking', source_type: 'markdown', source_ref: 'EQUIP-EI.md:10-12 + EI120.md:107-108', tags: ['feu', 'AES', 'motorisee'],
  },
  {
    title: 'EI60 hors zone bleue : avis de chantier',
    content: 'Pour EI60, si les dimensions dépassent la zone bleue du catalogue, ajouter un avis de chantier non remisable en ligne à part et mutualisé au devis selon le nombre de portes.',
    category: 'Feu', severity: 'blocking', source_type: 'markdown', source_ref: 'EI60.md:7 + 96-103', tags: ['EI60', 'avis-chantier'],
  },
  {
    title: 'EI120 : avis de chantier impératif',
    content: 'Toute demande EI120 impose un avis de chantier impératif, non remisable, mutualisé une seule fois par devis selon le nombre de blocs-portes concernés.',
    category: 'Feu', severity: 'blocking', source_type: 'markdown', source_ref: 'EI120.md:7-18 + 102-108', tags: ['EI120', 'avis-chantier'],
  },
  {
    title: 'EI60 grandes hauteurs : utiliser rallonges MSL tarifées',
    content: 'Pour EI60 en grande hauteur, si les rallonges MSL sont dans le tarif, remplacer l’avis de chantier ligne par la rallonge appropriée : 4086 au-delà de 2300 mm, 4088 au-delà de 3100 mm.',
    category: 'Feu', severity: 'warning', source_type: 'markdown', source_ref: 'SERRURES-GARNITURES.md:61 + EI60.md:69-79', tags: ['EI60', 'MSL', 'rallonge'],
  },
  {
    title: 'CR4 : serrure Dény LSS profil européen',
    content: 'Une ligne NEXUS CR4 doit utiliser les serrures Dény LSS profil européen en applique comme famille de serrure de la gamme, avec 4120 par défaut si rien n’est précisé.',
    category: 'Anti-effraction', severity: 'blocking', source_type: 'markdown', source_ref: 'CR4.md:64-74 + SERRURES-GARNITURES.md:15', tags: ['CR4', 'serrure'],
  },
  {
    title: 'CR4 EI60 : zone et seuils de prix',
    content: 'Pour CR4 avec option EI60 : en 1 vantail, distinguer zone bleue (+1 000 € TG) et hors zone bleue (+1 000 € TG + avis chantier). En 2 vantaux, appliquer +1 800 € jusqu’à L2600 H2600, +2 200 € au-delà avec avis chantier.',
    category: 'Anti-effraction', severity: 'blocking', source_type: 'markdown', source_ref: 'CR4.md:23-29 + 49-55', tags: ['CR4', 'EI60'],
  },
  {
    title: 'CR4 EI120 : avis de chantier obligatoire',
    content: 'Pour CR4 avec option EI120, appliquer le tarif CR4 + option EI120 et intégrer l’avis de chantier obligatoire lorsque la source le précise.',
    category: 'Anti-effraction', severity: 'blocking', source_type: 'markdown', source_ref: 'CR4.md:23-29 + EI120.md:7-18', tags: ['CR4', 'EI120'],
  },
  {
    title: 'CR5 avec option FB6 : vérifier compatibilité feu',
    content: 'Pour une ligne CR5 avec option FB6, conserver la base NEXUS CR5 avec option FB6 et vérifier la compatibilité avec le classement feu souhaité. Ne pas basculer automatiquement sur une base FB6 BP.',
    category: 'Anti-effraction', severity: 'warning', source_type: 'markdown', source_ref: 'CR5.md:81-84 + FB6-7.md:113-115', tags: ['CR5', 'FB6'],
  },
  {
    title: 'CR6 : serrure LSS 7 points obligatoire',
    content: 'Pour maintenir le classement CR6, la serrure Dény LSS 7 points est obligatoire. La référence par défaut est 4172 si aucune serrure précise n’est fournie.',
    category: 'Anti-effraction', severity: 'blocking', source_type: 'markdown', source_ref: 'CR6.md:41-57 + SERRURES-GARNITURES.md:17', tags: ['CR6', 'serrure'],
  },
  {
    title: 'CR6 2 vantaux hors catalogue',
    content: 'Une demande CR6 en 2 vantaux doit être traitée en nous consulter / fabrication sur demande. Ne pas générer automatiquement un prix catalogue standard.',
    category: 'Anti-effraction', severity: 'blocking', source_type: 'markdown', source_ref: 'CR6.md:52-57 + GUIDE-DEVIS.md:217-239', tags: ['CR6', '2V', 'hors-catalogue'],
  },
  {
    title: 'CR6 FB7 non cumulable avec feu',
    content: 'Sur CR6, l’option FB7 est exclusive et non compatible avec un classement feu. Signaler une violation si FB7 et EI30/EI60/EI120 sont demandés ensemble.',
    category: 'Anti-effraction', severity: 'blocking', source_type: 'markdown', source_ref: 'CR6.md:30-35 + 52-56', tags: ['CR6', 'FB7', 'feu'],
  },
  {
    title: 'FB6/FB7 : classement CR3 automatique selon serrure',
    content: 'Une ligne FB6 ou FB7 obtient le classement CR3 automatiquement si une serrure de la gamme Nexus CR3 est montée. Ne pas ajouter une option CR3 séparée dans ce cas.',
    category: 'Anti-effraction', severity: 'warning', source_type: 'markdown', source_ref: 'FB6-7.md:7 + 111-114', tags: ['FB6', 'FB7', 'CR3'],
  },
  {
    title: 'FB6/FB7 avec options feu : avis de chantier',
    content: 'Toute option feu EI30, EI60 ou EI120 sur une ligne FB6 ou FB7 nécessite un avis de chantier non remisable. Mutualiser cet avis une seule fois au devis.',
    category: 'Feu', severity: 'blocking', source_type: 'markdown', source_ref: 'FB6-7.md:37-56 + 111-117', tags: ['FB6', 'FB7', 'feu', 'avis-chantier'],
  },
  {
    title: 'FB7 + EI60 incompatible',
    content: 'Une combinaison FB7 + EI60 est incompatible et doit être rejetée ou renvoyée à un traitement manuel explicite. Ne pas chiffrer automatiquement cette combinaison.',
    category: 'Feu', severity: 'blocking', source_type: 'markdown', source_ref: 'GUIDE-DEVIS.md:213-224 + ANTI-BELIER.md:68', tags: ['FB7', 'EI60'],
  },
  {
    title: 'CR4 + FB4 + EI60 : combinaison standard cumulable',
    content: 'Une ligne BP CR4 avec options pare-balles FB4 et coupe-feu EI60 est une combinaison NEXUS standard et cumulable (ex. H2300×L1150). Chiffrer sur base CR4 + options FB4 et EI60. L’avis de chantier FB4+EI60 est obligatoire et non remisable, mutualisé une fois par devis — ce n’est pas une incompatibilité bloquante.',
    category: 'Chiffrage', severity: 'warning', source_type: 'markdown', source_ref: 'CR4.md + EI60.md + GUIDE-DEVIS.md', tags: ['CR4', 'FB4', 'EI60', 'compatibilité'],
  },
  {
    title: 'Anti-bélier : FB7 non cumulable EI60',
    content: 'Sur une porte anti-bélier, l’option FB7 n’est pas cumulable avec EI60. Le devis doit demander un choix exclusif.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'ANTI-BELIER.md:26-31 + 66-70', tags: ['anti-belier', 'FB7', 'EI60'],
  },
  {
    title: 'Anti-bélier feu + pare-balles : avis de chantier',
    content: 'Toute combinaison feu + pare-balles sur une porte anti-bélier nécessite un avis de chantier obligatoire et non remisable.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'ANTI-BELIER.md:26-31 + 66-70', tags: ['anti-belier', 'feu', 'pare-balles'],
  },
  {
    title: 'Blast 0,5 t/m² : option sur BP existant et LSS 4 points minimum',
    content: 'Blast 0,5 t/m² est une option disponible sur BP NEXUS compatible, pas une gamme de base autonome. Pour justifier le classement, prévoir une serrure Dény LSS 4 points minimum sur le vantail de service.',
    category: 'Règle métier', severity: 'blocking', source_type: 'xlsx', source_ref: 'TARIF NEXUS 2026-01.xlsx onglet Blast 0,5t.m² lignes 11-22', tags: ['blast', 'serrure'],
  },
  {
    title: 'Blast 0,5 t/m² : limites de dimensions option',
    content: 'Pour Blast 0,5 t/m², appliquer la plus-value +180 € HT TG sur BP 1V jusqu’à L1200 H2300, et +480 € HT TG sur BP 2V jusqu’à L2200 H2800. Au-delà, ne pas chiffrer sans validation.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'xlsx', source_ref: 'TARIF NEXUS 2026-01.xlsx onglet Blast 0,5t.m² lignes 16-18', tags: ['blast', 'dimensions'],
  },
  {
    title: 'Blast : distinguer 2T, 4T et 5T',
    content: 'Blast 2 t/m² est un BP dédié avec châssis dédié réf. 4750.XX ; Blast 4 t/m² / EPR2 est un BP dédié sans manœuvrabilité post-explosion ; Blast 5 t/m² existe uniquement en châssis dédié réf. 4752.XX, pas en bloc-porte catalogue.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'BLAST.md:125-134', tags: ['blast'],
  },
  {
    title: 'Blast hors zone bleue : note de calcul 9 300 €',
    content: 'Si une ligne Blast est en zone blanche / hors PV, ajouter une seule ligne globale Note de calcul explosion non remisable à 9 300 € HT avec délai nous consulter. Ne pas dupliquer si plusieurs lignes Blast déclenchent la note.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'markdown', source_ref: 'BLAST.md:135-145', tags: ['blast', 'note-calcul', 'mutualisation'],
  },
  {
    title: 'Blast 4T 2 vantaux : note de calcul toujours requise',
    content: 'Pour un bloc-porte Blast 4 t/m² en 2 vantaux, aucune cellule n’est en zone bleue : la note de calcul 9 300 € HT est toujours requise.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'markdown', source_ref: 'BLAST.md:171-173', tags: ['blast', '4T', '2V'],
  },
  {
    title: 'EF2 : LSS 5 points minimum et note de calcul',
    content: 'Une ligne EF2 impose une serrure Dény LSS 5 points minimum et une note de calcul obligatoire avec chiffrage/délai à nous consulter.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'EF2.md:10-18 + 53-58', tags: ['EF2', 'serrure', 'note-calcul'],
  },
  {
    title: 'EF2 + CR4 : nous consulter',
    content: 'Si une demande EF2 inclut CR4, ne pas appliquer de tarif automatique : CR4 est disponible sur demande et doit partir en nous consulter.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'EF2.md:30-38 + 53-58', tags: ['EF2', 'CR4'],
  },
  {
    title: 'Prison : EI120 non disponible',
    content: 'Dans la gamme Prison, EI120 n’est pas disponible. Toute combinaison Prison + EI120 doit être rejetée ou mise en traitement manuel.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'PRISON.md:8-14 + 115-120', tags: ['prison', 'EI120'],
  },
  {
    title: 'Prison : EI60 sous avis de chantier',
    content: 'Dans la gamme Prison, EI60 est disponible uniquement sous avis de chantier. Ajouter l’avis non remisable si la configuration est retenue.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'PRISON.md:8-14 + 115-120', tags: ['prison', 'EI60', 'avis-chantier'],
  },
  {
    title: 'Prison : serrure Dény et filière Ministère Justice',
    content: 'Les serrures Dény Prison sont normalement vendues directement par Dény au Ministère de la Justice. Si ce n’est pas ce cas, utiliser les prix listés et demander confirmation de la filière d’approvisionnement.',
    category: 'Attention client', severity: 'warning', source_type: 'markdown', source_ref: 'PRISON.md:18-23 + 48-52', tags: ['prison', 'serrure'],
  },
  {
    title: 'Prison EI60 : VAM haut et bas sur crémone Dény 46574',
    content: 'Pour une crémone Dény 46574 sur une configuration Prison EI60, compléter impérativement avec VAM haut et bas.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'PRISON.md:68-77 + 115-120', tags: ['prison', 'EI60', 'cremone'],
  },
  {
    title: 'Anti-séisme : note de calcul obligatoire',
    content: 'L’option anti-séisme est disponible sur tous les blocs-portes NEXUS mais nécessite toujours une note de calcul obligatoire ; le chiffrage exact est à nous consulter.',
    category: 'Règle métier', severity: 'blocking', source_type: 'xlsx', source_ref: 'TARIF NEXUS 2026-01.xlsx onglet Séisme lignes 7-12', tags: ['seisme', 'note-calcul'],
  },
  {
    title: 'Anti-séisme : serrure selon zone',
    content: 'Pour l’anti-séisme, zones 1 et 2 : serrure 3 points type MSL/KEL/LSS. Zones 3 et plus : serrure LSS 4 points minimum. La zone doit être déterminée par la carte sismique du projet.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'SEISME-AEV.md:16-25 + XLSX onglet Séisme', tags: ['seisme', 'serrure'],
  },
  {
    title: 'AEV : attestation et niveau maximum',
    content: 'L’option AEV est disponible sur tous les blocs-portes NEXUS uniquement sur attestation, avec niveau maximum A4 E4 VC4.',
    category: 'Règle métier', severity: 'warning', source_type: 'xlsx', source_ref: 'TARIF NEXUS 2026-01.xlsx onglet AEV lignes 5-6', tags: ['AEV', 'attestation'],
  },
  {
    title: 'AEV A/V : plinthe encastrée sans seuil obligatoire',
    content: 'Pour un classement A (Air) ou V (Vent), prévoir une plinthe automatique encastrée réf. 4470 ou 4474. Le seuil n’est pas obligatoire pour A ou V seuls.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'SEISME-AEV.md:38-42 + XLSX onglet AEV', tags: ['AEV', 'plinthe'],
  },
  {
    title: 'AEV E : plinthes encastrée + applique et seuil obligatoire',
    content: 'Pour un classement E (Eau), prévoir les plinthes automatiques encastrée et en applique, plus un seuil obligatoire.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'SEISME-AEV.md:38-42 + XLSX onglet AEV', tags: ['AEV', 'seuil', 'plinthe'],
  },
  {
    title: 'Châssis : références tarif réelles obligatoires',
    content: 'Pour un châssis, afficher les références réelles du tarif NEXUS (ex. 4720.xx, 4721.xx, 4730.xx, 4740.xx, 4742.xx, 4765.xx), jamais une référence générée du type CHASSIS-CR3-650x3100.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'markdown', source_ref: 'CHASSIS.md:48-64', tags: ['chassis', 'reference'],
  },
  {
    title: 'Châssis CR6 et EI120 hors catalogue',
    content: 'Les châssis CR6 et EI120 ne disposent pas de table cadre standard dans la connaissance. Le prix doit rester vide et passer en nous consulter.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'markdown', source_ref: 'CHASSIS.md:78-93', tags: ['chassis', 'CR6', 'EI120'],
  },
  {
    title: 'Vitrage intérieur 4822 uniquement CR5',
    content: 'Le vitrage intérieur Oculus réf. 4822 BR6-S est spécifique à la gamme CR5. S’il est demandé pour une autre gamme, signaler une alerte et ne pas l’appliquer automatiquement.',
    category: 'Chiffrage', severity: 'warning', source_type: 'markdown', source_ref: 'CHASSIS.md:66-76', tags: ['chassis', 'vitrage', 'CR5'],
  },
  {
    title: 'Traverses châssis : ajout seulement si explicite ou validé',
    content: 'Pour les châssis grandes dimensions, ajouter une traverse intermédiaire uniquement si elle est explicitement demandée ou validée techniquement. Une grande dimension seule ne suffit pas toujours à chiffrer automatiquement une traverse, sauf cas validé.',
    category: 'Chiffrage', severity: 'warning', source_type: 'markdown', source_ref: 'CHASSIS.md:97-141', tags: ['chassis', 'traverse'],
  },
  {
    title: 'Traverses incluses dans le PV ≠ incluses dans le prix',
    content: 'La mention “traverses incluses dans le PV” signifie couvertes par le procès-verbal, pas incluses dans le prix cadre. Si une traverse est chiffrée, appliquer le tarif au mètre linéaire selon la gamme.',
    category: 'Chiffrage', severity: 'warning', source_type: 'markdown', source_ref: 'CHASSIS.md:135-141', tags: ['chassis', 'traverse', 'PV'],
  },
  {
    title: 'Guichet intégré dans châssis : support 4435 obligatoire',
    content: 'Si un guichet pare-balles est intégré dans un châssis, ajouter automatiquement le support métallique réf. 4435 à 2 081,49 € HT.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'markdown', source_ref: 'GUICHET.md:15-17 + 26-35', tags: ['guichet', 'chassis'],
  },
  {
    title: 'Guichets : CR3/CR4 uniquement et non compatibles feu',
    content: 'Les guichets de façade pare-balles sont compatibles CR3 et CR4 uniquement et ne sont pas compatibles avec les classements feu EI60/EI120.',
    category: 'Règle métier', severity: 'blocking', source_type: 'markdown', source_ref: 'GUICHET.md:19-23', tags: ['guichet', 'feu'],
  },
  {
    title: 'Guichets : pas de serrure ni ferme-porte ni garnitures',
    content: 'Pour un guichet, ne pas ajouter d’option pare-balles en supplément, ni serrure, ni ferme-porte, ni garnitures : le prix unitaire inclut déjà le niveau pare-balles choisi.',
    category: 'Règle métier', severity: 'warning', source_type: 'markdown', source_ref: 'GUICHET.md:26-35', tags: ['guichet'],
  },
  {
    title: 'Thermolaquage : barème par porte et quantité commande',
    content: 'Le thermolaquage se chiffre par porte selon 1V/2V, le groupe dimensionnel et la quantité totale de commande. Une commande de 7 portes identiques utilise le barème “7 ou plus”.',
    category: 'Chiffrage', severity: 'warning', source_type: 'markdown', source_ref: 'THERMOLAQUAGE.md:9-18 + 73-90', tags: ['thermolaquage'],
  },
  {
    title: 'Pièces détachées : Doortal Service',
    content: 'Les pièces détachées n’ont pas de tarif catalogue disponible dans NEXUS : consulter Doortal Service et ne pas chiffrer automatiquement.',
    category: 'Chiffrage', severity: 'blocking', source_type: 'xlsx', source_ref: 'TARIF NEXUS 2026-01.xlsx onglet Pièces détachées B3', tags: ['pieces-detachees'],
  },
]

function withImportTag(rule) {
  return { ...rule, tags: [...new Set([...(rule.tags || []), IMPORT_TAG])] }
}

function ruleCode(index) {
  return `R${String(index + 1).padStart(3, '0')}`
}

const [adminRows] = await db.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
const adminId = adminRows[0]?.id || null

await db.query('DELETE FROM devis_rules WHERE tags_json LIKE ?', [`%${IMPORT_TAG}%`])

let inserted = 0
let indexed = 0

for (const [index, rawRule] of rules.map(withImportTag).entries()) {
  const [result] = await db.query(
    `INSERT INTO devis_rules
      (rule_code, title, content, category, severity, source_type, source_ref, tags_json, status, created_by, approved_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      ruleCode(index),
      rawRule.title,
      rawRule.content,
      rawRule.category,
      rawRule.severity,
      rawRule.source_type,
      rawRule.source_ref,
      JSON.stringify(rawRule.tags),
      adminId,
      adminId,
    ]
  )
  inserted += 1
  const qdrantId = await storeDevisRule({
    ruleId: result.insertId,
    ruleCode: ruleCode(index),
    title: rawRule.title,
    content: rawRule.content,
    category: rawRule.category,
    severity: rawRule.severity,
    sourceType: rawRule.source_type,
    sourceRef: rawRule.source_ref,
    tags: rawRule.tags,
  })
  if (qdrantId) {
    indexed += 1
    await db.query('UPDATE devis_rules SET qdrant_id = ? WHERE id = ?', [qdrantId, result.insertId])
  }
}

console.log(JSON.stringify({ inserted, indexed, tag: IMPORT_TAG }, null, 2))
await db.end()