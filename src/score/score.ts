import type { ScoreBreakdown, World } from '../sim/types'

export function scoreWorld(world: World): ScoreBreakdown {
  const player = world.units[world.playerId]!
  const notes: string[] = []

  const maxFocus = Math.max(1, player.damageDealt)
  const focus = Math.min(100, Math.round((player.focusScore / maxFocus) * 100))

  const hpRatio = player.alive ? player.hp / player.stats.maxHp : 0
  const survival = Math.round(hpRatio * 100)
  if (!player.alive) notes.push('You died — survival score cut.')

  const spacing = Math.min(
    100,
    Math.round(70 + (player.stats.aaRange > 300 ? 15 : 0) - player.damageTaken / 80),
  )

  const execRaw =
    player.abilities.r.spent || player.damageDealt > 400
      ? 75
      : player.damageDealt > 150
        ? 55
        : 35
  const execution = Math.min(100, execRaw + Math.round(player.actives.filter((a) => !a.ready).length * 5))

  if (player.focusScore > player.damageDealt * 0.5) {
    notes.push('Good focus: damage weighted onto priority targets.')
  } else {
    notes.push('Focus was dilute — prioritize carries over full tanks when free.')
  }

  const total = Math.round(focus * 0.35 + spacing * 0.2 + execution * 0.25 + survival * 0.2)

  return {
    focus,
    spacing: Math.max(0, spacing),
    execution,
    survival,
    total,
    damageDealt: Math.round(player.damageDealt),
    damageTaken: Math.round(player.damageTaken),
    notes,
  }
}
