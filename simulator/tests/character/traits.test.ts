/**
 * TRAITS de personnage — registre, progression, et effets mécaniques.
 *
 * Ce qu'on verrouille ici, c'est le CONTRAT du système, pas l'équilibrage :
 *  · la source data/traits.yaml couvre le vault, et sa prose n'est jamais parsée ;
 *  · une fiche ne peut pas porter un trait que sa progression n'ouvre pas ;
 *  · un mode réactif ⚒️ AJOUTE une variante — il ne retire pas l'action du plan ;
 *  · un ajustement de coût est vu par le moteur ET par le planificateur.
 */
import fs from 'fs'
import path from 'path'
import {
  TRAIT_DEFS, TRAITS_FILE, traitSlots, validateTraits,
} from '../../src/character/traits'
import { validateCharacter } from '../../src/character/character'
import { ACTION_DEFS, defFor, canAffordAction } from '../../src/combat/actions'
import { hasTrait, reactionDefs, applyTraitOverlays } from '../../src/combat/traits'
import type { SkillName } from '../../src/character/types'
import { makeCharacter, makeCombatant } from '../helpers/fixtures'

// ─── Le registre et sa source ─────────────────────────────────────────────────

describe('data/traits.yaml — le registre', () => {
  it('charge les traits du vault', () => {
    expect(Object.keys(TRAIT_DEFS).length).toBeGreaterThanOrEqual(35)
  })

  it('couvre TOUS les traits de rules/fr/core/traits.md (aucun oubli)', () => {
    const vault = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'rules', 'fr', 'core', 'traits.md'), 'utf-8')
    // Chaque trait du .md s'annonce « **⚒️ Nom :** » ou « **♾️ Nom :** ».
    const names = [...vault.matchAll(/\*\*(?:⚒️|♾️)\s*([^:—*]+?)\s*(?:—[^:]*)?:\*\*/g)]
      .map(m => m[1].trim())
    expect(names.length).toBeGreaterThan(30)

    const known = new Set(Object.values(TRAIT_DEFS).map(t => t.name))
    expect(names.filter(n => !known.has(n))).toEqual([])
  })

  it('n\'a de `grants` que sur les traits réellement branchés (le reste = prose)', () => {
    const wired = Object.values(TRAIT_DEFS).filter(t => t.grants).map(t => t.id).sort()
    expect(wired).toEqual(['momentum', 'opportunisme', 'tir-dinstinct'])
  })

  it('vise toujours une action que le moteur connaît, quand il y a un `grants`', () => {
    for (const t of Object.values(TRAIT_DEFS)) {
      if (!t.grants) continue
      expect(t.action).toBeDefined()
      expect(ACTION_DEFS[t.action as never]).toBeDefined()
    }
  })

  it('garde la prose telle quelle — elle n\'est jamais interprétée', () => {
    const raw = fs.readFileSync(TRAITS_FILE, 'utf-8')
    expect(raw).toContain('Réduit d\'un point le coût en fatigue')
    expect(TRAIT_DEFS['momentum'].effect).toContain('Frappe brutale')
  })
})

// ─── Progression (§ personnages.md : rangs 3 et 5) ────────────────────────────

describe('progression — un trait s\'achète, il ne se décrète pas', () => {
  it('ouvre un emplacement au rang 3, un second au rang 5', () => {
    expect([0, 1, 2, 3, 4, 5].map(traitSlots)).toEqual([0, 0, 0, 1, 1, 2])
  })

  const skills = (over: Partial<Record<SkillName, number>>) =>
    ({ ...makeCharacter().skills, ...over })

  it('refuse un trait dont le rang n\'est pas atteint', () => {
    const errors = validateTraits(['opportunisme'], skills({ precision: 2 }))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/rank 2/)
  })

  it('accepte le trait dès le rang 3', () => {
    expect(validateTraits(['opportunisme'], skills({ precision: 3 }))).toEqual([])
  })

  it('refuse deux traits d\'une compétence au rang 3 (un seul emplacement)', () => {
    // Puissance propose 3 traits pour 2 emplacements : le joueur choisit.
    expect(validateTraits(['momentum', 'poings-de-fer'], skills({ power: 3 }))).toHaveLength(1)
    expect(validateTraits(['momentum', 'poings-de-fer'], skills({ power: 5 }))).toEqual([])
  })

  it('refuse un id inconnu', () => {
    expect(validateTraits(['trait-imaginaire'], skills({}))[0]).toMatch(/Unknown trait/)
  })

  it('est appliquée par validateCharacter (la fiche entière est cohérente ou rien)', () => {
    const bad = makeCharacter({ traits: ['opportunisme'] })   // precision 2 dans la fixture
    expect(validateCharacter(bad).valid).toBe(false)

    const good = makeCharacter({
      traits: ['opportunisme'],
      skills: { ...makeCharacter().skills, precision: 3 },
    })
    expect(validateCharacter(good).valid).toBe(true)
  })

  it('recopie les traits de la fiche sur le combattant', () => {
    const c = makeCombatant('Porteur', {
      traits: ['opportunisme'], skills: { ...makeCharacter().skills, precision: 3 },
    })
    expect(c.traits).toEqual(['opportunisme'])
    expect(hasTrait(c, 'opportunisme')).toBe(true)
    expect(hasTrait(c, 'momentum')).toBe(false)
  })
})

// ─── Famille `reactiveMode` (Opportunisme, Tir d'instinct) ────────────────────

describe('mode réactif ⚒️ — l\'action gagne un déclencheur', () => {
  const bearer = () => makeCombatant('Opportuniste', {
    traits: ['opportunisme'], skills: { ...makeCharacter().skills, precision: 3 },
  })

  it('donne à la Frappe vive un déclencheur et le coût de la réaction', () => {
    const [variant, ...rest] = reactionDefs(bearer(), ACTION_DEFS['sharp-strike'])
    expect(rest).toHaveLength(0)
    expect(variant.trigger).toEqual({ on: 'movement-initiated', scope: 'reach' })
    // « Le coût devient ⚡💧 au lieu de ⚫ » : plus aucun PA, une réaction.
    expect(variant.cost).toMatchObject({ actions: 0, reactions: 1, fatigue: 1 })
  })

  it('n\'AJOUTE qu\'un mode : l\'action de base reste intacte et planifiable', () => {
    const s = bearer()
    // La def de base n'a pas bougé — pas de trigger, donc le planificateur la garde.
    expect(ACTION_DEFS['sharp-strike'].trigger).toBeUndefined()
    expect(defFor(s, 'sharp-strike').cost).toEqual(ACTION_DEFS['sharp-strike'].cost)
  })

  it('ne donne rien sans le trait', () => {
    expect(reactionDefs(makeCombatant('Quelconque'), ACTION_DEFS['sharp-strike'])).toEqual([])
  })

  it('ne touche pas les actions que le trait ne vise pas', () => {
    expect(reactionDefs(bearer(), ACTION_DEFS['armed-attack'])).toEqual([])
  })

  it('laisse passer les déclencheurs NATIFS, avec ou sans trait', () => {
    for (const s of [makeCombatant('Nu'), bearer()]) {
      const [native] = reactionDefs(s, ACTION_DEFS['opportunity-strike'])
      expect(native).toBe(ACTION_DEFS['opportunity-strike'])
    }
  })
})

// ─── Famille `costDelta` (Momentum) ───────────────────────────────────────────

describe('ajustement de coût ⚒️ — Momentum', () => {
  const bearer = () => makeCombatant('Cogneur', {
    traits: ['momentum'], skills: { ...makeCharacter().skills, power: 3 },
  })

  it('retire un point de fatigue à la Frappe brutale', () => {
    const base = ACTION_DEFS['brutal-strike']
    expect(base.cost.fatigue).toBe(2)
    expect(defFor(bearer(), 'brutal-strike').cost).toMatchObject({ actions: 2, fatigue: 1 })
  })

  it('ne touche à rien d\'autre — mêmes issues, même initiative, autres actions intactes', () => {
    const s = bearer()
    const def = defFor(s, 'brutal-strike')
    expect(def.initiative).toBe(ACTION_DEFS['brutal-strike'].initiative)
    expect(def.outcomes).toBe(ACTION_DEFS['brutal-strike'].outcomes)
    expect(defFor(s, 'sharp-strike')).toBe(ACTION_DEFS['sharp-strike'])
  })

  it('est vu par l\'économie d\'action : le coup passe à un souffle du plafond', () => {
    const skills = { ...makeCharacter().skills, power: 3 }
    // Plafond de fatigue = 20 : à 18💧, 2💧 est refusé, 1💧 passe encore.
    const sans = { ...makeCombatant('Sans', { skills }), fatigue: 18 }
    const avec = { ...makeCombatant('Avec', { traits: ['momentum'], skills }), fatigue: 18 }
    expect(canAffordAction(sans, 'brutal-strike')).toBe(false)
    expect(canAffordAction(avec, 'brutal-strike')).toBe(true)
  })

  it('rend la même référence quand aucun trait ne s\'applique (pas de surcoût)', () => {
    const nu = makeCombatant('Nu')
    expect(applyTraitOverlays(nu, ACTION_DEFS['brutal-strike'])).toBe(ACTION_DEFS['brutal-strike'])
  })
})
