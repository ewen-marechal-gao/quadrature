/**
 * src/lib/equipment.ts — le CATALOGUE d'objets (§ rules/fr/core/equipement.md).
 *
 * ⚠️ MODULE CÔTÉ SERVEUR (node:fs). À n'importer QUE depuis un Server Component,
 * et jamais autrement qu'en `import type` depuis un composant client — les
 * libellés vivent pour cette raison dans `lib/equipment-labels.ts`.
 *
 * Source : `data/equipment/*.yaml`, la même que le simulateur lit
 * (simulator/src/equipment/items-data.ts). Aucune valeur n'est recalculée ici —
 * la page PROJETTE le registre, elle ne le redéfinit pas.
 *
 * Ce que la page montre est donc l'état RÉEL de la donnée, y compris ses trous :
 * les arcs, les arbalètes et les « Protections avancées » du vault n'y sont pas
 * encore, et la colonne `mechanic` est du texte que le moteur n'applique pas.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import type { LocalizedString as SimLocale } from "@sim/locale";
import type {
  ArmorItem, ConsumableItem, ContainerItem, GearItem, ShieldItem, WeaponItem,
} from "@sim/equipment/types";
import { localize } from "@/lib/nav";
import {
  FAMILY_HINTS,
  FAMILY_LABELS,
  type BodyZone,
  type ItemKind,
  type SlotSize,
  type WeaponFamily,
} from "@/lib/equipment-labels";

// ─── Types d'affichage ────────────────────────────────────────────────────────

/**
 * L'union discriminée du simulateur, APLATIE : un objet unique dont tout champ
 * de toute nature est optionnel.
 *
 * C'est ce dont un composant de carte a besoin — lire `item.protection` sans
 * re-discriminer — et surtout, la liste des champs n'est écrite NULLE PART ici :
 * elle est celle du simulateur, à la trace. Un champ ajouté à `WeaponItem` (le
 * DD de rechargement des arbalètes, par exemple) devient lisible sur la carte
 * sans qu'une ligne de ce fichier bouge.
 *
 * ⚠️ `kind` est retiré de CHAQUE nature avant l'intersection, et non de leur
 * intersection : chacune le fige sur un littéral différent, et TypeScript réduit
 * une intersection à discriminant sans recouvrement à `never` — l'`Omit` arrivé
 * après n'aurait plus rien à retirer. Le champ est réintroduit en union, plus bas.
 */
type AnyItemFields = Partial<
  & Omit<WeaponItem, "kind">
  & Omit<ArmorItem, "kind">
  & Omit<ShieldItem, "kind">
  & Omit<ContainerItem, "kind">
  & Omit<ConsumableItem, "kind">
  & Omit<GearItem, "kind">
>;

/** Remplace chaque champ Locale `{ fr, en? }` par la chaîne DÉJÀ localisée. */
type Localized<T> = {
  [K in keyof T]: NonNullable<T[K]> extends SimLocale ? string : T[K];
};

/**
 * Un objet du catalogue, localisé et prêt à afficher.
 *
 * `grants` est écarté : le site n'affiche pas la grammaire moteur, il dit
 * seulement si elle existe (`wired`). Tout le reste vient du simulateur.
 */
export type EquipmentItem = Localized<Omit<AnyItemFields, "grants">> & {
  id: string;
  kind: ItemKind;
  /** Ces trois-là sont toujours présents, là où l'aplatissement les rend optionnels. */
  name: string;
  size: SlotSize;
  slots: number;
  zones: BodyZone[];
  /**
   * true quand l'objet porte un bloc `grants` — la grammaire que le moteur
   * applique. Aujourd'hui faux partout : la mécanique est déclarée, pas jouée.
   * Les champs STRUCTURÉS (portée, attaques, protection, provides…) sont, eux,
   * bel et bien lus par le simulateur.
   */
  wired: boolean;
};

/** Un bloc d'affichage : une famille d'armes, ou la nature entière. */
export interface EquipmentGroup {
  id: string;
  label?: string;
  /** Bandeau de la famille, repris du vault. */
  hint?: string;
  items: EquipmentItem[];
}

/** Une rubrique de la page : armes, armures, conteneurs… */
export interface EquipmentSection {
  id: string;
  label: string;
  groups: EquipmentGroup[];
}

// ─── Chargement ───────────────────────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), "..", "data", "equipment");

/**
 * Les trois fichiers du registre, avec leur clé racine et leur `kind` implicite
 * — mêmes conventions que le loader du simulateur (items-data.ts).
 */
const FILES: { file: string; root: string; defaultKind?: ItemKind }[] = [
  { file: "weapons.yaml", root: "weapons", defaultKind: "weapon" },
  { file: "protections.yaml", root: "items" },
  { file: "gear.yaml", root: "items" },
];

/**
 * Objets écartés du catalogue : ce sont les ÉTALONS de non-régression du
 * simulateur (l'arme d'une fiche qui n'en déclare aucune), pas du matériel qu'un
 * joueur équipe. Ils n'ont d'ailleurs pas de ligne au vault.
 */
const SIMULATOR_STANDINS = new Set(["generic-melee", "generic-bow"]);

/**
 * Une entrée du YAML, telle qu'elle est écrite : la même forme que le registre
 * du simulateur, mais AVANT résolution — `id` vient de la clé, `kind` et `size`
 * ont des valeurs implicites, et les champs Locale sont encore des objets.
 */
type RawItem = AnyItemFields & {
  /** Absent dans weapons.yaml, où `kind: weapon` est implicite. */
  kind?: ItemKind;
  name: SimLocale;
  slots: number;
  zones: BodyZone[];
};

/**
 * Reconnaît une chaîne Locale `{ fr, en? }` à sa forme.
 *
 * La convention du projet — « toute chaîne affichable est une Locale » — suffit
 * à décider : un objet portant un `fr` textuel EST une Locale, et rien d'autre
 * dans le registre n'a cette forme (`provides` porte `size`/`count`). C'est ce
 * qui permet de localiser sans énumérer les champs concernés, donc sans tenir
 * une quatrième liste à jour.
 */
function isLocale(value: unknown): value is SimLocale {
  return typeof value === "object" && value !== null
    && typeof (value as { fr?: unknown }).fr === "string";
}

/** Tous les objets du registre, dans l'ordre des fichiers (celui du vault). */
export function getAllItems(locale = "fr"): EquipmentItem[] {
  const out: EquipmentItem[] = [];

  for (const { file, root, defaultKind } of FILES) {
    const path = join(DATA_DIR, file);
    if (!existsSync(path)) continue;
    const doc = load(readFileSync(path, "utf-8")) as Record<
      string,
      Record<string, RawItem>
    > | null;

    for (const [id, raw] of Object.entries(doc?.[root] ?? {})) {
      if (SIMULATOR_STANDINS.has(id)) continue;

      // Projection GÉNÉRIQUE : chaque champ est repris tel quel, les Locale
      // résolues au passage. Un champ ajouté au registre du simulateur devient
      // donc lisible sur la carte sans qu'on touche à ce fichier. `grants` est
      // le seul écarté — le site n'en montre que l'existence, via `wired`.
      const projected = Object.fromEntries(
        Object.entries(raw)
          .filter(([key]) => key !== "grants")
          .map(([key, value]) => [key, isLocale(value) ? localize(value, locale) : value]),
      );

      // Même patron que le loader du simulateur (items-data.ts) : la sortie du
      // YAML est castée UNE fois, au point d'entrée, après avoir posé les champs
      // que le fichier laisse implicites.
      out.push({
        ...projected,
        id,
        kind: raw.kind ?? defaultKind ?? "gear",
        // Une arme, une armure, un conteneur occupent des 🔳 : `normal` est le
        // défaut, et seuls les petits objets déclarent `size: small`.
        size: raw.size ?? "normal",
        zones: raw.zones ?? [],
        wired: Boolean(raw.grants),
      } as EquipmentItem);
    }
  }
  return out;
}

// ─── Groupement ───────────────────────────────────────────────────────────────

/** Ordre d'affichage des familles d'armes — celui des tableaux du vault. */
const FAMILY_ORDER: WeaponFamily[] = [
  "short-blades", "long-blades", "impact", "polearms", "bows", "crossbows",
];

/**
 * Le catalogue rangé par NATURE, les armes sous-groupées par famille.
 *
 * Les groupes vides sont omis : c'est ce qui rend visible, sans le coder en dur,
 * qu'aucun arc ni aucune arbalète n'est encore dans la donnée.
 */
export function groupItems(items: EquipmentItem[]): EquipmentSection[] {
  const of = (kind: ItemKind) => items.filter((i) => i.kind === kind);

  const weapons: EquipmentSection = {
    id: "weapons",
    label: "Armes",
    groups: FAMILY_ORDER.map((family) => ({
      id: family,
      label: FAMILY_LABELS[family],
      hint: FAMILY_HINTS[family],
      items: items.filter((i) => i.kind === "weapon" && i.family === family),
    })).filter((g) => g.items.length > 0),
  };

  const flat = (id: string, label: string, kinds: ItemKind[]): EquipmentSection => ({
    id,
    label,
    groups: [{ id, items: kinds.flatMap(of) }].filter((g) => g.items.length > 0),
  });

  return [
    weapons,
    flat("protections", "Armures et boucliers", ["armor", "shield"]),
    flat("containers", "Conteneurs", ["container"]),
    flat("consumables", "Consommables", ["consumable"]),
    flat("gear", "Équipement divers", ["gear"]),
  ].filter((s) => s.groups.length > 0);
}
