/**
 * src/lib/character/storage.ts
 *
 * Persistance localStorage du store multi-personnages + export/import JSON.
 * Toutes les fonctions sont sûres côté serveur (garde `isBrowser`).
 */

import { createEmptyCharacter } from "./derive";
import {
  CHAR_IDS,
  QUICK_SLOTS,
  RESISTANCE_BOXES,
  SKILL_IDS,
  SLOT_IDS,
  SMALL_SLOTS,
  STABILITY_BOXES,
} from "./constants";
import type {
  Character,
  CharacterStore,
  InventoryItem,
  SlotType,
  TraitEntry,
} from "./types";

// v2 : le modèle a changé de forme en juin 2026 (ids EN, inventaire en Record,
// item d'emplacement) → nouvelle clé pour ne pas relire des données v1 incompatibles.
const STORAGE_KEY = "quadrature.characters.v2";

const isBrowser = () => typeof window !== "undefined" && !!window.localStorage;

/**
 * Normalise/valide un objet inconnu en `Character` (robustesse import + migration).
 * On part d'un personnage vierge et on n'écrase que les champs présents et valides :
 * tout champ manquant ou mal typé retombe sur la valeur par défaut.
 */
export function sanitizeCharacter(raw: unknown, name?: string): Character {
  const base = createEmptyCharacter(name ?? "");
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  // Helpers de coercition défensive.
  const str = (v: unknown, fb: string) => (typeof v === "string" ? v : fb);
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  const boolArray = (v: unknown, len: number) =>
    Array.from({ length: len }, (_, i) => Array.isArray(v) && v[i] === true);

  // 1. Identité.
  if (typeof r.id === "string") base.id = r.id;
  base.name = str(r.name, base.name);
  if (typeof r.portrait === "string") base.portrait = r.portrait;
  base.bio = str(r.bio, base.bio);

  // 2. Compétences (rang 0–5) et cercles courants (0–5), par id connu uniquement.
  if (r.skills && typeof r.skills === "object") {
    const s = r.skills as Record<string, unknown>;
    for (const id of SKILL_IDS) base.skills[id] = Math.max(0, Math.min(5, num(s[id], 0)));
  }
  if (r.charCurrent && typeof r.charCurrent === "object") {
    const cc = r.charCurrent as Record<string, unknown>;
    for (const id of CHAR_IDS) base.charCurrent[id] = Math.max(0, Math.min(5, num(cc[id], 1)));
  }

  // 3. Pistes : cases cochées + jauges bornées.
  base.resistance = boolArray(r.resistance, RESISTANCE_BOXES);
  base.stability = boolArray(r.stability, STABILITY_BOXES);
  base.fatigue = Math.max(1, Math.min(20, num(r.fatigue, 1)));
  base.protection = Math.max(0, num(r.protection, 0));

  // 4. État mental (valeur de l'énumération uniquement).
  const MENTAL = new Set(["enraged", "furious", "aggressive", "focused", "cautious", "panicked", "terrified"]);
  if (typeof r.mentalState === "string" && MENTAL.has(r.mentalState)) {
    base.mentalState = r.mentalState as Character["mentalState"];
  }

  // 5. Inventaire : on garde les emplacements vierges (base) et on superpose
  //    type/objet/pips par SlotId connu ; rapides/petits = tableaux de libellés.
  if (r.inventory && typeof r.inventory === "object") {
    const inv = r.inventory as Record<string, unknown>;
    const rawSlots = (inv.slots && typeof inv.slots === "object" ? inv.slots : {}) as Record<string, unknown>;
    const SLOT_TYPE_SET = new Set<SlotType>(["", "weapon", "armor", "small", "pocket", "packet"]);
    for (const id of SLOT_IDS) {
      const s = rawSlots[id] as Record<string, unknown> | undefined;
      if (!s) continue;
      const slot = base.inventory.slots[id];
      if (SLOT_TYPE_SET.has(s.type as SlotType)) slot.type = s.type as SlotType;
      slot.pips = Math.max(0, Math.min(4, num(s.pips, 0)));
      const item = s.item as Record<string, unknown> | null | undefined;
      const itemText = item && typeof item === "object" ? str(item.itemText, "") : "";
      slot.item = itemText ? ({ itemText } as InventoryItem) : null;
    }
    base.inventory.quick = Array.from({ length: QUICK_SLOTS }, (_, i) =>
      str(Array.isArray(inv.quick) ? inv.quick[i] : "", ""),
    );
    base.inventory.small = Array.from({ length: SMALL_SLOTS }, (_, i) =>
      str(Array.isArray(inv.small) ? inv.small[i] : "", ""),
    );
  }

  // 6. Textes libres page 2.
  if (r.page2 && typeof r.page2 === "object") {
    const p = r.page2 as Record<string, unknown>;
    base.page2 = {
      description: str(p.description, ""),
      background: str(p.background, ""),
      notes: str(p.notes, ""),
    };
  }

  // 7. Traits & disciplines (liste d'entrées { name, desc }).
  if (Array.isArray(r.traits)) {
    base.traits = r.traits
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .map((t): TraitEntry => ({ name: str(t.name, ""), desc: str(t.desc, "") }));
  }

  return base;
}

/** Charge le store ; retourne null hors navigateur ou si vide/illisible. */
export function loadStore(): CharacterStore | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.characters)) return null;
    const characters = parsed.characters.map((c) => sanitizeCharacter(c));
    const currentId =
      typeof parsed.currentId === "string" && characters.some((c) => c.id === parsed.currentId)
        ? parsed.currentId
        : (characters[0]?.id ?? null);
    return { characters, currentId };
  } catch {
    return null;
  }
}

/** Persiste le store (no-op hors navigateur). */
export function saveStore(store: CharacterStore): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota dépassé / mode privé : on ignore silencieusement */
  }
}

// ─── Export / import fichier ───────────────────────────────────────────────────

function safeFilename(name: string): string {
  const slug = name
    // décompose les accents (é → e + ́) …
    .normalize("NFD")
    // … puis supprime les diacritiques combinants (U+0300–U+036F)
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    // tout caractère non alphanumérique → tiret
    .replace(/[^a-zA-Z0-9]+/g, "-")
    // retire les tirets en début/fin
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `quadrature-${slug || "personnage"}.json`;
}

/** Déclenche le téléchargement d'un personnage en JSON. */
export function downloadCharacter(c: Character): void {
  if (!isBrowser()) return;
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFilename(c.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Lit un fichier JSON et le valide en `Character` (rejette si illisible). */
export async function readCharacterFile(file: File): Promise<Character> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  return sanitizeCharacter(parsed);
}
