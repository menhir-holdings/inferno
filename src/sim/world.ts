import { UNIT_DIAMETER, UNIT_RADIUS } from './constants'
import { approachPoint, formationOffset, resolveUnitCollisions } from './collision'
import {
  abilityDamage,
  aaDamage,
  attackStopDist,
  dealDamage,
  dist,
  enemiesOf,
  nearestEnemy,
  alliesOf,
  clampToArena,
  norm,
} from './combat'
import type { AbilitySlot, Unit, World } from './types'

const DT = 1 / 60

function applyAuraEffects(world: World) {
  for (const u of world.units) {
    if (!u.alive) continue
    u.moveFactor = 1
    u.dpsBuff = 0
    u.resistBuff = 0
  }

  for (const src of world.units) {
    if (!src.alive) continue
    if (src.stats.hamperRadius > 0 && src.stats.hamperStrength > 0) {
      for (const foe of enemiesOf(world, src)) {
        if (dist(src.pos, foe.pos) <= src.stats.hamperRadius) {
          foe.moveFactor = Math.min(foe.moveFactor, 1 - src.stats.hamperStrength)
        }
      }
    }
    if (src.stats.buffRadius > 0) {
      for (const ally of [src, ...alliesOf(world, src)]) {
        if (dist(src.pos, ally.pos) <= src.stats.buffRadius) {
          ally.dpsBuff = Math.max(ally.dpsBuff, src.stats.buffDps)
          ally.resistBuff = Math.max(ally.resistBuff, src.stats.buffResist)
        }
      }
    }
  }
}

function stepMove(world: World, u: Unit, dest: { x: number; y: number }, stopDist = 0): boolean {
  const d = dist(u.pos, dest)
  if (d <= stopDist + 1.5) return true
  const boost = u.speedBoostTtl > 0 ? 1.35 : 1
  const speed = u.stats.moveSpeed * u.moveFactor * boost * DT
  const travel = Math.min(speed, Math.max(0, d - stopDist))
  if (travel < 0.5) return true
  const n = norm(u.pos, dest)
  u.pos = clampToArena(
    { x: u.pos.x + n.x * travel, y: u.pos.y + n.y * travel },
    world.arena,
    UNIT_RADIUS,
  )
  return dist(u.pos, dest) <= stopDist + 1.5
}

function tryAutoAttack(world: World, u: Unit) {
  if (u.aaCooldown > 0 || u.targetId == null) return
  const target = world.units[u.targetId]
  if (!target || !target.alive) {
    u.targetId = null
    return
  }
  const range = u.stats.aaRange
  const stop = attackStopDist(u)
  const d = dist(u.pos, target.pos)
  if (d > range + 4) {
    const goal = approachPoint(u.pos, target.pos, stop)
    u.moveTo = goal
    return
  }
  if (d > stop + 2 && u.stats.melee) {
    u.moveTo = approachPoint(u.pos, target.pos, stop)
    return
  }
  u.moveTo = null
  const dmg = aaDamage(u)
  if (u.stats.melee || range < 200) {
    dealDamage(u, target, dmg, target.archetype !== 'tank')
  } else {
    const n = norm(u.pos, target.pos)
    world.projectiles.push({
      id: world.nextProjectileId++,
      fromId: u.id,
      toId: target.id,
      pos: { ...u.pos },
      vel: { x: n.x * 920, y: n.y * 920 },
      damage: dmg,
      ttl: 1.1,
      kind: 'aa',
      team: u.team,
      radius: 6,
    })
  }
  u.aaCooldown = 1 / u.stats.aaSpeed
}

function tickProjectiles(world: World) {
  const kept = []
  for (const p of world.projectiles) {
    p.ttl -= DT
    p.pos.x += p.vel.x * DT
    p.pos.y += p.vel.y * DT
    let hit = false
    if (p.toId != null) {
      const t = world.units[p.toId]
      if (t && t.alive && dist(p.pos, t.pos) < UNIT_RADIUS) {
        const atk = world.units[p.fromId]
        if (atk) dealDamage(atk, t, p.damage, t.archetype !== 'tank')
        hit = true
      }
    } else {
      for (const t of world.units) {
        if (!t.alive || t.team === p.team) continue
        if (dist(p.pos, t.pos) < p.radius + UNIT_RADIUS * 0.7) {
          const atk = world.units[p.fromId]
          if (atk) dealDamage(atk, t, p.damage, true)
          hit = true
          break
        }
      }
    }
    if (!hit && p.ttl > 0) kept.push(p)
  }
  world.projectiles = kept
}

function tickCooldowns(u: Unit) {
  if (u.aaCooldown > 0) u.aaCooldown -= DT
  if (u.speedBoostTtl > 0) u.speedBoostTtl -= DT
  if (u.hitFlashTtl > 0) u.hitFlashTtl -= DT
  for (const slot of ['q', 'w', 'e', 'r'] as AbilitySlot[]) {
    const a = u.abilities[slot]
    if (!a.ready && !a.spent) {
      a.cooldown -= DT
      if (a.cooldown <= 0) {
        a.ready = true
        a.cooldown = 0
      }
    }
  }
  for (const act of u.actives) {
    if (!act.ready) {
      act.cooldown -= DT
      if (act.cooldown <= 0) {
        act.ready = true
        act.cooldown = 0
      }
    }
  }
}

function priorityTarget(world: World, u: Unit): Unit | null {
  const foes = enemiesOf(world, u)
  if (!foes.length) return null
  const carries = foes.filter((f) => f.archetype !== 'tank' && f.archetype !== 'support')
  const pool = carries.length ? carries : foes
  return pool.sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0] ?? null
}

function teamCentroid(world: World, team: Unit['team']): { x: number; y: number } {
  const mates = world.units.filter((u) => u.alive && u.team === team)
  if (!mates.length) return { x: world.arena.w / 2, y: world.arena.h / 2 }
  const sx = mates.reduce((s, u) => s + u.pos.x, 0)
  const sy = mates.reduce((s, u) => s + u.pos.y, 0)
  return { x: sx / mates.length, y: sy / mates.length }
}

export function castAbility(
  world: World,
  u: Unit,
  slot: AbilitySlot,
  aim: { x: number; y: number } | null,
) {
  const ab = u.abilities[slot]
  if (!ab.ready || ab.spent || !u.alive) return false
  const dmg = abilityDamage(u, slot)
  const target =
    aim != null
      ? world.units.find((o) => o.alive && o.team !== u.team && dist(o.pos, aim) < UNIT_RADIUS + 8) ??
        nearestEnemy(world, u)
      : nearestEnemy(world, u)
  if (!target) return false

  if (slot === 'r') {
    dealDamage(u, target, dmg, true)
    for (const o of enemiesOf(world, u)) {
      if (o.id !== target.id && dist(target.pos, o.pos) < 150) {
        dealDamage(u, o, dmg * 0.35, false)
      }
    }
    if (u.archetype === 'assassin') {
      u.pos = approachPoint(target.pos, u.pos, UNIT_DIAMETER)
      u.pos = clampToArena(u.pos, world.arena, UNIT_RADIUS)
    }
    ab.spent = true
    ab.ready = false
  } else {
    const n = norm(u.pos, target.pos)
    const speed = u.archetype === 'mage' ? 820 : 700
    world.projectiles.push({
      id: world.nextProjectileId++,
      fromId: u.id,
      toId: null,
      pos: { ...u.pos },
      vel: { x: n.x * speed, y: n.y * speed },
      damage: dmg,
      ttl: slot === 'w' ? 1.1 : 0.85,
      kind: 'ability',
      team: u.team,
      radius: slot === 'w' ? 44 : u.archetype === 'mage' ? 18 : 26,
    })
    ab.ready = false
    ab.cooldown = ab.maxCooldown
  }
  return true
}

export function useActive(world: World, u: Unit, slot: 1 | 2 | 3) {
  const act = u.actives.find((a) => a.slot === slot)
  if (!act || !act.ready || !u.alive) return false
  if (act.kind === 'burst') {
    const t = priorityTarget(world, u) ?? nearestEnemy(world, u)
    if (t) dealDamage(u, t, u.stats.abilityPower * 1.6, true)
  } else if (act.kind === 'shield') {
    u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * 0.22)
  } else if (act.kind === 'speed') {
    u.speedBoostTtl = Math.max(u.speedBoostTtl, 2.5)
  }
  act.ready = false
  act.cooldown = act.maxCooldown
  return true
}

export function placeWard(world: World, u: Unit, pos: { x: number; y: number }) {
  if (!u.alive) return false
  world.wards.push({
    id: world.nextWardId++,
    pos: clampToArena(pos, world.arena),
    team: u.team,
    ttl: 90,
  })
  return true
}

function aiTick(world: World, u: Unit) {
  if (u.isPlayer || !u.alive) return
  const foe = nearestEnemy(world, u)
  if (!foe) return

  const d = dist(u.pos, foe.pos)
  const range = u.stats.aaRange
  const stop = attackStopDist(u)
  const focus = priorityTarget(world, u) ?? foe
  const offset = formationOffset(u.id, 28)

  if (u.archetype === 'support') {
    const hurt = alliesOf(world, u)
      .filter((a) => a.archetype !== 'tank')
      .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0]
    if (hurt && hurt.hp / hurt.stats.maxHp < 0.55) {
      const behind = approachPoint(hurt.pos, foe.pos, UNIT_DIAMETER * 1.5)
      u.moveTo = { x: behind.x + offset.x * 0.4, y: behind.y + offset.y * 0.4 }
    } else {
      const centroid = teamCentroid(world, u.team)
      u.moveTo = {
        x: centroid.x + offset.x,
        y: centroid.y + offset.y,
      }
    }
    u.targetId = focus.id
  } else if (u.archetype === 'tank') {
    const front = approachPoint(foe.pos, teamCentroid(world, u.team === 'blue' ? 'red' : 'blue'), stop)
    u.targetId = focus.id
    u.moveTo = { x: front.x + offset.x * 0.5, y: front.y + offset.y * 0.5 }
  } else if (u.archetype === 'brawler') {
    u.targetId = focus.id
    u.moveTo = approachPoint(u.pos, focus.pos, stop)
    u.moveTo = {
      x: u.moveTo.x + offset.x * 0.3,
      y: u.moveTo.y + offset.y * 0.3,
    }
  } else if (u.archetype === 'ranger' || u.archetype === 'mage') {
    u.targetId = focus.id
    const sweet = range * 0.82
    if (d < sweet * 0.55) {
      const n = norm(foe.pos, u.pos)
      u.moveTo = clampToArena(
        { x: u.pos.x + n.x * 90 + offset.x * 0.2, y: u.pos.y + n.y * 90 + offset.y * 0.2 },
        world.arena,
        UNIT_RADIUS,
      )
    } else if (d > sweet) {
      u.moveTo = approachPoint(u.pos, focus.pos, sweet)
    } else {
      u.moveTo = null
    }
  } else {
    u.targetId = focus.id
    u.moveTo = approachPoint(u.pos, focus.pos, stop)
  }

  if (u.abilities.q.ready && d < range * 1.15) castAbility(world, u, 'q', focus.pos)
  if (u.abilities.e.ready && u.archetype === 'assassin' && d < range * 1.3) {
    castAbility(world, u, 'e', focus.pos)
  }
  if (u.abilities.w.ready && world.tick % 120 === u.id % 120) {
    castAbility(world, u, 'w', focus.pos)
  }
  if (u.abilities.r.ready && !u.abilities.r.spent && focus.hp / focus.stats.maxHp < 0.5) {
    castAbility(world, u, 'r', focus.pos)
  }
}

export function tickWorld(world: World) {
  if (world.ended) return
  world.tick += 1
  world.time += DT
  if (world.time >= world.duration) {
    world.ended = true
    return
  }

  applyAuraEffects(world)

  for (const u of world.units) {
    if (!u.alive) continue
    tickCooldowns(u)
    aiTick(world, u)

    if (u.attackMoveTo) {
      const near = enemiesOf(world, u)
        .filter((o) => dist(u.pos, o.pos) <= u.stats.aaRange + UNIT_RADIUS)
        .sort((a, b) => dist(u.pos, a.pos) - dist(u.pos, b.pos))[0]
      if (near) {
        u.targetId = near.id
        u.attackMoveTo = null
        u.moveTo = approachPoint(u.pos, near.pos, attackStopDist(u))
      } else {
        const arrived = stepMove(world, u, u.attackMoveTo, UNIT_RADIUS)
        if (arrived) u.attackMoveTo = null
      }
    } else if (u.moveTo) {
      const stop = u.targetId != null ? attackStopDist(u) : UNIT_RADIUS * 0.5
      const arrived = stepMove(world, u, u.moveTo, stop)
      if (arrived) u.moveTo = null
    }

    tryAutoAttack(world, u)
  }

  resolveUnitCollisions(world)

  for (const w of world.wards) w.ttl -= DT
  world.wards = world.wards.filter((w) => w.ttl > 0)

  tickProjectiles(world)

  const blueAlive = world.units.some((u) => u.alive && u.team === 'blue')
  const redAlive = world.units.some((u) => u.alive && u.team === 'red')
  if (!blueAlive || !redAlive) world.ended = true
}

export { DT }
