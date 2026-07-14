# Quadrature — Feuille de route

Vue d'ensemble des chantiers, par thème. Le détail et la justification sont dans
[`rapport_avancement_2026-06-10.md`](rapport_avancement_2026-06-10.md). Légende :
🔴 prioritaire · 🟠 important · 🟡 plus tard · ✅ fait.

## Règles — cohérence éditoriale 🔴
- [ ] Corriger les références croisées défense ↔ compétence (Encaisser, Blocage, Injonction, Intimidation).
- [ ] Passe de nomenclature : « Tir ciblé/précis », « Frappe brutale/puissante », action « Pas », traits orphelins, formation « Garde ».
- [ ] Uniformiser les symboles caractéristique ✪ / compétence ✫ (Résistance, Stabilité…).

## Règles — complétion 🟠
- [ ] Compléter les traits manquants (compétences sans trait — bloque la progression au rang 3).
- [ ] Relier formations → disciplines rédigées ; finaliser les origines (« tables à revoir »).
- [ ] Trancher consommables : Jauge de Stock vs Règle des Charges ; unifier la monnaie.
- [ ] Playtester les Épreuves ⚙️ ; définir Havre (coûts) et Fatigue permanente.
- [ ] Exemple chiffré du Niveau de Menace 💀 ; étendre le glossaire aux symboles des disciplines.

## Univers 🟠
- [ ] Resynchroniser `lore.md` avec `astronomie.md` (masse, rayon, saisons polaires 600 → ~27 ans).
- [ ] Unifier le système de temps (Cycle/Phase/Ère) entre `lore.md` et `tools/`.
- [ ] Dédupliquer le climat (`lore.md` vs `climat.md`).

## Bestiaire & adversaires 🟠
Cladogramme phylogénétique de la faune → génération des fiches de monstres (« ce que la créature EST découle de ses mutations »).
- [x] ✅ Cladogramme (arbre + mutations) en `data/` (`cladogram.yaml` + `mutations.yaml`), édité via `tools/cladogram.ts` ; visualiseur web `/evolution`.
- [x] ✅ **Kits de combat** par mutation (`mutations[clé].kit`) : parties du corps, cartes, traits, Speed/Fatigue dérivés.
- [x] ✅ **Consolidateur** `tools/consolidate-bestiary.ts` : `data/bestiary/species/*.yaml` → `cards/*.card.yaml` (dérivées de l'ascendance).
- [x] ✅ Schéma adversaire migré **anglais + `Locale`** ; champ `weapons` (sapients équipés) ; rubrique web `/adversaires`.
- [x] ✅ Fiches : Faucheur, Lacérateur, Bandit des Cimes.
- [ ] 🟠 Passe **nommage des membres par plan de corps** (bipèdes/sapients : « Jambes »/« Membres inférieurs » ≠ « Pattes » ; pieds différenciés).
- [ ] 🟡 Étoffer les kits (mutations restantes) ; nouvelles espèces ; carte de la mécanique 🩸.
- [ ] 🟡 Intégration **simulateur** (résolution asymétrique, parties du corps, ressources régénérantes).

## Langue rituelle 🟡
Conlang générative d'Aeonir ([`rules/fr/univers/language.md`](rules/fr/univers/language.md)) — noms, lieux, créatures, incantations.
- [x] ✅ Phonologie à **deux registres** (pierre/sève) ; règles d'or (unicité ; inversion-ou-palindrome).
- [x] ✅ Grammaire de **composition tête-initiale** ; anthroponymie ; suffixe ethnonymique `-Dor` ; **4 peuples** (Syldor/Vaedor/Lumidor/Sahgdor).
- [x] ✅ Lexique : vivant (végétal, couleurs), grandeur/quantité, relief, **géographie** (naturelle, cosmo, météo).
- [x] ✅ Passe d'assainissement (numérotation, collisions, runes hallucinées retirées ; systèmes polygone→chiffre & éléments documentés).
- [ ] Compléter la table **Verbes & actions** (§VI) ; traduire l'incantation **Projection** (§XI).
- [ ] Revoir la rune `Ghâl` (refuser).
- [ ] 🟡 Outiller un **générateur onomastique** (noms/toponymes par registre, à partir des règles posées).

## Disciplines 🟡
- [ ] Armes d'hast — Tier 3 ; Échomancie (étoffer) ; puis Impact et Choromancie (sortir du carnet).

## Site web 🟠 / 🟡
- [ ] 🟠 Aligner l'inventaire de la feuille de personnage sur `equipement.md` (Dos/Taille) ; embarquer la police.
- [ ] 🟡 **Créateur de personnage** pas-à-pas (s'appuie sur le modèle d'état `web/src/lib/character/`).
- [ ] 🟡 **Simulateur de rencontre** intégré ; mode « apprendre à jouer » (la rubrique Bestiaire `/adversaires` existe — cf. § *Bestiaire & adversaires*).
- [ ] 🟡 Activer la locale **EN** (contenu `rules/en/`) ; remplacer le README boilerplate de `web/`.

## Simulateur 🟡
- [ ] README documentant les écarts règles ↔ simulation ; commiter la modif en cours d'`agent.ts`.
- [ ] Rapprocher des règles : fatigue initiale = 1, défaut ⚠️ sur le dé 🟪, positionnement/déplacements.

## Infrastructure
- [x] ✅ Consolidation en monorepo (historique préservé) — *0.1.0*.
- [x] ✅ Versionnement de `tools/`.
- [ ] Déplacer les artefacts legacy de la racine vers un dossier `archive/` (`Quadrature_latest.md`, captures, PDF).
- [ ] Choisir une **licence**.
