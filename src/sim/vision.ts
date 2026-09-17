import { UNIT_RADIUS, VISION_RADIUS } from './constants'
import { dist } from './combat'
import type { Team, Unit, Vec2, World } from './types'

export function observerTeam(world: World): Team {
  return world.units[world.playerId]?.team ?? 'blue'
}

/** Living allied champs, allied minions, and allied wards — shared vision, not personal. */
export function allyVisionSources(world: World): Vec2[] {
  const team = observerTeam(world)
  const out: Vec2[] = []
  for (const u of world.units) {
    if (u.alive && u.team === team) out.push(u.pos)
  }
  for (const m of world.minions) {
    if (m.alive && m.team === team) out.push(m.pos)
  }
  for (const w of world.wards) {
    if (w.team === team && w.ttl > 0) out.push(w.pos)
  }
  return out
}

export function inAllyVision(world: World, pos: Vec2, extra = 0): boolean {
  const r = VISION_RADIUS + extra
  for (const s of allyVisionSources(world)) {
    if (dist(s, pos) <= r) return true
  }
  return false
}

/** Allies always shown while alive. Enemies only inside shared ally vision. Dead drop vision. */
export function unitRevealed(world: World, u: Unit): boolean {
  if (!u.alive) return false
  if (u.team === observerTeam(world)) return true
  return inAllyVision(world, u.pos, UNIT_RADIUS)
}

export function fxRevealed(world: World, pos: Vec2, team: Team): boolean {
  if (team === observerTeam(world)) return true
  return inAllyVision(world, pos)
}
