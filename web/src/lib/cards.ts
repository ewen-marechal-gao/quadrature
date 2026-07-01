/**
 * src/lib/cards.ts
 *
 * Couche d'accès aux cartes d'action (rules/{locale}/cartes/*.yaml).
 * Utilisée uniquement côté serveur (Server Components, generateStaticParams).
 *
 * Le schéma des cartes est documenté dans rules/fr/cartes/README.md.
 * Fallback : si la locale demandée n'a pas de dossier cartes/, on sert le fr.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CardType = "action" | "reaction";

/** Code couleur de la carte (cf. universal_actions.md §Code couleur). */
export type CardCategory =
  | "mouvement"      // cyan
  | "offensive"      // rouge
  | "defensive"      // bleu
  | "guerison"       // vert
  | "amelioration";  // violet

export type CardFamily =
  | "melee" | "distance" | "mouvement" | "tempo" | "mental"
  | "physique" | "sociale" | "utilitaire" | "garde";

export interface CardUpgrade {
  nom: string;
  effet: string;
}

export interface CardSacrifice {
  des: "🟦" | "🟨";
  nom?: string;
  effet: string;
}

export interface CardTableRow {
  cout: number;
  effet: string;
}

export interface ActionCard {
  id: string;
  nom: string;
  type: CardType;
  famille: CardFamily;
  categorie: CardCategory;
  initiative: number;
  cout?: string;
  description?: string;
  prerequis?: string;
  /** Note de règle affichée sous l'en-tête, même rendu que le prérequis. */
  bandeau?: string;
  declencheur?: string;
  condition?: string;
  mental?: string;
  cible?: string;
  jet?: string;
  contre?: string;
  /** Effet ⭐ « Repérez X 5 » — déclencheur de lecture des dés (cartes d'adversaires). */
  repere?: string;
  ameliorations?: CardUpgrade[];
  sacrifices?: CardSacrifice[];
  defaut?: string;
  critique?: string;
  effet?: string;
  effet_duree?: string;
  succes?: string;
  echec?: string;
  table?: { titre?: string; lignes: CardTableRow[] };
  notes?: string;
  source?: string;
}

/** Groupe de cartes issu d'un fichier YAML. */
export interface CardSet {
  /** Nom du fichier sans extension, ex : "actions_universelles". */
  set: string;
  cartes: ActionCard[];
}

// ─── Chargement ───────────────────────────────────────────────────────────────

function getCardsDir(locale: string): string {
  const dir = path.join(process.cwd(), "..", "rules", locale, "cartes");
  if (!fs.existsSync(dir) && locale !== "fr") {
    return path.join(process.cwd(), "..", "rules", "fr", "cartes");
  }
  return dir;
}

/** Charge toutes les cartes de la locale, à plat, ordonnées par fichier. */
export function getAllCards(locale = "fr"): ActionCard[] {
  const dir = getCardsDir(locale);
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();

  const cards: ActionCard[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    const doc = yaml.load(raw) as { cartes?: ActionCard[] } | undefined;
    if (doc?.cartes) cards.push(...doc.cartes);
  }
  return cards;
}
