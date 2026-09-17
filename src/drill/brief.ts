import type { Archetype, Scenario, Unit } from '../sim/types'

export function drillObjective(player: Unit, mode: Scenario['mode']): { title: string; line: string } {
  if (mode === 'laning') {
    return {
      title: 'Laning drill',
      line: 'Last-hit on a clock. Trade when they CS — do not tunnel the wave.',
    }
  }
  const lines: Record<Archetype, string> = {
    tank: 'Engage the front. Zone carries. Do not chase into their backline.',
    assassin: 'Wait for the backline. Do not eat the tank. Ult the wounded carry.',
    ranger: 'Kite at AA range. Hit the wounded mage or assassin first.',
    mage: 'Land skillshots. Move after every cast. Do not stand in the red paint.',
    brawler: 'Win the 2v2. Peel if your ranger is diving too deep.',
    support: 'Stay on your carry. Hamper the dive. Do not wander.',
  }
  return {
    title: `${player.champName} · ${player.archetype}`,
    line: lines[player.archetype],
  }
}
