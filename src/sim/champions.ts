import type { Archetype } from './types'

export interface ChampDef {
  id: string
  name: string
  archetype: Archetype
}

/** Curated set covering all archetypes — icons via Data Dragon. */
export const CHAMPIONS: ChampDef[] = [
  { id: 'Zed', name: 'Zed', archetype: 'assassin' },
  { id: 'Akali', name: 'Akali', archetype: 'assassin' },
  { id: 'KhaZix', name: 'Kha\'Zix', archetype: 'assassin' },
  { id: 'Talon', name: 'Talon', archetype: 'assassin' },
  { id: 'Qiyana', name: 'Qiyana', archetype: 'assassin' },
  { id: 'Jinx', name: 'Jinx', archetype: 'ranger' },
  { id: 'Ashe', name: 'Ashe', archetype: 'ranger' },
  { id: 'Caitlyn', name: 'Caitlyn', archetype: 'ranger' },
  { id: 'Jhin', name: 'Jhin', archetype: 'ranger' },
  { id: 'KaiSa', name: 'Kai\'Sa', archetype: 'ranger' },
  { id: 'Ahri', name: 'Ahri', archetype: 'mage' },
  { id: 'Syndra', name: 'Syndra', archetype: 'mage' },
  { id: 'Lux', name: 'Lux', archetype: 'mage' },
  { id: 'Viktor', name: 'Viktor', archetype: 'mage' },
  { id: 'Orianna', name: 'Orianna', archetype: 'mage' },
  { id: 'Darius', name: 'Darius', archetype: 'brawler' },
  { id: 'Garen', name: 'Garen', archetype: 'brawler' },
  { id: 'Sett', name: 'Sett', archetype: 'brawler' },
  { id: 'Renekton', name: 'Renekton', archetype: 'brawler' },
  { id: 'XinZhao', name: 'Xin Zhao', archetype: 'brawler' },
  { id: 'Ornn', name: 'Ornn', archetype: 'tank' },
  { id: 'Sion', name: 'Sion', archetype: 'tank' },
  { id: 'Malphite', name: 'Malphite', archetype: 'tank' },
  { id: 'Leona', name: 'Leona', archetype: 'tank' },
  { id: 'Nautilus', name: 'Nautilus', archetype: 'tank' },
  { id: 'Lulu', name: 'Lulu', archetype: 'support' },
  { id: 'Nami', name: 'Nami', archetype: 'support' },
  { id: 'Thresh', name: 'Thresh', archetype: 'support' },
  { id: 'Janna', name: 'Janna', archetype: 'support' },
  { id: 'Milio', name: 'Milio', archetype: 'support' },
]

export const DDRAGON_VERSION = '14.24.1'

export function champIconUrl(champId: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${champId}.png`
}

export const PASSIVE_ITEMS = [
  { id: 'bf', name: 'B.F. Sword' },
  { id: 'ie', name: 'Infinity Edge' },
  { id: 'zhonya', name: 'Zhonya\'s' },
  { id: 'rift', name: 'Riftmaker' },
  { id: 'sunfire', name: 'Sunfire' },
  { id: 'frozen', name: 'Frozen Heart' },
  { id: 'boots', name: 'Boots' },
  { id: 'cloak', name: 'Cloak' },
]
