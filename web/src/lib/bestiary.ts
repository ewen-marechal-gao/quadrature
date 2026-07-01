/**
 * src/lib/bestiary.ts
 *
 * Couche d'accès aux fiches d'adversaires (data/bestiary/cards/*.card.yaml, générées
 * par tools/consolidate-bestiary.mjs depuis data/bestiary/species/ + le cladogramme).
 * Utilisée uniquement côté serveur (Server Components, generateStaticParams).
 *
 * Le schéma des fiches est documenté dans rules/fr/adversaires/regles_adversaires.md.
 * Convention : clés en ANGLAIS, chaînes affichables en Locale { fr, en? } — résolues
 * dans la locale demandée au chargement (comme lib/cladogram.ts), si bien que les
 * composants clients reçoivent des chaînes simples.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { localize, type Locale, type LocalizedString } from "@/lib/nav";

// ─── Énumérations ───────────────────────────────────────────────────────────────

/** Qualité d'un dé d'adversaire (cf. § Dés d'adversaires). */
export type AdversaryDie = "nuisance" | "threat" | "danger";
/** Type de garde par défaut inscrit sur la fiche. */
export type GuardType = "dodge" | "block" | "parry";
/** Palier de puissance (Insignifiant → Élite). */
export type PowerTier =
  | "insignificant" | "harmful" | "weak" | "novice" | "initiate"
  | "competent" | "veteran" | "expert" | "elite";

// ─── Types bruts (forme YAML : clés anglaises, chaînes Locale) ──────────────────

interface RawBlock { cases: number; grants: LocalizedString; }
interface RawPart {
  /** Slug d'identification stable (head, body, tail, frontLeg, sickles…). */
  type: string;
  name: LocalizedString;
  description?: LocalizedString;
  armor: number;
  blocks: RawBlock[];
}
interface RawTrait { id?: string; name: LocalizedString; kind: "passive" | "active"; effect: LocalizedString; }
interface RawCard {
  id: string;
  name: LocalizedString;
  cost: string;
  initiative: number;
  onFives?: LocalizedString;
  onSuccess?: LocalizedString;
  onFailure?: LocalizedString;
  note?: LocalizedString;
}
interface RawAdversary {
  id: string;
  name: LocalizedString;
  power: PowerTier;
  dice: AdversaryDie[];
  description?: LocalizedString;
  guard: { type: GuardType; value: number };
  speed: { walk: number; run: number };
  fatigue: number;
  parts: RawPart[];
  /** Armes/équipement (mécaniquement comme des parties, affichées à part). */
  weapons?: RawPart[];
  traits?: RawTrait[];
  cards: RawCard[];
  image?: string;
}

// ─── Types résolus (clés anglaises, chaînes dans la locale) ─────────────────────

/** Un bloc de cases d'une partie : confère une capacité tant qu'il est intact. */
export interface BodyBlock { cases: number; grants: string; }
/** Une partie du corps (identifiée par `type`, affichée via `name`). */
export interface BodyPart { type: string; name: string; description?: string; armor: number; blocks: BodyBlock[]; }
/** Un trait d'adversaire (♾️ passif / ⚒️ actif). */
export interface AdversaryTrait { name: string; kind: "passive" | "active"; effect: string; }
/** Une carte d'action du deck (pas de Défaut ⚠️). */
export interface AdversaryCard {
  id: string;
  name: string;
  cost: string;
  initiative: number;
  onFives?: string;
  onSuccess?: string;
  onFailure?: string;
  note?: string;
}
/** Fiche complète, chaînes résolues dans la locale. */
export interface Adversary {
  id: string;
  name: string;
  power: PowerTier;
  /** Libellé du palier dans la locale (ex. « Initié »). */
  powerLabel: string;
  dice: AdversaryDie[];
  description?: string;
  guard: { type: GuardType; label: string; value: number };
  speed: { walk: number; run: number };
  fatigue: number;
  parts: BodyPart[];
  /** Armes/équipement (affichées dans une section dédiée sous les parties). */
  weapons: BodyPart[];
  traits: AdversaryTrait[];
  cards: AdversaryCard[];
  /** Illustration du verso (chemin sous /public). Placeholder texte si absent. */
  image?: string;
}

// ─── Libellés localisés des énumérations d'affichage ────────────────────────────

const POWER_LABELS: Record<PowerTier, LocalizedString> = {
  insignificant: { fr: "Insignifiant", en: "Insignificant" },
  harmful: { fr: "Nuisible", en: "Harmful" },
  weak: { fr: "Faible", en: "Weak" },
  novice: { fr: "Novice", en: "Novice" },
  initiate: { fr: "Initié", en: "Initiate" },
  competent: { fr: "Compétent", en: "Competent" },
  veteran: { fr: "Vétéran", en: "Veteran" },
  expert: { fr: "Expert", en: "Expert" },
  elite: { fr: "Élite", en: "Elite" },
};
const GUARD_LABELS: Record<GuardType, LocalizedString> = {
  dodge: { fr: "Esquive", en: "Dodge" },
  block: { fr: "Blocage", en: "Block" },
  parry: { fr: "Parade", en: "Parry" },
};

// ─── Résolution Locale → chaînes ────────────────────────────────────────────────

function resolvePart(p: RawPart, locale: string): BodyPart {
  return {
    type: p.type,
    name: localize(p.name, locale),
    description: p.description ? localize(p.description, locale) : undefined,
    armor: p.armor,
    blocks: p.blocks.map((b) => ({ cases: b.cases, grants: localize(b.grants, locale) })),
  };
}

function resolveAdversary(raw: RawAdversary, locale: string): Adversary {
  const opt = (s?: LocalizedString) => (s ? localize(s, locale) : undefined);
  return {
    id: raw.id,
    name: localize(raw.name, locale),
    power: raw.power,
    powerLabel: localize(POWER_LABELS[raw.power], locale),
    dice: raw.dice,
    description: opt(raw.description),
    guard: { type: raw.guard.type, label: localize(GUARD_LABELS[raw.guard.type], locale), value: raw.guard.value },
    speed: raw.speed,
    fatigue: raw.fatigue,
    parts: raw.parts.map((p) => resolvePart(p, locale)),
    weapons: (raw.weapons ?? []).map((p) => resolvePart(p, locale)),
    traits: (raw.traits ?? []).map((t) => ({ name: localize(t.name, locale), kind: t.kind, effect: localize(t.effect, locale) })),
    cards: raw.cards.map((c) => ({
      id: c.id,
      name: localize(c.name, locale),
      cost: c.cost,
      initiative: c.initiative,
      onFives: opt(c.onFives),
      onSuccess: opt(c.onSuccess),
      onFailure: opt(c.onFailure),
      note: opt(c.note),
    })),
    image: raw.image,
  };
}

// ─── Chargement ─────────────────────────────────────────────────────────────────

const CARDS_DIR = path.join(process.cwd(), "..", "data", "bestiary", "cards");

/** Charge toutes les fiches `*.card.yaml`, résolues dans la locale, ordonnées par nom de fichier. */
export function getAllAdversaries(locale: Locale = "fr"): Adversary[] {
  if (!fs.existsSync(CARDS_DIR)) return [];

  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".card.yaml")).sort();
  const adversaries: Adversary[] = [];
  for (const file of files) {
    const raw = yaml.load(fs.readFileSync(path.join(CARDS_DIR, file), "utf-8")) as RawAdversary | undefined;
    if (raw?.id) adversaries.push(resolveAdversary(raw, locale));
  }
  return adversaries;
}

/** Charge une fiche par son id, ou undefined si introuvable. */
export function getAdversary(id: string, locale: Locale = "fr"): Adversary | undefined {
  return getAllAdversaries(locale).find((a) => a.id === id);
}
