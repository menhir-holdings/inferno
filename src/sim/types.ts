export type Team = 'blue' | 'red'

export type Archetype =
  | 'assassin'
  | 'ranger'
  | 'mage'
  | 'brawler'
  | 'tank'
  | 'support'

export type AbilitySlot = 'q' | 'w' | 'e' | 'r'

export type ActiveKind = 'burst' | 'shield' | 'speed'

export type ModeId = 'teamfight' | 'laning' | 'jungle'

export interface Vec2 {
  x: number
  y: number
}

export interface ItemSlot {
  id: string
  name: string
  active?: ActiveKind
}

export interface UnitStats {
  moveSpeed: number
  maxHp: number
  resist: number
  aaDamage: number
  aaSpeed: number
  aaRange: number
  abilityPower: number
  melee: boolean
  hamperRadius: number
  hamperStrength: number
  buffRadius: number
  buffDps: number
  buffResist: number
}

export interface AbilityState {
  slot: AbilitySlot
  cooldown: number
  maxCooldown: number
  ready: boolean
  /** R is once-per-scenario in MVP */
  spent: boolean
}

export interface ActiveState {
  slot: 1 | 2 | 3
  kind: ActiveKind
  cooldown: number
  maxCooldown: number
  ready: boolean
}

export interface Unit {
  id: number
  champId: string
  champName: string
  team: Team
  archetype: Archetype
  power: number
  level: number
  kills: number
  deaths: number
  assists: number
  items: ItemSlot[]
  actives: ActiveState[]
  pos: Vec2
  hp: number
  stats: UnitStats
  abilities: Record<AbilitySlot, AbilityState>
  /** attack target id, or null */
  targetId: number | null
  /** move destination */
  moveTo: Vec2 | null
  /** attack-move destination */
  attackMoveTo: Vec2 | null
  aaCooldown: number
  alive: boolean
  isPlayer: boolean
  /** temporary buffs from supports */
  dpsBuff: number
  resistBuff: number
  /** slow factor from tank/support hamper (0 = full stop, 1 = normal) */
  moveFactor: number
  /** temporary self speed boost seconds remaining */
  speedBoostTtl: number
  /** walk into range then drop ward */
  pendingWard: Vec2 | null
  damageDealt: number
  damageTaken: number
  focusScore: number
  /** brief white flash on hit */
  hitFlashTtl: number
}

export interface DamageFloater {
  x: number
  y: number
  text: string
  ttl: number
  color: number
}

export interface Ward {
  id: number
  pos: Vec2
  team: Team
  ttl: number
}

export interface Projectile {
  id: number
  fromId: number
  toId: number | null
  pos: Vec2
  vel: Vec2
  damage: number
  ttl: number
  kind: 'aa' | 'ability' | 'active'
  team: Team
  radius: number
}

export type FightResult = 'victory' | 'defeat' | 'timeout' | null

export interface World {
  seed: number
  tick: number
  time: number
  duration: number
  arena: { w: number; h: number }
  units: Unit[]
  wards: Ward[]
  projectiles: Projectile[]
  playerId: number
  attackChampionsOnly: boolean
  ended: boolean
  result: FightResult
  nextProjectileId: number
  nextWardId: number
  floaters: DamageFloater[]
}

export interface Scenario {
  seed: number
  durationSec: number
  playerSlot: number
  mode: ModeId
  units: ScenarioUnit[]
}

export interface ScenarioUnit {
  champId: string
  champName: string
  team: Team
  archetype: Archetype
  power: number
  level: number
  kills: number
  deaths: number
  assists: number
  items: ItemSlot[]
  activeKinds: ActiveKind[]
  startPos: Vec2
}

export interface InputFrame {
  t: number
  type:
    | 'move'
    | 'attack'
    | 'stop'
    | 'amove'
    | 'ability'
    | 'active'
    | 'ward'
    | 'aot'
  x?: number
  y?: number
  slot?: string
}

export interface ScoreBreakdown {
  focus: number
  spacing: number
  execution: number
  survival: number
  total: number
  damageDealt: number
  damageTaken: number
  notes: string[]
}
