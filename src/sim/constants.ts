/** Visual + physics radius for a baseline (gameplayRadius 65) champ blob */
export const UNIT_RADIUS = 28
export const UNIT_DIAMETER = UNIT_RADIUS * 2
/** Inner circle for icon fill (inside ring stroke) */
export const ICON_RADIUS = 24

/** Ward cast range (arena units). Must feel finite vs map size. */
export const WARD_CAST_RANGE = 240
/** Seconds between ward placements */
export const WARD_COOLDOWN = 45

export const COLORS = {
  ally: 0x5ec8ff,
  foe: 0xff5a4a,
  player: 0xff5a1a,
  hpHigh: 0xe8b86d,
  hpLow: 0xff5a1a,
  hamper: 0xff4d00,
  buff: 0xff8c42,
  arena: 0x12100e,
  grid: 0x3d342e,
} as const
