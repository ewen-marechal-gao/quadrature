import path from 'path'
import { loadCharacter, deserializeFromYaml, serializeToYaml } from '../../src/character/io'

const LENA_PATH = path.resolve(__dirname, '../../characterSheets/lena.yaml')

describe('deserializeFromYaml', () => {

  const MINIMAL_YAML = `
name: TestChar
characteristics:
  strength:
    value: 1
    wounds: 0
    power: 1
    robustness: 0
  agility:
    value: 1
    wounds: 0
    precision: 0
    mobility: 1
  vigor:
    value: 1
    wounds: 0
    endurance: 1
    recovery: 0
  grace:
    value: 1
    wounds: 0
    composure: 0
    disguise: 0
  acuity:
    value: 2
    wounds: 0
    observation: 2
    vigilance: 0
  willpower:
    value: 1
    wounds: 0
    authority: 0
    discipline: 0
  intelligence:
    value: 1
    wounds: 0
    logic: 0
    reactivity: 1
  tenacity:
    value: 1
    wounds: 0
    conviction: 0
    resilience: 0
  charisma:
    value: 1
    wounds: 0
    eloquence: 0
    manipulation: 0
  lucidity:
    value: 1
    wounds: 0
    foresight: 0
    intuition: 0
`

  it('parses a valid YAML string into a Character', () => {
    const char = deserializeFromYaml(MINIMAL_YAML)
    expect(char.name).toBe('TestChar')
  })

  it('contains all 10 characteristics', () => {
    const char = deserializeFromYaml(MINIMAL_YAML)
    const names = Object.keys(char.characteristics)
    expect(names).toHaveLength(10)
    expect(names).toContain('strength')
    expect(names).toContain('lucidity')
  })

  it('contains all 20 skills', () => {
    const char = deserializeFromYaml(MINIMAL_YAML)
    const names = Object.keys(char.skills)
    expect(names).toHaveLength(20)
    expect(names).toContain('power')
    expect(names).toContain('intuition')
  })

  it('derives characteristic values from skill ranks (base 1 · +1 au rang 2)', () => {
    const char = deserializeFromYaml(MINIMAL_YAML)
    expect(char.characteristics.acuity.value).toBe(2)     // observation 2 → +1
    expect(char.characteristics.strength.value).toBe(1)   // power 1 (< rang 2) → reste 1
    expect(char.characteristics.strength.wounds).toBe(0)
  })

  it('correctly parses skill values nested under their characteristic', () => {
    const char = deserializeFromYaml(MINIMAL_YAML)
    expect(char.skills.power).toBe(1)
    expect(char.skills.endurance).toBe(1)
    expect(char.skills.precision).toBe(0)
  })

  it('throws when the "name" field is missing', () => {
    const badYaml = MINIMAL_YAML.replace('name: TestChar\n', '')
    expect(() => deserializeFromYaml(badYaml)).toThrow()
  })

  it('throws when a characteristic block is missing', () => {
    const badYaml = MINIMAL_YAML.replace(/  strength:[\s\S]*?  agility:/, '  agility:')
    expect(() => deserializeFromYaml(badYaml)).toThrow()
  })

})

describe('serializeToYaml + deserializeFromYaml roundtrip', () => {

  it('restores the same character after serialize → deserialize', async () => {
    const original = await loadCharacter(LENA_PATH)
    const yaml     = serializeToYaml(original)
    const restored = deserializeFromYaml(yaml)

    expect(restored.name).toBe(original.name)
    expect(restored.characteristics).toEqual(original.characteristics)
    expect(restored.skills).toEqual(original.skills)
  })

})

describe('loadCharacter', () => {

  it('loads lena.yaml without errors', async () => {
    const char = await loadCharacter(LENA_PATH)
    expect(char.name).toBe('Lena')
  })

  it('Lena has strength=2 (dérivé de power 2)', async () => {
    const char = await loadCharacter(LENA_PATH)
    expect(char.characteristics.strength.value).toBe(2)
  })

  it('Lena has power=2 (unlocks brutal-strike)', async () => {
    const char = await loadCharacter(LENA_PATH)
    expect(char.skills.power).toBe(2)
  })

  it('Lena has endurance=1 (unlocks respiration)', async () => {
    const char = await loadCharacter(LENA_PATH)
    expect(char.skills.endurance).toBe(1)
  })

  it('Lena has precision=0 (sharp-strike locked)', async () => {
    const char = await loadCharacter(LENA_PATH)
    expect(char.skills.precision).toBe(0)
  })

  it('rejects a non-existent file path', async () => {
    await expect(loadCharacter('/no/such/file.yaml')).rejects.toThrow()
  })

})
