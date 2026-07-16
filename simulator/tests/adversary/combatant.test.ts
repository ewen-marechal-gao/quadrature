/**
 * Body-part health model tests, exercised against the real Faucheur fiche.
 *
 * Faucheur parts (armor · blocks):
 *   head    🛡️1  |▢▢| |▢▢|        → grants bite · +1 ◇ (Cerveau)
 *   body    🛡️0  |▢▢▢| |▢▢| |▢▢▢| → +2 🫁 · +1 ◇ (SNC) · grants cry
 *   sickles 🛡️1  |▢▢▢▢|            → grants sickleStrike (bloc unique, armé)
 *   rearLeg 🛡️0  |▢▢| |▢▢▢|       → +1 action Charge (grants charge) · structure
 *   tail    🛡️0  |▢▢| |▢▢|        → immunity knockdown · grants tailSweep
 * fatigue 8 · tenacity 4 · dice 4×threat · guard Esquive 10 · ◇ 2 (Corps SNC + Tête Cerveau) · évasion 0.
 */
import { loadAdversary } from '../../src/adversary/io'
import {
  initAdversary, damagePart, addAdversaryFatigue, shiftAdversaryMental, startRound,
  activeDeck, cardCost, hasImmunity, grantedResource,
  canPlayCard, spendCardCost, baseActions,
  spendAdversaryFatigueCost, cardFatigueCost,
  addBleed, bleedTick,
  grantedGuard, effectiveGuard,
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
/**
 * Créature « à nu » : évasion 0 et armure 0 partout. Isole la destruction de
 * blocs des deux défenses réactives (Évasion et Armure, testées à part) — une
 * 💔 détruit alors directement un bloc, comme dans l'ancien modèle.
 */
const bare = (c: AdversaryCombatant): AdversaryCombatant => ({
  ...c,
  evasion: 0,
  parts:   c.parts.map(p => ({ ...p, armor: 0 })),
  weapons: c.weapons.map(p => ({ ...p, armor: 0 })),
})

// ─── Initialisation & resources ───────────────────────────────────────────────

describe('initAdversary', () => {
  it('starts intact with resources granted by intact blocks', async () => {
    const c = await faucheur()
    expect(c.fatigue).toBe(0)
    expect(c.stability).toBe(2)   // Corps (SNC) + Tête (Cerveau)
    expect(c.endurance).toBe(2)   // body (Cœur)
    expect(c.evasion).toBe(0)     // plus d'évasion terrestre (signature aquatique/rare)
    expect(c.mentalState).toBe('aggressive')   // disposition de départ par défaut
    expect(c.parts.some(isPartDestroyed)).toBe(false)
  })
})

// ─── Light wounds: armor + block filling ──────────────────────────────────────

describe('damagePart — light wounds', () => {
  it('at least 1 wound lands through armor (§ minimum 1)', async () => {
    const c = await faucheur()
    // head armor 1, deal 1💢 → max(1, 1-1) = 1 mark (le minimum passe toujours)
    const d = damagePart(c, 'head', { light: 1 })
    expect(part(d, 'head').blocks[0].damage).toBe(1)
  })

  it('armor reduces excess light wounds', async () => {
    const c = await faucheur()
    // head armor 1, deal 3💢 → max(1, 3-1) = 2 marks into the top block (Mâchoires |▢▢|)
    const d = damagePart(c, 'head', { light: 3 })
    expect(part(d, 'head').blocks[0].damage).toBe(2)
    expect(isBlockDestroyed(part(d, 'head').blocks[0])).toBe(true)
  })

  it('fills blocks top → bottom, spilling into the next block', async () => {
    const c = await faucheur()
    // rearLeg armor 0, top block Charge |▢▢| (2). Deal 4💢 → 2 fill top (destroyed) + 2 into next.
    const d = damagePart(c, 'rearLeg', { light: 4 })
    const s = part(d, 'rearLeg')
    expect(s.blocks[0].damage).toBe(2)
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
    const c = { ...(await faucheur()), evasion: 1 }  // jeton d'Évasion injecté (test mécanique)
    // Target head (armor 1, |▢▢|): 1💔 → evasion spends → 3💢 armor-reduced to 2 → block full.
    const d = damagePart(c, 'head', { heavy: 1 })
    expect(d.evasion).toBe(0)
    expect(isBlockDestroyed(part(d, 'head').blocks[0])).toBe(true)
  })

  it('without evasion, a heavy wound is absorbed by armor before touching a block', async () => {
    let c = { ...(await faucheur()), evasion: 0 }   // head armor 1
    // 1re 💔 : l'armure encaisse (1→0), le bloc reste intact.
    c = damagePart(c, 'head', { heavy: 1 })
    expect(part(c, 'head').armor).toBe(0)
    expect(isBlockDestroyed(part(c, 'head').blocks[0])).toBe(false)
    // 2e 💔 : armure épuisée → le bloc du dessus est détruit.
    c = damagePart(c, 'head', { heavy: 1 })
    expect(isBlockDestroyed(part(c, 'head').blocks[0])).toBe(true)
    expect(isBlockDestroyed(part(c, 'head').blocks[1])).toBe(false)
  })

  it('Sonné 🫨 disables Evasion — the heavy wound falls on armor, not evasion', async () => {
    const c = { ...(await faucheur()), evasion: 1 }  // head armor 1, jeton d'Évasion injecté
    // Sans Sonné : la 💔 est convertie par l'Évasion (3💢 réduites à 2 → bloc plein).
    const evaded = damagePart(c, 'head', { heavy: 1 })
    expect(evaded.evasion).toBe(0)
    expect(isBlockDestroyed(part(evaded, 'head').blocks[0])).toBe(true)
    // Sonné : l'Évasion n'est PAS dépensée ; la 💔 tombe sur l'armure (1→0), bloc intact.
    const stunned = damagePart({ ...c, stunned: true }, 'head', { heavy: 1 })
    expect(stunned.evasion).toBe(1)              // intacte
    expect(part(stunned, 'head').armor).toBe(0)  // armure encaissée
    expect(isBlockDestroyed(part(stunned, 'head').blocks[0])).toBe(false)
  })

  it('armor absorbs heavy wounds by losing a point each; a cracked plate protects 💢 less', async () => {
    let c = { ...(await faucheur()), evasion: 0 }
    // Le Corps n'a plus d'armure dérivée : on la force à 1 pour isoler l'attrition sur un |▢▢▢|.
    c = { ...c, parts: c.parts.map(p => p.type === 'body' ? { ...p, armor: 1 } : p) }
    const body = () => part(c, 'body')                // body armor 1, |▢▢▢| (Cœur)
    expect(body().armor).toBe(1)
    // Une 💢 est d'abord réduite par l'armure 1 → min 1 passe.
    c = damagePart(c, 'body', { light: 2 })           // max(1, 2−1) = 1
    expect(body().blocks[0].damage).toBe(1)
    // Une 💔 détruit le point d'armure (1→0) ; le bloc ne bouge pas.
    c = damagePart(c, 'body', { heavy: 1 })
    expect(body().armor).toBe(0)
    expect(body().blocks[0].damage).toBe(1)           // inchangé
    // Armure entamée : les 💢 passent désormais en plein (les deux canaux ouverts).
    c = damagePart(c, 'body', { light: 2 })           // max(1, 2−0) = 2 → 1 + 2 = 3 (bloc plein)
    expect(body().blocks[0].damage).toBe(3)
    expect(isBlockDestroyed(body().blocks[0])).toBe(true)
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
    let c = bare(await faucheur())
    // Le bloc unique des Serpes confère sickleStrike ; le détruire retire la carte.
    c = damagePart(c, 'sickles', { heavy: 1 })
    expect(activeDeck(c).map(k => k.id).sort())
      .toEqual(['bite', 'charge', 'cry', 'tailSweep'])
  })

  it('sickleStrike costs its base ⚫⚫ (plus de réduction de coût)', async () => {
    const c = await faucheur()
    expect(cardCost(c, 'sickleStrike')).toBe(2)
  })

  it('exposes knockdown immunity from the intact tail', async () => {
    let c = await faucheur()
    expect(hasImmunity(c, 'knockdown')).toBe(true)
    c = { ...c, evasion: 0 }
    c = damagePart(c, 'tail', { heavy: 1 })        // destroy the tail block
    expect(hasImmunity(c, 'knockdown')).toBe(false)
  })

  it('destroying an Aileron block cuts the Evasion resource (signature aquatique)', async () => {
    // L'évasion vit désormais sur les ailerons aquatiques (rigidFinlets), pas sur les
    // pattes terrestres. L'Évoluant porte 3 ailerons (un par segment) → évasion 3.
    let c = initAdversary(await loadAdversary('evoluant'))
    expect(grantedResource(c, 'evasion')).toBe(3)
    // segArriere : bloc du haut = Aileron ; le détruire retire son +1 🍀.
    c = damagePart(c, 'segArriere', { heavy: 1 })
    expect(grantedResource(c, 'evasion')).toBe(2)
    expect(startRound(c).evasion).toBe(2)
  })
})

// ─── Cuirasse généralisée (armor_add_all) ────────────────────────────────────────

describe('armor_add_all — la carapace cuirasse toutes les parties (statique)', () => {
  const cuirassard = async () => initAdversary(await loadAdversary('cuirassard'))

  it('chitinoFerricCarapace bake +1 🛡️ dans chaque partie, y compris la carapace', async () => {
    const c = await cuirassard()
    expect(part(c, 'body').armor).toBe(1)      // base 0 + armor_add_all 1
    expect(part(c, 'carapace').armor).toBe(4)  // base 3 + 1
    expect(part(c, 'head').armor).toBe(2)      // ossification 1 + 1
  })

  it('le +1 est statique : détruire la carapace ne l’enlève PAS aux autres parties', async () => {
    let c = { ...(await cuirassard()), evasion: 0 }
    // Corps armure 1 : 4💢 → max(1, 4-1) = 3 (remplit |▢▢▢| Cœur).
    expect(part(damagePart(c, 'body', { light: 4 }), 'body').blocks[0].damage).toBe(3)
    // Réduire la carapace en miettes (armure 0 + tous blocs détruits).
    c = { ...c, parts: c.parts.map(p => p.type === 'carapace'
      ? { ...p, armor: 0, blocks: p.blocks.map(b => ({ ...b, damage: b.cases })) } : p) }
    expect(isPartDestroyed(part(c, 'carapace'))).toBe(true)
    // Le Corps garde son armure baked-in : toujours 3 marques (pas 4).
    expect(part(c, 'body').armor).toBe(1)
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

  it('spendCardCost spends the ⚫ AND the 💧 cost (cry: ⚫ + 2💧)', async () => {
    const c = await faucheur()          // actions 2, endurance 2
    expect(cardFatigueCost(c, 'cry')).toBe(2)
    const d = spendCardCost(c, 'cry')
    expect(d.actions).toBe(1)
    expect(d.endurance).toBe(0)         // 2💧 cost entièrement absorbés par le tampon
    expect(d.fatigue).toBe(0)
  })

  it('canPlayCard refuses a card whose 💧 cost would fill the clock', async () => {
    const c = await faucheur()          // clock 8
    const exhausted = { ...c, endurance: 0, fatigue: 6 }
    expect(canPlayCard(exhausted, 'cry')).toBe(false)   // 6 + 2 ≥ 8
    expect(canPlayCard(exhausted, 'bite')).toBe(true)   // 6 + 1 < 8
    // With a 🫁 left, part of the cost is absorbed → playable again.
    expect(canPlayCard({ ...exhausted, endurance: 1 }, 'cry')).toBe(true)  // 1 absorbé, 6+1 < 8
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
    let c = bare(await faucheur())   // armure 0 → chaque 💔 détruit un bloc
    // Destroy every block of every part: head 2 (bite·◇), body 3 (🫁·◇·cri), sickles 2, rearLeg 2, tail 2
    const blows: Array<[string, number]> = [
      ['head', 2], ['body', 3], ['sickles', 2], ['rearLeg', 2], ['tail', 2],
    ]
    for (const [part, n] of blows) {
      for (let i = 0; i < n; i++) {
        expect(isAdversaryDefeated(c)).toBe(false)
        c = damagePart(c, part, { heavy: 1 })
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

  it('canPlayCard respects the current cost and remaining ⚫', async () => {
    const c = await faucheur()
    // sickleStrike coûte sa base ⚫⚫ (plus de réduction) → il prend toute la manche.
    expect(cardCost(c, 'sickleStrike')).toBe(2)
    expect(canPlayCard(c, 'sickleStrike')).toBe(true)                       // 2 ⚫ dispo
    expect(canPlayCard({ ...c, actions: 1 }, 'sickleStrike')).toBe(false)   // 1 < 2
  })

  it('spending a card deducts its current cost from the pool', async () => {
    const c = await faucheur()
    const after = spendCardCost(c, 'charge')   // cost 1
    expect(after.actions).toBe(1)
  })

  it('a card whose block is destroyed is no longer playable', async () => {
    let c = bare(await faucheur())
    c = damagePart(c, 'sickles', { heavy: 1 })  // bloc unique des Serpes détruit → carte hors deck
    expect(canPlayCard(c, 'sickleStrike')).toBe(false)
  })

  it('start of round refills ⚫ to the base', async () => {
    let c = await faucheur()
    c = spendCardCost(c, 'sickleStrike')   // coût 2 → toute la manche
    expect(c.actions).toBe(0)
    expect(startRound(c).actions).toBe(2)
  })
})

// ─── Mental track ──────────────────────────────────────────────────────────────

describe('shiftAdversaryMental', () => {
  it('stability absorbs a shift before the track moves (§ Ténacité)', async () => {
    const c = await faucheur()  // stability 2, aggressive (disposition de départ)
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

// ─── Garde effective (blocs + état mental) ──────────────────────────────────────

describe('garde effective — base + blocs intacts + état mental', () => {
  it('combine la garde de fiche et le modificateur mental', async () => {
    const c = await faucheur()                                  // garde 10, aggressive (mod 0)
    expect(effectiveGuard(c)).toBe(10)
    expect(effectiveGuard({ ...c, mentalState: 'cautious' })).toBe(11)  // Prudent +1
    expect(effectiveGuard({ ...c, mentalState: 'enraged' })).toBe(8)    // Enragé −2
  })

  it('un bloc intact confère sa garde ; sa destruction la fait perdre', async () => {
    const c = structuredClone(await faucheur())
    const head = c.parts.find(p => p.type === 'head')!
    head.blocks[0].grant = { ...head.blocks[0].grant, guard: 2 }
    expect(grantedGuard(c)).toBe(2)
    expect(effectiveGuard(c)).toBe(12)          // 10 + 2

    head.blocks[0].damage = head.blocks[0].cases   // bloc détruit
    expect(grantedGuard(c)).toBe(0)
    expect(effectiveGuard(c)).toBe(10)          // bonus perdu
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
