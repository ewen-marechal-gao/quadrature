import { FACES, rollDie } from '../../src/dieSystem/dice'

describe('FACES — die face definitions', () => {

  it('all standard types have exactly 6 faces in the range [0, 5]', () => {
    const standard: (keyof typeof FACES)[] = [
      'characteristic', 'skill', 'advantage', 'disadvantage', 'wild',
    ]
    for (const type of standard) {
      expect(FACES[type]).toHaveLength(6)
      for (const face of FACES[type]) {
        expect(face).toBeGreaterThanOrEqual(0)
        expect(face).toBeLessThanOrEqual(5)
      }
    }
  })

  it('reinforced die has no 0 face (can never flaw)', () => {
    expect(FACES.reinforced).not.toContain(0)
  })

  it('reinforced die has two 5 faces (doubles critical probability)', () => {
    expect(FACES.reinforced.filter(f => f === 5)).toHaveLength(2)
  })

  it('weakened die has no 5 face (can never critical)', () => {
    expect(FACES.weakened).not.toContain(5)
  })

  it('weakened die has two 0 faces (doubles flaw probability)', () => {
    expect(FACES.weakened.filter(f => f === 0)).toHaveLength(2)
  })

})

describe('rollDie', () => {

  it('returns a value that is a valid face of that type', () => {
    // Run 200 rolls for statistical coverage; every result must be a known face
    for (let i = 0; i < 200; i++) {
      for (const type of Object.keys(FACES) as (keyof typeof FACES)[]) {
        const result = rollDie(type)
        expect(FACES[type]).toContain(result)
      }
    }
  })

  it('produces at least 2 distinct values across 50 rolls (not constant)', () => {
    const results = new Set(Array.from({ length: 50 }, () => rollDie('characteristic')))
    expect(results.size).toBeGreaterThan(1)
  })

})
