/**
 * Loader de `data/equipment/*.yaml` — le registre des objets.
 *
 * Même patron qu'actions-data.ts et guards-data.ts : lecture SYNCHRONE à
 * l'initialisation du module, pour que `ITEMS` reste une const importable
 * partout sans bootstrap asynchrone.
 *
 * Trois fichiers, un seul registre plat indexé par id :
 *  · weapons.yaml     — clé racine `weapons:`, `kind: weapon` implicite et
 *    `size: normal` par défaut (une arme n'occupe jamais un ▫️) ;
 *  · protections.yaml — clé racine `items:`, `kind` explicite (armor/shield/gear) ;
 *  · gear.yaml        — clé racine `items:`, `kind` explicite.
 *
 * Le loader VALIDE ce que le type ne peut pas garantir depuis du YAML : `kind`
 * connu, zones connues, `slots` cohérent avec la taille. Un id en double entre
 * fichiers est une erreur dure — deux objets homonymes rendraient l'inventaire
 * dépendant de l'ordre de lecture.
 */

import fs   from 'fs'
import path from 'path'
import { parse } from 'yaml'
import type { Item, ItemKind, BodyZone, WeaponItem } from './types'
import { ALL_BODY_ZONES } from './types'

/** Dossier source, à la racine du dépôt, à côté de player_actions.yaml. */
export const EQUIPMENT_DIR =
  path.resolve(__dirname, '..', '..', '..', 'data', 'equipment')

const FILES = [
  { file: 'weapons.yaml',     root: 'weapons', defaultKind: 'weapon' as ItemKind },
  { file: 'protections.yaml', root: 'items',   defaultKind: undefined },
  { file: 'gear.yaml',        root: 'items',   defaultKind: undefined },
] as const

const KNOWN_KINDS: readonly ItemKind[] =
  ['weapon', 'armor', 'shield', 'container', 'consumable', 'gear']

function validate(id: string, raw: Record<string, unknown>, file: string): void {
  const fail = (msg: string) => { throw new Error(`data/equipment/${file} → "${id}" : ${msg}`) }

  if (!KNOWN_KINDS.includes(raw.kind as ItemKind)) fail(`kind inconnu « ${String(raw.kind)} »`)
  if (raw.name == null) fail('champ `name` manquant')

  const zones = raw.zones as BodyZone[] | undefined
  if (!Array.isArray(zones) || zones.length === 0) fail('champ `zones` manquant ou vide')
  for (const z of zones!) if (!ALL_BODY_ZONES.includes(z)) fail(`zone inconnue « ${z} »`)

  if (typeof raw.slots !== 'number' || raw.slots < 0) fail('`slots` doit être un entier ≥ 0')

  if (raw.kind === 'weapon') {
    const w = raw as unknown as WeaponItem
    if (typeof w.reach !== 'number' || w.reach < 1)
      fail('`reach` est une portée ABSOLUE en cases, ≥ 1')
    if (!Array.isArray(w.attacks) || w.attacks.length === 0)
      fail('une arme doit ouvrir au moins une attaque (`attacks`)')
    if (typeof w.canParry !== 'boolean') fail('`canParry` manquant')
  }
}

/** Lit et fusionne les trois fichiers. Exposé pour le test de cohérence au vault. */
export function readItems(): Record<string, Item> {
  const registry: Record<string, Item> = {}

  for (const { file, root, defaultKind } of FILES) {
    const doc = parse(fs.readFileSync(path.join(EQUIPMENT_DIR, file), 'utf-8')) as
      Record<string, Record<string, Record<string, unknown>>>
    const block = doc[root] ?? {}

    for (const [id, rawEntry] of Object.entries(block)) {
      if (registry[id])
        throw new Error(`data/equipment : id « ${id} » défini deux fois (doublon dans ${file})`)

      const raw = {
        ...rawEntry,
        id,
        kind: rawEntry.kind ?? defaultKind,
        // Une arme, une armure, un conteneur occupent des 🔳 : `normal` est le
        // défaut, et seuls les petits objets déclarent `size: small`.
        size: rawEntry.size ?? 'normal',
      }
      validate(id, raw, file)
      registry[id] = raw as unknown as Item
    }
  }
  return registry
}

/** Registre complet, indexé par id. */
export const ITEMS: Record<string, Item> = readItems()

/** Accès typé — lève si l'id est inconnu (une fiche ne référence pas un fantôme). */
export function getItem(id: string): Item {
  const item = ITEMS[id]
  if (!item) throw new Error(`Objet inconnu : « ${id} » (cf. data/equipment/)`)
  return item
}

/**
 * L'arme par défaut d'un personnage qui n'en déclare aucune.
 * Elle reproduit le comportement d'avant le modèle d'équipement : c'est le
 * témoin de non-régression du chantier.
 */
export const DEFAULT_MELEE_WEAPON_ID = 'generic-melee'
