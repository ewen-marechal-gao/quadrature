/**
 * src/lib/bestiary.ts
 *
 * Couche d'accès aux fiches d'adversaires (data/bestiary/cards/*.card.yaml, générées
 * par tools/consolidate-bestiary.ts depuis data/bestiary/species/ + le cladogramme).
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

/**
 * Ce que confère un bloc : prose d'affichage (`text`) + ops mécaniques
 * (grantsCard, cardCost, resource…). Le web n'affiche que la prose.
 */
interface RawGrant {
  text: LocalizedString | "auto";
  resource?: BlockResource;
  amount?: number;
  grantsCard?: string;
  /** Bonus de garde conféré tant que le bloc est intact. */
  guard?: number;
  [k: string]: unknown;
}
interface RawBlock { cases: number; name?: LocalizedString; grants?: RawGrant; }
interface RawPart {
  /** Slug d'identification stable (head, body, tail, frontLeg, sickles…). */
  type: string;
  name: LocalizedString;
  description?: LocalizedString;
  armor: number;
  blocks: RawBlock[];
}
interface RawTrait { id?: string; name: LocalizedString; kind: "passive" | "active"; effect: LocalizedString; source?: LocalizedString; }
/** Issue de carte : prose d'affichage + effets structurés (ces derniers ignorés côté web). */
interface RawOutcome { text: LocalizedString | "auto"; [k: string]: unknown; }
interface RawCard {
  id: string;
  name: LocalizedString;
  cost: number;
  initiative: number;
  ranged?: boolean;
  onSuccess: RawOutcome;
  onFailure: RawOutcome;
  onFives?: RawOutcome;
  note?: LocalizedString;
}
interface RawAdversary {
  id: string;
  /** uid du nœud du cladogramme dont la fiche dérive. */
  from?: string;
  name: LocalizedString;
  power: PowerTier;
  dice: AdversaryDie[];
  description?: LocalizedString;
  guard: { type: GuardType; value: number };
  /** Palier de taille (omis par le générateur quand « normal »). */
  size?: string;
  /** ⚫ Points d'action (omis quand la valeur plate 2 s'applique). */
  actions?: number;
  speed: { walk: number; run: number };
  fatigue: number;
  /** 🧠 Ténacité : longueur de la barre mentale (▢), tampon final avant fuite/reddition. */
  tenacity?: number;
  parts: RawPart[];
  /** Armes/équipement (mécaniquement comme des parties, affichées à part). */
  weapons?: RawPart[];
  traits?: RawTrait[];
  cards: RawCard[];
  image?: string;
  /** Nom de fichier d'illustration dans data/bestiary/art/ (résolu en chemin web). */
  art?: string;
}

// ─── Types résolus (clés anglaises, chaînes dans la locale) ─────────────────────

/** Ressource conférée au début de chaque manche par un bloc intact. */
export type BlockResource = "endurance" | "evasion" | "stability";
/**
 * Un bloc de cases d'une partie : confère une capacité tant qu'il est intact.
 * `grants` = prose complète (repli) ; les ops structurées (`resource`/`amount`,
 * `grantsCard`) permettent un rendu COMPACT et l'agrégation « début de manche ».
 */
export interface BodyBlock {
  cases: number;
  name?: string;
  grants: string;
  resource?: BlockResource;
  amount?: number;
  grantsCard?: string;
  /** Bonus de garde conféré tant que le bloc est intact (perdu s'il est détruit). */
  guard?: number;
}
/** Une partie du corps (identifiée par `type`, affichée via `name`). */
export interface BodyPart { type: string; name: string; description?: string; armor: number; blocks: BodyBlock[]; }
/** Un trait d'adversaire (♾️ passif / ⚒️ actif). */
export interface AdversaryTrait { name: string; kind: "passive" | "active"; effect: string; source?: string; }
/** Une carte d'action du deck (pas de Défaut ⚠️). */
export interface AdversaryCard {
  id: string;
  name: string;
  /** Cost in action points ⚫ (integer); rendered as N symbols by the front-end. */
  cost: number;
  initiative: number;
  onFives?: string;
  onSuccess?: string;
  onFailure?: string;
  note?: string;
}
/** Fiche complète, chaînes résolues dans la locale. */
export interface Adversary {
  id: string;
  /** uid du nœud du cladogramme dont la fiche dérive (lien depuis /evolution). */
  from?: string;
  name: string;
  dice: AdversaryDie[];
  description?: string;
  guard: { type: GuardType; label: string; value: number };
  /** Palier de taille (absent = « normal »). Décale les cases de chaque bloc. */
  size?: string;
  /** ⚫ Points d'action par manche (défaut plat : 2). Essoufflé en retire 1 (plancher 1). */
  actions?: number;
  speed: { walk: number; run: number };
  fatigue: number;
  /** 🧠 Ténacité : longueur de la barre mentale (▢). Absent = créature sans piste mentale. */
  tenacity?: number;
  parts: BodyPart[];
  /** Armes/équipement (affichées dans une section dédiée sous les parties). */
  weapons: BodyPart[];
  traits: AdversaryTrait[];
  cards: AdversaryCard[];
  /** Illustration du verso (chemin sous /public). Placeholder texte si absent. */
  image?: string;
}

// ─── Libellés localisés des énumérations d'affichage ────────────────────────────

const GUARD_LABELS: Record<GuardType, LocalizedString> = {
  dodge: { fr: "Esquive", en: "Dodge" },
  block: { fr: "Blocage", en: "Block" },
  parry: { fr: "Parade", en: "Parry" },
};

// ─── Résolution Locale → chaînes ────────────────────────────────────────────────

/** Résout une prose Locale, avec le sentinel « auto » rendu vide (auto-rendu différé). */
function localizeText(t: LocalizedString | "auto", locale: string): string {
  return t === "auto" ? "" : localize(t, locale);
}

function resolvePart(p: RawPart, locale: string): BodyPart {
  return {
    type: p.type,
    name: localize(p.name, locale),
    description: p.description ? localize(p.description, locale) : undefined,
    armor: p.armor,
    blocks: p.blocks.map((b) => ({
      cases: b.cases,
      ...(b.name && { name: localize(b.name, locale) }),
      grants: b.grants ? localizeText(b.grants.text, locale) : "",
      ...(b.grants?.resource && { resource: b.grants.resource }),
      ...(b.grants?.amount != null && { amount: b.grants.amount }),
      ...(b.grants?.grantsCard && { grantsCard: b.grants.grantsCard }),
      ...(b.grants?.guard != null && { guard: b.grants.guard }),
    })),
  };
}

function resolveAdversary(raw: RawAdversary, locale: string): Adversary {
  const opt = (s?: LocalizedString) => (s ? localize(s, locale) : undefined);
  return {
    id: raw.id,
    ...(raw.from ? { from: raw.from } : {}),
    name: localize(raw.name, locale),
    dice: raw.dice,
    description: opt(raw.description),
    guard: { type: raw.guard.type, label: localize(GUARD_LABELS[raw.guard.type], locale), value: raw.guard.value },
    ...(raw.size ? { size: raw.size } : {}),
    ...(raw.actions != null ? { actions: raw.actions } : {}),
    speed: raw.speed,
    fatigue: raw.fatigue,
    ...(raw.tenacity != null ? { tenacity: raw.tenacity } : {}),
    parts: raw.parts.map((p) => resolvePart(p, locale)),
    weapons: (raw.weapons ?? []).map((p) => resolvePart(p, locale)),
    traits: (raw.traits ?? []).map((t) => ({ name: localize(t.name, locale), kind: t.kind, effect: localize(t.effect, locale), ...(t.source && { source: localize(t.source, locale) }) })),
    cards: raw.cards.map((c) => ({
      id: c.id,
      name: localize(c.name, locale),
      cost: c.cost,
      initiative: c.initiative,
      onFives: c.onFives ? localizeText(c.onFives.text, locale) : undefined,
      onSuccess: localizeText(c.onSuccess.text, locale),
      onFailure: localizeText(c.onFailure.text, locale),
      note: opt(c.note),
    })),
    image: raw.art ? `/bestiary/art/${raw.art}` : raw.image,
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
