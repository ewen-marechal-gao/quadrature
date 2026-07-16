/**
 * Encounter board + starting positions.
 *
 * The loader is deliberately strict, because the failure it prevents is silent:
 * a half-placed encounter would leave the unplaced fighters both unreachable and
 * un-gated, and the numbers would still look plausible. Loud beats plausible.
 */
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { loadEncounter } from '../../src/encounter/io'

/** Write an encounter YAML to a temp file and load it. */
async function load(yaml: string) {
  const dir  = await mkdtemp(path.join(tmpdir(), 'quad-enc-'))
  const file = path.join(dir, 'enc.yaml')
  await writeFile(file, yaml, 'utf-8')
  return loadEncounter(file)
}

const encounter = (board: string, pcPos: string, advPos: string) => `
name: Test
maxRounds: 10
${board}
factions:
  - name: A
    characters:
      - sheet: characterSheets/Duelist_precise.yaml
        persona: opportunist
        ${pcPos}
    allowedActions: []
  - name: B
    characters:
      - adversary: faucheur
        ${advPos}
    allowedActions: []
`

describe('encounter board', () => {
  it('loads a placed encounter', async () => {
    const enc = await load(encounter('board: { width: 20, height: 5 }', 'pos: { x: 2, y: 2 }', 'pos: { x: 14, y: 2 }'))
    expect(enc.board).toEqual({ width: 20, height: 5 })
    expect(enc.factions[0].characters[0].pos).toEqual({ x: 2, y: 2 })
    expect(enc.factions[1].characters[0].pos).toEqual({ x: 14, y: 2 })
  })

  it('loads a positionless encounter — the historical default', async () => {
    const enc = await load(encounter('', '', ''))
    expect(enc.board).toBeUndefined()
    expect(enc.factions[0].characters[0].pos).toBeUndefined()
  })
})

describe('encounter board — positions are all-or-nothing', () => {
  it('rejects a board with an unplaced combatant', async () => {
    await expect(load(encounter('board: { width: 20, height: 5 }', 'pos: { x: 2, y: 2 }', '')))
      .rejects.toThrow(/every combatant must be placed/)
  })

  it('rejects a position without a board', async () => {
    await expect(load(encounter('', 'pos: { x: 2, y: 2 }', '')))
      .rejects.toThrow(/declares a starting "pos" but the encounter has no "board"/)
  })
})

describe('encounter board — the mat\'s own invariants', () => {
  it('rejects a figure standing off the board', async () => {
    await expect(load(encounter('board: { width: 20, height: 5 }', 'pos: { x: 2, y: 9 }', 'pos: { x: 14, y: 2 }')))
      .rejects.toThrow(/off the 20×5 board/)
  })

  it('rejects two figures on the same square', async () => {
    await expect(load(encounter('board: { width: 20, height: 5 }', 'pos: { x: 7, y: 3 }', 'pos: { x: 7, y: 3 }')))
      .rejects.toThrow(/cannot share a square/)
  })

  it('rejects a degenerate board', async () => {
    await expect(load(encounter('board: { width: 0, height: 5 }', 'pos: { x: 0, y: 0 }', 'pos: { x: 1, y: 1 }')))
      .rejects.toThrow(/integer width\/height/)
  })

  it('rejects a non-integer square', async () => {
    await expect(load(encounter('board: { width: 20, height: 5 }', 'pos: { x: 2.5, y: 2 }', 'pos: { x: 14, y: 2 }')))
      .rejects.toThrow(/needs an integer starting "pos/)
  })
})
