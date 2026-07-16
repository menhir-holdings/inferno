import type { ScoreBreakdown, World } from '../sim/types'

function carryWeight(u: { archetype: string; hp: number; stats: { maxHp: number } }) {
  if (u.archetype === 'tank') return 0.35
  if (u.archetype === 'support') return 0.55
  const low = u.hp / u.stats.maxHp < 0.35
  return low ? 1.5 : 1
}

export function scoreWorld(world: World): ScoreBreakdown {
  const player = world.units[world.playerId]!
  const notes: string[] = []

  let weightedFocus = 0
  let totalWeight = 0
  for (const u of world.units) {
    if (u.team === player.team || !u.alive) continue
    const w = carryWeight(u)
    totalWeight += w
    if (u.damageTaken > 0 && player.damageDealt > 0) {
      weightedFocus += w * Math.min(1, u.damageTaken / (player.damageDealt * 0.25))
    }
  }
  const focus = Math.min(100, Math.round((weightedFocus / Math.max(0.5, totalWeight)) * 100))

  const hpRatio = player.alive ? player.hp / player.stats.maxHp : 0
  const survival = Math.round(hpRatio * 100)
  if (!player.alive) notes.push('You died — reposition earlier or peel with actives.')

  const idealRange = player.stats.aaRange
  const spacing = Math.min(
    100,
    Math.round(
      55 +
        (player.damageTaken < player.stats.maxHp * 0.35 ? 25 : 0) +
        (idealRange > 400 ? 10 : 5) -
        player.damageTaken / 100,
    ),
  )

  const usedR = player.abilities.r.spent
  const usedActives = player.actives.some((a) => !a.ready && a.cooldown < a.maxCooldown - 1)
  const execution = Math.min(
    100,
    Math.round(40 + (usedR ? 25 : 0) + (usedActives ? 15 : 0) + Math.min(25, player.damageDealt / 30)),
  )

  if (focus >= 70) notes.push('Strong focus — damage tracked onto priority bodies.')
  else if (focus < 45) notes.push('Focus was loose — hit carries and wounded targets when tanks are fronting.')
  if (player.damageTaken > player.damageDealt * 0.8) {
    notes.push('Spacing cost you — kite at the edge of your AA range.')
  }

  const total = Math.round(focus * 0.38 + spacing * 0.22 + execution * 0.22 + survival * 0.18)

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
