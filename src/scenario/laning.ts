import { CHAMPIONS } from '../sim/champions'
import { createRng } from '../sim/rng'
import type { ActiveKind, Archetype, Scenario, ScenarioUnit } from '../sim/types'
import { makeItems, scenarioToWorld } from './generate'

export { scenarioToWorld }

const LANE_ARENA = { w: 520, h: 920 }

function pickChamp(rng: ReturnType<typeof createRng>, arch: Archetype, used: Set<string>) {
  const pool = CHAMPIONS.filter((c) => c.archetype === arch && !used.has(c.id))
  const champ = rng.pick(pool.length ? pool : CHAMPIONS.filter((c) => c.archetype === arch))
  used.add(champ.id)
  return champ
}

export function generateLaningScenario(seed: number, durationSec = 90): Scenario {
  const rng = createRng(seed)
  const used = new Set<string>()
  const playerArch = rng.pick(['brawler', 'assassin', 'mage', 'ranger'] as const)
  const foeArch = rng.pick(['brawler', 'assassin', 'mage', 'ranger', 'tank'] as const)
  const playerChamp = pickChamp(rng, playerArch, used)
  const foeChamp = pickChamp(rng, foeArch, used)

  const playerPower = rng.int(4, 8)
  const foePower = rng.int(4, 8)
  const nActives = rng.poissonActives(1)
  const activeKinds: ActiveKind[] = []
  for (let a = 0; a < nActives; a++) activeKinds.push(rng.pick(['burst', 'shield', 'speed']))

  const midX = LANE_ARENA.w / 2
  const units: ScenarioUnit[] = [
    {
      champId: playerChamp.id,
      champName: playerChamp.name,
      team: 'blue',
      archetype: playerChamp.archetype,
      power: playerPower,
      level: 6 + rng.int(0, 3),
      kills: 0,
      deaths: 0,
      assists: 0,
      items: makeItems(rng, activeKinds),
      activeKinds,
      startPos: { x: midX - 80, y: LANE_ARENA.h * 0.72 },
    },
    {
      champId: foeChamp.id,
      champName: foeChamp.name,
      team: 'red',
      archetype: foeChamp.archetype,
      power: foePower,
      level: 6 + rng.int(0, 3),
      kills: 0,
      deaths: 0,
      assists: 0,
      items: makeItems(rng, []),
      activeKinds: [],
      startPos: { x: midX + 80, y: LANE_ARENA.h * 0.28 },
    },
  ]

  return {
    seed,
    durationSec,
    playerSlot: 0,
    mode: 'laning',
    units,
  }
}
