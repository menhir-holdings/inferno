import { abilityDamage, aaDamage, dealDamage, dist, enemiesOf, nearestEnemy, alliesOf, clampToArena, norm } from './combat'
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
    // Tank / support hamper
    if (src.stats.hamperRadius > 0 && src.stats.hamperStrength > 0) {
      for (const foe of enemiesOf(world, src)) {
        if (dist(src.pos, foe.pos) <= src.stats.hamperRadius) {
          foe.moveFactor = Math.min(foe.moveFactor, 1 - src.stats.hamperStrength)
        }
      }
    }
    // Support buffs
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

function moveUnit(world: World, u: Unit, dest: { x: number; y: number }) {
  const d = dist(u.pos, dest)
  if (d < 4) {
    u.pos = { ...dest }
    return true
  }
  const boost = u.speedBoostTtl > 0 ? 1.35 : 1
  const speed = u.stats.moveSpeed * u.moveFactor * boost * DT
  const n = norm(u.pos, dest)
  u.pos = clampToArena(
    { x: u.pos.x + n.x * Math.min(speed, d), y: u.pos.y + n.y * Math.min(speed, d) },
    world.arena,
  )
  return false
}

function tryAutoAttack(world: World, u: Unit) {
  if (u.aaCooldown > 0 || u.targetId == null) return
  const target = world.units[u.targetId]
  if (!target || !target.alive) {
    u.targetId = null
    return
  }
  if (world.attackChampionsOnly && u.isPlayer && false) {
    // always champions in this sim
  }
  const range = u.stats.aaRange
  if (dist(u.pos, target.pos) > range + 8) {
    // walk into range
    u.moveTo = { ...target.pos }
    return
  }
  u.moveTo = null
  const dmg = aaDamage(u)
  if (u.stats.melee || range < 200) {
    dealDamage(u, target, dmg, true)
  } else {
    const n = norm(u.pos, target.pos)
    const speed = 900
    world.projectiles.push({
      id: world.nextProjectileId++,
      fromId: u.id,
      toId: target.id,
      pos: { ...u.pos },
      vel: { x: n.x * speed, y: n.y * speed },
      damage: dmg,
      ttl: 1.2,
      kind: 'aa',
      team: u.team,
      radius: 8,
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
      if (t && t.alive && dist(p.pos, t.pos) < 28) {
        const atk = world.units[p.fromId]
        if (atk) dealDamage(atk, t, p.damage, p.kind !== 'aa' || t.archetype !== 'tank')
        hit = true
      }
    } else {
      for (const t of world.units) {
        if (!t.alive || t.team === p.team) continue
        if (dist(p.pos, t.pos) < p.radius + 24) {
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

export function castAbility(world: World, u: Unit, slot: AbilitySlot, aim: { x: number; y: number } | null) {
  const ab = u.abilities[slot]
  if (!ab.ready || ab.spent || !u.alive) return false
  const dmg = abilityDamage(u, slot)
  const target =
    aim != null
      ? world.units.find(
          (o) => o.alive && o.team !== u.team && dist(o.pos, aim) < 50,
        ) ?? nearestEnemy(world, u)
      : nearestEnemy(world, u)
  if (!target) return false

  if (slot === 'r') {
    dealDamage(u, target, dmg, true)
    // small AOE splash
    for (const o of enemiesOf(world, u)) {
      if (o.id !== target.id && dist(target.pos, o.pos) < 140) {
        dealDamage(u, o, dmg * 0.35, false)
      }
    }
    ab.spent = true
    ab.ready = false
  } else {
    const n = norm(u.pos, target.pos)
    const speed = 750
    world.projectiles.push({
      id: world.nextProjectileId++,
      fromId: u.id,
      toId: null,
      pos: { ...u.pos },
      vel: { x: n.x * speed, y: n.y * speed },
      damage: dmg,
      ttl: 0.9,
      kind: 'ability',
      team: u.team,
      radius: slot === 'w' ? 40 : 22,
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
    const t = nearestEnemy(world, u)
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

  if (u.archetype === 'support') {
    const ally = alliesOf(world, u).sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0]
    if (ally && ally.hp / ally.stats.maxHp < 0.6) {
      u.moveTo = { ...ally.pos }
      u.targetId = foe.id
    } else {
      u.attackMoveTo = { x: foe.pos.x - (foe.pos.x - u.pos.x) * 0.3, y: foe.pos.y }
      u.targetId = foe.id
    }
  } else if (u.archetype === 'tank' || u.archetype === 'brawler') {
    u.targetId = foe.id
    u.moveTo = { ...foe.pos }
  } else if (u.archetype === 'ranger' || u.archetype === 'mage') {
    if (d < range * 0.55) {
      const n = norm(foe.pos, u.pos)
      u.moveTo = clampToArena(
        { x: u.pos.x + n.x * 80, y: u.pos.y + n.y * 80 },
        world.arena,
      )
    } else if (d > range * 0.95) {
      u.moveTo = { ...foe.pos }
    } else {
      u.moveTo = null
    }
    u.targetId = foe.id
  } else {
    // assassin
    const carry = enemiesOf(world, u).sort(
      (a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp,
    )[0]
    const focus = carry ?? foe
    u.targetId = focus.id
    u.moveTo = { ...focus.pos }
  }

  // opportunistic abilities
  if (u.abilities.q.ready && d < range * 1.2) castAbility(world, u, 'q', foe.pos)
  if (u.abilities.w.ready && d < range * 1.1 && world.tick % 90 === u.id) {
    castAbility(world, u, 'w', foe.pos)
  }
  if (u.abilities.r.ready && !u.abilities.r.spent && foe.hp / foe.stats.maxHp < 0.45) {
    castAbility(world, u, 'r', foe.pos)
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
        .filter((o) => dist(u.pos, o.pos) <= u.stats.aaRange + 20)
        .sort((a, b) => dist(u.pos, a.pos) - dist(u.pos, b.pos))[0]
      if (near) {
        u.targetId = near.id
        u.attackMoveTo = null
        u.moveTo = null
      } else {
        const arrived = moveUnit(world, u, u.attackMoveTo)
        if (arrived) u.attackMoveTo = null
      }
    } else if (u.moveTo) {
      const arrived = moveUnit(world, u, u.moveTo)
      if (arrived) u.moveTo = null
    }

    tryAutoAttack(world, u)
  }

  for (const w of world.wards) w.ttl -= DT
  world.wards = world.wards.filter((w) => w.ttl > 0)

  tickProjectiles(world)

  const blueAlive = world.units.some((u) => u.alive && u.team === 'blue')
  const redAlive = world.units.some((u) => u.alive && u.team === 'red')
  if (!blueAlive || !redAlive) world.ended = true
}

export { DT }
