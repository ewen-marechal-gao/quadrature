/**
 * src/lib/discipline-cards.ts — cartes des DISCIPLINES (data/disciplines/*.yaml).
 *
 * Les disciplines (Électromancie…) portent leurs actions dans data/disciplines,
 * PAS dans les cartes du vault (rules/{locale}/cartes) ni dans player_actions.yaml.
 * Ce module lit ces actions et les CONVERTIT en ActionCard — la même forme
 * d'affichage que les cartes du vault — pour /cartes ET le viewer de combat.
 *
 * ⚠️ MODULE SERVEUR (fs). Les chaînes sont des Locale { fr, en? } ; on résout à
 * la locale demandée (fallback fr). Le schéma source est celui d'un ActionDef
 * (nom/coût/jet/issues déclaratives) ; une carte à `resolver` (Décharge) porte sa
 * prose d'affichage dans des tiers `onSuccess`/… ignorés par le moteur.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import type { ActionCard, CardFamily, CardCategory, CardType } from "@/lib/cards";
import type { Locale } from "@/lib/nav";

// ─── Formes brutes (miroir partiel de data/disciplines/*.yaml) ─────────────────

type Loc = string | Partial<Record<Locale, string>>;
const L = (s: Loc | undefined, locale: Locale): string =>
  s == null ? "" : typeof s === "string" ? s : (s[locale] ?? s.fr ?? "");

interface RawOutcome { text?: Loc; effect?: unknown[] }
interface RawDisciplineAction {
  name: Loc;
  description?: Loc;
  initiative?: number;
  cost?: { actions?: number; reactions?: number; fatigue?: number };
  tags?: string[];
  reach?: number;
  selfTargeted?: boolean;
  selfDC?: number;
  roll?: { characteristic?: string; skill?: string };
  mentalConditions?: string[];
  trigger?: { on?: string };
  onPlay?: RawOutcome; onSuccess?: RawOutcome; onFailure?: RawOutcome;
  onCritical?: RawOutcome; onFlaw?: RawOutcome;
}
interface RawDisciplineFile {
  discipline?: { id?: string; name?: Loc };
  actions?: Record<string, RawDisciplineAction>;
}

const DISCIPLINES_DIR = join(process.cwd(), "..", "data", "disciplines");

// ─── Conversion ────────────────────────────────────────────────────────────────

/** Bande d'initiative → lune de coût (I 🌓 · II 🌕 · III 🌗). */
const bandMoon = (init: number): string => (init <= 3 ? "🌓" : init <= 6 ? "🌕" : "🌗");

/** Libellé bilingue d'une caractéristique (dé bleu du jet). */
const CHAR_LABELS: Record<string, Partial<Record<Locale, string>>> = {
  strength: { fr: "Force", en: "Strength" },
  agility: { fr: "Agilité", en: "Agility" },
  vigor: { fr: "Vigueur", en: "Vigor" },
  grace: { fr: "Grâce", en: "Grace" },
  acuity: { fr: "Acuité", en: "Acuity" },
  willpower: { fr: "Volonté", en: "Willpower" },
  intelligence: { fr: "Intelligence", en: "Intelligence" },
  tenacity: { fr: "Ténacité", en: "Tenacity" },
  charisma: { fr: "Charisme", en: "Charisma" },
  lucidity: { fr: "Lucidité", en: "Lucidity" },
};

function familyOf(tags: string[]): CardFamily {
  if (tags.includes("ranged")) return "distance";
  if (tags.includes("melee")) return "melee";
  if (tags.includes("mental")) return "mental";
  if (tags.includes("movement")) return "mouvement";
  return "utilitaire"; // support / enhancement / défaut
}

function categoryOf(tags: string[]): CardCategory {
  if (tags.includes("offensive")) return "offensive";
  if (tags.includes("defensive")) return "defensive";
  if (tags.includes("healing")) return "guerison";
  if (tags.includes("movement")) return "mouvement";
  return "amelioration"; // support / enhancement
}

/** Coût imprimé : lunes (une par PA, teintées par la bande) + 💧 + ⚡ pour une réaction. */
function coutOf(a: RawDisciplineAction): string {
  const init = a.initiative ?? 5;
  const actions = a.cost?.actions ?? 0;
  const reactions = a.cost?.reactions ?? 0;
  const fatigue = a.cost?.fatigue ?? 0;
  const base = a.trigger ? "⚡".repeat(Math.max(1, reactions)) : bandMoon(init).repeat(actions);
  return base + "💧".repeat(fatigue);
}

function cibleOf(a: RawDisciplineAction, locale: Locale): string | undefined {
  if (a.selfTargeted) return locale === "en" ? "Self" : "Personnel";
  if (a.reach != null) {
    return locale === "en"
      ? `A creature within ${a.reach} squares`
      : `Une créature à portée de ${a.reach} cases`;
  }
  return undefined;
}

/** Jet : dés jaunes = discipline (Électromancie 🟨🟨), dé bleu = caractéristique. */
function jetOf(a: RawDisciplineAction, disciplineName: string, locale: Locale): string | undefined {
  if (!a.roll?.characteristic) return undefined;
  const char = L(CHAR_LABELS[a.roll.characteristic], locale) || a.roll.characteristic;
  return `${disciplineName} 🟨🟨 + ${char} 🟦`;
}

function toCard(id: string, a: RawDisciplineAction, disciplineName: string, locale: Locale): ActionCard {
  const tags = a.tags ?? [];
  const outcome = (o?: RawOutcome) => L(o?.text, locale) || undefined;
  const cible = cibleOf(a, locale);
  const jet = jetOf(a, disciplineName, locale);
  return {
    id,
    nom: L(a.name, locale) || id,
    type: (a.trigger ? "reaction" : "action") as CardType,
    famille: familyOf(tags),
    categorie: categoryOf(tags),
    ...(a.initiative != null && { initiative: a.initiative }),
    cout: coutOf(a),
    // Bandeau = nom de la discipline (remplace le repli « Action universelle »).
    ...(disciplineName && { bandeau: disciplineName }),
    ...(L(a.description, locale) && { description: L(a.description, locale) }),
    ...(a.trigger?.on && { declencheur: a.trigger.on }),
    ...(a.mentalConditions?.length && {
      mental: a.mentalConditions.join(locale === "en" ? " or " : " ou "),
    }),
    ...(cible && { cible }),
    ...(jet && { jet }),
    ...(a.selfDC != null && { contre: `DD ${a.selfDC}` }),
    ...(outcome(a.onCritical) && { critique: outcome(a.onCritical) }),
    ...(outcome(a.onFlaw) && { defaut: outcome(a.onFlaw) }),
    ...(outcome(a.onPlay) && { effet: outcome(a.onPlay) }),
    ...(outcome(a.onSuccess) && { succes: outcome(a.onSuccess) }),
    ...(outcome(a.onFailure) && { echec: outcome(a.onFailure) }),
    source: disciplineName,
  };
}

/** Toutes les cartes de discipline, converties, ordonnées par fichier puis par clé. */
export function getDisciplineCards(locale: Locale = "fr"): ActionCard[] {
  if (!existsSync(DISCIPLINES_DIR)) return [];
  const cards: ActionCard[] = [];
  for (const file of readdirSync(DISCIPLINES_DIR).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    let doc: RawDisciplineFile | undefined;
    try {
      doc = load(readFileSync(join(DISCIPLINES_DIR, file), "utf-8")) as RawDisciplineFile;
    } catch {
      continue;
    }
    const disciplineName = L(doc?.discipline?.name, locale) || doc?.discipline?.id || "";
    for (const [id, a] of Object.entries(doc?.actions ?? {})) {
      cards.push(toCard(id, a, disciplineName, locale));
    }
  }
  return cards;
}
