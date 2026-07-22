import type { ScoreBreakdown, World } from '../sim/types'
import { scoreWorld } from './score'

export function scoreLaningWorld(world: World): ScoreBreakdown {
  const base = scoreWorld(world)
  const cs = world.playerCs
  const missed = world.lastHitMissed
  const durationMin = world.time / 60
  const csPerMin = durationMin > 0.1 ? cs / durationMin : cs
  const lastHitPct =
    cs + missed > 0 ? Math.round((cs / (cs + missed)) * 100) : cs > 0 ? 100 : 0

  const csScore = Math.min(100, Math.round(csPerMin * 18))
  const lastHitScore = lastHitPct
  const tradeScore = Math.min(
    100,
    Math.round(
      50 +
        (base.damageDealt > base.damageTaken ? 25 : 0) +
        Math.min(25, base.damageDealt / 40),
    ),
  )

  const total = Math.round(csScore * 0.35 + lastHitScore * 0.25 + tradeScore * 0.2 + base.survival * 0.2)

  const notes = [...base.notes]
  notes.unshift(`CS ${cs} (${csPerMin.toFixed(1)}/min) · last-hit ${lastHitPct}%`)
  if (missed > 0) notes.push(`${missed} minion${missed > 1 ? 's' : ''} missed in last-hit window.`)
  if (base.damageDealt > base.damageTaken * 1.2) notes.push('Won the damage trade vs laner.')
  else if (base.damageTaken > base.damageDealt * 1.5) notes.push('Took bad trades — respect wave state before fighting.')

  return {
    ...base,
    focus: csScore,
    spacing: lastHitScore,
    execution: tradeScore,
    total,
    cs,
    lastHitMissed: missed,
    notes,
  }
}
