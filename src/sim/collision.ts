import { UNIT_DIAMETER, UNIT_RADIUS } from './constants'
import { clampToArena, dist } from './combat'
import type { Vec2, World } from './types'

/** Point to stand when approaching `target` from `from`, stopping `stopDist` away. */
export function approachPoint(from: Vec2, target: Vec2, stopDist: number): Vec2 {
  const d = dist(from, target)
  if (d <= stopDist || d < 0.001) return { ...from }
  const t = (d - stopDist) / d
  return {
    x: from.x + (target.x - from.x) * t,
    y: from.y + (target.y - from.y) * t,
  }
}

/** Small offset so multiple units don't path to the exact same pixel. */
export function formationOffset(id: number, radius = 36): Vec2 {
  const a = id * 2.399963
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius }
}

export function resolveUnitCollisions(world: World, iterations = 5) {
  const units = world.units.filter((u) => u.alive)
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i]!
        const b = units[j]!
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        let d = Math.hypot(dx, dy)
        if (d < 0.001) {
          const jitter = (a.id - b.id) * 0.31
          a.pos.x -= Math.cos(jitter) * 2
          a.pos.y -= Math.sin(jitter) * 2
          b.pos.x += Math.cos(jitter) * 2
          b.pos.y += Math.sin(jitter) * 2
          d = UNIT_DIAMETER - 1
        }
        if (d < UNIT_DIAMETER) {
          const nx = dx / d
          const ny = dy / d
          const push = (UNIT_DIAMETER - d) * 0.5
          a.pos.x -= nx * push
          a.pos.y -= ny * push
          b.pos.x += nx * push
          b.pos.y += ny * push
          a.pos = clampToArena(a.pos, world.arena, UNIT_RADIUS)
          b.pos = clampToArena(b.pos, world.arena, UNIT_RADIUS)
        }
      }
    }
  }
}

/** Ensure spawn positions are at least touching-distance apart. */
export function separatePositions(
  positions: Vec2[],
  arena: { w: number; h: number },
  minDist = UNIT_DIAMETER,
): Vec2[] {
  const out = positions.map((p) => ({ ...p }))
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!
        const b = out[j]!
        const d = dist(a, b)
        if (d < minDist && d > 0.001) {
          const nx = (b.x - a.x) / d
          const ny = (b.y - a.y) / d
          const push = (minDist - d) * 0.5
          a.x -= nx * push
          a.y -= ny * push
          b.x += nx * push
          b.y += ny * push
        }
      }
      out[i] = clampToArena(out[i]!, arena, UNIT_RADIUS)
    }
  }
  return out
}
