import { statsFor } from '../sim/archetypes'
import { CHAMPIONS, PASSIVE_ITEMS } from '../sim/champions'
import { separatePositions } from '../sim/collision'
import { UNIT_DIAMETER } from '../sim/constants'
import { createRng } from '../sim/rng'
import type {
  AbilitySlot,
  AbilityState,
  ActiveKind,
  ActiveState,
  Archetype,
  ItemSlot,
  Scenario,
  ScenarioUnit,
  Unit,
  World,
} from '../sim/types'

const ACTIVE_KINDS: ActiveKind[] = ['burst', 'shield', 'speed']

const ACTIVE_NAMES: Record<ActiveKind, string> = {
  burst: 'Hextech',
  shield: 'Seraph',
  speed: 'Ghostblade',
}

export function makeAbilities(rng: ReturnType<typeof createRng>): Record<AbilitySlot, AbilityState> {
  const mk = (slot: AbilitySlot, lo: number, hi: number): AbilityState => ({
    slot,
    cooldown: 0,
    maxCooldown: rng.cooldown(lo, hi),
    ready: true,
    spent: false,
  })
  return {
    q: mk('q', 3.5, 7),
    w: mk('w', 5, 10),
    e: mk('e', 6, 12),
    r: { slot: 'r', cooldown: 0, maxCooldown: 999, ready: true, spent: false },
  }
}

export function makeActives(kinds: ActiveKind[]): ActiveState[] {
  return kinds.map((kind, i) => ({
    slot: (i + 1) as 1 | 2 | 3,
    kind,
    cooldown: 0,
    maxCooldown: kind === 'burst' ? 60 : kind === 'shield' ? 45 : 40,
    ready: true,
  }))
}

export function makeItems(rng: ReturnType<typeof createRng>, activeKinds: ActiveKind[]): ItemSlot[] {
  const items: ItemSlot[] = []
  for (const kind of activeKinds) {
    items.push({ id: kind, name: ACTIVE_NAMES[kind], active: kind })
  }
  while (items.length < 6) {
    const p = rng.pick(PASSIVE_ITEMS)
    items.push({ ...p })
  }
  return items.slice(0, 6)
}

/** Per-team spawn: random anchor, facing axis, cohesion 0 (chaotic) → 1 (tight). */
interface TeamSpawnGeom {
  anchor: { x: number; y: number }
  angle: number
  cohesion: number
}

function teamSpawnGeom(
  rng: ReturnType<typeof createRng>,
  arenaW: number,
  arenaH: number,
): TeamSpawnGeom {
  const margin = 90
  return {
    anchor: {
      x: margin + rng.next() * (arenaW - margin * 2),
      y: margin + rng.next() * (arenaH - margin * 2),
    },
    angle: rng.next() * Math.PI * 2,
    cohesion: rng.next(),
  }
}

function unitSpawnInCluster(
  rng: ReturnType<typeof createRng>,
  geom: TeamSpawnGeom,
  index: number,
  count: number,
): { x: number; y: number } {
  const { anchor, angle, cohesion } = geom
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const perpCos = -sin
  const perpSin = cos

  const alongSpan = 36 + (1 - cohesion) * 240
  const perpSpan = 28 + (1 - cohesion) * 200
  const chaos = (1 - cohesion) * 280

  const t = count > 1 ? (index / (count - 1) - 0.5) * 2 : 0
  const along = t * alongSpan + (rng.next() - 0.5) * chaos
  const perp = (rng.next() - 0.5) * perpSpan + (rng.next() - 0.5) * chaos * 0.65

  return {
    x: anchor.x + cos * along + perpCos * perp,
    y: anchor.y + sin * along + perpSin * perp,
  }
}

export function generateScenario(seed: number, durationSec = 45): Scenario {
  const rng = createRng(seed)
  const byArch = {
    assassin: CHAMPIONS.filter((c) => c.archetype === 'assassin'),
    ranger: CHAMPIONS.filter((c) => c.archetype === 'ranger'),
    mage: CHAMPIONS.filter((c) => c.archetype === 'mage'),
    brawler: CHAMPIONS.filter((c) => c.archetype === 'brawler'),
    tank: CHAMPIONS.filter((c) => c.archetype === 'tank'),
    support: CHAMPIONS.filter((c) => c.archetype === 'support'),
  }

  // Rough team comps: tank, carry, mage/assassin, brawler, support each side
  const roles: Archetype[] = ['tank', 'ranger', 'mage', 'brawler', 'support']
  const used = new Set<string>()
  const arenaW = 1100
  const arenaH = 700
  const rawPositions: { pos: { x: number; y: number }; unit: Omit<ScenarioUnit, 'startPos'> }[] = []
  const teamGeom: Record<'blue' | 'red', TeamSpawnGeom> = {
    blue: teamSpawnGeom(rng, arenaW, arenaH),
    red: teamSpawnGeom(rng, arenaW, arenaH),
  }

  for (const team of ['blue', 'red'] as const) {
    const shuffledRoles = rng.shuffle([...roles])
    if (rng.next() < 0.35) {
      shuffledRoles[2] = rng.pick(['assassin', 'mage'] as const)
    }
    shuffledRoles.forEach((arch, i) => {
      const pool = byArch[arch].filter((c) => !used.has(c.id))
      const champ = rng.pick(pool.length ? pool : byArch[arch])
      used.add(champ.id)
      const power = rng.int(3, 9)
      const level = Math.min(18, 6 + Math.round(power * 1.2) + rng.int(0, 2))
      const nActives = rng.poissonActives(1)
      const activeKinds: ActiveKind[] = []
      for (let a = 0; a < nActives; a++) {
        activeKinds.push(rng.pick(ACTIVE_KINDS))
      }
      rawPositions.push({
        pos: unitSpawnInCluster(rng, teamGeom[team], i, shuffledRoles.length),
        unit: {
          champId: champ.id,
          champName: champ.name,
          team,
          archetype: champ.archetype,
          power,
          level,
          kills: rng.int(0, Math.max(1, power)),
          deaths: rng.int(0, 5),
          assists: rng.int(0, 8),
          items: makeItems(rng, activeKinds),
          activeKinds,
        },
      })
    })
  }

  const separated = separatePositions(
    rawPositions.map((r) => r.pos),
    { w: arenaW, h: arenaH },
    UNIT_DIAMETER,
  )
  const units: ScenarioUnit[] = rawPositions.map((r, i) => ({
    ...r.unit,
    startPos: separated[i]!,
  }))

  const playerSlot = rng.int(0, 4) // blue team slot

  return {
    seed,
    durationSec,
    playerSlot,
    mode: 'teamfight',
    units,
  }
}

export function scenarioToWorld(scenario: Scenario): World {
  const rng = createRng(scenario.seed ^ 0x9e3779b9)
  const arena =
    scenario.mode === 'laning'
      ? { w: 520, h: 920 }
      : { w: 1100, h: 700 }
  const units: Unit[] = scenario.units.map((su, id) => {
    const stats = statsFor(su.archetype, su.power)
    return {
      id,
      champId: su.champId,
      champName: su.champName,
      team: su.team,
      archetype: su.archetype,
      power: su.power,
      level: su.level,
      kills: su.kills,
      deaths: su.deaths,
      assists: su.assists,
      items: su.items,
      actives: makeActives(su.activeKinds),
      pos: { ...su.startPos },
      hp: stats.maxHp,
      stats,
      abilities: makeAbilities(rng),
      targetId: null,
      moveTo: null,
      attackMoveTo: null,
      aaCooldown: 0,
      alive: true,
      isPlayer: id === scenario.playerSlot,
      dpsBuff: 0,
      resistBuff: 0,
      moveFactor: 1,
      speedBoostTtl: 0,
      pendingWard: null,
      damageDealt: 0,
      damageTaken: 0,
      focusScore: 0,
      hitFlashTtl: 0,
    }
  })

  return {
    seed: scenario.seed,
    mode: scenario.mode,
    tick: 0,
    time: 0,
    duration: scenario.durationSec,
    arena,
    units,
    minions: [],
    wards: [],
    projectiles: [],
    swipes: [],
    playerId: scenario.playerSlot,
    attackChampionsOnly: false,
    ended: false,
    result: null,
    nextProjectileId: 1,
    nextWardId: 1,
    nextMinionId: 1,
    floaters: [],
    playerCs: 0,
    waveTimer: 4,
  }
}
