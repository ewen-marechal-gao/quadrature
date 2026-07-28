/**
 * src/lib/combat-labels.ts — libellés d'affichage du visualiseur de combat.
 *
 * Pur (aucun import node) → importable côté client. On assume le risque de
 * divergence avec le vault/les fiches (même parti pris que la prose des cartes) :
 * un id inconnu retombe proprement sur sa forme brute plutôt que de coupler le
 * visualiseur aux données de règles.
 */

import type { CombatEffect } from "@/lib/combat-report";

/** Nom lisible d'une action / carte jouée. Fallback : l'id brut. */
const ACTION_LABELS: Record<string, string> = {
  // Actions universelles / déplacement
  walk: "Marche",
  course: "Course",
  charge: "Charge",
  respiration: "Respiration",
  stabilize: "Stabilisation",
  // Attaques PJ
  "sharp-strike": "Frappe vive",
  "armed-attack": "Attaque armée",
  "brutal-strike": "Frappe brutale",
  "unarmed-attack": "Attaque à mains nues",
  // Cartes du Faucheur (bestiaire)
  cry: "Cri",
  sickleStrike: "Coup de faux",
  bite: "Morsure",
};

export function actionLabel(id: string): string {
  return ACTION_LABELS[id] ?? id;
}

/** Statuts, avec un pictogramme quand il en existe un. */
const STATUS_LABELS: Record<string, string> = {
  winded: "😮‍💨 essoufflé",
  stunned: "💫 sonné",
  knockdown: "🙏 à terre",
  hemorrhage: "🩸 hémorragie",
  entrapped: "🕸️ entravé",
  kneeling: "🧎 à genoux",
  incapacitated: "😵‍💫 incapacité",
  "near-death": "😵 mourant",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Un effet, réduit à une puce compacte pour le journal de phase. */
export function describeEffect(e: CombatEffect): string | null {
  const n = typeof e.value === "number" ? e.value : (typeof e.amount === "number" ? (e.amount as number) : undefined);
  switch (e.kind) {
    case "light-wound":       return `${n ?? ""}💢`.trim();
    case "heavy-wound":       return "💔";
    case "heal-wounds":       return `soigne ${n ?? ""}💢`.trim();
    case "add-fatigue":       return `${n ?? ""}💧`.trim();
    case "remove-fatigue":    return `−${n ?? ""}💧`.trim();
    // 🔥 Combustion (add-burn : montant `amount`).
    case "add-burn":          return `${n ?? ""}🔥`.trim();
    // ⚡ Charge (add-charge : `delta` signé — ⊖ négatif / ⊕ positif).
    case "add-charge": {
      const d = typeof e.delta === "number" ? e.delta : 0;
      if (d === 0) return null;
      return d < 0 ? `+${-d}⊖` : `+${d}⊕`;
    }
    // ⚡ Dissipation d'une charge (dissipate-charge : `amount`, vers 0).
    case "dissipate-charge":  return `dissipe ${n ?? ""}⚡`.trim();
    case "add-status":        return `+ ${statusLabel(String(e.status))}`;
    case "remove-status":     return `− ${statusLabel(String(e.status))}`;
    case "spend-actions":     return `−${n ?? 1}⚫`;
    case "add-reaction":      return `+${n ?? 1}⚡`;
    case "spend-reaction":    return "−1⚡";
    case "add-temp-protection": return `+${n ?? ""}🛡️`.trim();
    case "add-stability":     return `+${n ?? ""}◇`.trim();
    case "drain-stability":   return `−${n ?? ""}◇`.trim();
    case "set-inertia":       return `inertie ➡️ ${n ?? 0}`;
    case "destabilize":       return "déstabilisé";
    case "shift-mental":
    case "shift-mental-broken":
      return e.direction === "toward-terror" ? "🔻 peur"
           : e.direction === "toward-rage"   ? "🔺 rage"
           : "🎯 recentré";
    case "set-mental":        return `état → ${String(e.state)}`;
    case "move": {
      const len = Array.isArray(e.path) ? e.path.length : 0;
      return `déplacement ${len} case${len > 1 ? "s" : ""}`;
    }
    // move-toward est une intention interne, jamais journalisée telle quelle.
    default:                  return e.kind;
  }
}

/** État mental — pictogramme (aligné sur MENTAL_ICONS du simulateur). */
const MENTAL_ICONS: Record<string, string> = {
  enraged: "😡", furious: "😠", aggressive: "😤", focused: "😐",
  cautious: "😟", panicked: "😨", terrified: "😱",
};

export function mentalIcon(state: string): string {
  return MENTAL_ICONS[state] ?? "";
}
