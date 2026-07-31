/**
 * Inventaire porté — ce qu'un personnage a sur le corps, et ce qui s'en dérive.
 *
 * L'inventaire est une DONNÉE (quels objets, dans quelle zone) ; tout le reste
 * — Protection 🛡️, encombrement, portée d'attaque, gardes disponibles — est
 * RECALCULÉ ici. Rien de dérivé n'est stocké sur la fiche, même règle que pour
 * les caractéristiques (§ character/io.ts).
 *
 * ── Le repli, et pourquoi il compte ──────────────────────────────────────────
 * Une fiche SANS bloc `inventory` n'est pas un personnage nu : c'est un
 * personnage dont l'équipement n'est pas modélisé. Le moteur doit alors se
 * comporter exactement comme avant le chantier — portées lues sur l'action,
 * aucune attaque interdite. `hasEquipment()` est ce commutateur, et c'est lui
 * qui garantit que le banc ne bouge pas d'un chiffre tant qu'aucune fiche n'a
 * été migrée.
 */

import type { BodyZone, Item, WeaponItem, ShieldItem, AttackKind } from './types'
import { ZONE_CAPACITY, isWeapon, isArmor, isShield, isContainer } from './types'
import { getItem } from './items-data'

/** Objets portés, rangés par zone du corps. C'est la seule donnée stockée. */
export interface Inventory {
  worn: Partial<Record<BodyZone, string[]>>
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

/** L'inventaire est-il modélisé ? Faux = repli sur le comportement d'avant le chantier. */
export function hasEquipment(inv?: Inventory): inv is Inventory {
  return inv != null && Object.values(inv.worn).some(ids => ids != null && ids.length > 0)
}

/** Ids portés dans une zone. */
export function zoneItems(inv: Inventory, zone: BodyZone): Item[] {
  return (inv.worn[zone] ?? []).map(getItem)
}

/** Tous les objets portés, toutes zones confondues. */
export function allItems(inv: Inventory): Item[] {
  return (Object.keys(inv.worn) as BodyZone[]).flatMap(z => zoneItems(inv, z))
}

// ─── Protection ───────────────────────────────────────────────────────────────

/**
 * Protection 🛡️ de base — le stock qui se vide et ne revient pas.
 * Somme des armures du torse et des pièces isolées (heaume, jambières).
 */
export function baseProtection(inv: Inventory): number {
  return allItems(inv).reduce((n, i) => {
    if (isArmor(i)) return n + i.protection
    if (i.kind === 'gear') return n + (i.protection ?? 0)
    return n
  }, 0)
}

/**
 * Protection 🛡️ retenue par le moteur : DÉRIVÉE de l'équipement dès qu'il y en
 * a, sinon la valeur saisie sur la fiche (héritée d'avant le chantier).
 *
 * Les deux chemins ne coexistent jamais pour une même fiche : une fiche migrée
 * n'a plus à porter le nombre, et une fiche non migrée n'a pas d'armure à
 * sommer. C'est ce qui rend la migration mesurable une fiche à la fois.
 */
export function effectiveProtection(inv: Inventory | undefined, declared = 0): number {
  return hasEquipment(inv) ? baseProtection(inv) : declared
}

/**
 * Protection 🛡️ REGAGNÉE à chaque manche (boucliers) — se branche sur
 * `tempProtection`, qui expire déjà en fin de manche.
 */
export function roundProtection(inv: Inventory): number {
  return allItems(inv).reduce(
    (n, i) => (isShield(i) ? n + i.protectionPerRound : n), 0)
}

// ─── Armes ────────────────────────────────────────────────────────────────────

/** Armes tenues en main — les seules avec lesquelles on frappe. */
export function wieldedWeapons(inv: Inventory): WeaponItem[] {
  return zoneItems(inv, 'hands').filter(isWeapon)
}

/**
 * Armes rangées mais DÉGAINABLES : leur zone porte un fourreau ou un harnais.
 * Sans porteur, une arme au Dos est transportée, pas jouable (§ equipement —
 * « Permet un accès à une arme en combat »).
 */
export function drawableWeapons(inv: Inventory): WeaponItem[] {
  const out: WeaponItem[] = []
  for (const zone of Object.keys(inv.worn) as BodyZone[]) {
    if (zone === 'hands') continue
    const items = zoneItems(inv, zone)
    const carries = items.some(i => isContainer(i) && (i.carries === 'weapon' || i.carries === 'any'))
    if (carries) out.push(...items.filter(isWeapon))
  }
  return out
}

/** Le bouclier tenu, s'il y en a un. */
export function wieldedShield(inv: Inventory): ShieldItem | undefined {
  return zoneItems(inv, 'hands').find(isShield)
}

/** Attaques ouvertes par l'armement en main. */
export function availableAttacks(inv: Inventory): Set<AttackKind> {
  const out = new Set<AttackKind>()
  for (const w of wieldedWeapons(inv)) for (const a of w.attacks) out.add(a)
  return out
}

/**
 * Portée, en cases, avec laquelle le porteur peut délivrer cette attaque —
 * la MEILLEURE de ses armes en main qui l'ouvre. Une lance et une dague en
 * mains : la Frappe vive porte à 3, parce que c'est la lance qui frappe.
 * `undefined` = aucune arme en main ne permet cette attaque.
 */
export function reachFor(inv: Inventory, attack: AttackKind): number | undefined {
  const able = wieldedWeapons(inv).filter(w => w.attacks.includes(attack))
  if (able.length === 0) return undefined
  return Math.max(...able.map(w => w.reach))
}

/** Distance minimale imposée par l'arme qui sert cette attaque (arc engagé). */
export function minRangeFor(inv: Inventory, attack: AttackKind): number {
  const able = wieldedWeapons(inv).filter(w => w.attacks.includes(attack))
  if (able.length === 0) return 0
  // On retient l'arme la plus longue, donc sa contrainte de distance minimale.
  const best = able.reduce((a, b) => (b.reach > a.reach ? b : a))
  return best.minRange ?? 0
}

/** Une arme en main permet-elle de parer ⚡ ? (Ce que `guards.yaml` approximait par Puissance ≥ 1.) */
export function canParry(inv: Inventory): boolean {
  return wieldedWeapons(inv).some(w => w.canParry)
}

/** Un bouclier en main permet-il de bloquer ⚡ ? (Ce que `guards.yaml` approximait par Robustesse ≥ 2.) */
export function canBlock(inv: Inventory): boolean {
  return wieldedShield(inv) != null
}

// ─── Encombrement ─────────────────────────────────────────────────────────────

/** 🔳 consommés dans une zone. */
export function usedSlots(inv: Inventory, zone: BodyZone): number {
  return zoneItems(inv, zone)
    .filter(i => i.size === 'normal')
    .reduce((n, i) => n + i.slots, 0)
}

/** 🔳 consommés au total — à comparer à la Charge Maximale (2 + Force + Robustesse). */
export function totalSlots(inv: Inventory): number {
  return (Object.keys(inv.worn) as BodyZone[]).reduce((n, z) => n + usedSlots(inv, z), 0)
}

/**
 * Zones où le nombre d'objets dépasse la capacité anatomique — on ne porte pas
 * trois sacs sur le dos. Distinct de la surcharge, qui est une question de poids.
 */
export function overfilledZones(inv: Inventory): BodyZone[] {
  return (Object.keys(inv.worn) as BodyZone[])
    .filter(z => usedSlots(inv, z) > ZONE_CAPACITY[z])
}

/**
 * Surcharge : 🔳 occupés au-delà de la Charge Maximale. Chaque point coûte
 * un 🟦 sur TOUS les jets physiques (§ equipement — La Surcharge).
 */
export function overload(inv: Inventory, carryCapacity: number): number {
  return Math.max(0, totalSlots(inv) - carryCapacity)
}
