/**
 * Body-part health model tests, exercised against the real Faucheur fiche.
 *
 * Faucheur parts (armor · blocks):
 *   head    🛡️0  |▢▢| |▢▢| |▢▢|  → +1 ◇ · grants bite · grants shriek
 *   body    🛡️1  |▢▢▢|           → +1 🫁
 *   sickles 🛡️1  |▢▢▢| |▢▢▢|     → cost override sickleStrike · grants sickleStrike
 *   rearLeg 🛡️1  |▢▢| |▢▢▢|      → +1 action Charge (grants charge) · move · Évasion 1
 *   tail    🛡️0  |▢▢| |▢▢|       → immunity knockdown · grants tailSweep
 * fatigue 9 · dice 4×threat · guard Esquive 10.
 */
import { loadAdversary } from '../../src/adversary/io'
import {
  initAdversary, damagePart, addAdversaryFatigue, shiftAdversaryMental, startRound,
  activeDeck, cardCost, hasImmunity, grantedResource,
  canPlayCard, spendCardCost, baseActions,
  isBlockDestroyed, isPartDestroyed, isAdversaryDefeated,
  type AdversaryCombatant,
} from '../../src/adversary/combatant'

async function faucheur(): Promise<AdversaryCombatant> {
  return initAdversary(await loadAdversary('faucheur'))
}
const part = (c: AdversaryCombatant, type: string) =>
  [...c.parts, ...c.weapons].find(p => p.type === type)!

// ─── Initialisation & resources ───────────────────────────────────────────────

describe('initAdversary', () => {
  it('starts intact with resources granted by intact blocks', async () => {
    const c = await faucheur()
    expect(c.fatigue).toBe(0)
    expect(c.stability).toBe(1)   // head
    expect(c.endurance).toBe(1)   // body
    expect(c.evasion).toBe(1)     // rearLeg
    expect(c.mentalState).toBe('focused')
    expect(c.parts.some(isPartDestroyed)).toBe(false)
  })
})

// ─── Light wounds: armor + block filling ──────────────────────────────────────

describe('damagePart — light wounds', () => {
  it('at least 1 wound lands through armor (§ minimum 1)', async () => {
    const c = await faucheur()
    // body armor 1, deal 1💢 → max(1, 1-1) = 1 mark
    const d = damagePart(c, 'body', { light: 1 })
    expect(part(d, 'body').blocks[0].damage).toBe(1)
  })

  it('armor reduces excess light wounds', async () => {
    const c = await faucheur()
    // rearLeg armor 1, deal 3💢 → max(1, 3-1) = 2 marks into the top block (|▢▢|)
    const d = damagePart(c, 'rearLeg', { light: 3 })
    expect(part(d, 'rearLeg').blocks[0].damage).toBe(2)
    expect(isBlockDestroyed(part(d, 'rearLeg').blocks[0])).toBe(true)
  })

  it('fills blocks top → bottom, spilling into the next block', async () => {
    const c = await faucheur()
    // sickles armor 1, top block |▢▢▢| (3). Deal 6💢 → 5 land: 3 fill top (destroyed) + 2 into next.
    const d = damagePart(c, 'sickles', { light: 6 })
    const s = part(d, 'sickles')
    expect(s.blocks[0].damage).toBe(3)
    expect(isBlockDestroyed(s.blocks[0])).toBe(true)
    expect(s.blocks[1].damage).toBe(2)
  })

  it('does not mutate the input state', async () => {
    const c = await faucheur()
    damagePart(c, 'body', { light: 2 })
    expect(part(c, 'body').blocks[0].damage).toBe(0)
  })
})

// ─── Heavy wounds & evasion ───────────────────────────────────────────────────

describe('damagePart — heavy wounds & evasion', () => {
  it('a heavy wound is first converted by an Evasion token into 3💢', async () => {
    const c = await faucheur()  // evasion 1
    // Target head (armor 0, |▢▢|): 1💔 → evasion spends → 3💢 armor-reduced (3) → block full.
    const d = damagePart(c, 'head', { heavy: 1 })
    expect(d.evasion).toBe(0)
    expect(isBlockDestroyed(part(d, 'head').blocks[0])).toBe(true)
  })

  it('without evasion, a heavy wound destroys the top intact block', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    const d = damagePart(c, 'sickles', { heavy: 1 })
    const s = part(d, 'sickles')
    expect(isBlockDestroyed(s.blocks[0])).toBe(true)   // top block destroyed
    expect(isBlockDestroyed(s.blocks[1])).toBe(false)  // lower block intact
  })
})

// ─── Dynamic deck & cost ──────────────────────────────────────────────────────

describe('capability derivation', () => {
  it('the deck lists every card whose granting block is intact', async () => {
    const c = await faucheur()
    expect(activeDeck(c).map(k => k.id).sort())
      .toEqual(['bite', 'charge', 'shriek', 'sickleStrike', 'tailSweep'])
  })

  it('destroying the granting block drops the card from the deck', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // sickles lower block grants sickleStrike; destroy both blocks (top then lower).
    c = damagePart(c, 'sickles', { heavy: 1 })
    c = damagePart(c, 'sickles', { heavy: 1 })
    expect(activeDeck(c).map(k => k.id).sort())
      .toEqual(['bite', 'charge', 'shriek', 'tailSweep'])
  })

  it('the sickles upper block overrides sickleStrike cost to ⚫ while intact', async () => {
    let c = await faucheur()
    expect(cardCost(c, 'sickleStrike')).toBe(1)   // override active
    c = { ...c, evasion: 0 }
    c = damagePart(c, 'sickles', { heavy: 1 })     // destroy the upper (cost) block
    expect(cardCost(c, 'sickleStrike')).toBe(2)   // base cost ⚫⚫ returns
  })

  it('exposes knockdown immunity from the intact tail', async () => {
    let c = await faucheur()
    expect(hasImmunity(c, 'knockdown')).toBe(true)
    c = { ...c, evasion: 0 }
    c = damagePart(c, 'tail', { heavy: 1 })        // destroy the tail block
    expect(hasImmunity(c, 'knockdown')).toBe(false)
  })

  it('destroying the rearLeg cuts the Evasion resource at next round start', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // rearLeg: top |▢▢| (charge), lower |▢▢▢| (evasion). Destroy both.
    c = damagePart(c, 'rearLeg', { heavy: 1 })
    c = damagePart(c, 'rearLeg', { heavy: 1 })
    expect(grantedResource(c, 'evasion')).toBe(0)
    expect(startRound(c).evasion).toBe(0)
  })
})

// ─── Fatigue & endurance ───────────────────────────────────────────────────────

describe('addAdversaryFatigue', () => {
  it('endurance absorbs fatigue before the permanent clock', async () => {
    const c = await faucheur()  // endurance 1, fatigue clock 9
    const d = addAdversaryFatigue(c, 3)
    expect(d.endurance).toBe(0)
    expect(d.fatigue).toBe(2)   // 3 − 1 buffered
  })

  it('defeat triggers when the fatigue clock fills', async () => {
    let c = await faucheur()
    c = { ...c, endurance: 0 }
    expect(isAdversaryDefeated(c)).toBe(false)
    c = addAdversaryFatigue(c, 9)
    expect(isAdversaryDefeated(c)).toBe(true)
  })

  it('defeat triggers when every body part is destroyed (weapons excluded)', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // Destroy every block of every part: head 3, body 1, sickles 2, rearLeg 2, tail 2
    const blows: Array<[string, number]> = [
      ['head', 3], ['body', 1], ['sickles', 2], ['rearLeg', 2], ['tail', 2],
    ]
    for (const [part, n] of blows) {
      for (let i = 0; i < n; i++) {
        expect(isAdversaryDefeated(c)).toBe(false)
        c = { ...damagePart(c, part, { heavy: 1 }), evasion: 0 }
      }
    }
    expect(isAdversaryDefeated(c)).toBe(true)
    expect(c.fatigue).toBe(0)  // defeat came from the parts, not the clock
  })
})

// ─── Action economy ───────────────────────────────────────────────────────────

describe('action economy', () => {
  it('grants 2 ⚫ per round by default (no reaction economy)', async () => {
    const c = await faucheur()
    expect(baseActions(c)).toBe(2)
    expect(c.actions).toBe(2)
    expect(c).not.toHaveProperty('reactions')
  })

  it('honours a sheet override of base actions', async () => {
    const c = await faucheur()
    const boosted = startRound({ ...c, sheet: { ...c.sheet, actions: 3 } })
    expect(boosted.actions).toBe(3)
  })

  it('canPlayCard respects the current (block-overridden) cost and remaining ⚫', async () => {
    const c = await faucheur()
    // sickleStrike base cost 2, but the intact upper Serpes block overrides to 1.
    expect(cardCost(c, 'sickleStrike')).toBe(1)
    expect(canPlayCard(c, 'sickleStrike')).toBe(true)
    expect(canPlayCard({ ...c, actions: 0 }, 'sickleStrike')).toBe(false)
  })

  it('spending a card deducts its current cost from the pool', async () => {
    const c = await faucheur()
    const after = spendCardCost(c, 'charge')   // cost 1
    expect(after.actions).toBe(1)
  })

  it('a card whose block is destroyed is no longer playable', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    c = damagePart(c, 'sickles', { heavy: 1 })  // destroy cost-override block
    c = damagePart(c, 'sickles', { heavy: 1 })  // destroy grants block → card leaves deck
    expect(canPlayCard(c, 'sickleStrike')).toBe(false)
  })

  it('start of round refills ⚫ to the base', async () => {
    let c = await faucheur()
    c = spendCardCost(c, 'sickleStrike')
    expect(c.actions).toBe(1)
    expect(startRound(c).actions).toBe(2)
  })
})

// ─── Mental track ──────────────────────────────────────────────────────────────

describe('shiftAdversaryMental', () => {
  it('stability absorbs a shift before the track moves (§ Ténacité)', async () => {
    const c = await faucheur()  // stability 1, focused
    const d = shiftAdversaryMental(c, -1)  // 🔻 vers Peur, absorbed
    expect(d.stability).toBe(0)
    expect(d.mentalState).toBe('focused')
  })

  it('moves toward Paniqué once stability is exhausted', async () => {
    let c = await faucheur()
    c = { ...c, stability: 0 }
    expect(shiftAdversaryMental(c, -1).mentalState).toBe('panicked')
    expect(shiftAdversaryMental({ ...c, stability: 0 }, +1).mentalState).toBe('enraged')
  })
})
