import type { Archetype, UnitStats } from './types'

/** Baseline profiles at power 5. Scaled by power elsewhere. */
export const ARCHETYPE_BASE: Record<Archetype, Omit<UnitStats, never>> = {
  assassin: {
    moveSpeed: 380,
    maxHp: 1400,
    resist: 0.18,
    aaDamage: 55,
    aaSpeed: 0.85,
    aaRange: 125,
    abilityPower: 130,
    melee: true,
    hamperRadius: 0,
    hamperStrength: 0,
    buffRadius: 0,
    buffDps: 0,
    buffResist: 0,
  },
  ranger: {
    moveSpeed: 340,
    maxHp: 1600,
    resist: 0.22,
    aaDamage: 85,
    aaSpeed: 1.15,
    aaRange: 550,
    abilityPower: 70,
    melee: false,
    hamperRadius: 0,
    hamperStrength: 0,
    buffRadius: 0,
    buffDps: 0,
    buffResist: 0,
  },
  mage: {
    moveSpeed: 320,
    maxHp: 1200,
    resist: 0.15,
    aaDamage: 35,
    aaSpeed: 0.65,
    aaRange: 575,
    abilityPower: 160,
    melee: false,
    hamperRadius: 0,
    hamperStrength: 0,
    buffRadius: 0,
    buffDps: 0,
    buffResist: 0,
  },
  brawler: {
    moveSpeed: 350,
    maxHp: 2000,
    resist: 0.32,
    aaDamage: 70,
    aaSpeed: 0.9,
    aaRange: 150,
    abilityPower: 90,
    melee: true,
    hamperRadius: 0,
    hamperStrength: 0,
    buffRadius: 0,
    buffDps: 0,
    buffResist: 0,
  },
  tank: {
    moveSpeed: 310,
    maxHp: 2800,
    resist: 0.48,
    aaDamage: 40,
    aaSpeed: 0.7,
    aaRange: 150,
    abilityPower: 50,
    melee: true,
    hamperRadius: 220,
    hamperStrength: 0.45,
    buffRadius: 0,
    buffDps: 0,
    buffResist: 0,
  },
  support: {
    moveSpeed: 335,
    maxHp: 1500,
    resist: 0.25,
    aaDamage: 40,
    aaSpeed: 0.7,
    aaRange: 500,
    abilityPower: 85,
    melee: false,
    hamperRadius: 380,
    hamperStrength: 0.28,
    buffRadius: 420,
    buffDps: 0.18,
    buffResist: 0.12,
  },
}

export function statsFor(archetype: Archetype, power: number): UnitStats {
  const base = ARCHETYPE_BASE[archetype]
  const p = 0.55 + (power / 10) * 0.9
  return {
    moveSpeed: base.moveSpeed * (0.92 + power * 0.012),
    maxHp: Math.round(base.maxHp * p),
    resist: Math.min(0.7, base.resist * (0.85 + power * 0.03)),
    aaDamage: base.aaDamage * p,
    aaSpeed: base.aaSpeed * (0.9 + power * 0.02),
    aaRange: base.aaRange,
    abilityPower: base.abilityPower * p,
    melee: base.melee,
    hamperRadius: base.hamperRadius,
    hamperStrength: base.hamperStrength,
    buffRadius: base.buffRadius,
    buffDps: base.buffDps,
    buffResist: base.buffResist,
  }
}

/** Ability shape bias by archetype (for AI / cast targeting). */
export type AbilityShape = 'point' | 'skillshot' | 'aoe' | 'dash'

export function abilityShape(archetype: Archetype, slot: 'q' | 'w' | 'e' | 'r'): AbilityShape {
  if (slot === 'r') {
    if (archetype === 'assassin') return 'dash'
    if (archetype === 'mage') return 'aoe'
    if (archetype === 'tank') return 'aoe'
    return 'point'
  }
  if (archetype === 'mage') return slot === 'q' ? 'skillshot' : 'aoe'
  if (archetype === 'assassin') return slot === 'e' ? 'dash' : 'point'
  if (archetype === 'ranger') return 'skillshot'
  if (archetype === 'tank') return 'aoe'
  if (archetype === 'support') return slot === 'q' ? 'skillshot' : 'point'
  return 'point'
}
