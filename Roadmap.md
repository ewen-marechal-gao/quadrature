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

## Disciplines 🟡
- [ ] Armes d'hast — Tier 3 ; Échomancie (étoffer) ; puis Impact et Choromancie (sortir du carnet).

## Site web 🟠 / 🟡
- [ ] 🟠 Aligner l'inventaire de la feuille de personnage sur `equipement.md` (Dos/Taille) ; embarquer la police.
- [ ] 🟡 **Créateur de personnage** pas-à-pas (s'appuie sur le modèle d'état `web/src/lib/character/`).
- [ ] 🟡 Fiches d'adversaires ; **simulateur de rencontre** intégré ; mode « apprendre à jouer ».
- [ ] 🟡 Activer la locale **EN** (contenu `rules/en/`) ; remplacer le README boilerplate de `web/`.

## Simulateur 🟡
- [ ] README documentant les écarts règles ↔ simulation ; commiter la modif en cours d'`agent.ts`.
- [ ] Rapprocher des règles : fatigue initiale = 1, défaut ⚠️ sur le dé 🟪, positionnement/déplacements.

## Infrastructure
- [x] ✅ Consolidation en monorepo (historique préservé) — *0.1.0*.
- [x] ✅ Versionnement de `tools/`.
- [ ] Déplacer les artefacts legacy de la racine vers un dossier `archive/` (`Quadrature_latest.md`, captures, PDF).
- [ ] Choisir une **licence**.
