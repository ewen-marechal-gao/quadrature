import { buildPool } from '../../src/dieSystem/pool'

describe('buildPool — dice pool construction', () => {

  describe('characteristic dice', () => {
    it('creates N characteristic dice when char = N (N > 0)', () => {
      const pool = buildPool({ characteristic: 3, skill: 2 })
      expect(pool.characteristic).toEqual(['characteristic', 'characteristic', 'characteristic'])
    })

    it('creates a single weakened die when characteristic = 0', () => {
      const pool = buildPool({ characteristic: 0, skill: 2 })
      expect(pool.characteristic).toEqual(['weakened'])
    })
  })

  describe('skill dice', () => {
    it('creates N skill dice when skill ≥ 2', () => {
      const pool = buildPool({ characteristic: 3, skill: 3 })
      expect(pool.skill).toEqual(['skill', 'skill', 'skill'])
    })

    it('pads with weakened to reach minimum of 2 when skill = 1', () => {
      const pool = buildPool({ characteristic: 3, skill: 1 })
      expect(pool.skill).toEqual(['skill', 'weakened'])
    })

    it('uses 2 weakened dice when skill = 0', () => {
      const pool = buildPool({ characteristic: 3, skill: 0 })
      expect(pool.skill).toEqual(['weakened', 'weakened'])
    })
  })

  describe('wild dice', () => {
    it('always includes exactly one wild die with no advantages/disadvantages', () => {
      const pool = buildPool({ characteristic: 2, skill: 2 })
      expect(pool.wild).toEqual(['wild'])
    })

    it('adds advantage dice after the wild die', () => {
      const pool = buildPool({ characteristic: 2, skill: 2, advantages: 2 })
      expect(pool.wild).toEqual(['wild', 'advantage', 'advantage'])
    })

    it('adds disadvantage dice after the wild die', () => {
      const pool = buildPool({ characteristic: 2, skill: 2, disadvantages: 1 })
      expect(pool.wild).toEqual(['wild', 'disadvantage'])
    })

    it('cancels advantage/disadvantage pairs', () => {
      // 2 advantages + 2 disadvantages → 0 net → just wild
      const pool = buildPool({ characteristic: 2, skill: 2, advantages: 2, disadvantages: 2 })
      expect(pool.wild).toEqual(['wild'])
    })

    it('keeps the net advantage after pair cancellation', () => {
      // 3 advantages + 1 disadvantage → 2 net advantages
      const pool = buildPool({ characteristic: 2, skill: 2, advantages: 3, disadvantages: 1 })
      expect(pool.wild).toEqual(['wild', 'advantage', 'advantage'])
    })
  })

  describe('sacrifice mechanic (⛞)', () => {
    it('removes one characteristic die and upgrades one weakened to skill', () => {
      // char=3, skill=0 → 2 weakened. Sacrifice 1 char die to upgrade 1 weakened.
      const pool = buildPool({ characteristic: 3, skill: 0, sacrifices: 1 })
      expect(pool.characteristic).toHaveLength(2)
      expect(pool.skill.filter(d => d === 'skill')).toHaveLength(1)
      expect(pool.skill.filter(d => d === 'weakened')).toHaveLength(1)
    })

    it('requires ≥ 2 characteristic dice — ignores sacrifice if only 1 char die', () => {
      const pool = buildPool({ characteristic: 1, skill: 0, sacrifices: 1 })
      // char=1 → only 1 characteristic die; sacrifice cannot fire
      expect(pool.characteristic).toHaveLength(1)
      expect(pool.skill).toEqual(['weakened', 'weakened'])
    })

    it('does nothing if there are no weakened skill dice to upgrade', () => {
      // skill=2 → no weakened; sacrifice has nothing to upgrade
      const pool = buildPool({ characteristic: 3, skill: 2, sacrifices: 1 })
      expect(pool.characteristic).toHaveLength(3)  // unchanged
      expect(pool.skill).toEqual(['skill', 'skill'])
    })
  })

  describe('skill boost mechanic (⬆)', () => {
    it('upgrades one skill die to reinforced', () => {
      const pool = buildPool({ characteristic: 3, skill: 2, skillBoosts: 1 })
      expect(pool.skill).toContain('reinforced')
      expect(pool.skill.filter(d => d === 'skill')).toHaveLength(1)
    })

    it('does not upgrade weakened dice (only skill → reinforced)', () => {
      const pool = buildPool({ characteristic: 3, skill: 1, skillBoosts: 1 })
      // skill=1 → [skill, weakened]. Boost upgrades the 'skill' die.
      expect(pool.skill).toContain('reinforced')
      expect(pool.skill).toContain('weakened')
    })
  })

})
