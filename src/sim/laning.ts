import { UNIT_RADIUS } from './constants'
import { dist, norm } from './combat'
import type { Minion, Team, World } from './types'

const DT = 1 / 60
export const WAVE_INTERVAL = 28
export const WAVE_TELEGRAPH = 6

function spawnWave(world: World) {
  const midX = world.arena.w / 2
  const spawnY = (team: Team) => (team === 'blue' ? world.arena.h - 48 : 48)
  for (const team of ['blue', 'red'] as const) {
    for (let i = -1; i <= 1; i++) {
      world.minions.push({
        id: world.nextMinionId++,
        team,
        pos: { x: midX + i * 36, y: spawnY(team) },
        hp: 420,
        maxHp: 420,
        damage: 12,
        moveSpeed: 260,
        gold: 21,
        alive: true,
        targetId: null,
        moveTo: null,
        lane: 'mid',
      })
    }
  }
}

function nearestEnemyMinion(world: World, m: Minion): Minion | null {
  let best: Minion | null = null
  let bestD = Infinity
  for (const o of world.minions) {
    if (!o.alive || o.team === m.team) continue
    const d = dist(m.pos, o.pos)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

function stepMinion(world: World, m: Minion) {
  if (!m.alive) return
  const goalY = m.team === 'blue' ? 56 : world.arena.h - 56
  const foe = nearestEnemyMinion(world, m)
  const champFoe = world.units.find(
    (u) => u.alive && u.team !== m.team && dist(u.pos, m.pos) < 120,
  )

  if (champFoe && dist(m.pos, champFoe.pos) < 90) {
    champFoe.hp -= m.damage * DT * 0.6
    if (champFoe.hp <= 0) {
      champFoe.hp = 0
      champFoe.alive = false
    }
    return
  }

  if (foe && dist(m.pos, foe.pos) < 100) {
    foe.hp -= m.damage * DT
    if (foe.hp <= 0) {
      foe.hp = 0
      foe.alive = false
    }
    return
  }

  const dest = { x: m.pos.x, y: goalY }
  const d = dist(m.pos, dest)
  if (d > 4) {
    const n = norm(m.pos, dest)
    const travel = m.moveSpeed * DT
    m.pos.x += n.x * travel
    m.pos.y += n.y * travel
  }
}

function updateLastHitWindow(world: World) {
  const player = world.units[world.playerId]
  world.lastHitMinionId = null
  if (!player?.alive) return

  const aaKill = player.stats.aaDamage * 1.15
  const range = player.stats.aaRange + UNIT_RADIUS
  let best: Minion | null = null
  let bestHp = Infinity

  for (const m of world.minions) {
    if (!m.alive || m.team === player.team) continue
    const d = dist(player.pos, m.pos)
    if (d > range) continue
    if (m.hp <= aaKill && m.hp < bestHp) {
      best = m
      bestHp = m.hp
    }
  }
  world.lastHitMinionId = best?.id ?? null
}

export function tickLaning(world: World) {
  world.waveTimer -= DT
  if (world.waveTimer <= 0) {
    spawnWave(world)
    world.waveTimer = WAVE_INTERVAL
  }

  updateLastHitWindow(world)
  const trackedLastHit = world.lastHitMinionId
  const player = world.units[world.playerId]

  for (const m of world.minions) stepMinion(world, m)

  for (const m of world.minions) {
    if (m.alive && m.hp <= 0) {
      if (m.id === trackedLastHit && player?.targetId !== m.id) {
        world.lastHitMissed += 1
      }
      m.alive = false
    }
  }

  world.minions = world.minions.filter((m) => m.alive)

  if (player?.alive && player.targetId != null) {
    const minion = world.minions.find((m) => m.id === player.targetId && m.alive)
    if (minion && dist(player.pos, minion.pos) <= player.stats.aaRange + UNIT_RADIUS) {
      minion.hp -= player.stats.aaDamage * DT * player.stats.aaSpeed
      if (minion.hp <= 0) {
        minion.hp = 0
        minion.alive = false
        world.playerCs += 1
        world.floaters.push({
          x: minion.pos.x,
          y: minion.pos.y - 20,
          text: '+CS',
          ttl: 0.9,
          color: 0xc4f000,
        })
        player.targetId = null
      }
    }
  }

  const foe = world.units.find((u) => u.alive && u.team === 'red')
  if (!foe) {
    world.ended = true
    world.result = 'victory'
    return
  }
  if (!player?.alive) {
    world.ended = true
    world.result = 'defeat'
  }
}

export function drawLaneOverlay(w: number, h: number, g: {
  rect: (x: number, y: number, w: number, h: number) => void
  fill: (style: { color: number; alpha: number }) => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  stroke: (style: { width: number; color: number; alpha: number }) => void
}) {
  const mid = w / 2
  g.rect(mid - 70, 12, 140, h - 24)
  g.fill({ color: 0x1a1e14, alpha: 0.55 })
  g.moveTo(mid, 12)
  g.lineTo(mid, h - 12)
  g.stroke({ width: 1, color: 0xc4f000, alpha: 0.18 })
}
