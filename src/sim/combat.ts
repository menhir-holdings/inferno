import { UNIT_DIAMETER } from './constants'
import type { AbilitySlot, Unit, Vec2, World } from './types'

export function attackStopDist(u: Unit): number {
  if (u.stats.melee || u.stats.aaRange < 200) return UNIT_DIAMETER * 0.98
  return u.stats.aaRange * 0.92
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

export function norm(a: Vec2, b: Vec2): Vec2 {
  const d = dist(a, b) || 1
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }
}

export function clampToArena(pos: Vec2, arena: { w: number; h: number }, pad = 28): Vec2 {
  return {
    x: Math.max(pad, Math.min(arena.w - pad, pos.x)),
    y: Math.max(pad, Math.min(arena.h - pad, pos.y)),
  }
}

export function enemiesOf(world: World, u: Unit): Unit[] {
  return world.units.filter((o) => o.alive && o.team !== u.team)
}

export function alliesOf(world: World, u: Unit): Unit[] {
  return world.units.filter((o) => o.alive && o.team === u.team && o.id !== u.id)
}

export function nearestEnemy(world: World, u: Unit): Unit | null {
  const foes = enemiesOf(world, u)
  if (!foes.length) return null
  return foes.reduce((best, o) => (dist(u.pos, o.pos) < dist(u.pos, best.pos) ? o : best))
}

export function unitAt(world: World, pos: Vec2, radius = 36, team?: Unit['team']): Unit | null {
  let best: Unit | null = null
  let bestD = radius
  for (const u of world.units) {
    if (!u.alive) continue
    if (team && u.team !== team) continue
    const d = dist(u.pos, pos)
    if (d < bestD) {
      bestD = d
      best = u
    }
  }
  return best
}

export function effectiveResist(u: Unit): number {
  return Math.min(0.85, u.stats.resist + u.resistBuff)
}

export function dealDamage(attacker: Unit, target: Unit, raw: number, isFocus = false): number {
  const mult = 1 + attacker.dpsBuff
  const dmg = Math.max(1, raw * mult * (1 - effectiveResist(target)))
  target.hp -= dmg
  target.damageTaken += dmg
  target.hitFlashTtl = 0.12
  attacker.damageDealt += dmg
  if (isFocus && target.archetype !== 'tank') {
    attacker.focusScore += dmg * (target.hp / target.stats.maxHp < 0.4 ? 1.4 : 1)
  }
  if (target.hp <= 0) {
    target.hp = 0
    target.alive = false
    target.deaths += 1
    attacker.kills += 1
  }
  return dmg
}

export function abilityDamage(caster: Unit, slot: AbilitySlot): number {
  const ap = caster.stats.abilityPower
  if (slot === 'r') return ap * 2.4
  if (slot === 'q') return ap * 0.95
  if (slot === 'w') return ap * 0.85
  return ap * 1.05
}

export function aaDamage(attacker: Unit): number {
  return attacker.stats.aaDamage * (1 + attacker.dpsBuff)
}
