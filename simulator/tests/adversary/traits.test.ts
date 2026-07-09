/**
 * Structured trait registry (adversary/traits.ts) + self-targeted card ops.
 *
 * Sanguinaire (§ Traits d'adversaires) : si la cible souffre d'au moins une
 * hémorragie 🩸, la créature gagne 🟩 sur ses actions offensives.
 * Griffes (Lacération ⭐) : la cible saigne ET le prédateur gagne +1 ◇
 * (op auto-ciblée gainStability, routée vers l'attaquant via selfId).
 */
import { loadAdversary } from '../../src/adversary/io'
import { initAdversary, type AdversaryCombatant } from '../../src/adversary/combatant'
import { hasTrait, hasCardTag, attackAdvantages } from '../../src/adversary/traits'
import { scoreAdversaryAttack } from '../../src/adversary/attack'
import type { AdversaryCardDef } from '../../src/adversary/types'
import type { AdversaryRollResult } from '../../src/adversary/dice'
import { STATUS_DEFS } from '../../src/combat/status'
import type { CombatantState, StatusEffect } from '../../src/combat/types'

async function faucheur(): Promise<AdversaryCombatant> {
  return initAdversary(await loadAdversary('faucheur'))
}

/** Minimal PC stand-in: attackAdvantages only reads `bleed` (jetons 🩸). */
const pcBleeding = (bleed: number): CombatantState =>
  ({ bleed } as unknown as CombatantState)

const card = (c: AdversaryCombatant, id: string) =>
  c.sheet.cards.find(k => k.id === id)!

// ─── Trait registry ───────────────────────────────────────────────────────────

describe('hasTrait', () => {
  it('finds the structured sanguinaire trait on the Faucheur fiche', async () => {
    const c = await faucheur()
    expect(hasTrait(c, 'sanguinaire')).toBe(true)
    expect(hasTrait(c, 'unknown-trait')).toBe(false)
  })
})

describe('hasCardTag', () => {
  it('reads the tags carried by the fiche (never inferred from effects)', async () => {
    const c = await faucheur()
    expect(hasCardTag(card(c, 'sickleStrike'), 'offensive')).toBe(true)
    expect(hasCardTag(card(c, 'sickleStrike'), 'physicalDamage')).toBe(true)
    expect(hasCardTag(card(c, 'cry'), 'mental')).toBe(true)
    expect(hasCardTag(card(c, 'cry'), 'physicalDamage')).toBe(false)
    expect(hasCardTag(card(c, 'tailSweep'), 'fatigueDamage')).toBe(true)
    expect(hasCardTag(card(c, 'charge'), 'movement')).toBe(true)
  })
})

describe('attackAdvantages — Sanguinaire', () => {
  it('grants 🟩 on an offensive card when the target bleeds', async () => {
    const c = await faucheur()
    const r = attackAdvantages(c, card(c, 'sickleStrike'), pcBleeding(1))
    expect(r.advantages).toBe(1)
    expect(r.notes).toHaveLength(1)
  })

  it('does not apply to cards without physicalDamage (mental cry, fatigue sweep)', async () => {
    const c = await faucheur()
    expect(attackAdvantages(c, card(c, 'cry'),       pcBleeding(1)).advantages).toBe(0)
    expect(attackAdvantages(c, card(c, 'tailSweep'), pcBleeding(1)).advantages).toBe(0)
  })

  it('grants nothing when the target does not bleed', async () => {
    const c = await faucheur()
    const r = attackAdvantages(c, card(c, 'sickleStrike'), pcBleeding(0))
    expect(r.advantages).toBe(0)
  })

  it('grants nothing on a card not tagged offensive, even against a bleeding target', async () => {
    const c = await faucheur()
    const heal: AdversaryCardDef = {
      id: 'lick-wounds', name: 'Lèche-plaies', cost: 1, initiative: 1,
      tags: ['support', 'healing'],
      onSuccess: { text: '', effect: [] }, onFailure: { text: '', effect: [] },
    }
    const r = attackAdvantages(c, heal, pcBleeding(1))
    expect(r.advantages).toBe(0)
  })
})

// ─── Self-targeted ops (gainStability) ───────────────────────────────────────

describe('gainStability routing (Lacération ⭐)', () => {
  const rollWithFive: AdversaryRollResult =
    { dice: ['threat', 'threat', 'threat', 'threat'], values: [5, 3, 2, 4], total: 14, fives: 1 }

  it('routes the ◇ gain to the attacker while the 🩸 lands on the target', async () => {
    const lac = initAdversary(await loadAdversary('lacerateur'))
    const result = scoreAdversaryAttack(rollWithFive, card(lac, 'laceration'), 10, 'pc', 'lacerateur')
    expect(result.fivesTriggered).toBe(true)
    expect(result.effects).toContainEqual({ targetId: 'pc', kind: 'add-status', status: 'hemorrhage' })
    expect(result.effects).toContainEqual({ targetId: 'lacerateur', kind: 'add-stability', amount: 1 })
  })

  it('drops the self op when no selfId is provided', async () => {
    const lac = initAdversary(await loadAdversary('lacerateur'))
    const result = scoreAdversaryAttack(rollWithFive, card(lac, 'laceration'), 10, 'pc')
    expect(result.effects.some(e => e.kind === 'add-stability')).toBe(false)
  })
})

// ─── À genoux 🧎 (nouvel état) ────────────────────────────────────────────────

describe('kneeling status', () => {
  it('gives melee attackers 🟩 and clears at round start without PA penalty', () => {
    const def = STATUS_DEFS.kneeling
    expect(def.attackerAdvantage).toBe(1)
    expect(def.onTokenReset!(undefined as unknown as CombatantState))
      .toEqual({ actionPenalty: 0, clear: true })
  })
})
