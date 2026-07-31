/**
 * src/components/sheet/labels.ts
 *
 * Tous les libellés d'interface de la feuille de personnage, en `LocalizedString`
 * (`{ fr: "…" }`, même forme que `books.json`). Aucune chaîne affichable ne doit
 * être écrite « en dur » dans les composants : on passe par `SHEET_LABELS` + `t()`.
 *
 * (Les termes de jeu — caractéristiques, compétences, zones, états mentaux —
 * vivent dans `lib/character/constants.ts`.)
 */

import type { LocalizedString } from "@/lib/nav";

export const SHEET_LABELS = {
  // Chrome — barre d'outils & menu
  // (« ← Accueil » retiré : la TopBar porte le retour, la barre d'outils non.)
  unnamed: { fr: "Sans nom" },
  newCharacter: { fr: "+ Nouveau" },
  duplicate: { fr: "Dupliquer" },
  importJson: { fr: "Importer JSON" },
  exportJson: { fr: "Exporter JSON" },
  print: { fr: "Imprimer" },
  charactersHeading: { fr: "Personnages" },
  deleteCharacter: { fr: "Supprimer" },
  confirmDelete: { fr: "Supprimer ce personnage ?" },
  loading: { fr: "Chargement de la feuille…" },
  emptyTitle: { fr: "Aucun personnage" },
  emptyHint: { fr: "Créez-en un pour commencer." },

  // Page 1 — en-têtes de colonnes/sections
  bodyColumn: { fr: "Corps" },
  mindColumn: { fr: "Esprit" },
  physicalCondition: { fr: "Condition Physique & États" },
  mentalCondition: { fr: "Condition Mentale & Stabilité" },
  charsAndSkills: { fr: "Caractéristiques et Compétences" },
  exhaustionRule: { fr: "⚠️ Épuisement (≥ 10) : test d'Endurance (🟨🟨🟦) 🆚 Fatigue." },

  // Pistes
  resistanceTitle: { fr: "♥️ Résistance" },
  resistanceFormula: { fr: "(Vigueur)" },
  stabilityTitle: { fr: "◇ Stabilité" },
  stabilityFormula: { fr: "(Ténacité + ✫ Discipline)" },
  fatigueTitle: { fr: "💧 Fatigue" },
  fatigueSubtext: { fr: "Débute à 1 • Maximum 20" },
  protectionTitle: { fr: "🛡️ Protection" },
  protectionSubtext: { fr: "(Armure)" },

  // Portrait / identité
  charName: { fr: "Nom du Personnage" },
  namePlaceholder: { fr: "— Saisir le nom —" },
  changePortrait: { fr: "Changer le portrait" },
  removePortrait: { fr: "Retirer" },
  biography: { fr: "Biographie" },
  bioPlaceholder: { fr: "— Histoire, origines, peuple, particularités —" },
  portraitAlt: { fr: "Portrait" },

  // Page 2 — inventaire
  inventoryTitle: { fr: "Inventaire" },
  largeSlots: { fr: "Grands emplacements" },
  chargeFormula: { fr: "Limite : 2 + Force + Robustesse" },
  quickSlots: { fr: "Emplacements rapides" },
  smallSlots: { fr: "Petits emplacements" },
  itemPlaceholder: { fr: "—" },
  slotTypeTitle: { fr: "Type : arme ⚔ · armure 🛡 · petit ▫ · poche 🔸 · paquet 📦" },

  // Page 2 — traits & description
  traitsTitle: { fr: "Traits & Disciplines" },
  traitColHeader: { fr: "Trait / Discipline" },
  descColHeader: { fr: "Description" },
  description: { fr: "Description" },
  history: { fr: "Historique" },
  notes: { fr: "Notes" },
  descPlaceholder: { fr: "Apparence physique, traits distinctifs…" },
  historyPlaceholder: { fr: "Origines, passé, motivations…" },
  notesPlaceholder: { fr: "—" },
} satisfies Record<string, LocalizedString>;

export type SheetLabelKey = keyof typeof SHEET_LABELS;
