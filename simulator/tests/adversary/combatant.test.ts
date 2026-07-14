/**
 * Body-part health model tests, exercised against the real Faucheur fiche.
 *
 * Faucheur parts (armor · blocks):
 *   head    🛡️1  |▢▢| |▢▢| |▢▢|  → +1 ◇ · grants bite · +1 ◇
 *   body    🛡️1  |▢▢▢| |▢▢▢|     → +2 🫁 · grants cry
 *   sickles 🛡️1  |▢▢▢| |▢▢▢|     → cost override sickleStrike · grants sickleStrike
 *   rearLeg 🛡️1  |▢▢| |▢▢▢|      → +1 action Charge (grants charge) · Évasion 1
 *   tail    🛡️0  |▢▢| |▢▢|       → immunity knockdown · grants tailSweep
 * fatigue 8 · tenacity 4 · dice 4×threat · guard Esquive 10 · ◇ 2 (Tête).
 */
import { loadAdversary } from '../../src/adversary/io'
import {
  initAdversary, damagePart, addAdversaryFatigue, shiftAdversaryMental, startRound,
  activeDeck, cardCost, hasImmunity, grantedResource,
  canPlayCard, spendCardCost, baseActions,
  spendAdversaryFatigueCost, cardFatigueCost,
  addBleed, bleedTick,
  isBlockDestroyed, isPartDestroyed, isAdversaryDefeated, isAdversaryWinded,
  type AdversaryCombatant,
} from '../../src/adversary/combatant'
import { applyEffectToActor, actorEndRound } from '../../src/adversary/actor'

async function faucheur(): Promise<AdversaryCombatant> {
  return initAdversary(await loadAdversary('faucheur'))
}
const part = (c: AdversaryCombatant, type: string) =>
  [...c.parts, ...c.weapons].find(p => p.type === type)!
const totalMarks = (c: AdversaryCombatant) =>
  [...c.parts, ...c.weapons].flatMap(p => p.blocks).reduce((s, b) => s + b.damage, 0)

// ─── Initialisation & resources ───────────────────────────────────────────────

describe('initAdversary', () => {
  it('starts intact with resources granted by intact blocks', async () => {
    const c = await faucheur()
    expect(c.fatigue).toBe(0)
    expect(c.stability).toBe(2)   // head : 2 blocs ◇ (nerveux + cerveau)
    expect(c.endurance).toBe(2)   // body
    expect(c.evasion).toBe(1)     // rearLeg
    expect(c.mentalState).toBe('aggressive')   // disposition de départ par défaut
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
    // Target head (armor 1, |▢▢|): 1💔 → evasion spends → 3💢 armor-reduced to 2 → block full.
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

  it('Sonné 🫨 disables Evasion — a heavy wound lands in full', async () => {
    const c = await faucheur()  // evasion 1
    // Without stun: 1💔 on head (armor 1, |▢▢|) is converted by evasion → block full.
    const evaded = damagePart(c, 'head', { heavy: 1 })
    expect(evaded.evasion).toBe(0)
    expect(isBlockDestroyed(part(evaded, 'head').blocks[0])).toBe(true)
    // Stunned: evasion is NOT spent; the heavy wound destroys the top block directly.
    const stunned = damagePart({ ...c, stunned: true }, 'head', { heavy: 1 })
    expect(stunned.evasion).toBe(1)  // untouched
    expect(isBlockDestroyed(part(stunned, 'head').blocks[0])).toBe(true)
  })

  it('Sonné is cleared at round start', async () => {
    const c = { ...(await faucheur()), stunned: true }
    expect(startRound(c).stunned).toBe(false)
  })
})

// ─── Dynamic deck & cost ──────────────────────────────────────────────────────

describe('capability derivation', () => {
  it('the deck lists every card whose granting block is intact', async () => {
    const c = await faucheur()
    expect(activeDeck(c).map(k => k.id).sort())
      .toEqual(['bite', 'charge', 'cry', 'sickleStrike', 'tailSweep'])
  })

  it('destroying the granting block drops the card from the deck', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // sickles lower block grants sickleStrike; destroy both blocks (top then lower).
    c = damagePart(c, 'sickles', { heavy: 1 })
    c = damagePart(c, 'sickles', { heavy: 1 })
    expect(activeDeck(c).map(k => k.id).sort())
      .toEqual(['bite', 'charge', 'cry', 'tailSweep'])
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

// ─── armorAll (carapace) ────────────────────────────────────────────────────────

describe('armorAll — the carapace shields the other parts', () => {
  const cuirassard = async () => initAdversary(await loadAdversary('cuirassard'))

  it('an intact carapace adds its bonus to other parts; cracking it exposes them', async () => {
    let c = await cuirassard()
    c = { ...c, evasion: 0 }
    // Body base armor 0 + carapace +2 = effective 2. 4💢 → max(1, 4-2) = 2 marks.
    expect(part(damagePart(c, 'body', { light: 4 }), 'body').blocks[0].damage).toBe(2)
    // Crack the carapace (armor 3, one 5-case block) with a heavy wound (evasion off).
    c = damagePart(c, 'carapace', { heavy: 1 })
    expect(isPartDestroyed(part(c, 'carapace'))).toBe(true)
    // Body now on its own armor 0: 4💢 → max(1, 4-0) = 4 marks (fills |▢▢▢|, spills 1).
    expect(part(damagePart(c, 'body', { light: 4 }), 'body').blocks[0].damage).toBe(3)
  })
})

// ─── Fatigue & endurance ───────────────────────────────────────────────────────

describe('addAdversaryFatigue', () => {
  it('endurance absorbs fatigue, but at least 1💧 marks the clock (tampon poreux)', async () => {
    const c = await faucheur()  // endurance 2, fatigue clock 10
    // Above the buffer: 2 absorbed, remainder marks the clock.
    const d = addAdversaryFatigue(c, 3)
    expect(d.endurance).toBe(0)
    expect(d.fatigue).toBe(1)
    // Within the buffer: min 1 gets through anyway — chip damage always progresses.
    const e = addAdversaryFatigue(c, 2)
    expect(e.endurance).toBe(1)   // only 1 absorbed
    expect(e.fatigue).toBe(1)
  })

  it('defeat triggers when the fatigue clock fills', async () => {
    let c = await faucheur()
    c = { ...c, endurance: 0 }
    expect(isAdversaryDefeated(c)).toBe(false)
    c = addAdversaryFatigue(c, 10)   // clock size 10
    expect(isAdversaryDefeated(c)).toBe(true)
  })

  it('card fatigue costs 💧 are fully absorbable by 🫁 (no porous minimum)', async () => {
    const c = await faucheur()          // endurance 2
    const d = spendAdversaryFatigueCost(c, 2)
    expect(d.endurance).toBe(0)
    expect(d.fatigue).toBe(0)           // fully buffered — acting fresh is free
    const e = spendAdversaryFatigueCost({ ...c, endurance: 0 }, 2)
    expect(e.fatigue).toBe(2)           // buffer burnt → the cost marks the clock
  })

  it('spendCardCost spends the ⚫ AND the 💧 cost (cry: ⚫ + 1💧)', async () => {
    const c = await faucheur()          // actions 2, endurance 2
    expect(cardFatigueCost(c, 'cry')).toBe(1)
    const d = spendCardCost(c, 'cry')
    expect(d.actions).toBe(1)
    expect(d.endurance).toBe(1)         // 💧 cost absorbed by the buffer
    expect(d.fatigue).toBe(0)
  })

  it('canPlayCard refuses a card whose 💧 cost would fill the clock', async () => {
    const c = await faucheur()          // clock 8
    const exhausted = { ...c, endurance: 0, fatigue: 7 }
    expect(canPlayCard(exhausted, 'cry')).toBe(false)   // 7 + 1 ≥ 8
    expect(canPlayCard(exhausted, 'bite')).toBe(true)   // no 💧 cost
    // With a 🫁 left, the cost is absorbed → playable again.
    expect(canPlayCard({ ...exhausted, endurance: 1 }, 'cry')).toBe(true)
  })

  it('Essoufflé past half the clock ⇒ −1 ⚫ (min 1)', async () => {
    const c = await faucheur()   // clock 8, base 2 ⚫
    expect(baseActions(c)).toBe(2)
    expect(isAdversaryWinded(c)).toBe(false)
    const tired = { ...c, endurance: 0, fatigue: 5 }   // 5 > 4 = moitié de 8
    expect(isAdversaryWinded(tired)).toBe(true)
    expect(baseActions(tired)).toBe(1)                 // 2 − 1
    // startRound applique la pénalité au pool d'actions
    expect(startRound(tired).actions).toBe(1)
  })

  it('defeat triggers when every body part is destroyed (weapons excluded)', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // Destroy every block of every part: head 3 (◇·bite·◇), body 2 (🫁·cri), sickles 2, rearLeg 2, tail 2
    const blows: Array<[string, number]> = [
      ['head', 3], ['body', 2], ['sickles', 2], ['rearLeg', 2], ['tail', 2],
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

// ─── Hémorragie 🩸 ──────────────────────────────────────────────────────────────

describe('bleed 🩸 (cumulative)', () => {
  it('a hemorrhage status adds one cumulative bleed token', async () => {
    let c = await faucheur()
    c = applyEffectToActor(c, { targetId: c.id, kind: 'add-status', status: 'hemorrhage' }) as AdversaryCombatant
    c = applyEffectToActor(c, { targetId: c.id, kind: 'add-status', status: 'hemorrhage' }) as AdversaryCombatant
    expect(c.bleed).toBe(2)
  })

  it('bleedTick with no tokens is identity', async () => {
    const c = await faucheur()
    expect(bleedTick(c)).toEqual(c)
  })

  it('marks the most-wounded block first, ignoring armor', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    // head |▢▢| armed to 1/2; every other block still 0. One 🩸 → head (most wounded).
    c = damagePart(c, 'head', { light: 1 })
    expect(part(c, 'head').blocks[0].damage).toBe(1)
    c = bleedTick(addBleed(c, 1))
    expect(part(c, 'head').blocks[0].damage).toBe(2)     // marked directly, no armor reduction
    expect(isBlockDestroyed(part(c, 'head').blocks[0])).toBe(true)
  })

  it('marks as many cases as there are tokens (cumulative)', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    const before = totalMarks(c)
    c = bleedTick(addBleed(c, 3))
    expect(totalMarks(c) - before).toBe(3)
  })

  it('the wound closes by one step per round (−1 jeton), fading without re-injury', async () => {
    let c = await faucheur()
    c = addBleed(c, 2)
    const r1 = bleedTick(c)
    expect(totalMarks(r1)).toBe(2)   // 2 jetons → 2 cases
    expect(r1.bleed).toBe(1)         // la plaie se referme d'un cran
    const r2 = bleedTick(r1)
    expect(totalMarks(r2) - totalMarks(r1)).toBe(1)  // 1 jeton restant → 1 case
    expect(r2.bleed).toBe(0)
    expect(bleedTick(r2)).toEqual(r2)                // refermée : plus de saignée
  })

  it('a burst of N tokens deals triangular total damage N(N+1)/2 (combo design)', async () => {
    // Appliquer N saignements dans UNE manche puis laisser la plaie se refermer
    // seule inflige N + (N-1) + … + 1 cases : le burst est récompensé, l'étalement
    // (1 jeton/manche) resterait linéaire. Récompense précision/kit qui empilent.
    for (const N of [2, 3, 4]) {
      let c = await faucheur()
      c = addBleed(c, N)
      let total = 0
      let before = totalMarks(c)
      while (c.bleed > 0) {
        c = bleedTick(c)
        total += totalMarks(c) - before
        before = totalMarks(c)
      }
      expect(total).toBe((N * (N + 1)) / 2)
    }
  })

  it('actorEndRound applies the bleed to an adversary', async () => {
    let c = await faucheur()
    c = { ...c, evasion: 0 }
    c = damagePart(c, 'tail', { light: 1 })             // tail 🛡️0 → 1/2
    c = addBleed(c, 1)
    const after = actorEndRound(c) as AdversaryCombatant
    expect(part(after, 'tail').blocks[0].damage).toBe(2)
    expect(isBlockDestroyed(part(after, 'tail').blocks[0])).toBe(true)
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
    const c = await faucheur()  // stability 1, aggressive (disposition de départ)
    const d = shiftAdversaryMental(c, -1)  // 🔻 vers Peur, absorbé par le ◇
    expect(d.stability).toBe(1)            // ◇ 2 − 1 absorbé
    expect(d.mentalState).toBe('aggressive')
  })

  it('moves along the 4-state track once stability is exhausted', async () => {
    const c = { ...(await faucheur()), stability: 0 }
    // 🔻 vers Peur : aggressive → cautious → panicked
    const cautious = shiftAdversaryMental(c, -1)
    expect(cautious.mentalState).toBe('cautious')
    expect(shiftAdversaryMental(cautious, -1).mentalState).toBe('panicked')
    // 🔺 vers Colère : aggressive → enraged
    expect(shiftAdversaryMental(c, +1).mentalState).toBe('enraged')
  })
})

// ─── Assaut mental (Provocation / Intimidation) ─────────────────────────────────

describe('assaut mental — drain-stability / destabilize / shift-if-broken', () => {
  it('startRound skips the ◇ regen when destabilized, then clears the flag', async () => {
    const c = { ...(await faucheur()), stability: 0, destabilized: true }
    const r = startRound(c)
    expect(r.stability).toBe(0)          // regain sauté (aurait rendu 2)
    expect(r.destabilized).toBe(false)   // consommé
    expect(startRound(r).stability).toBe(2)  // manche suivante : régén normale
  })

  it('drain-stability floors at 0 ; destabilize poses le flag', async () => {
    let c = await faucheur()             // ◇ 2
    c = applyEffectToActor(c, { targetId: c.id, kind: 'drain-stability', amount: 3 }) as AdversaryCombatant
    expect(c.stability).toBe(0)
    c = applyEffectToActor(c, { targetId: c.id, kind: 'destabilize' }) as AdversaryCombatant
    expect(c.destabilized).toBe(true)
  })

  it('shift-mental-broken ne décale QUE si le ◇ est vide', async () => {
    const c = await faucheur()           // ◇ 2, aggressive
    const held = applyEffectToActor(c,
      { targetId: c.id, kind: 'shift-mental-broken', direction: 'toward-rage' }) as AdversaryCombatant
    expect(held.mentalState).toBe('aggressive')   // le ◇ tient encore la piste
    const broken = applyEffectToActor({ ...c, stability: 0 },
      { targetId: c.id, kind: 'shift-mental-broken', direction: 'toward-rage' }) as AdversaryCombatant
    expect(broken.mentalState).toBe('enraged')    // ◇ vide → 🔺
  })
})
